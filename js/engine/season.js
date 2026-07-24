// 赛季引擎 —— 赛程生成、常规赛、季后赛、休赛期成长
// NBA 常规赛 82 场: 同分区4场×4=16, 同联盟跨分区约36, 跨联盟2场×15=30
// 季后赛: 每联盟前8, 七局四胜, 4 轮 (首轮/半决赛/分区决赛/总决赛)

const SeasonEngine = (() => {

    // 生成 82 场赛程，按"天"（gameDay）组织，便于逐日推进
    function generateSchedule(teams) {
        // 对称构造，保证每队正好 82 场:
        //   同分区 4 场 × 4 = 16
        //   同联盟跨分区: 对每对跨分区组合用 (i+j)%5<3 决定 4 场否则 3 场 → 每队 36 场
        //   跨联盟 2 场 × 15 = 30
        //   合计 16 + 36 + 30 = 82
        const rawGames = [];
        const processed = new Set();

        // 给每个分区内球队建立稳定索引 (0-4)
        const divIndex = {}; // teamId -> {conf, div, idx}
        const divCounters = {};
        teams.forEach(t => {
            const key = t.conf + "|" + t.div;
            if (divCounters[key] === undefined) divCounters[key] = 0;
            divIndex[t.id] = { conf: t.conf, div: t.div, idx: divCounters[key]++ };
        });

        const pairKey = (a, b) => [a, b].sort().join("|");

        teams.forEach(t => {
            teams.forEach(x => {
                if (t.id === x.id) return;
                const key = pairKey(t.id, x.id);
                if (processed.has(key)) return;
                processed.add(key);

                let count;
                if (t.conf !== x.conf) {
                    count = 2; // 跨联盟
                } else if (t.div === x.div) {
                    count = 4; // 同分区
                } else {
                    // 同联盟跨分区: 用 (idx_i + idx_j) % 5 < 3 → 4 场, 否则 3 场 (对称)
                    const ti = divIndex[t.id].idx;
                    const xi = divIndex[x.id].idx;
                    count = ((ti + xi) % 5 < 3) ? 4 : 3;
                }

                // 主客场均衡分配
                const homeForT = Math.ceil(count / 2);
                for (let g = 0; g < count; g++) {
                    const homeIsT = g < homeForT;
                    rawGames.push({
                        home: homeIsT ? t.id : x.id,
                        away: homeIsT ? x.id : t.id,
                    });
                }
            });
        });

        // 分配到比赛日：每天每队最多 1 场
        const days = [];
        const remaining = [...rawGames];
        shuffle(remaining);
        let maxDays = 200;
        while (remaining.length > 0 && days.length < maxDays) {
            const day = [];
            const playedToday = new Set();
            for (let i = remaining.length - 1; i >= 0; i--) {
                const g = remaining[i];
                if (!playedToday.has(g.home) && !playedToday.has(g.away)) {
                    day.push(g);
                    playedToday.add(g.home);
                    playedToday.add(g.away);
                    remaining.splice(i, 1);
                }
            }
            days.push(day);
        }
        return days;
    }


    // 计算排名
    function computeStandings(teams, records) {
        const east = [], west = [];
        teams.forEach(t => {
            const r = records[t.id] || { win: 0, loss: 0 };
            const entry = {
                teamId: t.id, abbr: t.abbr, name: `${t.city}${t.name}`,
                conf: t.conf, div: t.div, color: t.color,
                win: r.win, loss: r.loss,
                winRate: r.win + r.loss > 0 ? r.win / (r.win + r.loss) : 0,
                streak: r.streak || 0,
            };
            if (t.conf === "East") east.push(entry); else west.push(entry);
        });
        const byWinRate = (a, b) => b.winRate - a.winRate || b.win - a.win;
        east.sort(byWinRate);
        west.sort(byWinRate);
        return { east, west };
    }

    // 设置季后赛对阵（每联盟前8）
    // 返回首轮对阵: [{high, low, series}]
    function setupPlayoffs(standings) {
        const east8 = standings.east.slice(0, 8);
        const west8 = standings.west.slice(0, 8);
        // 1v8, 4v5, 3v6, 2v7
        const pairings = (seeded) => [
            { high: seeded[0], low: seeded[7] },
            { high: seeded[3], low: seeded[4] },
            { high: seeded[2], low: seeded[5] },
            { high: seeded[1], low: seeded[6] },
        ];
        return {
            east: pairings(east8),
            west: pairings(west8),
        };
    }

    // 模拟一个季后赛轮次
    // pairings: [{high:teamId, low:teamId}]
    // 返回 [{high, low, winner, highWins, lowWins, games}]
    function simulatePlayoffRound(pairings, teamsPlayers) {
        return pairings.map(pair => {
            const homePlayers = teamsPlayers[pair.high.teamId];
            const awayPlayers = teamsPlayers[pair.low.teamId];
            const res = SimEngine.simulateSeries(homePlayers, awayPlayers);
            return {
                high: pair.high, low: pair.low,
                winner: res.winner === "home" ? pair.high : pair.low,
                highWins: res.homeWins, lowWins: res.awayWins,
                games: res.games,
            };
        });
    }

    // 下一轮对阵：胜者重新种子（高种子对低种子）
    // results 数量: 首轮4条→次轮2组; 次轮2条→分区决赛1组
    function nextRound(results) {
        const winners = results.map(r => r.winner);
        if (winners.length <= 1) return [];
        if (winners.length === 4) {
            // 首轮胜者对应种子 [1,4,3,2]，重排后 1v4 / 2v3
            const seedOrder = [1, 4, 3, 2];
            const indexed = winners.map((w, i) => ({ team: w, seed: seedOrder[i] }));
            indexed.sort((a, b) => a.seed - b.seed);
            return [
                { high: indexed[0].team, low: indexed[3].team },
                { high: indexed[1].team, low: indexed[2].team },
            ];
        } else {
            // 2 个胜者 → 1 组，主场优势给战绩更好者
            const sorted = [...winners].sort((a, b) => (b.winRate || 0) - (a.winRate || 0));
            return [{ high: sorted[0], low: sorted[1] }];
        }
    }

    // 休赛期：球员成长与老化
    function offseasonProgression(players) {
        const changes = [];
        players.forEach(p => {
            const before = { ...p };
            // 年龄老化
            p.a += 1;
            let delta = 0;
            if (p.a <= 23) {
                // 年轻球员成长（朝潜力靠近）
                const target = p.pot || p.o + 3;
                const grow = Math.max(1, Math.round((target - p.o) * 0.35 + randInt(-1, 2)));
                delta = grow;
            } else if (p.a <= 27) {
                // 巅峰期微涨
                delta = randInt(-1, 2);
            } else if (p.a <= 31) {
                delta = randInt(-2, 1);
            } else if (p.a <= 34) {
                delta = randInt(-3, 0);
            } else {
                delta = randInt(-5, -1);
            }
            // 新秀额外成长
            if (p.isRookie && p.a <= 22) delta += randInt(1, 3);
            p.o = Math.max(40, Math.min(99, p.o + delta));
            // 各项能力同步微调
            const skills = ["ins","sh","pa","re","de","at","iq"];
            skills.forEach(s => {
                p[s] = Math.max(20, Math.min(99, p[s] + Math.round(delta * 0.7 + randInt(-1, 1))));
            });
            // 运动能力随年龄下降更快
            if (p.a > 30) p.at = Math.max(20, p.at - randInt(0, 2));

            // 薪资随表现调整（简化：能力变化对应薪资）
            p.sal = Math.round(adjustSalaryByAge(p) * 10) / 10;
            p.isRookie = false; // 进入第二季不再算新秀

            if (Math.abs(delta) >= 2) {
                changes.push({ player: p, delta, before: before.o });
            }
        });
        return changes;
    }

    function adjustSalaryByAge(p) {
        const base = TradeEngine.salaryForOvr(p.o);
        if (p.a > 34) return base * 0.7;
        if (p.a > 32) return base * 0.85;
        if (p.a < 24 && p.o >= 80) return base * 1.1; // 新星顶薪
        return base;
    }

    // 生成自由球员（休赛期补充市场）
    function generateFreeAgents(count = 15) {
        const proto = window.ROOKIE_PROTOTYPES;
        const fas = [];
        for (let i = 0; i < count; i++) {
            const pos = pick(proto.positions);
            const profile = window.ROOKIE_POS_PROFILES[pos];
            const ovr = randInt(66, 76);
            const age = randInt(24, 33);
            const v = () => randInt(-5, 5);
            const p = {
                id: `fa_${Date.now()}_${i}_${Math.random().toString(36).slice(2,7)}`,
                n: pick(proto.names) + " " + (Math.random() < 0.3 ? "二世" : ""),
                t: null,
                p: pos, a: age, o: ovr, pot: ovr + randInt(0, 3),
                sal: TradeEngine.salaryForOvr(ovr) * (0.7 + Math.random() * 0.4),
                ins: clamp(profile.ins + v(), 40, 80),
                sh: clamp(profile.sh + v(), 40, 82),
                pa: clamp(profile.pa + v(), 35, 78),
                re: clamp(profile.re + v(), 35, 80),
                de: clamp(profile.de + v(), 40, 80),
                at: clamp(profile.at + v(), 50, 85),
                iq: clamp(profile.iq + v(), 50, 82),
                isFreeAgent: true,
            };
            p.sal = Math.round(p.sal * 10) / 10;
            fas.push(p);
        }
        return fas;
    }

    // 签约自由球员（加入球队，需有名额且薪资空间/特例）
    function signFreeAgent(teamPlayers, player) {
        if (teamPlayers.length >= 15) return { ok: false, reason: "名单已满(15人)" };
        player.isFreeAgent = false;
        teamPlayers.push(player);
        return { ok: true };
    }

    // 释放球员（变自由球员）
    function releasePlayer(teamPlayers, playerId) {
        if (teamPlayers.length <= 14) return { ok: false, reason: "名单不足14人，无法释放" };
        const idx = teamPlayers.findIndex(p => p.id === playerId);
        if (idx === -1) return { ok: false, reason: "未找到球员" };
        const [p] = teamPlayers.splice(idx, 1);
        p.isFreeAgent = true;
        p.t = null;
        return { ok: true, player: p };
    }

    function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } }

    // ================================================================
    //  赛季奖项评选 AwardsEngine
    //  规则: 基于常规赛累积数据 + 球队战绩 + 能力值综合评分
    //    MVP: 进攻数据为主 + 球队胜率加权
    //    DPOY: 防守数据(抢断/盖帽) + 防守能力 + 球队失分
    //    ROY: 仅新秀参与，按综合数据
    //    最佳阵容/防守阵/新秀阵: 各5人(2后场+3前场)
    // ================================================================
    function computeAwards(state) {
        const candidates = [];
        Object.entries(state.statAccum).forEach(([teamId, acc]) => {
            const teamRec = state.records[teamId] || { win: 0, loss: 0 };
            const gp = teamRec.win + teamRec.loss;
            const winRate = gp > 0 ? teamRec.win / gp : 0;
            Object.entries(acc).forEach(([pid, s]) => {
                if (s.gp < 20) return; // 至少打 20 场才参评
                const p = state.players.find(x => x.id === pid);
                if (!p) return;
                const ppg = s.pts / s.gp, rpg = s.reb / s.gp, apg = s.ast / s.gp;
                const spg = s.stl / s.gp, bpg = s.blk / s.gp, tpg = s.tov / s.gp;
                const fgPct = s.fga > 0 ? s.fgm / s.fga : 0.45;
                const tpPct = s.tpa > 0 ? s.tpm / s.tpa : 0.33;
                const efficiency = ppg + rpg * 1.2 + apg * 1.5 + spg * 2 + bpg * 2 - tpg * 1.2;
                // MVP 评分: 数据效率 + 球队胜率(权重高) + 能力修正 + 效率(命中率)
                const mvpScore = efficiency * 1.0 + winRate * 22 + p.o * 0.15 + (fgPct - 0.45) * 30 + (tpPct - 0.35) * 10;
                // 防守评分: 抢断/盖帽 + 防守能力 + 球队失分越少越好
                const defScore = spg * 6 + bpg * 5 + p.de * 0.5 + p.re * 0.15 + winRate * 8;
                candidates.push({
                    player: p, teamId, ppg, rpg, apg, spg, bpg, tpg, fgPct, tpPct, gp: s.gp, winRate,
                    mvpScore, defScore,
                });
            });
        });

        const sorted = (arr, key, desc = true) => arr.slice().sort((a, b) => desc ? b[key] - a[key] : a[key] - b[key]);
        const mvpList = sorted(candidates, "mvpScore");
        const dpoyList = sorted(candidates, "defScore");
        const royList = sorted(candidates.filter(c => c.player.isRookie || c.player.a <= 22), "mvpScore");

        // 最佳阵容：2后场(PG/SG) + 3前场(SF/PF/C)
        const guards = mvpList.filter(c => ["PG", "SG"].includes(c.player.p));
        const forwards = mvpList.filter(c => ["SF", "PF", "C"].includes(c.player.p));
        const allNBA = [...guards.slice(0, 2), ...forwards.slice(0, 3)];
        // 最佳防守阵
        const defGuards = dpoyList.filter(c => ["PG", "SG"].includes(c.player.p));
        const defForwards = dpoyList.filter(c => ["SF", "PF", "C"].includes(c.player.p));
        const allDefensive = [...defGuards.slice(0, 2), ...defForwards.slice(0, 3)];
        // 最佳新秀阵
        const allRookie = royList.slice(0, 5);

        return {
            year: state.year,
            mvp: mvpList[0] || null,
            dpoy: dpoyList[0] || null,
            roy: royList[0] || null,
            allNBA: allNBA.map(c => c.player.id),
            allDefensive: allDefensive.map(c => c.player.id),
            allRookie: allRookie.map(c => c.player.id),
            // 详情用于展示
            mvpTop5: mvpList.slice(0, 5),
            dpoyTop5: dpoyList.slice(0, 5),
            royTop5: royList.slice(0, 5),
        };
    }

    return {
        generateSchedule,
        computeStandings,
        setupPlayoffs,
        simulatePlayoffRound,
        nextRound,
        offseasonProgression,
        generateFreeAgents,
        signFreeAgent,
        releasePlayer,
        computeAwards,
    };
})();

window.SeasonEngine = SeasonEngine;
