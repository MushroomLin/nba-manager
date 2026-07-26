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
    // 返回 [{high, low, winner, highWins, lowWins, games, gameStats}]
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
                gameStats: res.gameStats || [],
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
    // 注意：自由球员（isFreeAgent=true）由 ageFreeAgents 单独处理，此处跳过避免双重老化
    function offseasonProgression(players) {
        const changes = [];
        const retired = [];
        // 第一阶段：年龄增长 + 能力调整（暂不清除 isRookie，留给后续评选参考）
        players.forEach(p => {
            // 自由球员由 ageFreeAgents 单独处理，此处跳过避免双重老化
            if (p.isFreeAgent) return;
            const before = { ...p };
            // 年龄老化
            p.a += 1;
            // 在联盟年数 +1（用于新秀合同判断）；老存档球员默认按 5 年处理（已过新秀期）
            if (p.yrsInLeague == null) p.yrsInLeague = 5;
            p.yrsInLeague += 1;
            let delta = 0;
            if (p.a <= 23) {
                // 年轻球员成长（朝潜力靠近）
                // 修复 v4：原 0.50/0.62 让新秀 3 年涨 6-9 点，超过真实 NBA 的 3-5 点
                // 降至 0.32/0.42：3 年涨 4-6 点，配合降低后的新秀初始强度，成才率回归合理
                const target = p.pot || p.o + 3;
                const growthRate = (p.pot && p.pot - p.o >= 10) ? 0.42 : 0.32;
                const grow = Math.round((target - p.o) * growthRate + randInt(-1, 1));
                delta = Math.max(0, grow); // 至少不退步（年轻球员保护）
            } else if (p.a <= 27) {
                // 巅峰期：朝潜力稳步成长
                // 修复 v4：初始球员 pot = ovr + 0~4，gap < 3 时进入零均值导致不成长甚至退步
                // 真实 NBA 24-27 岁是巅峰期，应稳步接近 pot 上限
                // 修复方案：动态提升 pot 下限，确保 24-27 岁球员有成长空间
                let target = p.pot || p.o;
                // 24-27 岁球员 pot 下限提升至 ovr + 4（若原本更低）
                if (target < p.o + 4) target = p.o + 4;
                const gap = Math.max(0, target - p.o);
                if (gap >= 3) {
                    delta = Math.max(0, Math.round(gap * 0.30 + randInt(-1, 1))); // 仍向 pot 成长
                } else {
                    delta = randInt(-1, 1); // 接近 pot，基本持平
                }
            } else if (p.a <= 31) {
                // 巅峰末期开始衰退（期望 -1）
                delta = randInt(-3, 1);
            } else if (p.a <= 34) {
                // 老将加速衰退
                delta = randInt(-5, 0);
            } else {
                // 高龄快速衰退
                delta = randInt(-7, 0);
            }
            // 超巨保护：ovr≥90 的球员单季衰退不超过 -6，延长巅峰期但允许自然衰退
            // 修复 v2：原 -5 保护仍让 ovr90 后期反弹至 24-29，放宽至 -6 加快超巨淡出
            if (p.o >= 90 && delta < -6) delta = -6;
            // 新秀额外成长（仅对刚结束的新秀赛季生效，之后 isRookie 会被清掉）
            // 修复：randInt(1, 3) 期望 +2 叠加成长率导致 MIP ovrΔ 普遍 10-17（期望 3-8）
            // 降至 randInt(0, 2) 期望 +1，配合下方单季成长上限 8
            if (p.isRookie && p.a <= 23) delta += randInt(0, 2);
            // 修复：单季成长硬上限，避免高潜新秀单季 +10 以上跳变（MIP ovrΔ 离谱根因）
            // 真实 NBA 单季最大进步约 +8-9（如恩比德新秀年），上限设 9 平衡超巨培养与防跳变
            if (delta > 9) delta = 9;
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
        // 注意：自由球员（isFreeAgent=true）由 ageFreeAgents 处理退役，此处跳过
        players.forEach(p => {
            if (p.isFreeAgent) return;
            if (p.isFiller) {
                // 填充球员：能力过低或年龄过大直接淘汰（不进入自由市场）
                if (p.o < 65 || p.a > 36) {
                    retired.push(p);
                }
                return;
            }
            // 真实球员：基于年龄和能力的退役概率
            // 球星保护：高 ovr 球员退役概率大幅降低，延长生涯（参考 LeBron/Curry/Durant 37+ 仍在阵）
            // 修复：能力膨胀根因之一，提高退役概率让超巨更快淡出
            let retireProb = 0;
            if (p.a >= 41) retireProb = 0.80;
            else if (p.a >= 40) retireProb = 0.55;
            else if (p.a >= 38) retireProb = 0.35;
            else if (p.a >= 36) retireProb = 0.20;
            // 修复：中后期退役人数过低（S8=0, S13/15/17=1），低于 20-30 目标区间
            // 提高 33-35 岁段退役概率，让老将更稳步退出，避免"退役真空期"
            else if (p.a >= 34) retireProb = 0.12;
            else if (p.a >= 33) retireProb = 0.06;
            else if (p.a >= 32) retireProb = 0.03;
            // 球星保护：高能力球员退役概率折扣
            // 修复：原 0.45 折扣过强（ovr≥90 长期 14-28 个），调至 0.60 让超巨更早退役
            if (p.o >= 90)      retireProb *= 0.60;
            else if (p.o >= 86) retireProb *= 0.65;  // 一线巨星
            else if (p.o >= 83) retireProb *= 0.75;  // 全明星
            else if (p.o >= 80) retireProb *= 0.85;  // 优质首发
            // 修复：超巨硬性年龄下限——ovr≥90 且年龄<36 不得退役（参考 LeBron/Curry/Durant 37+ 仍在阵）
            // 原 37 岁下限保护过强，36 岁 ovr=90 球员退役概率仅 6.3%，造成超巨堆积
            // 调整为 36 岁：让 36 岁超巨开始有退役概率（10.8%），37 岁以上正常退役
            if (p.o >= 90 && p.a < 36) retireProb = 0;
            // 修复：低龄球员豁免能力衰退退役——原 p.o<68 / p.o<62 加概率未设年龄下限，
            // 导致 28-31 岁 ovr<62 球员 retireProb 达 0.37，20 季出现 4 例 <32 岁退役（真实 NBA 不存在）
            // 真实 NBA 中低能力球员 30 岁前通常被裁/转海外，不算"退役"；此处仅对 ≥32 岁球员施加能力退役概率
            // 修复：原 +0.25 过高导致 S1 老将集中退役（56-62人），降至 +0.18
            if (p.a >= 32 && p.o < 68) retireProb += 0.12;
            if (p.a >= 32 && p.o < 62) retireProb += 0.18;
            // 受过重伤（赛季报销）的老将更易退役
            if (p.injured > 60 && p.a > 30) retireProb += 0.10;

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
        // 注意：自由球员（含落选新秀）的 isRookie 由 ageFreeAgents 或签约后处理，
        // 落选新秀若被签约仍应算新秀（ROY 候选），此处跳过
        players.forEach(p => {
            if (p.isFreeAgent) return;
            if (!p.isRetired && p.isRookie) {
                // 把新秀赛季信息存入 lastRookieYear，供 computeAwards 评选 ROY 使用
                p.lastRookieYear = p.draftYear;
                p.isRookie = false;
            }
        });

        // 第五阶段：新秀/年轻球员"打不出来"淘汰机制
        // 真实 NBA 中约 40% 首轮秀、70% 次轮秀 3 年内离开联盟。
        // 原逻辑所有新秀都能进轮换且永远留联盟，导致联盟球员膨胀（360→791/8季）、新秀成才率虚高。
        // 修复 v4：原门槛 ovr<74 太低，新秀 3 年内涨过 74 即豁免，淘汰率接近 0
        // 提高门槛至 ovr<76，扩大年龄/年数范围，提高概率，确保联盟球员稳定
        players.forEach(p => {
            if (p.isFreeAgent || p.isRetired || p.isFiller) return;
            // 对 24-29 岁、yrsInLeague 2-5 年的球员生效（新秀合同期内/期后早期）
            if (p.yrsInLeague == null || p.yrsInLeague < 2 || p.yrsInLeague > 5) return;
            if (p.a < 24 || p.a > 29) return;
            // 高 ovr 球员保护：已打出来（轮换主力）的不淘汰
            if (p.o >= 76) return;
            // 淘汰概率：ovr 越低、年数越多，概率越高
            // 真实 NBA：ovr<65 的次轮秀 3 年内 70% 离开，ovr 70-73 的边缘球员 4 年内 40% 离开
            let cutProb = 0;
            if (p.o < 60) cutProb = 0.65;
            else if (p.o < 65) cutProb = 0.50;
            else if (p.o < 68) cutProb = 0.35;
            else if (p.o < 70) cutProb = 0.22;
            else if (p.o < 72) cutProb = 0.15;
            else cutProb = 0.10; // ovr 72-75
            // 年数加成：第 3-5 年概率递增
            if (p.yrsInLeague >= 3) cutProb *= 1.4;
            if (p.yrsInLeague >= 4) cutProb *= 1.3;
            if (p.yrsInLeague >= 5) cutProb *= 1.2;
            if (Math.random() < cutProb) {
                // 转自由市场而非直接退役（让 AI 球队有机会低价捡漏）
                p.isFreeAgent = true;
                p.t = null;
                p.yearsInFreeAgency = 0;
                // 不加入 retired，保留在 state.players 供历史查询
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

    // 强制执行硬帽（第二土豪线）：超帽球队释放最低性价比球员直至合规
    // 应在 offseasonProgression 之后、选秀之前调用
    // 释放策略：按 "薪资 / 球员价值" 降序释放（即最不划算的球员先被裁）
    // 优先释放非核心(ovr<85)；若无候选人则降级释放 ovr≥85 但非超巨核心(ovr<92)的球员
    // 名单可降至 12 人（休赛期选秀/filler 会补足，原 13 人无法处理多超巨球队）
    // 返回被释放的球员数组（用于日志/动画展示）
    function enforceHardCap(state) {
        const cap = window.SALARY_CAP;
        if (!cap) return [];
        const hardCap = cap * 1.30;
        const released = [];
        if (!state.teamsPlayers) return released;
        state.teams.forEach(t => {
            const roster = state.teamsPlayers[t.id];
            if (!roster) return;
            let teamSal = roster.reduce((s, p) => s + (p.sal || 0), 0);
            // 修复：原限制 roster.length > 8 导致多超巨球队卡死在超帽状态
            // 当 4-6 名顶薪超巨 + 2-3 角色球员 = 8 人时合计薪资仍 >182M，循环退出跳过级联释放
            // 允许降至 5 人：极端情况下可裁到 5 名核心，filler/选秀会补足至 14 人
            // filler 薪资 1.5-4.5M，9 个 filler 合计 <40M，不会重新超帽
            for (let guard = 0; teamSal > hardCap && guard < 30 && roster.length > 5; guard++) {
                // 候选释放名单：非新秀，按"薪资性价比"降序（性价比最差先裁）
                // 第一优先级：ovr<85 的非核心球员
                let candidates = roster
                    .filter(p => !p.isRookie && p.o < 85)
                    .map(p => ({
                        player: p,
                        ratio: (p.sal || 0) / ((TradeEngine.playerValue ? TradeEngine.playerValue(p) : p.o) + 1),
                    }))
                    .sort((a, b) => b.ratio - a.ratio);
                // 若无 ovr<85 候选人，降级释放 ovr 85-91 的高薪低性价比球员（保护 ovr≥92 超巨）
                if (candidates.length === 0) {
                    candidates = roster
                        .filter(p => !p.isRookie && p.o >= 85 && p.o < 92)
                        .map(p => ({
                            player: p,
                            ratio: (p.sal || 0) / ((TradeEngine.playerValue ? TradeEngine.playerValue(p) : p.o) + 1),
                        }))
                        .sort((a, b) => b.ratio - a.ratio);
                }
                // 极端情况：若仍无候选人，允许释放 ovr 92-95 的次顶薪超巨（保护 ovr≥96）
                if (candidates.length === 0) {
                    candidates = roster
                        .filter(p => !p.isRookie && p.o >= 92 && p.o < 96)
                        .map(p => ({
                            player: p,
                            ratio: (p.sal || 0) / ((TradeEngine.playerValue ? TradeEngine.playerValue(p) : p.o) + 1),
                        }))
                        .sort((a, b) => b.ratio - a.ratio);
                }
                // 终极兜底：若仍超帽，允许释放 ovr≥96 的超级顶薪球员
                // 修复：原逻辑无此层级，导致 S20 BOS 243.5M 仍超帽（6 名 ovr 91-99 球员合计 220M+）
                if (candidates.length === 0) {
                    candidates = roster
                        .filter(p => !p.isRookie && p.o >= 96)
                        .map(p => ({
                            player: p,
                            ratio: (p.sal || 0) / ((TradeEngine.playerValue ? TradeEngine.playerValue(p) : p.o) + 1),
                        }))
                        .sort((a, b) => b.ratio - a.ratio);
                }
                if (candidates.length === 0) break; // 没有可裁的，放弃（极端情况）
                const toRelease = candidates[0].player;
                const idx = roster.findIndex(p => p.id === toRelease.id);
                if (idx < 0) break;
                roster.splice(idx, 1);
                teamSal -= (toRelease.sal || 0);
                toRelease.t = null;
                toRelease.isFreeAgent = true;
                // 重新进入自由市场，滞留计时从 0 开始
                toRelease.yearsInFreeAgency = 0;
                released.push(toRelease);
            }
        });
        // 修复：被释放球员不再从 state.players 删除，而是保留并标记为自由球员
        // 用户要求：自由球员应来自各球队裁员/硬帽释放，而非纯随机生成
        // 这些球员已在循环中标记 isFreeAgent=true, t=null，保留在 state.players 供自由市场使用
        return released;
    }

    // 生成自由球员（仅作为补充，数量不足时填充）
    // 修复：用户要求自由球员应来自各球队裁员/新秀离队，而非纯随机生成
    // 主来源：enforceHardCap 释放的球员 + 名单超额裁减的球员 + 选秀落选新秀
    // 本函数仅在以上来源不足时少量补充，避免自由市场空空荡荡
    function generateFreeAgents(count = 8) {
        const proto = window.ROOKIE_PROTOTYPES;
        const fas = [];
        const usedNames = new Set();
        // NBA 名字组件黑名单（与新秀生成一致，避免与 NBA 球员重名）
        const nbaNameParts = new Set();
        if (window.PLAYERS_DATA) {
            window.PLAYERS_DATA.forEach(p => {
                if (typeof p.n === 'string') {
                    p.n.split('·').forEach(part => {
                        const t = part.trim();
                        if (t) nbaNameParts.add(t);
                    });
                }
            });
        }
        function genName() {
            for (let attempt = 0; attempt < 300; attempt++) {
                const fn = proto.firstNames[Math.floor(Math.random() * proto.firstNames.length)];
                const ln = proto.lastNames[Math.floor(Math.random() * proto.lastNames.length)];
                if (nbaNameParts.has(fn) || nbaNameParts.has(ln)) continue;
                const full = `${fn}·${ln}`;
                if (!usedNames.has(full)) { usedNames.add(full); return full; }
            }
            return `${proto.firstNames[0]}·${proto.lastNames[0]}_${Math.floor(Math.random()*99)}`;
        }
        for (let i = 0; i < count; i++) {
            const pos = pick(proto.positions);
            const profile = window.ROOKIE_POS_PROFILES[pos];
            const ovr = randInt(64, 74);
            const age = randInt(25, 34);
            const v = () => randInt(-5, 5);
            const p = {
                id: `fa_${Date.now()}_${i}_${Math.random().toString(36).slice(2,7)}`,
                n: genName(),
                t: null,
                p: pos, a: age, o: ovr, pot: ovr + randInt(0, 3),
                sal: TradeEngine.salaryForOvr(ovr) * (0.6 + Math.random() * 0.3),
                ins: clamp(profile.ins + v(), 40, 80),
                sh: clamp(profile.sh + v(), 40, 82),
                pa: clamp(profile.pa + v(), 35, 78),
                re: clamp(profile.re + v(), 35, 80),
                de: clamp(profile.de + v(), 40, 80),
                at: clamp(profile.at + v(), 50, 85),
                iq: clamp(profile.iq + v(), 50, 82),
                isFreeAgent: true,
                isFiller: false,
            };
            p.sal = Math.round(p.sal * 10) / 10;
            fas.push(p);
        }
        return fas;
    }

    // 老化与清理自由球员池：每年休赛期调用
    // 规则：自由球员年龄+1、能力衰退；年龄过大或能力过低者退役移除
    // 避免自由市场堆积大量高龄低能球员
    function ageFreeAgents(state) {
        if (!state.freeAgents || state.freeAgents.length === 0) return { aged: 0, retired: 0 };
        let aged = 0, retiredCount = 0;
        const survivors = [];
        state.freeAgents.forEach(p => {
            p.a += 1;
            // 追踪在自由市场滞留的年数：滞留越久越难找到工作，退役概率递增
            // 修复：原逻辑只按年龄/能力判定退役，导致大量 27-33 岁 ovr 65-70 球员长期堆积
            if (p.yearsInFreeAgency == null) p.yearsInFreeAgency = 0;
            p.yearsInFreeAgency += 1;
            aged++;
            // 能力随年龄衰退（简化版）
            if (p.a > 30) {
                const delta = p.a > 36 ? randInt(-4, -1) : randInt(-2, 0);
                p.o = Math.max(40, Math.min(99, p.o + delta));
                const skills = ["ins","sh","pa","re","de","at","iq"];
                skills.forEach(s => {
                    p[s] = Math.max(20, Math.min(99, p[s] + Math.round(delta * 0.7 + randInt(-1, 1))));
                });
            }
            // 退役判定：35+ 按概率退役，40+ 高概率退役，能力过低直接淘汰
            // 自由球员找不到工作更容易选择退役/转海外，比现役球员更激进
            let retireProb = 0;
            if (p.a >= 40) retireProb = 0.55;
            else if (p.a >= 38) retireProb = 0.35;
            else if (p.a >= 36) retireProb = 0.20;
            else if (p.a >= 34) retireProb = 0.10;
            // 30+ 岁低能力自由球员：难以找到新合同，倾向退役/转海外
            // 避免自由市场堆积大量 30+ 岁边缘球员
            if (p.a >= 32 && p.o < 68) retireProb += 0.20;
            if (p.a >= 30 && p.o < 62) retireProb += 0.25;
            // 能力过低的自由球员（不论年龄）：难以找工作，倾向退役/转海外联赛
            // 避免自由市场堆积大量低能力落选新秀
            if (p.o < 62) retireProb += 0.25;
            else if (p.o < 66) retireProb += 0.12;
            if (p.o < 58) retireProb += 0.20;  // 能力极低直接淘汰
            // 修复：自由市场滞留时间退役加成
            // 真实 NBA 中落选/被裁球员若 1-2 年找不到工作，通常转海外联赛或退役
            // 滞留 1 年 +15%，2 年 +35%，3 年 +60%，4 年 +85%（几乎必然退役）
            // 这避免自由市场无限膨胀（原 10 季 10→373 人）
            if (p.yearsInFreeAgency >= 4) retireProb += 0.85;
            else if (p.yearsInFreeAgency >= 3) retireProb += 0.60;
            else if (p.yearsInFreeAgency >= 2) retireProb += 0.35;
            else if (p.yearsInFreeAgency >= 1) retireProb += 0.15;
            if (Math.random() < retireProb) {
                p.isRetired = true;
                retiredCount++;
            } else {
                // 薪资随能力重算（老将折扣）；滞留越久薪资越低（急切签约）
                p.sal = Math.round(adjustSalaryByAge(p) * 10) / 10;
                if (p.yearsInFreeAgency >= 2) {
                    p.sal = Math.max(0.5, Math.round(p.sal * 0.7 * 10) / 10);
                }
                survivors.push(p);
            }
        });
        // 修复：自由市场容量上限。真实 NBA 自由市场通常 50-150 人，超过 150 时清理最弱球员
        // 避免极端堆积情况下退役逻辑仍不够清理
        const MAX_FA = 150;
        if (survivors.length > MAX_FA) {
            survivors.sort((a, b) => a.o - b.o); // 升序，最弱在前
            const toRemove = survivors.splice(0, survivors.length - MAX_FA);
            toRemove.forEach(p => {
                p.isRetired = true;
                retiredCount++;
            });
        }
        state.freeAgents = survivors;
        return { aged, retired: retiredCount };
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
        // 重置自由市场滞留计时（签约后从 0 重新开始）
        player.yearsInFreeAgency = 0;
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
        // 重新进入自由市场，滞留计时从 0 开始
        p.yearsInFreeAgency = 0;
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

        // 先按 pid 聚合所有球队的 statAccum，避免赛季中交易的球员被拆成多个候选
        // 交易球员 P 在 A 队和 B 队各有 statAccum 记录，需合并为一条（总 gp/总数 → per-game）
        const playerAgg = {}; // pid -> { p, s(合并后统计), gp, teamId(当前所属) }
        Object.entries(state.statAccum).forEach(([teamId, acc]) => {
            Object.entries(acc).forEach(([pid, s]) => {
                const p = state.players.find(x => x.id === pid);
                if (!p) return;
                if (!playerAgg[pid]) {
                    // 首次记录：浅拷贝
                    // 修复：单队 gp 也可能因模拟 bug 超过 82，clamp 至 82 防止 per-game 失真
                    const firstGp = Math.min(82, s.gp || 0);
                    playerAgg[pid] = {
                        p,
                        s: { ...s, gp: firstGp },
                        gp: firstGp,
                        teamId: p.t, // 用球员当前所属球队（交易后）
                    };
                } else {
                    // 后续记录：累加（注意要累加原始计数，不是 per-game）
                    const dst = playerAgg[pid].s;
                    const keys = ["gp","min","pts","reb","ast","stl","blk","tov","pf","fgm","fga","tpm","tpa","ftm","fta","oreb"];
                    keys.forEach(k => { dst[k] = (dst[k] || 0) + (s[k] || 0); });
                    // 修复：跨队累加 gp 可能超过 82（球员被交易到比赛场次更多的球队时，
                    // A 队 50 场 + B 队 35 场 = 85 场，物理上不可能）
                    // 真实 NBA 规则：球员单季最多 82 场；按比例缩减所有计数统计以保证 per-game 准确
                    if (dst.gp > 82) {
                        const scale = 82 / dst.gp;
                        keys.forEach(k => { if (typeof dst[k] === 'number') dst[k] = Math.round(dst[k] * scale); });
                        dst.gp = 82;
                    }
                    playerAgg[pid].gp = dst.gp;
                    // 球队归属：保留当前所属（p.t 已被交易更新），不因历史数据改变
                }
            });
        });

        // 基于聚合后的数据生成候选
        // 构建球队 conf 映射，用于东西部 MVP 评选
        const teamConf = {};
        (state.teams || []).forEach(t => { teamConf[t.id] = t.conf; });

        Object.values(playerAgg).forEach(({ p, s, gp, teamId }) => {
            if (gp < 20) return; // 至少打 20 场才参评（按整季总场次，不再因交易被拆分过滤）
            const teamRec = state.records[teamId] || { win: 0, loss: 0 };
            const teamGp = teamRec.win + teamRec.loss;
            const winRate = teamGp > 0 ? teamRec.win / teamGp : 0;
            const ppg = s.pts / gp, rpg = s.reb / gp, apg = s.ast / gp;
            const spg = s.stl / gp, bpg = s.blk / gp, tpg = s.tov / gp;
            const fgPct = s.fga > 0 ? s.fgm / s.fga : 0.45;
            const tpPct = s.tpa > 0 ? s.tpm / s.tpa : 0.33;
            // efficiency 调整：提高 apg 权重(1.5→2.5)，降低 bpg 权重(2.0→1.5)，避免"1助攻超级内线"刷 MVP
            const efficiency = ppg + rpg * 1.2 + apg * 2.5 + spg * 2 + bpg * 1.5 - tpg * 1.2;
            // MVP 硬门槛加严：原 ppg>=20 || apg>=8 过宽，导致 11/20 季 MVP 不达标
            // 真实 NBA MVP 全部满足以下之一：
            //   1. 得分≥22 且 胜率≥0.55（得分型核心，如 SGemVP/Anta）
            //   2. 得分≥18 且 助攻≥9 且 胜率≥0.55（组织型核心，如约基奇/东契奇）
            //   3. 得分≥25 且 胜率≥0.50（弱队得分王，如 76人艾弗森）
            // 修复 S14 格兰特·贝利 ppg=17.6 当选 MVP 的问题（违反所有硬门槛）
            const mvpEligible =
                (ppg >= 22 && winRate >= 0.55) ||
                (ppg >= 18 && apg >= 9 && winRate >= 0.55) ||
                (ppg >= 25 && winRate >= 0.50);
            // MVP 评分: 数据效率 + 球队胜率(权重 40→80) + 能力修正 + 命中率
            // 真实 NBA MVP 几乎全部来自 50 胜以上球队(胜率>0.61)
            // 加硬门槛：胜率<0.50 直接 -50 分；0.50-0.55 扣 -25 分（边缘球队）
            const mvpWinRatePenalty = winRate < 0.50 ? -50 : (winRate < 0.55 ? -25 : 0);
            // 助攻惩罚加强：apg<2 扣 -15（纯内线无组织），apg<3 扣 -10（原 -8 太轻）
            const mvpAstPenalty = apg < 2 ? -15 : (apg < 3 ? -10 : 0);
            // 得分<20 的纯防守型球员扣分（MVP 应是进攻核心）
            const mvpPtsPenalty = ppg < 20 ? -6 : 0;
            // 不符合硬门槛的球员给极低分（-1000），确保不可能当选
            const mvpHardFilter = mvpEligible ? 0 : -1000;
            const mvpScore = efficiency * 1.0 + winRate * 80 + p.o * 0.15 + (fgPct - 0.45) * 30 + (tpPct - 0.35) * 10
                            + mvpWinRatePenalty + mvpAstPenalty + mvpPtsPenalty + mvpHardFilter;
            // 防守评分: 抢断/盖帽 + 防守能力 + 球队失分越少越好
            const defScore = spg * 6 + bpg * 5 + p.de * 0.5 + p.re * 0.15 + winRate * 8;
            // 第六人评分: 板凳出场(按 ovr 排序，前5为首发，其余为替补)
            const sortedRoster = [...(state.teamsPlayers[teamId] || [])].sort((a, b) => b.o - a.o);
            const isBench = p.isFiller || !sortedRoster.slice(0, 5).includes(p);
            const sixManScore = efficiency * 1.1 + (isBench ? 5 : -10) + p.o * 0.1;
            // 进步最快: 综合考虑 ovr 提升 + 数据提升
            // 修复：原评分仅 ovrDelta*5 + efficiency*0.5，门槛 ovrDelta>=4 过严
            // 真实 NBA MIP 主要看数据提升幅度（如 Ja Morant 19→27 PPG），ovr 提升是次要的
            // 现在加入 ppg/rpg/apg 提升评分，让数据暴涨但 ovr 提升不大的球员也能当选
            const hist = playerHistory[p.id];
            const lastRecord = hist && hist.length ? hist[hist.length - 1] : null;
            const lastOvr = lastRecord ? lastRecord.ovr : p.o;
            const ovrDelta = p.o - lastOvr;
            // 数据提升（vs 上赛季 per-game）：lastRecord.pts/reb/ast 已是 per-game
            const lastPpg = lastRecord ? (lastRecord.pts || 0) : 0;
            const lastRpg = lastRecord ? (lastRecord.reb || 0) : 0;
            const lastApg = lastRecord ? (lastRecord.ast || 0) : 0;
            const ppgDelta = ppg - lastPpg;
            const rpgDelta = rpg - lastRpg;
            const apgDelta = apg - lastApg;
            // 数据提升评分：ppg 提升权重最高（真实 MIP 多为得分暴涨）
            const dataImproveScore = Math.max(0, ppgDelta) * 2.5
                                   + Math.max(0, rpgDelta) * 1.5
                                   + Math.max(0, apgDelta) * 2.0;
            // MIP 综合评分：数据提升为主 + ovr 提升为辅 + 本季数据基础分
            const mipScore = dataImproveScore + ovrDelta * 3 + efficiency * 0.3;
            candidates.push({
                player: p, teamId, ppg, rpg, apg, spg, bpg, tpg, fgPct, tpPct, gp, winRate,
                efficiency, mvpScore, defScore, sixManScore, mipScore, ovrDelta, isBench,
                conf: teamConf[teamId] || null,
                ppgDelta, rpgDelta, apgDelta, lastPpg, lastRpg, lastApg,
            });
        });

        const sorted = (arr, key, desc = true) => arr.slice().sort((a, b) => desc ? b[key] - a[key] : a[key] - b[key]);
        const mvpList = sorted(candidates, "mvpScore");
        const dpoyList = sorted(candidates, "defScore");
        // ROY 候选：本赛季是该球员的新秀赛季
        // 修复 bug：原代码用 isRookie===true，但 offseasonProgression 已在赛季开始前清除 isRookie，
        // 导致 ROY 永远没人。改用 draftYear === state.year 判断（上赛季选秀进联盟的球员，
        // 本赛季就是新秀赛季）。同时兼容旧逻辑：isRookie 仍为 true 也算新秀。
        // 修复：原按 mvpScore 排序，winRate*80 权重过高导致强队低分新秀(5分)击败弱队高分新秀(20分)
        // 真实 ROY 评选主要看个人数据(得分/篮板/助攻/效率)，球队战绩仅作辅助参考
        // royScore：个人数据为主(efficiency×1.2)，胜率权重仅 5（避免强队低分新秀垄断）
        const royList = sorted(candidates.filter(c => {
            if (c.player.isRookie === true) return true;
            // draftYear 记录球员被选中的年份；state.year 是刚结束赛季的起始年
            // 例：2026 年选秀 → draftYear=2026 → 2026-27 赛季是新秀赛季 → 赛季结束时 state.year=2026
            // 所以 ROY 候选条件：draftYear === state.year
            if (c.player.draftYear === state.year) return true;
            // 兼容 lastRookieYear 标记
            if (c.player.lastRookieYear === state.year) return true;
            return false;
        }).map(c => ({
            ...c,
            // ROY 评分：个人数据绝对主导，胜率仅微弱参考（真实 ROY 如文班亚马来自弱队仍当选）
            // efficiency = ppg + rpg*1.2 + apg*2.5 + spg*2 + bpg*1.5 - tpg*1.2
            // 15分+5板+5助 efficiency≈30 → royScore≈36+2.5+8=46.5；5分新秀 efficiency≈8 → royScore≈9.6+4+8=21.6
            royScore: c.efficiency * 1.2 + c.winRate * 5 + c.gp * 0.1,
        })).filter(c => {
            // ROY 候选硬门槛——ppg >= 8 且 gp >= 20
            // 真实 NBA ROY 最低约 10 PPG，但若某届新秀整体偏弱（玩家执教弱队时常见），
            // 强制 10 分门槛会导致 ROY 空缺。放宽到 8 分 + gp≥20，保证 ROY 总能选出
            // （即使数据偏低，也是该届新秀中最佳者，符合"最佳新秀"语义）
            return c.ppg >= 8 && c.gp >= 20;
        }), "royScore");
        const sixManList = sorted(candidates.filter(c => c.isBench).filter(c => {
            // 修复：6MOY 硬门槛——ppg >= 12 且 gp >= 30，避免低分替补当选
            // 原门槛 ppg>=10 仍让前 4 季 6MOY PPG<13（真实 6MOY 通常 13+ PPG，如克拉克森 17、普尔 20）
            // 提升至 12：与基线 13 PPG 接近，确保获奖者数据符合真实预期
            return c.ppg >= 12 && c.gp >= 30;
        }), "sixManScore");
        const mipList = sorted(candidates.filter(c => {
            // 修复 MIP 评选门槛：
            // 原条件 ovrDelta>=4 过严，且只看 ovr 提升忽略数据提升，导致 MIP 经常无人当选
            // 真实 NBA MIP 标准是"数据显著提升"，ovr 提升幅度不是硬指标
            // 新门槛：ovrDelta>=2 或 数据提升显著（ppg/rpg/apg 任一提升≥3）
            const h = playerHistory[c.player.id];
            // 排除新秀（新秀赛季不参评 MIP，因为没有上赛季数据可比）
            if (c.player.draftYear === state.year) return false;
            // 排除上赛季已成名的超巨（hist 存在且 lastOvr>=82，已是顶级球员无"进步空间"）
            if (h && h.length && h[h.length - 1].ovr >= 82) return false;
            // 必须有上赛季历史数据可比
            if (!h || h.length === 0) return false;
            const dataImprove = Math.max(0, c.ppgDelta) + Math.max(0, c.rpgDelta) + Math.max(0, c.apgDelta);
            const qualified = c.ovrDelta >= 2 || dataImprove >= 3;
            if (!qualified) return false;
            // 本季数据至少有轮换水准（ppg>=8 或 efficiency>=15），避免低分球员靠微弱提升当选
            if (c.ppg < 8 && c.efficiency < 15) return false;
            return true;
        }), "mipScore");

        // 东西部 MVP：改为在季后赛分区决赛结束后评选（基于季后赛数据）
        // 此处不再评选，由 advancePlayoffs 在 round 3 结束时调用 computeConferenceMVP
        const eastMvpList = [];
        const westMvpList = [];

        // 最佳阵容：每阵 2后场(PG/SG) + 3前场(SF/PF/C)，限制中锋最多 1 人，避免一阵出现 3 中锋
        // 修复：原无绝对门槛，导致 ovr=80 ppg=9.2 球员入选一阵（S6 PG 位置人才断层时）
        // 增加按阵别设置硬门槛：一阵需 ppg≥15 或 ovr≥85；二三阵放宽至 ppg≥10 或 ovr≥80
        function pickAllNBATeams(sourceList, teamCount = 3) {
            const teams = [];
            const used = new Set();
            for (let t = 0; t < teamCount; t++) {
                // 阵别门槛：一阵最严，二三阵递减
                const minPpg = t === 0 ? 15 : (t === 1 ? 12 : 10);
                const minOvr = t === 0 ? 85 : (t === 1 ? 82 : 80);
                const eligible = sourceList.filter(c =>
                    !used.has(c.player.id) && (c.ppg >= minPpg || c.player.o >= minOvr)
                );
                const guards = eligible.filter(c => ["PG", "SG"].includes(c.player.p));
                const wings = eligible.filter(c => ["SF", "PF"].includes(c.player.p));
                const centers = eligible.filter(c => c.player.p === "C");
                // 2 后场 + 3 前场；前场至多 1 名中锋，其余用 SF/PF 锋线
                let finalTeam = [...guards.slice(0, 2)];
                const frontAvail = [...centers.slice(0, 1), ...wings];
                for (const c of frontAvail) {
                    if (finalTeam.length >= 5) break;
                    if (!finalTeam.includes(c)) finalTeam.push(c);
                }
                // 补位 fallback：若未满 5 人，从剩余最高分候选（不限位置，但需满足门槛）补足
                if (finalTeam.length < 5) {
                    const remaining = eligible.filter(c => !finalTeam.includes(c));
                    for (const c of remaining) {
                        if (finalTeam.length >= 5) break;
                        finalTeam.push(c);
                    }
                }
                // 终极兜底：若仍不足 5 人（人才断层），允许从 sourceList 取（不强制门槛，宁缺毋滥原则下的妥协）
                if (finalTeam.length < 5) {
                    const remaining = sourceList.filter(c =>
                        !used.has(c.player.id) && !finalTeam.includes(c)
                    );
                    for (const c of remaining) {
                        if (finalTeam.length >= 5) break;
                        finalTeam.push(c);
                    }
                }
                finalTeam.forEach(c => used.add(c.player.id));
                teams.push(finalTeam);
            }
            return teams;
        }
        const allNBATeams = pickAllNBATeams(mvpList, 3); // [一阵, 二阵, 三阵]
        const allDefTeams = pickAllNBATeams(dpoyList, 2); // [防守一阵, 防守二阵]
        const allRookieTeams = pickAllNBATeams(royList, 2); // [新秀一阵, 新秀二阵]

        return {
            year: state.year,
            mvp: mvpList[0] || null,
            eastMvp: eastMvpList[0] || null,
            westMvp: westMvpList[0] || null,
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
            eastMvpTop5: eastMvpList.slice(0, 5),
            westMvpTop5: westMvpList.slice(0, 5),
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

    // ================================================================
    //  总决赛 MVP 评选
    //  规则：基于总决赛系列赛每场双方球员数据，冠军球队中综合评分最高者当选
    //  评分：得分为主 + 篮板/助攻 + 系列赛胜场加成
    //  finalsResult: simulateSeries 返回（需含每场 lines/teamId 信息）
    //  highTeamId, lowTeamId: 总决赛双方球队 ID
    //  championTeamId: 冠军球队 ID（FMVP 只从冠军队选，真实 NBA 规则）
    // ================================================================
    function computeFinalsMVP(finalsResult, highTeamId, lowTeamId, championTeamId) {
        if (!finalsResult || !finalsResult.gameStats) return null;
        // 聚合球员统计：每场 lines 累加到对应球员
        const playerStats = {}; // pid -> { player, teamId, gp, pts, reb, ast, stl, blk, ... }
        finalsResult.gameStats.forEach(g => {
            // g.home/away 结构: { teamId, lines: [{player, min, pts, reb, ast, ...}] }
            [g.home, g.away].forEach(side => {
                if (!side || !side.lines) return;
                side.lines.forEach(line => {
                    if (!line.player) return;
                    const pid = line.player.id;
                    if (!playerStats[pid]) {
                        playerStats[pid] = {
                            player: line.player,
                            teamId: side.teamId,
                            gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0,
                        };
                    }
                    const s = playerStats[pid];
                    s.gp++;
                    s.min += line.min || 0;
                    s.pts += line.pts || 0;
                    s.reb += line.reb || 0;
                    s.ast += line.ast || 0;
                    s.stl += line.stl || 0;
                    s.blk += line.blk || 0;
                    s.tov += line.tov || 0;
                    s.fgm += line.fgm || 0;
                    s.fga += line.fga || 0;
                    s.tpm += line.tpm || 0;
                    s.tpa += line.tpa || 0;
                });
            });
        });
        // FMVP 只从冠军球队选（真实 NBA 规则：败方 FMVP 仅 1969 Jerry West 一例，此后皆为冠军队球员）
        const candidates = Object.values(playerStats).filter(s => s.teamId === championTeamId);
        if (candidates.length === 0) return null;
        // 评分：总分 + 篮板 + 助攻 + 胜场加成（冠军默认 4 胜）
        // ppg/rpg/apg 用 per-game，避免出场场次差异影响
        candidates.forEach(s => {
            const ppg = s.pts / Math.max(1, s.gp);
            const rpg = s.reb / Math.max(1, s.gp);
            const apg = s.ast / Math.max(1, s.gp);
            const spg = s.stl / Math.max(1, s.gp);
            const bpg = s.blk / Math.max(1, s.gp);
            const tpg = s.tov / Math.max(1, s.gp);
            const fgPct = s.fga > 0 ? s.fgm / s.fga : 0.45;
            const efficiency = ppg + rpg * 1.2 + apg * 2.0 + spg * 2 + bpg * 1.5 - tpg * 1.2;
            // FMVP 评分：效率为主 + 出场时间 + 命中率加成
            s.score = efficiency * 1.0 + s.min / Math.max(1, s.gp) * 0.3 + (fgPct - 0.45) * 30;
            s.ppg = ppg; s.rpg = rpg; s.apg = apg; s.spg = spg; s.bpg = bpg; s.fgPct = fgPct;
        });
        candidates.sort((a, b) => b.score - a.score);
        const fmvp = candidates[0];
        return {
            player: fmvp.player,
            teamId: fmvp.teamId,
            gp: fmvp.gp,
            ppg: +fmvp.ppg.toFixed(1),
            rpg: +fmvp.rpg.toFixed(1),
            apg: +fmvp.apg.toFixed(1),
            spg: +fmvp.spg.toFixed(1),
            bpg: +fmvp.bpg.toFixed(1),
            fgPct: +fmvp.fgPct.toFixed(3),
            min: +(fmvp.min / Math.max(1, fmvp.gp)).toFixed(1),
            score: +fmvp.score.toFixed(2),
        };
    }

    // ================================================================
    //  东西部决赛 MVP 评选
    //  规则：基于该联盟季后赛前 3 轮（首轮+半决赛+分区决赛）的球员累计数据，
    //       从分区冠军（打进总决赛的球队）中选综合评分最高者。
    //  roundResults: 前 3 轮所有系列赛结果数组 [{high, low, winner, gameStats}, ...]
    //  confTeamIds: 该联盟进入季后赛的 8 支球队 id 集合（用于过滤本联盟球员）
    //  champTeamId: 分区冠军球队 id（FMVP 只从冠军队选，符合"分区决赛MVP"语义）
    // ================================================================
    function computeConferenceMVP(roundResults, confTeamIds, champTeamId) {
        if (!roundResults || roundResults.length === 0 || !champTeamId) return null;
        const confSet = confTeamIds instanceof Set ? confTeamIds : new Set(confTeamIds);
        // 聚合本联盟所有系列赛的球员数据
        const playerStats = {};
        roundResults.forEach(res => {
            if (!res.gameStats) return;
            res.gameStats.forEach(g => {
                [g.home, g.away].forEach(side => {
                    if (!side || !side.lines) return;
                    // 仅统计本联盟球队的球员（避免总决赛跨联盟数据干扰）
                    if (!confSet.has(side.teamId)) return;
                    side.lines.forEach(line => {
                        if (!line.player) return;
                        const pid = line.player.id;
                        if (!playerStats[pid]) {
                            playerStats[pid] = {
                                player: line.player, teamId: side.teamId,
                                gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0,
                            };
                        }
                        const s = playerStats[pid];
                        s.gp++; s.min += line.min || 0; s.pts += line.pts || 0; s.reb += line.reb || 0;
                        s.ast += line.ast || 0; s.stl += line.stl || 0; s.blk += line.blk || 0; s.tov += line.tov || 0;
                        s.fgm += line.fgm || 0; s.fga += line.fga || 0; s.tpm += line.tpm || 0; s.tpa += line.tpa || 0;
                    });
                });
            });
        });
        // 候选：仅从分区冠军球队中选（真实 NBA 分区决赛MVP 通常颁给冠军队最佳球员）
        const candidates = Object.values(playerStats).filter(s => s.teamId === champTeamId);
        if (candidates.length === 0) return null;
        candidates.forEach(s => {
            const gp = Math.max(1, s.gp);
            const ppg = s.pts / gp, rpg = s.reb / gp, apg = s.ast / gp;
            const spg = s.stl / gp, bpg = s.blk / gp, tpg = s.tov / gp;
            const fgPct = s.fga > 0 ? s.fgm / s.fga : 0.45;
            const efficiency = ppg + rpg * 1.2 + apg * 2.0 + spg * 2 + bpg * 1.5 - tpg * 1.2;
            // 评分：效率为主 + 出场时间 + 命中率 + 系列赛场次加成（打得多说明球队走得远）
            s.score = efficiency * 1.0 + s.min / gp * 0.3 + (fgPct - 0.45) * 30 + s.gp * 0.5;
            s.ppg = ppg; s.rpg = rpg; s.apg = apg; s.spg = spg; s.bpg = bpg; s.fgPct = fgPct;
        });
        candidates.sort((a, b) => b.score - a.score);
        const mvp = candidates[0];
        return {
            player: mvp.player, teamId: mvp.teamId, gp: mvp.gp,
            ppg: +mvp.ppg.toFixed(1), rpg: +mvp.rpg.toFixed(1), apg: +mvp.apg.toFixed(1),
            spg: +mvp.spg.toFixed(1), bpg: +mvp.bpg.toFixed(1),
            fgPct: +mvp.fgPct.toFixed(3), min: +(mvp.min / Math.max(1, mvp.gp)).toFixed(1),
            score: +mvp.score.toFixed(2),
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
        ageFreeAgents,
        signFreeAgent,
        releasePlayer,
        computeAwards,
        computeFinalsMVP,
        computeConferenceMVP,
        enforceHardCap,
    };
})();

window.SeasonEngine = SeasonEngine;
