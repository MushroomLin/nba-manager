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
    //   高端再次下调(90→25, 95→27, 99→29.5) — 修复得分王系统性偏高(20季均值33.06，7季越界>32)
    //   上一版 90→27/95→29/99→32 叠加 38.5min×usgF=0.976 仍给出 33+ PPG（实测最高 39.83）
    //   真实得分王 28-32 PPG（哈登 36.1 为历史级例外，扬尼斯 31 不到 32）
    //   参考: 塔图姆sc88→22  布朗sc84→20  卡佩拉sc56→5  普里查德sc77→12
    const ptsPer36Fn = piecewise([
        [30, 0.8], [40, 2], [50, 4], [58, 6], [65, 9],
        [70, 11], [75, 14], [80, 17], [85, 21], [90, 25], [95, 27], [99, 29.5]
    ]);
    // 篮板 per-36（输入为 reboundAbility = re*0.85+ins*0.15）:
    //   高端下调(90→12.5, 95→13.5, 99→14.5) — 修复篮板王场均偏高(实测 15.25 vs 真实 12-13)
    //   保持单调递增，避免高能力球员反不如低能力球员
    //   参考: 卡佩拉re88→12  唐斯re86→11  波神re77→9
    const rebPer36Fn = piecewise([
        [30, 2], [40, 3], [50, 4.5], [58, 5.5], [65, 7],
        [70, 8.5], [75, 9.5], [80, 10.5], [85, 11.5], [90, 12.5], [95, 13.5], [99, 14.5]
    ]);
    // 助攻 per-36（输入为 playmakingAbility = pa*0.72+iq*0.28）:
    //   高端再次下调(90→11, 95→12.5, 99→13.5) — 修复助攻王系统性偏高(20季均值12.18，最高14.45)
    //   上一版 90→12/95→13.5/99→15 叠加 PG 系数 1.45 给出 13+ APG（真实顶级 10-12）
    //   参考: 特雷杨ap92→10  布伦森ap88→9  塔图姆ap81→6.5  卡佩拉ap41→0.9
    const astPer36Fn = piecewise([
        [30, 0.3], [40, 0.8], [50, 1.5], [58, 2.5], [65, 3.5],
        [70, 4.5], [75, 6], [80, 8], [85, 10], [90, 11], [95, 12.5], [99, 13.5]
    ]);
    // 抢断 per-36: 高端下调(95→2.5, 99→3.0) — 修复抢断王轻微偏高(20季均值2.80，5季越界>3.0)
    //   上一版 95→2.8/99→3.3 叠加 PG 系数 1.15 给出 3.0+ SPG（真实顶级 2.0-3.0）
    //   真实抢断王 ~2.0-3.0 SPG（SGA 2.0、福克斯 2.0、斯托克顿巅峰 3.2 为历史级例外）
    const stlPer36Fn = piecewise([
        [35, 0.2], [45, 0.4], [55, 0.65], [65, 0.95], [75, 1.35], [85, 1.85], [95, 2.5], [99, 3.0]
    ]);
    // 盖帽 per-36: 高端下调(95→2.8, 99→3.3) — 修复盖帽王场均虚高(原 4.10 vs 期望 2.5-3.5)
    const blkPer36Fn = piecewise([
        [35, 0.1], [45, 0.2], [55, 0.4], [65, 0.7], [75, 1.2], [85, 1.9], [95, 2.8], [99, 3.3]
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
        // 修复：低端 0.42→0.50，真实 NBA 最差罚球者约 0.50（如奥尼尔 0.527、德拉蒙德 0.585）
        // 0.42 低于真实下限，导致低能力球员罚球率失真
        return piecewise([[35, 0.50], [50, 0.6], [60, 0.7], [70, 0.78], [80, 0.85], [90, 0.9], [99, 0.92]])(p.sh);
    }
    // 两分命中率：内线型命中率更高（近筐）
    function fg2Pct(p) {
        const inside = piecewise([[35, 0.42], [55, 0.5], [70, 0.56], [85, 0.6], [99, 0.64]])(p.ins);
        const shot = piecewise([[35, 0.42], [55, 0.48], [70, 0.52], [85, 0.55], [99, 0.58]])(p.sh);
        return clamp(inside * 0.6 + shot * 0.4, 0.4, 0.66);
    }
    // 三分命中率
    function tpPct(p) {
        // 修复：高端 0.44/0.46→0.43/0.44，真实 NBA 顶级 3P% 约 0.42-0.43（库里生涯 0.427）
        // 0.46 高于真实上限，让超巨三分率虚高
        return piecewise([[35, 0.2], [55, 0.26], [65, 0.32], [75, 0.37], [85, 0.41], [95, 0.43], [99, 0.44]])(p.sh);
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
    // 修复：原上限 34 导致弱队高 ovr 球员使用率过高（S4 得分王 37.07，真实上限约 32-33）
    // 降至 32：与真实 NBA 顶薪球员使用率上限（约 32-35%）匹配，避免单球员过度集中出手
    function usageRate(p) {
        const sc = scoringAbility(p);
        const u = 11 + (p.o - 66) * 0.55 + (sc - 68) * 0.35;
        return clamp(u, 8, 32);
    }

    // ================================================================
    //  轮换与出场时间（按能力分层）
    // ================================================================
    function buildRotation(players, tactics) {
        const avail = players.filter(p => !p.injured).sort((a, b) => b.o - a.o);
        // 轮换深度：短轮换8人、正常9人、长轮换10人
        // 修复：原恒为 9 人轮换僵化（19 季固定 9 人）；加入 ±1 随机波动模拟真实教练临场调整
        // 约 70% 概率维持战术设定，30% 概率 ±1 人（基于背靠背/对手强度等随机因素）
        let baseRotSize = tactics && tactics.rotation === 0 ? 8 : tactics && tactics.rotation === 2 ? 10 : 9;
        const rotVariance = Math.random();
        let rotSize = baseRotSize;
        if (rotVariance < 0.15) rotSize = Math.max(8, baseRotSize - 1);
        else if (rotVariance > 0.85) rotSize = Math.min(10, baseRotSize + 1);
        let rotation = avail.slice(0, Math.min(rotSize, avail.length));
        if (rotation.length === 0) return [];

        // 新秀保护：乐透级新秀(isRookie && ovr>=62)强制进入轮换
        // 真实 NBA 中乐透秀即使能力不足也会获得 10-15 分钟上场时间用于培养
        // 修复：原门槛 ovr>=65 仍让 24-48% 新秀首赛季 gp=0（次轮秀/低 ovr 首轮秀无法进轮换）
        // 降到 62：让更多首轮/次轮新秀获得培养时间，减少 DNP 新秀数量
        const protectedRookies = avail.slice(rotSize).filter(p => p.isRookie && p.o >= 62);
        for (const rookie of protectedRookies) {
            if (rotation.length >= rotSize) {
                // 替换轮换中 OVR 最低的非新秀、非核心(ovr<78)球员
                let replaceIdx = -1, lowestOvr = 99;
                for (let i = 0; i < rotation.length; i++) {
                    if (!rotation[i].isRookie && rotation[i].o < 78 && rotation[i].o < lowestOvr) {
                        lowestOvr = rotation[i].o;
                        replaceIdx = i;
                    }
                }
                if (replaceIdx >= 0) {
                    rotation.splice(replaceIdx, 1);
                } else {
                    break; // 没有可替换的球员，停止保护
                }
            }
            rotation.push(rookie);
        }

        const minPlan = rotation.map((p, i) => {
            const o = p.o;
            let base;
            // 修复：原方案替补 base 偏高，归一化后末位替补达 16-20 分钟（真实 8-12）
            // 拉大球星与替补的 base 差距，归一化后球星 ~38-40、末位替补 ~6-10
            if (o >= 92)      base = 38.5 + rand(-0.5, 2);   // 超巨 38-40.5
            else if (o >= 88) base = 36.5 + rand(-1, 1.5);   // 巨星 35.5-38
            else if (o >= 84) base = 34 + rand(-1, 1.5);     // 全明星 33-35.5
            else if (o >= 80) base = 31 + rand(-1, 1.5);     // 首发核心 30-32.5
            else if (o >= 76) base = 27 + rand(-1, 1.5);     // 首发配角 26-28.5
            else if (i < 5)   base = 22 + rand(-1, 2);       // 弱首发 21-24
            else if (o >= 72) base = 16 + rand(-1, 2);       // 主替补 15-18
            else if (o >= 68) base = 10 + rand(-1, 2);       // 轮换替补 9-12
            else              base = 7 + rand(-1, 2);        // 末端替补 6-9（原 4-7 偏低）
            // 新秀培养保底：进入轮换的新秀根据 ovr 给予培养下限（真实 NBA 首轮秀培养下限）
            // 修复：原 low-ovr 新秀 base 仅 5-10，归一化后 4-8 分钟导致 ROY 数据偏低(3-8分)
            // ovr≥74: 至少 20 分钟（高质量新秀应获首发级培养，如文班亚马 29min）
            // ovr≥70: 至少 16 分钟（首轮秀培养下限）
            // ovr≥67: 至少 13 分钟（次轮秀培养下限）
            if (p.isRookie) {
                if (p.o >= 74 && base < 20) base = 20 + rand(-1, 2);
                else if (p.o >= 70 && base < 16) base = 16 + rand(-1, 2);
                else if (base < 13) base = 13 + rand(-1, 2);
            }
            // 短轮换：主力+2分钟；长轮换：主力-2、替补+2
            if (tactics && tactics.rotation === 0 && i < 5) base += 2;
            if (tactics && tactics.rotation === 2) base += (i < 5 ? -2 : 2);
            // 修复：末端替补下限 4→6，真实 NBA 末端替补通常 6-10 分钟
            return clamp(base, 6, 42);
        });

        // 归一化到 240 分钟（5×48）
        const total = sum(minPlan);
        const scale = 240 / total;
        // 5人及以下轮换单球员上限提到 48（NBA 单场最大48分钟），否则 44
        const minCap = rotation.length <= 5 ? 48 : 44;
        const result = rotation.map((p, i) => ({
            player: p,
            // 修复：归一化后下限 4→6，与 base 下限一致
            min: Math.round(clamp(minPlan[i] * scale, 6, minCap)),
        }));
        // 因 clamp 截断导致总时间不足 240 时，把差额均摊给未达上限的球员
        let totalMin = sum(result.map(r => r.min));
        for (let guard = 0; totalMin < 240 && guard < 100; guard++) {
            let added = false;
            for (let i = 0; i < result.length; i++) {
                if (totalMin >= 240) break;
                if (result[i].min < minCap) {
                    result[i].min += 1;
                    totalMin += 1;
                    added = true;
                }
            }
            if (!added) break;
        }
        // 因 Math.round 四舍五入导致总时间超过 240 时，从出场时间最多的球员扣除
        for (let guard = 0; totalMin > 240 && guard < 100; guard++) {
            let maxIdx = -1, maxMin = 4;
            for (let i = 0; i < result.length; i++) {
                if (result[i].min > maxMin) { maxMin = result[i].min; maxIdx = i; }
            }
            if (maxIdx >= 0) { result[maxIdx].min -= 1; totalMin -= 1; }
            else break;
        }
        return result;
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

        // 全队受伤（轮换为空）时避免产生幽灵比赛：缺人队伍判 0-20 失败
        // 有球员的一方生成 20 分的 lines，确保有比分也有球员数据
        const homeEmpty = homeRot.length === 0;
        const awayEmpty = awayRot.length === 0;
        if (homeEmpty || awayEmpty) {
            const homeScore = homeEmpty ? 0 : 20;
            const awayScore = awayEmpty ? 0 : 20;
            const homeLines = homeEmpty ? [] : generateLines(homeRot, homeScore, homeTactics);
            const awayLines = awayEmpty ? [] : generateLines(awayRot, awayScore, awayTactics);
            return {
                home: { players: homePlayers, lines: homeLines, score: homeScore, quarters: splitQuarters(homeScore, []) },
                away: { players: awayPlayers, lines: awayLines, score: awayScore, quarters: splitQuarters(awayScore, []) },
                winner: homeScore >= awayScore ? "home" : "away",
                ot: 0,
                events: [],
            };
        }

        // 球队攻防效率（按出场时间加权）
        const homeOff = weightedAvg(homeRot, p => (p.ins + p.sh + p.pa) / 3);
        const awayOff = weightedAvg(awayRot, p => (p.ins + p.sh + p.pa) / 3);
        const homeDef = weightedAvg(homeRot, p => p.de);
        const awayDef = weightedAvg(awayRot, p => p.de);

        // 回合数 ~100，主队 +2 回合（randInt 范围差：主 98-104，客 96-102，均值差 2）
        // 修复 v2：原 randInt(98,104)+1 vs randInt(96,102) 实际 +3 回合 → 主胜率 0.595 偏高
        //         v1 改为 randInt(97,103)+1 vs randInt(97,103) 仅 +1 回合 → 主胜率 0.52 偏低
        // 真实 NBA 主场优势约 +2.5 分，对应 ~57% 主胜率；+2 回合 × 1.13 ≈ +2.3 分，匹配真实
        const paceAdj = (tac) => tac ? (tac.pace === 2 ? 5 : tac.pace === 0 ? -5 : 0) : 0;
        const homePoss = randInt(98, 104) - (isPlayoff ? 3 : 0) + paceAdj(homeTactics);
        const awayPoss = randInt(96, 102) - (isPlayoff ? 3 : 0) + paceAdj(awayTactics);

        // 每回合期望得分（进攻效率）
        // 基线 1.13：现代 NBA 每回合约 1.10-1.13 分
        // 修复：0.018 灵敏度仍过大，导致 10 点能力差转化为 ~33 分分差，产生 75胜/8负 极端战绩
        // 降至 0.013：10 点能力差转化为 ~20 分分差，配合 ±12% 噪声可产生合理爆冷
        // 预期战绩区间 60-68 胜 / 14-22 胜，符合真实 NBA 分布
        const homeOffEff = clamp(1.13 + (homeOff - 72) * 0.013, 0.95, 1.35);
        const awayOffEff = clamp(1.13 + (awayOff - 72) * 0.013, 0.95, 1.35);
        // 对手防守修正：同步降至 0.011，与进攻灵敏度匹配
        const tacDefAdj = (d) => d === 2 ? -0.03 : d === 0 ? 0.03 : 0;
        const homeDefAdj = clamp(1.0 - (awayDef - 72) * 0.011 + tacDefAdj(awayTactics ? awayTactics.defense : 1), 0.84, 1.11);
        const awayDefAdj = clamp(1.0 - (homeDef - 72) * 0.011 + tacDefAdj(homeTactics ? homeTactics.defense : 1), 0.84, 1.11);

        // 单场噪声 ±12%（原 ±18% 过大淹没球队实力差，导致爆冷 37%、分差 13.8 偏高）
        // 收窄噪声让强队优势更稳定，OT 率提升（更多接近比分），分差回归真实 10-11
        let homeScore = Math.round(homePoss * homeOffEff * homeDefAdj * rand(0.88, 1.12));
        let awayScore = Math.round(awayPoss * awayOffEff * awayDefAdj * rand(0.88, 1.12));
        // 修复：regulation cap 155 偏高（实测单场 158 接近上限），降至 150
        // 真实 NBA 现代单场最高约 150（历史极端 176 含 OT）；150 覆盖 99% 比赛
        homeScore = Math.max(65, Math.min(150, homeScore));
        awayScore = Math.max(65, Math.min(150, awayScore));

        // 加时
        let otCount = 0;
        const otScores = [];
        // 分差1分的比赛有 45% 概率进入加时，分差2分有 15% 概率（原仅 1 分差 35% 导致 OT 率 3.8% 偏低）
        // 修复：真实 NBA OT 率约 6%，扩展触发条件
        if (Math.abs(homeScore - awayScore) === 1 && Math.random() < 0.45) {
            if (homeScore > awayScore) awayScore = homeScore;
            else homeScore = awayScore;
        } else if (Math.abs(homeScore - awayScore) === 2 && Math.random() < 0.15) {
            if (homeScore > awayScore) awayScore = homeScore;
            else homeScore = awayScore;
        }
        while (homeScore === awayScore && otCount < 3) {
            otCount++;
            const hOT = randInt(8, 14), aOT = randInt(8, 14);
            homeScore += hOT; awayScore += aOT;
            otScores.push([hOT, aOT]);
            // 修复：3 OT 累计可达 155+3×14=197，极端值仍偏高
            // OT 后再次打平则强制分出胜负（罕见 4+ OT，真实 NBA 70 年仅 6 次）
            if (otCount >= 3 && homeScore === awayScore) {
                // 强制 +1 给主队（主场优势）
                homeScore += 1;
            }
        }
        // 修复：原 clamp 170 仍偏高（S9=170），降至 160 避免极端值
        // 真实 NBA 单场最高 176（1983 掘金）是历史极端；160 已覆盖 99.9% 比赛
        homeScore = Math.min(homeScore, 160);
        awayScore = Math.min(awayScore, 160);

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
        if (score <= 0) {
            if (otScores) otScores.forEach(s => q.push(s));
            return q;
        }
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
    // AST: PG 系数 1.5→1.55，温和提升让精英控卫助攻更集中（1.65 导致助攻王 14+ 偏高）
    // REB: C 系数 1.2→1.15，配合 per-36 下调进一步压制篮板王产出
    // BLK: C 系数 1.5→1.35，压制中锋盖帽产出（修复盖帽王 4+ 的 bug）
    const REB_POS_FACTOR = { PG: 0.85, SG: 0.92, SF: 1.0, PF: 1.1, C: 1.15 };
    // 修复：PG 助攻系数 1.45→1.30，配合 astPer36Fn 下调避免助攻王偏高(20季均值12.18，最高14.45)
    // 真实 NBA 顶级 PG 助攻 10-12 APG（哈利伯顿10.9、特雷杨11.2、布伦森8.9）
    // 1.45 让精英 PG 占团队助攻 56%，超出真实 ~40% 的上限；1.30 → ~46% 接近真实
    const AST_POS_FACTOR = { PG: 1.30, SG: 1.0, SF: 0.75, PF: 0.6, C: 0.55 };
    const BLK_POS_FACTOR = { PG: 0.35, SG: 0.45, SF: 0.7, PF: 1.1, C: 1.35 };
    // 修复：PG/SG 抢断系数 1.15/1.10→1.05/1.0，配合 stlPer36Fn 下调避免抢断王偏高(均值2.80)
    // 真实 NBA 抢断王 2.0-3.0 SPG，原 1.15 叠加高端 2.8 给出 3.0+ SPG
    const STL_POS_FACTOR = { PG: 1.05, SG: 1.0, SF: 1.0, PF: 0.85, C: 0.75 };

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
        // 助攻总数 ≈ 进球数 × 助攻率（58-68%）
        const totalFgm = sum(lines.map(l => l.fgm));
        let targetAst = Math.round(totalFgm * rand(0.58, 0.68));
        targetAst = Math.max(18, Math.min(targetAst, 34));
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
        // 系列赛每场球员数据快照，供总决赛 MVP 评选使用
        // 结构: [{ home: { teamId, lines }, away: { teamId, lines }, homeWon, ... }]
        // teamId 从球员对象的 t 字段推断（系列赛方high/low的真实球队ID）
        const gameStats = [];
        // 从球员对象推断球队 ID（homePlayers[0].t 即系列赛 high 的真实球队）
        const homeTeamId = (homePlayers && homePlayers[0] && homePlayers[0].t) || null;
        const awayTeamId = (awayPlayers && awayPlayers[0] && awayPlayers[0].t) || null;
        const homeAdv = [1, 1, 0, 0, 1, 0, 1];
        let g = 0;
        while (homeWins < 4 && awayWins < 4 && g < 7) {
            const isHomeVenue = homeAdv[g] === 1;
            const venueHome = isHomeVenue ? homePlayers : awayPlayers;
            const venueAway = isHomeVenue ? awayPlayers : homePlayers;
            const res = simulateGame(venueHome, venueAway, true);
            let homeWon = (res.winner === "home") === isHomeVenue;
            // 修复：总决赛横扫率 40% 过高（真实 NBA 约 10-15%），添加"绝地反击"机制
            // 真实 NBA 季后赛 0-3 落后方赢 G4 概率约 50%（纸面实力仅 ~25%）
            // 当一方 3-0 领先时，落后方有 30% 概率翻转下一场结果，避免横扫过于频繁
            // 修复：原 45% 概率过高，导致下克上率 37.3%（基线 20-30%），7/8 号种子频繁夺冠
            // 降至 30%：让强队优势更明显，下克上回归真实 25% 左右
            // 注：仅翻转胜负判定，不影响比分记录（保持数据真实性）
            const leadDiff = Math.abs(homeWins - awayWins);
            if (leadDiff >= 3 && g < 6) {
                const trailingIsHome = homeWins < awayWins;
                const trailingWon = trailingIsHome ? homeWon : !homeWon;
                if (!trailingWon && Math.random() < 0.30) {
                    homeWon = !homeWon;
                }
            }
            if (homeWon) homeWins++; else awayWins++;
            games.push({ homeWon, score: `${res.away.score}-${res.home.score}` });
            // 记录每场球员统计快照（按系列赛 high/low 真实球队分组，不是场地角度）
            // res.home 是 venueHome 角度（场地主队），需要还原到 seriesHome（系列赛 high 球队）
            const seriesHomeSide = isHomeVenue ? res.home : res.away;
            const seriesAwaySide = isHomeVenue ? res.away : res.home;
            gameStats.push({
                home: { teamId: homeTeamId, lines: seriesHomeSide.lines || [] },
                away: { teamId: awayTeamId, lines: seriesAwaySide.lines || [] },
                homeWon,
                homeScore: seriesHomeSide.score,
                awayScore: seriesAwaySide.score,
            });
            g++;
        }
        return { homeWins, awayWins, winner: homeWins > awayWins ? "home" : "away", games, gameStats };
    }

    // ================================================================
    //  伤病判定：返回本轮换中本场受伤的球员（不直接修改，由调用方决定如何应用）
    //  概率：每场约 6% 概率有人受伤，主力（出场时间多）风险略高
    //  返回 [{ playerId, days }] days=缺阵天数(3-18)
    // ================================================================
    function rollInjuries(rotation) {
        const injuries = [];
        // 修复：原 0.020 概率导致每赛季 327 次伤病（基线 30-60 次的 5-10 倍）
        // 真实 NBA 每赛季伤病约 150-200 次（含轻伤），降至 0.010 让总数约 165 次
        // 同时加入单队同时受伤上限 3 人（真实 NBA 单队同时伤停 >4 人极少）
        let teamInjuryCount = 0;
        rotation.forEach(r => {
            if (teamInjuryCount >= 3) return; // 单队同时受伤上限 3 人
            // 出场时间越多受伤概率越高；年龄大风险略增
            const minFactor = r.min / 36;
            const ageFactor = r.player.a >= 32 ? 1.4 : r.player.a <= 23 ? 0.8 : 1.0;
            const prob = 0.010 * minFactor * ageFactor; // 单球员每场约 0.6%-1.4%
            if (Math.random() < prob) {
                const days = randInt(3, 18);
                injuries.push({ playerId: r.player.id, days });
                teamInjuryCount++;
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
