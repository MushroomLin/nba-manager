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

                // 主客场均衡分配：3 场对决用 pairKey 哈希决定哪方多 1 主场，
                // 使每队 4 次 3 场对决中约 2 次 2H / 2 次 1H，避免固定 2 主 1 客
                const flip = (hashStr(key) % 2 === 0);
                const homeForT = count === 3 ? (flip ? 2 : 1) : Math.ceil(count / 2);
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
        // 给每个种子附加 seed 字段（standings 已按战绩排序，index+1 即种子号）
        const withSeed = (seeded) => seeded.map((entry, i) => ({ ...entry, seed: i + 1 }));
        const eastSeeded = withSeed(east8);
        const westSeeded = withSeed(west8);
        // 1v8, 4v5, 3v6, 2v7
        const pairings = (seeded) => [
            { high: seeded[0], low: seeded[7] },
            { high: seeded[3], low: seeded[4] },
            { high: seeded[2], low: seeded[5] },
            { high: seeded[1], low: seeded[6] },
        ];
        return {
            east: pairings(eastSeeded),
            west: pairings(westSeeded),
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
        // seed 升序排序辅助：seed 缺失时回退到战绩（winRate 降序）
        const bySeed = (a, b) => {
            const sa = a.seed != null ? a.seed : 99;
            const sb = b.seed != null ? b.seed : 99;
            if (sa !== sb) return sa - sb;
            return (b.winRate || 0) - (a.winRate || 0);
        };
        if (winners.length === 4) {
            // 按真实 seed 升序排序，1v4 / 2v3 配对，seed 小的为 high（有主场优势）
            const sorted = [...winners].sort(bySeed);
            return [
                { high: sorted[0], low: sorted[3] },
                { high: sorted[1], low: sorted[2] },
            ];
        } else {
            // 2 个胜者 → 1 组，主场优势给 seed 更小（或战绩更好）者
            const sorted = [...winners].sort(bySeed);
            return [{ high: sorted[0], low: sorted[1] }];
        }
    }

    // 休赛期：球员成长与老化
    // 返回 { changes, retired } —— changes 为重要成长记录，retired 为退役球员数组
    function offseasonProgression(players) {
        const changes = [];
        const retired = [];
        // 第一阶段：年龄增长 + 能力调整（暂不清除 isRookie，留给后续评选参考）
        players.forEach(p => {
            const before = { ...p };
            // 年龄老化
            p.a += 1;
            // 在联盟年数 +1（用于新秀合同判断）；老存档球员默认按 5 年处理（已过新秀期）
            if (p.yrsInLeague == null) p.yrsInLeague = 5;
            p.yrsInLeague += 1;
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
            // 新秀额外成长（仅对刚结束的新秀赛季生效，之后 isRookie 会被清掉）
            if (p.isRookie && p.a <= 23) delta += randInt(1, 3);
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

            if (Math.abs(delta) >= 2) {
                changes.push({ player: p, delta, before: before.o });
            }
        });

        // 第二阶段：评估退役
        // 规则：35岁以上老将按能力衰退程度概率退役；38岁以上强制退役概率提升；
        // 保证联盟每年有合理数量的球员退役（约 20-30 人），与新秀补充量平衡
        players.forEach(p => {
            if (p.isFiller) {
                // 填充球员：能力过低或年龄过大直接淘汰（不进入自由市场）
                if (p.o < 65 || p.a > 36) {
                    retired.push(p);
                }
                return;
            }
            // 真实球员：基于年龄和能力的退役概率
            let retireProb = 0;
            if (p.a >= 40) retireProb = 0.85;
            else if (p.a >= 38) retireProb = 0.55;
            else if (p.a >= 36) retireProb = 0.30;
            else if (p.a >= 34) retireProb = 0.12;
            else if (p.a >= 32) retireProb = 0.04;
            // 能力低于阈值的退役概率增加（打不动了）
            if (p.o < 68) retireProb += 0.15;
            if (p.o < 62) retireProb += 0.30;
            // 受过重伤（赛季报销）的老将更易退役
            if (p.injured > 60 && p.a > 30) retireProb += 0.15;

            if (Math.random() < retireProb) {
                retired.push(p);
            }
        });

        // 第三阶段：从联盟移除退役球员（保留在 state.players 供历史查询，但从球队名单移除）
        // 注意：这里只标记 isRetired，由调用方负责从 teamsPlayers 中清理
        retired.forEach(p => {
            p.isRetired = true;
            p.t = null;
            // 进入第二季不再算新秀（退役的当然不算）
            p.isRookie = false;
        });

        // 第四阶段：清除未退役球员的 isRookie 标记
        // 注意：评选奖项发生在常规赛结束（presentSeasonAwards），此时 isRookie 已经是 false，
        // 这会导致 ROY 找不到新秀。修复方案：把 isRookie 清除时机改到「新赛季的第一次比赛后」。
        // 但更简单的做法：在 computeAwards 中通过 draftYear 字段判断是否为新秀赛季。
        // 这里仍然清除 isRookie，保持与新秀「只享受一年新秀待遇」的语义一致。
        players.forEach(p => {
            if (!p.isRetired && p.isRookie) {
                // 把新秀赛季信息存入 lastRookieYear，供 computeAwards 评选 ROY 使用
                p.lastRookieYear = p.draftYear;
                p.isRookie = false;
            }
        });

        return { changes, retired };
    }

    function adjustSalaryByAge(p) {
        const base = TradeEngine.salaryForOvr(p.o);
        // 新秀合同：选秀后前 4 个赛季享受新秀合同价（约为市场价 40-60%）
        // draftYear 记录选秀年份；当前赛季序号 = state.year - draftYear + 1
        // 但此函数无法访问 state，改用 playerYrsInLeague 字段（由 offseasonProgression 维护）
        if (p.yrsInLeague != null && p.yrsInLeague <= 4) {
            return base * 0.5;  // 新秀合同期内
        }
        // 老将衰退打折
        if (p.a >= 38) return base * 0.5;
        if (p.a >= 36) return base * 0.65;
        if (p.a >= 34) return base * 0.8;
        if (p.a >= 32) return base * 0.9;
        return base;
    }

    // 生成自由球员（休赛期补充市场）
    function generateFreeAgents(count = 15) {
        const proto = window.ROOKIE_PROTOTYPES;
        const fas = [];
        const usedNames = new Set();
        function genName() {
            for (let attempt = 0; attempt < 30; attempt++) {
                const fn = proto.firstNames[Math.floor(Math.random() * proto.firstNames.length)];
                const ln = proto.lastNames[Math.floor(Math.random() * proto.lastNames.length)];
                const full = `${fn}·${ln}`;
                if (!usedNames.has(full)) { usedNames.add(full); return full; }
            }
            return `${proto.firstNames[0]}·${proto.lastNames[0]}_${Math.floor(Math.random()*99)}`;
        }
        for (let i = 0; i < count; i++) {
            const pos = pick(proto.positions);
            const profile = window.ROOKIE_POS_PROFILES[pos];
            const ovr = randInt(66, 76);
            const age = randInt(24, 33);
            const v = () => randInt(-5, 5);
            const p = {
                id: `fa_${Date.now()}_${i}_${Math.random().toString(36).slice(2,7)}`,
                n: genName(),
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
    // 返回 {ok, reason}；可选 teamId 用于设置球员归属，缺失时从现有名单推断
    function signFreeAgent(teamPlayers, player, teamId) {
        if (teamPlayers.length >= 15) return { ok: false, reason: "名单已满(15人)" };
        // 薪资空间检查：当前总薪资 + 球员薪资 不得超过工资帽
        const cap = window.SALARY_CAP;
        const currentSalary = teamPlayers.reduce((s, p) => s + (p.sal || 0), 0);
        if (cap != null && currentSalary + (player.sal || 0) > cap) {
            return { ok: false, reason: "薪资空间不足" };
        }
        // 设置球队归属：优先用传入的 teamId，否则从现有名单推断
        const tid = teamId != null ? teamId : (teamPlayers.find(p => p && p.t != null) || {}).t;
        if (tid != null) player.t = tid;
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
    // 简单字符串哈希（用于赛程主客场均衡分配的确定性 flip）
    function hashStr(s) {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        return Math.abs(h);
    }

    // ================================================================
    //  赛季奖项评选 AwardsEngine
    //  规则: 基于常规赛累积数据 + 球队战绩 + 能力值综合评分
    //    MVP / DPOY / ROY / 最佳第六人 / 进步最快球员
    //    最佳阵容一阵/二阵/三阵 (各 2后场+3前场)
    //    最佳防守一阵/二阵 (各 2后场+3前场)
    //    最佳新秀一阵/二阵 (各 2后场+3前场)
    // ================================================================
    function computeAwards(state) {
        const candidates = [];
        // 用于进步最快球员: 记录本赛季 ovr 与上赛季 ovr 的差值
        const playerHistory = state.playerHistory || {};
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
                // 第六人评分: 板凳出场(按 ovr 排序，前5为首发，其余为替补)
                const sortedRoster = [...(state.teamsPlayers[teamId] || [])].sort((a, b) => b.o - a.o);
                const isBench = p.isFiller || !sortedRoster.slice(0, 5).includes(p);
                const sixManScore = efficiency * 1.1 + (isBench ? 5 : -10) + p.o * 0.1;
                // 进步最快: 与上赛季 ovr 差值 + 数据提升
                const hist = playerHistory[pid];
                const lastOvr = hist && hist.length ? hist[hist.length - 1].ovr : p.o;
                const ovrDelta = p.o - lastOvr;
                const mipScore = ovrDelta * 5 + efficiency * 0.5;
                candidates.push({
                    player: p, teamId, ppg, rpg, apg, spg, bpg, tpg, fgPct, tpPct, gp: s.gp, winRate,
                    mvpScore, defScore, sixManScore, mipScore, ovrDelta, isBench,
                });
            });
        });

        const sorted = (arr, key, desc = true) => arr.slice().sort((a, b) => desc ? b[key] - a[key] : a[key] - b[key]);
        const mvpList = sorted(candidates, "mvpScore");
        const dpoyList = sorted(candidates, "defScore");
        // ROY 候选：本赛季是该球员的新秀赛季
        // 修复 bug：原代码用 isRookie===true，但 offseasonProgression 已在赛季开始前清除 isRookie，
        // 导致 ROY 永远没人。改用 draftYear === state.year-1 判断（上赛季选秀进联盟的球员，
        // 本赛季就是新秀赛季）。同时兼容旧逻辑：isRookie 仍为 true 也算新秀。
        const royList = sorted(candidates.filter(c => {
            if (c.player.isRookie === true) return true;
            // draftYear 记录球员被选中的年份；state.year-1 是刚结束赛季的起始年
            // 例：2025 年选秀 → draftYear=2025 → 2025-26 赛季是新秀赛季 → 赛季结束时 state.year=2025
            // 所以 ROY 候选条件：draftYear === state.year
            if (c.player.draftYear === state.year) return true;
            // 兼容 lastRookieYear 标记
            if (c.player.lastRookieYear === state.year) return true;
            return false;
        }), "mvpScore");
        const sixManList = sorted(candidates.filter(c => c.isBench), "sixManScore");
        const mipList = sorted(candidates.filter(c => {
            if (c.ovrDelta < 2) return false;
            // 排除上赛季已成名的超巨（hist 存在且 lastOvr>=82）
            const h = playerHistory[c.player.id];
            if (h && h.length && h[h.length - 1].ovr >= 82) return false;
            // 排除新秀（新秀赛季不参评 MIP，因为没有上赛季数据可比）
            if (c.player.draftYear === state.year) return false;
            return true;
        }), "mipScore");

        // 最佳阵容：每阵 2后场(PG/SG) + 3前场(SF/PF/C)，依次选出一阵/二阵/三阵
        function pickAllNBATeams(sourceList, teamCount = 3) {
            const teams = [];
            const used = new Set();
            for (let t = 0; t < teamCount; t++) {
                const guards = sourceList.filter(c => !used.has(c.player.id) && ["PG", "SG"].includes(c.player.p));
                const forwards = sourceList.filter(c => !used.has(c.player.id) && ["SF", "PF", "C"].includes(c.player.p));
                const team = [...guards.slice(0, 2), ...forwards.slice(0, 3)];
                team.forEach(c => used.add(c.player.id));
                teams.push(team);
            }
            return teams;
        }
        const allNBATeams = pickAllNBATeams(mvpList, 3); // [一阵, 二阵, 三阵]
        const allDefTeams = pickAllNBATeams(dpoyList, 2); // [防守一阵, 防守二阵]
        const allRookieTeams = pickAllNBATeams(royList, 2); // [新秀一阵, 新秀二阵]

        return {
            year: state.year,
            mvp: mvpList[0] || null,
            dpoy: dpoyList[0] || null,
            roy: royList[0] || null,
            sixMan: sixManList[0] || null,
            mip: mipList[0] || null,
            // 最佳阵容一阵/二阵/三阵
            allNBAFirst:  allNBATeams[0].map(c => c.player.id),
            allNBASecond: allNBATeams[1].map(c => c.player.id),
            allNBAThird:  allNBATeams[2].map(c => c.player.id),
            // 最佳防守一阵/二阵
            allDefFirst:  allDefTeams[0].map(c => c.player.id),
            allDefSecond: allDefTeams[1].map(c => c.player.id),
            // 最佳新秀一阵/二阵
            allRookieFirst:  allRookieTeams[0].map(c => c.player.id),
            allRookieSecond: allRookieTeams[1].map(c => c.player.id),
            // 兼容旧字段
            allNBA: allNBATeams[0].map(c => c.player.id),
            allDefensive: allDefTeams[0].map(c => c.player.id),
            allRookie: allRookieTeams[0].map(c => c.player.id),
            // 详情用于展示
            mvpTop5: mvpList.slice(0, 5),
            dpoyTop5: dpoyList.slice(0, 5),
            royTop5: royList.slice(0, 5),
            sixManTop5: sixManList.slice(0, 5),
            mipTop5: mipList.slice(0, 5),
            allNBAFirstDetail:  allNBATeams[0],
            allNBASecondDetail: allNBATeams[1],
            allNBAThirdDetail:  allNBATeams[2],
            allDefFirstDetail:  allDefTeams[0],
            allDefSecondDetail: allDefTeams[1],
            allRookieFirstDetail:  allRookieTeams[0],
            allRookieSecondDetail: allRookieTeams[1],
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
