// 比赛模拟引擎 v4 —— per-36 期望产出 + 使用率 + 位置系数
//
// 核心设计原则:
//   1. 能力→产出采用"分段非线性"映射（per-36min），锚点对照真实 NBA 量级校准
//      —— 解决 v3 线性映射导致球星与角色球员差距不足的问题
//   2. 得分分配权重 = per36期望 × (min/36) × 使用率因子
//      —— 球星不仅效率高，还占用更多进攻回合（真实使用率 30%+ vs 角色球员 12%）
//   3. 篮板/助攻分配引入"位置系数"，避免后卫抢过多板、中锋刷过多助
//   4. 出场时间按能力分层：超巨 38-40min，末端替补 8-13min
//   5. 保持"总量确定 + 能力权重分配"的物理一致性（个人得分和 = 球队总分）
//   6. 随机扰动控制在 ±10%，降低场次剧烈波动

const SimEngine = (() => {

    const rand = (min, max) => Math.random() * (max - min) + min;
    const randInt = (min, max) => Math.floor(rand(min, max + 1));
    const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
    const sum = arr => arr.reduce((a, b) => a + b, 0);

    // ================================================================
    //  分段插值函数：锚点对照真实 NBA per-36 数据校准
    // ================================================================
    // points: [[x0,y0],[x1,y1],...] 按 x 升序，区间内线性插值，超出范围取边界值
    function piecewise(points) {
        return (x) => {
            if (x <= points[0][0]) return points[0][1];
            const last = points[points.length - 1];
            if (x >= last[0]) return last[1];
            for (let i = 0; i < points.length - 1; i++) {
                const x0 = points[i][0], y0 = points[i][1];
                const x1 = points[i + 1][0], y1 = points[i + 1][1];
                if (x >= x0 && x <= x1) {
                    const t = (x - x0) / (x1 - x0);
                    return y0 + (y1 - y0) * t;
                }
            }
            return last[1];
        };
    }

    // ================================================================
    //  能力复合值（把多项能力合成一个"维度得分"，用于查 per-36 表）
    // ================================================================
    // 得分维度：投篮为主 + 内线为辅 + 球商（结果落在 0-99，无放大溢出）
    //   锚点校准: 塔图姆(sh88,ins88,iq90)=88.2  布朗(80,88,84)=83.6  唐斯(84,84,84)=84
    //   纯内线型(ins>sh+15，如卡佩拉/罗宾逊)用 ins 主导公式，避免 sh 过低拖累吃饼型中锋
    function scoringAbility(p) {
        if (p.ins > p.sh + 15) {
            // 内线终结型：内线为主，少量投篮+球商
            return p.ins * 0.8 + p.sh * 0.15 + p.iq * 0.1;
        }
        return p.sh * 0.4 + p.ins * 0.5 + p.iq * 0.1;
    }
    // 助攻维度：传球为主 + 球商
    function playmakingAbility(p) { return p.pa * 0.72 + p.iq * 0.28; }
    // 篮板维度：篮板能力为主 + 内线高度
    function reboundAbility(p) { return p.re * 0.85 + p.ins * 0.15; }
    // 抢断维度：防守 + 运动能力
    function stealAbility(p) { return p.de * 0.55 + p.at * 0.45; }
    // 盖帽维度：内线 + 防守 + 运动
    function blockAbility(p) { return p.ins * 0.4 + p.de * 0.3 + p.at * 0.3; }

    // ================================================================
    //  per-36 期望产出（锚点对照真实 NBA）
    // ================================================================
    // 得分 per-36（锚点对照真实 NBA per-36，输入为 scoringAbility 0-99）:
    //   sc=99→34  95→31  90→27  85→23  80→19  75→15  70→12  65→9  58→6  50→4  40→2
    //   参考: 塔图姆sc88→26  布朗sc84→23  卡佩拉sc56→5  普里查德sc77→15
    const ptsPer36Fn = piecewise([
        [30, 0.8], [40, 2], [50, 4], [58, 6], [65, 9],
        [70, 12], [75, 15], [80, 19], [85, 23], [90, 27], [95, 31], [99, 34]
    ]);
    // 篮板 per-36（输入为 reboundAbility = re*0.85+ins*0.15）:
    //   reba=95→17.5  90→15.5  85→13  80→11.5  75→10  70→8.5  65→7  58→5.5  50→4.5  40→3
    //   参考: 卡佩拉re88→14.5  唐斯re86→13  波神re77→10
    const rebPer36Fn = piecewise([
        [30, 2], [40, 3], [50, 4.5], [58, 5.5], [65, 7],
        [70, 8.5], [75, 10], [80, 11.5], [85, 13], [90, 15.5], [95, 17.5], [99, 19]
    ]);
    // 助攻 per-36（输入为 playmakingAbility = pa*0.72+iq*0.28）:
    //   ap=99→14  95→12.5  90→11  85→8.5  80→7  75→6  70→5  65→4  58→3  50→2  40→1.2
    //   参考: 特雷杨ap92→11  布伦森ap88→9  塔图姆ap81→6.5  卡佩拉ap41→1.2
    const astPer36Fn = piecewise([
        [30, 0.3], [40, 1.2], [50, 2], [58, 3], [65, 4],
        [70, 5], [75, 6], [80, 7], [85, 8.5], [90, 11], [95, 12.5], [99, 14]
    ]);
    // 抢断 per-36: stl=95→2.5  85→1.8  75→1.3  65→0.9  55→0.6  45→0.4
    const stlPer36Fn = piecewise([
        [35, 0.2], [45, 0.4], [55, 0.65], [65, 0.95], [75, 1.35], [85, 1.85], [95, 2.5], [99, 2.8]
    ]);
    // 盖帽 per-36: blk=95→3.2  85→2.2  75→1.4  65→0.8  55→0.4  45→0.2
    const blkPer36Fn = piecewise([
        [35, 0.1], [45, 0.2], [55, 0.4], [65, 0.8], [75, 1.4], [85, 2.2], [95, 3.2], [99, 3.8]
    ]);
    // 失误 per-36: 高使用率球员失误多，iq 高则少
    //   以"使用强度"为输入：usage 越高、iq 越低 → 失误越多
    //   这里返回的是基础值，最终按使用率放大
    function tovPer36(p, usage) {
        const base = piecewise([
            [40, 0.4], [50, 0.7], [60, 1.1], [70, 1.6], [80, 2.2], [90, 3.0], [99, 3.8]
        ])(100 - p.iq); // iq 越低，基础失误越高
        return base * (0.6 + usage / 100 * 1.2); // 使用率放大
    }

    // ================================================================
    //  投篮/罚球命中率与倾向
    // ================================================================
    function ftPct(p) {
        return piecewise([[35, 0.42], [50, 0.6], [60, 0.7], [70, 0.78], [80, 0.85], [90, 0.9], [99, 0.92]])(p.sh);
    }
    // 两分命中率：内线型命中率更高（近筐）
    function fg2Pct(p) {
        const inside = piecewise([[35, 0.42], [55, 0.5], [70, 0.56], [85, 0.6], [99, 0.64]])(p.ins);
        const shot = piecewise([[35, 0.42], [55, 0.48], [70, 0.52], [85, 0.55], [99, 0.58]])(p.sh);
        return clamp(inside * 0.6 + shot * 0.4, 0.4, 0.66);
    }
    // 三分命中率
    function tpPct(p) {
        return piecewise([[35, 0.2], [55, 0.26], [65, 0.32], [75, 0.37], [85, 0.41], [95, 0.44], [99, 0.46]])(p.sh);
    }
    // 三分出手倾向（0-1）：投篮能力越强越倾向三分，后卫/前锋更高
    function threeTendency(p) {
        const base = piecewise([[40, 0.05], [55, 0.15], [65, 0.28], [75, 0.4], [85, 0.5], [95, 0.58], [99, 0.62]])(p.sh);
        const posFactor = { PG: 1.05, SG: 1.1, SF: 1.0, PF: 0.75, C: 0.45 }[p.p] || 1.0;
        return clamp(base * posFactor, 0.03, 0.68);
    }
    // 罚球得分占得分比（造犯规：内线 + 运动）
    function ftScoreShare(p) {
        const foul = p.ins * 0.55 + p.at * 0.45;
        return piecewise([[40, 0.06], [55, 0.12], [70, 0.18], [85, 0.26], [99, 0.32]])(foul);
    }

    // ================================================================
    //  使用率（USG%）：体现球员在进攻中的"戏份"
    // ================================================================
    // 真实 NBA: 超巨 30-35%, 全明星 25-28%, 首发配角 18-22%, 替补 12-16%
    function usageRate(p) {
        const sc = scoringAbility(p);
        const u = 11 + (p.o - 66) * 0.55 + (sc - 68) * 0.35;
        return clamp(u, 8, 34);
    }

    // ================================================================
    //  轮换与出场时间（按能力分层）
    // ================================================================
    function buildRotation(players, tactics) {
        const avail = players.filter(p => !p.injured).sort((a, b) => b.o - a.o);
        // 轮换深度：短轮换8人、正常9人、长轮换10人
        const rotSize = tactics && tactics.rotation === 0 ? 8 : tactics && tactics.rotation === 2 ? 10 : 9;
        const rotation = avail.slice(0, Math.min(rotSize, avail.length));
        if (rotation.length === 0) return [];

        const minPlan = rotation.map((p, i) => {
            const o = p.o;
            let base;
            if (o >= 92)      base = 37.5 + rand(-0.5, 2);   // 超巨 37-39.5
            else if (o >= 88) base = 35.5 + rand(-1, 1.5);   // 巨星 34.5-37
            else if (o >= 84) base = 33 + rand(-1, 1.5);     // 全明星 32-34.5
            else if (o >= 80) base = 30.5 + rand(-1, 1.5);   // 首发核心 29.5-32
            else if (o >= 76) base = 26.5 + rand(-1, 1.5);   // 首发配角 25.5-28
            else if (i < 5)   base = 23 + rand(-1, 2);       // 弱首发 22-25
            else if (o >= 72) base = 18 + rand(-1, 2);       // 主替补 17-20
            else if (o >= 68) base = 13 + rand(-1, 2);       // 轮换替补 12-15
            else              base = 8 + rand(-1, 3);        // 末端替补 7-11
            // 短轮换：主力+2分钟；长轮换：主力-2、替补+2
            if (tactics && tactics.rotation === 0 && i < 5) base += 2;
            if (tactics && tactics.rotation === 2) base += (i < 5 ? -2 : 2);
            return clamp(base, 4, 42);
        });

        // 归一化到 240 分钟（5×48）
        const total = sum(minPlan);
        const scale = 240 / total;
        return rotation.map((p, i) => ({
            player: p,
            min: Math.round(clamp(minPlan[i] * scale, 4, 44)),
        }));
    }

    function teamRating(players) {
        const rot = buildRotation(players);
        if (rot.length === 0) return 60;
        let total = 0, wsum = 0;
        rot.forEach(r => {
            const p = r.player;
            const off = (p.ins + p.sh + p.pa) / 3;
            const rate = off * 0.5 + p.de * 0.25 + p.re * 0.12 + p.iq * 0.13;
            total += rate * r.min; wsum += r.min;
        });
        return wsum > 0 ? total / wsum : 60;
    }

    function emptyLine(p, min) {
        return {
            player: p, min,
            pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
            fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0,
        };
    }

    function weightedAvg(rotation, fn) {
        let s = 0, w = 0;
        rotation.forEach(r => { s += fn(r.player) * r.min; w += r.min; });
        return w > 0 ? s / w : 70;
    }

    // ================================================================
    //  比赛主流程
    // ================================================================
    // tactics 可选: { pace: 0慢/1正常/2快, defense: 0松/1正常/2紧, rotation: 0短/1正常/2长 }
    function simulateGame(homePlayers, awayPlayers, isPlayoff = false, homeTactics = null, awayTactics = null) {
        const homeRot = buildRotation(homePlayers, homeTactics);
        const awayRot = buildRotation(awayPlayers, awayTactics);

        // 球队攻防效率（按出场时间加权）
        const homeOff = weightedAvg(homeRot, p => (p.ins + p.sh + p.pa) / 3);
        const awayOff = weightedAvg(awayRot, p => (p.ins + p.sh + p.pa) / 3);
        const homeDef = weightedAvg(homeRot, p => p.de);
        const awayDef = weightedAvg(awayRot, p => p.de);

        // 回合数 ~100，主场+2，季后赛节奏略慢；战术节奏调整（快+5/慢-5）
        const paceAdj = (tac) => tac ? (tac.pace === 2 ? 5 : tac.pace === 0 ? -5 : 0) : 0;
        const homePoss = randInt(98, 104) + 2 - (isPlayoff ? 3 : 0) + paceAdj(homeTactics);
        const awayPoss = randInt(96, 102) - (isPlayoff ? 3 : 0) + paceAdj(awayTactics);

        // 每回合期望得分（进攻效率）
        const homeOffEff = clamp(0.97 + (homeOff - 72) * 0.0085, 0.88, 1.22);
        const awayOffEff = clamp(0.97 + (awayOff - 72) * 0.0085, 0.88, 1.22);
        // 对手防守修正：紧逼防守额外压制对手效率、松懈则提升对手
        const tacDefAdj = (d) => d === 2 ? -0.03 : d === 0 ? 0.03 : 0;
        const homeDefAdj = clamp(1.0 - (awayDef - 72) * 0.006 + tacDefAdj(awayTactics ? awayTactics.defense : 1), 0.86, 1.10);
        const awayDefAdj = clamp(1.0 - (homeDef - 72) * 0.006 + tacDefAdj(homeTactics ? homeTactics.defense : 1), 0.86, 1.10);

        let homeScore = Math.round(homePoss * homeOffEff * homeDefAdj * rand(0.97, 1.03));
        let awayScore = Math.round(awayPoss * awayOffEff * awayDefAdj * rand(0.97, 1.03));
        homeScore = Math.max(70, Math.min(140, homeScore));
        awayScore = Math.max(70, Math.min(140, awayScore));

        // 加时
        let otCount = 0;
        const otScores = [];
        while (homeScore === awayScore && otCount < 4) {
            otCount++;
            const hOT = randInt(8, 14), aOT = randInt(8, 14);
            homeScore += hOT; awayScore += aOT;
            otScores.push([hOT, aOT]);
        }

        // 生成个人统计
        const homeLines = generateLines(homeRot, homeScore, homeTactics);
        const awayLines = generateLines(awayRot, awayScore, awayTactics);

        const homeQuarters = splitQuarters(homeScore, otScores.map(s => s[0]));
        const awayQuarters = splitQuarters(awayScore, otScores.map(s => s[1]));

        // 提取比赛关键事件（三双/高分/绝杀/加时）
        const events = extractEvents(homeLines, awayLines, homeScore, awayScore, otCount);

        return {
            home: { players: homePlayers, lines: homeLines, score: homeScore, quarters: homeQuarters },
            away: { players: awayPlayers, lines: awayLines, score: awayScore, quarters: awayQuarters },
            winner: homeScore >= awayScore ? "home" : "away",
            ot: otCount,
            events,
        };
    }

    // 提取比赛亮点事件
    function extractEvents(homeLines, awayLines, homeScore, awayScore, otCount) {
        const events = [];
        const allLines = [
            ...homeLines.map(l => ({ ...l, side: "home" })),
            ...awayLines.map(l => ({ ...l, side: "away" })),
        ];
        allLines.forEach(l => {
            // 50+ 得分
            if (l.pts >= 50) events.push({ type: "50pt", player: l.player.n, pts: l.pts, side: l.side });
            else if (l.pts >= 40) events.push({ type: "40pt", player: l.player.n, pts: l.pts, side: l.side });
            // 三双
            const dubs = [l.pts, l.reb, l.ast, l.stl, l.blk].filter(v => v >= 10).length;
            if (dubs >= 3) events.push({ type: "tripleDouble", player: l.player.n, pts: l.pts, reb: l.reb, ast: l.ast, side: l.side });
            else if (dubs >= 2) events.push({ type: "doubleDouble", player: l.player.n, pts: l.pts, reb: l.reb, ast: l.ast, side: l.side });
            // 大号两双：板≥20 或 助≥15
            if (l.reb >= 20) events.push({ type: "bigReb", player: l.player.n, reb: l.reb, side: l.side });
            if (l.ast >= 15) events.push({ type: "bigAst", player: l.player.n, ast: l.ast, side: l.side });
            // 盖帽≥5 / 抢断≥5
            if (l.blk >= 5) events.push({ type: "bigBlk", player: l.player.n, blk: l.blk, side: l.side });
            if (l.stl >= 5) events.push({ type: "bigStl", player: l.player.n, stl: l.stl, side: l.side });
        });
        // 加时
        if (otCount > 0) events.push({ type: "overtime", ot: otCount });
        // 绝杀（分差≤3）
        const diff = Math.abs(homeScore - awayScore);
        if (diff <= 3 && otCount === 0) events.push({ type: "buzzer", diff });
        return events;
    }

    function splitQuarters(score, otScores) {
        const q = [0, 0, 0, 0];
        let remaining = score;
        for (let i = 0; i < 4; i++) {
            if (i === 3) { q[i] = remaining; }
            else {
                let val = Math.round(score / 4 * rand(0.88, 1.12));
                val = Math.max(15, Math.min(val, remaining - (3 - i) * 12));
                q[i] = val; remaining -= val;
            }
        }
        if (otScores) otScores.forEach(s => q.push(s));
        return q;
    }

    // ================================================================
    //  个人统计生成（核心：per-36 期望 × 时间 × 位置/使用率系数，归一化到总量）
    // ================================================================

    // 位置系数表（位置对各项产出的天然倾向，re/pa 已含位置信息故系数温和）
    const REB_POS_FACTOR = { PG: 0.85, SG: 0.92, SF: 1.0, PF: 1.1, C: 1.2 };
    const AST_POS_FACTOR = { PG: 1.3, SG: 1.0, SF: 0.75, PF: 0.6, C: 0.55 };
    const BLK_POS_FACTOR = { PG: 0.35, SG: 0.45, SF: 0.7, PF: 1.1, C: 1.5 };
    const STL_POS_FACTOR = { PG: 1.15, SG: 1.1, SF: 1.0, PF: 0.85, C: 0.75 };

    function generateLines(rotation, teamScore, tactics) {
        if (rotation.length === 0) return [];
        const lines = rotation.map(r => emptyLine(r.player, r.min));

        // ---- 1. 得分分配 ----
        // 权重 = per36期望得分 × (min/36) × 使用率因子
        //   使用率因子 = 0.5 + usg/100*1.4：usg=34→0.98, usg=24→0.84, usg=12→0.67
        //   体现球星"占用更多进攻回合"的真实使用率差异
        const scWeights = rotation.map(r => {
            const p = r.player;
            const per36 = ptsPer36Fn(scoringAbility(p));
            const usgF = 0.5 + usageRate(p) / 100 * 1.4;
            return per36 * (r.min / 36) * usgF;
        });
        const totalScW = sum(scWeights);
        let assignedPts = 0;
        lines.forEach((line, i) => {
            const share = totalScW > 0 ? scWeights[i] / totalScW : 1 / lines.length;
            const expected = teamScore * share;
            line.pts = Math.max(0, Math.round(expected * rand(0.9, 1.1)));
            assignedPts += line.pts;
        });
        // 修正：差额加给得分最高者，保证 个人和 = 球队总分
        const diff = teamScore - assignedPts;
        if (diff !== 0 && lines.length > 0) {
            let topIdx = 0;
            lines.forEach((l, i) => { if (l.pts > lines[topIdx].pts) topIdx = i; });
            lines[topIdx].pts = Math.max(0, lines[topIdx].pts + diff);
        }

        // ---- 2. 得分拆分：罚球 + 投篮（三分/两分）----
        lines.forEach(line => {
            const p = line.player;
            if (line.pts === 0) return;
            // 罚球得分占比
            const ftShare = ftScoreShare(p);
            let ftPts = Math.round(line.pts * ftShare * rand(0.9, 1.1));
            ftPts = Math.max(0, Math.min(ftPts, line.pts));
            const fgPts = line.pts - ftPts; // 投篮得分

            // 罚球明细
            const ftp = ftPct(p);
            line.ftm = ftPts;
            line.fta = Math.max(ftPts, Math.round(ftPts / ftp * rand(0.92, 1.08)));

            // 投篮明细
            const threeRate = threeTendency(p);
            const tp = tpPct(p);
            const f2p = fg2Pct(p);

            // 三分命中数（受得分和倾向约束）
            let tpm = 0;
            if (fgPts >= 3 && threeRate > 0.1) {
                const expected = fgPts / 2.6 * threeRate * rand(0.85, 1.15);
                tpm = clamp(Math.round(expected), 0, Math.floor(fgPts / 3));
            }
            const threePts = tpm * 3;
            const twoPts = fgPts - threePts;
            const twoPm = Math.max(0, Math.round(twoPts / 2));

            line.tpm = tpm;
            line.tpa = Math.max(tpm, tpm > 0 ? Math.round(tpm / tp * rand(0.85, 1.15)) : (threeRate > 0.2 ? randInt(0, 2) : 0));
            const twoPa = Math.max(twoPm, twoPm > 0 ? Math.round(twoPm / f2p * rand(0.88, 1.12)) : randInt(0, 2));
            line.fgm = tpm + twoPm;
            line.fga = line.tpa + twoPa;
        });

        // ---- 3. 篮板分配 ----
        // 全队总篮板 ~ 40-46
        const totalReb = randInt(40, 46);
        const rebWeights = rotation.map(r => {
            const p = r.player;
            const per36 = rebPer36Fn(reboundAbility(p));
            const posF = REB_POS_FACTOR[p.p] || 1.0;
            return per36 * (r.min / 36) * posF;
        });
        const totalRebW = sum(rebWeights);
        let assignedReb = 0;
        lines.forEach((line, i) => {
            const share = totalRebW > 0 ? rebWeights[i] / totalRebW : 1 / lines.length;
            line.reb = Math.max(0, Math.round(totalReb * share * rand(0.88, 1.12)));
            assignedReb += line.reb;
        });
        // 修正篮板和
        const rebDiff = totalReb - assignedReb;
        if (rebDiff !== 0 && lines.length > 0) {
            let topIdx = 0;
            lines.forEach((l, i) => { if (l.reb > lines[topIdx].reb) topIdx = i; });
            lines[topIdx].reb = Math.max(0, lines[topIdx].reb + rebDiff);
        }
        // 进攻篮板占比
        lines.forEach(line => {
            const orebRate = clamp(0.22 + (reboundAbility(line.player) - 65) / 320, 0.08, 0.42);
            line.oreb = Math.min(line.reb, Math.round(line.reb * orebRate * rand(0.8, 1.2)));
        });

        // ---- 4. 助攻分配 ----
        // 助攻总数 ≈ 进球数 × 助攻率（55-66%）
        const totalFgm = sum(lines.map(l => l.fgm));
        let targetAst = Math.round(totalFgm * rand(0.56, 0.66));
        targetAst = Math.max(16, Math.min(targetAst, 32));
        const astWeights = rotation.map(r => {
            const p = r.player;
            const per36 = astPer36Fn(playmakingAbility(p));
            const posF = AST_POS_FACTOR[p.p] || 1.0;
            return per36 * (r.min / 36) * posF;
        });
        const totalAstW = sum(astWeights);
        let assignedAst = 0;
        lines.forEach((line, i) => {
            const share = totalAstW > 0 ? astWeights[i] / totalAstW : 1 / lines.length;
            line.ast = Math.max(0, Math.round(targetAst * share * rand(0.85, 1.15)));
            assignedAst += line.ast;
        });
        // 修正助攻和（差给最高者）
        const astDiff = targetAst - assignedAst;
        if (astDiff !== 0 && lines.length > 0) {
            let topIdx = 0;
            lines.forEach((l, i) => { if (l.ast > lines[topIdx].ast) topIdx = i; });
            lines[topIdx].ast = Math.max(0, lines[topIdx].ast + astDiff);
        }

        // ---- 5. 抢断、盖帽、失误、犯规 ----
        lines.forEach(line => {
            const p = line.player;
            const min = line.min;
            const usg = usageRate(p);
            // 抢断：per36 × 时间 × 位置系数
            const stlPer36 = stlPer36Fn(stealAbility(p)) * (STL_POS_FACTOR[p.p] || 1.0);
            line.stl = Math.max(0, Math.round(stlPer36 * (min / 36) * rand(0.7, 1.3)));
            // 盖帽
            const blkPer36 = blkPer36Fn(blockAbility(p)) * (BLK_POS_FACTOR[p.p] || 1.0);
            line.blk = Math.max(0, Math.round(blkPer36 * (min / 36) * rand(0.6, 1.4)));
            // 失误：使用率高的球员失误更多
            line.tov = Math.max(0, Math.round(tovPer36(p, usg) * (min / 36) * rand(0.85, 1.15)));
            // 犯规：与出场时间和防守强度相关，内线犯规更多；紧逼防守犯规+25%
            const pfPosF = { PG: 0.85, SG: 0.9, SF: 1.0, PF: 1.2, C: 1.3 }[p.p] || 1.0;
            const tacPF = tactics && tactics.defense === 2 ? 1.25 : tactics && tactics.defense === 0 ? 0.8 : 1.0;
            const pfBase = (min / 36) * (1.6 + (p.de - 70) / 100) * pfPosF * tacPF;
            line.pf = Math.min(6, Math.max(0, Math.round(clamp(pfBase, 0, 6) * rand(0.7, 1.3))));
        });

        return lines;
    }

    // ================================================================
    //  系列赛
    // ================================================================
    function simulateSeries(homePlayers, awayPlayers) {
        let homeWins = 0, awayWins = 0;
        const games = [];
        const homeAdv = [1, 1, 0, 0, 1, 0, 1];
        let g = 0;
        while (homeWins < 4 && awayWins < 4 && g < 7) {
            const isHomeVenue = homeAdv[g] === 1;
            const venueHome = isHomeVenue ? homePlayers : awayPlayers;
            const venueAway = isHomeVenue ? awayPlayers : homePlayers;
            const res = simulateGame(venueHome, venueAway, true);
            const homeWon = (res.winner === "home") === isHomeVenue;
            if (homeWon) homeWins++; else awayWins++;
            games.push({ homeWon, score: `${res.away.score}-${res.home.score}` });
            g++;
        }
        return { homeWins, awayWins, winner: homeWins > awayWins ? "home" : "away", games };
    }

    // ================================================================
    //  伤病判定：返回本轮换中本场受伤的球员（不直接修改，由调用方决定如何应用）
    //  概率：每场约 6% 概率有人受伤，主力（出场时间多）风险略高
    //  返回 [{ playerId, days }] days=缺阵天数(3-18)
    // ================================================================
    function rollInjuries(rotation) {
        const injuries = [];
        rotation.forEach(r => {
            // 出场时间越多受伤概率越高；年龄大风险略增
            const minFactor = r.min / 36;
            const ageFactor = r.player.a >= 32 ? 1.4 : r.player.a <= 23 ? 0.8 : 1.0;
            const prob = 0.012 * minFactor * ageFactor; // 单球员每场约 0.8%-1.7%
            if (Math.random() < prob) {
                const days = randInt(3, 18);
                injuries.push({ playerId: r.player.id, days });
            }
        });
        return injuries;
    }

    // ================================================================
    //  调试/校准辅助：单球员 per-36 期望产出（供外部验证用）
    // ================================================================
    function playerPer36(p) {
        return {
            pts: ptsPer36Fn(scoringAbility(p)),
            reb: rebPer36Fn(reboundAbility(p)),
            ast: astPer36Fn(playmakingAbility(p)),
            stl: stlPer36Fn(stealAbility(p)),
            blk: blkPer36Fn(blockAbility(p)),
            usg: usageRate(p),
        };
    }

    return {
        simulateGame, simulateSeries, teamRating, buildRotation,
        rollInjuries,
        // 暴露映射函数供调试/外部使用
        scoringAbility, playmakingAbility, reboundAbility, stealAbility, blockAbility,
        usageRate, playerPer36,
        piecewise, ptsPer36Fn, rebPer36Fn, astPer36Fn,
        rand, randInt, clamp,
    };
})();

window.SimEngine = SimEngine;
