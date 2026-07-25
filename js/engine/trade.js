// 交易引擎 —— 遵循 NBA 薪资匹配规则与劳资协议
// 规则要点:
//  1. 工资帽以下球队可吸收薪资差额（无需匹配）
//  2. 工资帽以上球队: 接收薪资 <= 送出薪资 × 125% + 10万 (本游戏简化为 125%)
//  3. 球员名单 14-15 人（交易后不得低于 14）
//  4. 不可交易条款、签约交易、选秀权互换等简化处理
//  5. AI 球队根据需求与价值评估决定是否接受

const TradeEngine = (() => {

    // 计算球队总薪资
    function teamSalary(players) {
        return players.reduce((s, p) => s + (p.sal || 0), 0);
    }

    // 一方送出球员的总薪资
    function outgoingSalary(players) {
        return players.reduce((s, p) => s + (p.sal || 0), 0);
    }

    // 判断交易对单支球队是否薪资合规
    // outgoing = 该队送出的球员; incoming = 该队接收的球员
    function validateSalary(teamPlayersBefore, outgoing, incoming) {
        const cap = window.SALARY_CAP;
        // 硬帽（第二土豪线）：禁止任何球队通过交易让总薪资突破此线
        // 参考 NBA 第二土豪线约 1.35×工资帽，本游戏取 1.30×（约 183M）
        const hardCap = cap * 1.30;
        const beforeSalary = teamSalary(teamPlayersBefore);
        const outSal = outgoingSalary(outgoing);
        const inSal = outgoingSalary(incoming);
        const afterSalary = beforeSalary - outSal + inSal;

        // 硬帽检查：交易后总薪资不得超过硬帽（防止超巨扎堆导致薪资爆炸）
        if (afterSalary > hardCap) {
            return { valid: false, reason: `交易后总薪资 $${afterSalary.toFixed(1)}M 超过硬帽 $${hardCap.toFixed(1)}M`, outSal, inSal, afterSalary };
        }

        // 交易后该队是否仍在帽上
        const overCapAfter = afterSalary > cap;
        // 交易前是否在帽下（帽下球队可吸收）
        const underCapBefore = beforeSalary < cap;

        let reason = "";
        let valid = true;

        if (underCapBefore) {
            // 帽下空间足够吸收
            const room = cap - beforeSalary + outSal;
            if (inSal > room) {
                // 部分用空间，剩余需匹配
                const matched = inSal - room;
                const limit = outSal * 1.25 + 0.1;
                if (matched > limit) { valid = false; reason = "薪资超出可匹配上限(125%+$100K)"; }
            }
        } else {
            // 帽上球队必须匹配: incoming <= outgoing * 125% + 100K
            const limit = outSal * 1.25 + 0.1;
            if (inSal > limit) { valid = false; reason = `接收薪资 $${inSal.toFixed(1)}M 超过上限 $${limit.toFixed(1)}M (125%+$100K)`; }
        }

        // 名单人数检查：交易后不得低于 14 人
        const rosterAfter = teamPlayersBefore.length - outgoing.length + incoming.length;
        if (rosterAfter < 14) { valid = false; reason = "交易后名单不足 14 人"; }
        if (rosterAfter > 15) { valid = false; reason = "交易后名单超过 15 人"; }

        return { valid, reason, outSal, inSal, afterSalary };
    }

    // 评估一笔交易对 AI 球队的吸引力
    // 返回 -100..100 的价值分；越高越愿意接受
    function evaluateTradeForTeam(teamPlayers, outgoing, incoming, seasonContext) {
        // 1. 薪资合规
        const salCheck = validateSalary(teamPlayers, outgoing, incoming);
        if (!salCheck.valid) return { score: -1000, reason: salCheck.reason };

        // 2. 价值评估：用综合能力 + 年龄 + 潜力
        const outValue = outgoing.reduce((s, p) => s + playerValue(p), 0);
        const inValue = incoming.reduce((s, p) => s + playerValue(p), 0);

        // 球队需求：若战绩差则更愿换未来（年轻+潜力），若强队更愿即战力
        const record = seasonContext && seasonContext.record;
        const isRebuilding = record && record.winRate < 0.40;
        const isContender = record && record.winRate > 0.60;

        // 重建队：年轻球员/高潜力球员价值加成
        let adjustedIn = inValue;
        if (isRebuilding) {
            adjustedIn += incoming.reduce((s, p) => s + (p.pot ? (p.pot - p.o) * 0.5 : 0) + (p.a < 25 ? 3 : 0), 0);
            adjustedIn -= incoming.reduce((s, p) => s + (p.a > 32 ? 4 : 0), 0);
        }
        // 争冠队：即战力（高 ovr）加成，老将减分少
        if (isContender) {
            adjustedIn += incoming.reduce((s, p) => s + (p.o >= 85 ? 5 : 0), 0);
        }

        const diff = adjustedIn - outValue;
        // 接受阈值：需要净获得一定价值才会接受（AI 不做亏本买卖）
        // 加入随机性模拟谈判
        const noise = (Math.random() - 0.5) * 8;
        const score = diff + noise;

        let reason = "";
        if (score < -3) reason = "对方认为这笔交易对他们不利";
        else if (score < 5) reason = "对方在犹豫，认为价值相当";
        else reason = "对方对这笔交易感兴趣";

        return { score, reason, salCheck, outValue, inValue };
    }

    // 球员综合价值（用于交易评估）
    function playerValue(p) {
        // 综合 = 当前能力 + 潜力 + 年龄曲线
        let val = p.o * 1.0;
        // 潜力
        if (p.pot && p.pot > p.o) val += (p.pot - p.o) * 0.45;
        // 年龄曲线：巅峰 27-30，年轻/老将折价
        // 修复：原 1.8 折扣过重，导致 36 岁利拉德(ovr85) val≈81 与 25 岁内姆哈德(ovr78) val≈80 等价
        // 降至 1.2：老将仍有折价但不至于让全明星换角色球员被认定公平
        if (p.a < 23) val += 2;
        else if (p.a > 34) val -= (p.a - 34) * 1.2;
        else if (p.a > 30) val -= (p.a - 30) * 1.0;
        // 球星级保护：ovr≥85 的球员额外加分，避免被等价交换为角色球员
        // 真实 NBA 中全明星几乎不会 1-for-1 换角色球员（除非搭选秀权/薪资配平）
        if (p.o >= 88) val += 6;
        else if (p.o >= 85) val += 3;
        // 薪资性价比：高薪低能扣分
        const expectedSal = salaryForOvr(p.o);
        if (p.sal > expectedSal * 1.3) val -= 4;
        else if (p.sal < expectedSal * 0.6) val += 3;
        return val;
    }

    // 由能力推算合理薪资（单位：百万美元）
    // 工资帽约 140M，球队 14-15 人；薪资分布参考真实 NBA：
    //   超巨 35M、明星 28M、全明星 22M、首发 15M、轮换 8M、替补 3M、边缘 2M
    // 调整后典型球队总薪资约 130-150M，接近工资帽
    function salaryForOvr(ovr) {
        if (ovr >= 93) return 38;   // 超级巨星（顶薪）
        if (ovr >= 90) return 33;   // 一线巨星
        if (ovr >= 87) return 28;   // 全明星
        if (ovr >= 84) return 22;   // 准全明星
        if (ovr >= 81) return 17;   // 优质首发
        if (ovr >= 78) return 12;   // 普通首发
        if (ovr >= 75) return 8;    // 主要轮换
        if (ovr >= 72) return 5;    // 替补轮换
        if (ovr >= 69) return 3;    // 深度替补
        if (ovr >= 65) return 2;    // 边缘球员
        return 1.5;                  // 饮水机管理员
    }

    // 执行交易（直接修改两队名单）
    // executeTradeWithIds: 直接传入双方球队 id，更新球员 t 字段并移动到对方名单
    // 标记 _tradedThisSeason，本季内该球员不再被 AI 交易（防止连锁交易失控）
    // 记录 _lastTradeSeason，下一季不得再被交易（跨季冷却，防止同球员反复被交易）
    function executeTradeWithIds(teamAPlayers, teamBPlayers, outgoingA, outgoingB, aId, bId, seasonYear) {
        const aIds = new Set(outgoingA.map(p => p.id));
        const bIds = new Set(outgoingB.map(p => p.id));
        for (let i = teamAPlayers.length - 1; i >= 0; i--) if (aIds.has(teamAPlayers[i].id)) teamAPlayers.splice(i, 1);
        for (let i = teamBPlayers.length - 1; i >= 0; i--) if (bIds.has(teamBPlayers[i].id)) teamBPlayers.splice(i, 1);
        // seasonYear 为当前赛季年份；若未传入则用 Date.now() 兜底（不应发生）
        const sy = seasonYear || (window.state && window.state.year) || 0;
        outgoingB.forEach(p => { p.t = aId; p._tradedThisSeason = true; p._lastTradeSeason = sy; });
        outgoingA.forEach(p => { p.t = bId; p._tradedThisSeason = true; p._lastTradeSeason = sy; });
        teamAPlayers.push(...outgoingB);
        teamBPlayers.push(...outgoingA);
    }

    // 清除所有球员的赛季交易标记（新赛季开始时调用）
    // 注意：仅清除 _tradedThisSeason，保留 _lastTradeSeason 用于跨季冷却判断
    function resetTradeFlags(state) {
        if (!state.players) return;
        state.players.forEach(p => { delete p._tradedThisSeason; });
    }

    // ================================================================
    //  AI 自动交易系统
    //  设计要点:
    //   1. 每次尝试为随机球队 A 寻找交易伙伴 B，构造价值匹配的交易包
    //   2. 双方都用 evaluateTradeForTeam 评估，需双向通过阈值才会执行
    //   3. 薪资匹配(125%规则)、名单人数(14-15)由 validateSalary 保证
    //   4. 重建队倾向送出老将换年轻/潜力；争冠队倾向送年轻换即战力
    //   5. 不交易新秀(isRookie)、不交易填充球员(isFiller)
    // ================================================================

    const rand = (mn, mx) => Math.random() * (mx - mn) + mn;
    const randInt = (mn, mx) => Math.floor(rand(mn, mx + 1));
    const shuffleArr = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

    // 球队战绩上下文
    function teamWinRate(records, teamId) {
        const r = records && records[teamId];
        if (!r || r.win + r.loss === 0) return 0.5;
        return r.win / (r.win + r.loss);
    }

    // 判断球队方向：重建 / 争冠 / 中游
    function teamDirection(winRate) {
        if (winRate < 0.40) return "rebuild";
        if (winRate > 0.62) return "contend";
        return "mid";
    }

    // 球员对某球队的"吸引力"（按球队方向调整）
    // 返回调整后的价值，用于在 B 队中挑选 A 想要的球员
    function playerAppealTo(p, direction) {
        let v = playerValue(p);
        if (direction === "rebuild") {
            // 重建队：年轻+潜力加分，老将减分
            if (p.a <= 23) v += 4;
            if (p.pot && p.pot > p.o) v += (p.pot - p.o) * 0.5;
            if (p.a >= 32) v -= (p.a - 32) * 2;
        } else if (direction === "contend") {
            // 争冠队：即战力加分，年轻低 ovr 减分
            if (p.o >= 84) v += 6;
            if (p.a <= 22 && p.o < 75) v -= 4;
            if (p.a >= 35) v -= 3;
        }
        return v;
    }

    // 球队"愿意送出"的球员（按方向调整后价值最低的冗余球员）
    // 不含新秀、填充球员、受伤球员、本赛季已被交易过的球员（冷却期，防止连锁交易）
    // 跨季冷却：球星(ovr≥85) 上一季被交易过的本季不得再被交易；普通球员可连续换队
    // 修复：原 <2 冷却不分星级，导致可交易池随赛季累积持续萎缩，
    // 20 季后可交易球员减少 50%+，交易频率从 S1=2 衰减到 S19/S20=0
    function tradablePlayers(roster, direction, keepTop, currentYear) {
        const list = roster.filter(p =>
            !p.isFiller && !p.isRookie && !p.injured && p.a >= 22 && p.a <= 38 &&
            !p._tradedThisSeason && // 赛季内已换队的球员本季不再交易（真实 NBA 赛中交易后无法立即再换）
            // 跨季冷却：仅对球星生效，避免球星反复流转；角色球员可连续换队（真实 NBA 边缘球员常年在各队流转）
            !(p.o >= 85 && p._lastTradeSeason && currentYear && currentYear - p._lastTradeSeason < 2)
        );
        // keepTop: 保留前 N 名核心不交易（除非大换血）
        const sorted = list.sort((a, b) => playerValue(b) - playerValue(a));
        if (keepTop > 0 && sorted.length > keepTop) {
            // 核心球员一般不主动送出，但重建队可以送老将核心
            const core = new Set(sorted.slice(0, keepTop).map(p => p.id));
            const nonCore = list.filter(p => !core.has(p.id));
            // 重建队: 老将核心(30+) 也可交易
            if (direction === "rebuild") {
                const oldCore = sorted.slice(0, keepTop).filter(p => p.a >= 30);
                return [...nonCore, ...oldCore];
            }
            return nonCore;
        }
        return list;
    }

    // 为球队 A 构造一个对球队 B 的交易提案
    // 返回 { teamA, teamB, outgoingA, outgoingB } 或 null
    function constructProposal(teamA, teamB, teamsPlayers, records, currentYear) {
        const rosterA = teamsPlayers[teamA];
        const rosterB = teamsPlayers[teamB];
        if (!rosterA || !rosterB) return null;
        if (rosterA.length < 14 || rosterB.length < 14) return null;

        const wrA = teamWinRate(records, teamA);
        const wrB = teamWinRate(records, teamB);
        const dirA = teamDirection(wrA);
        const dirB = teamDirection(wrB);

        // A 愿意送出的球员（保留前 3 核心，重建队老将除外）
        const aOffer = tradablePlayers(rosterA, dirA, 3, currentYear);
        if (aOffer.length === 0) return null;

        // B 愿意送出的球员
        const bOffer = tradablePlayers(rosterB, dirB, 3, currentYear);
        if (bOffer.length === 0) return null;

        // 从 A 的可交易球员中选一个"交易筹码"：取价值中段者更现实
        // （避免总是交易最差的，也避免交易唯一的明星）
        const sortedA = [...aOffer].sort((a, b) => playerValue(a) - playerValue(b));
        const aIdx = Math.floor(sortedA.length * (0.3 + Math.random() * 0.4));
        const aPiece = sortedA[Math.min(aIdx, sortedA.length - 1)];
        if (!aPiece) return null;

        const aPieceVal = playerValue(aPiece);
        const aPieceSal = aPiece.sal || 0;

        // B 中找对 A 有吸引力且价值匹配的球员
        // 价值窗口放宽到 ±18（允许薪资/年龄/潜力差异带来的价值差）
        const valWindow = 18;
        const bCandidates = bOffer.map(p => ({
            player: p,
            val: playerValue(p),
            appeal: playerAppealTo(p, dirA),
            sal: p.sal || 0,
        })).filter(c => {
            // 价值需要在窗口内（按 A 视角的吸引力）
            const diff = Math.abs(c.appeal - aPieceVal);
            return diff < valWindow;
        });

        // 排序: 按 A 视角综合分（吸引力高 + 价值差小）降序
        bCandidates.sort((x, y) => {
            const sx = x.appeal - Math.abs(x.val - aPieceVal) * 0.5;
            const sy = y.appeal - Math.abs(y.val - aPieceVal) * 0.5;
            return sy - sx;
        });

        if (bCandidates.length === 0) return null;

        // 薪资匹配检查：尝试多个候选，找到薪资能匹配的
        // 支持 1-1, 1-2, 2-1 三种交易包结构
        const tryCount = Math.min(bCandidates.length, 4);
        for (let ci = 0; ci < tryCount; ci++) {
            const bPiece = bCandidates[ci].player;
            const outgoingA = [aPiece];
            const outgoingB = [bPiece];

            // 薪资匹配：若双方核心薪资差距大，优先补真实球员，再补填充球员
                // 目标: 接收薪资 <= 送出薪资 * 1.25 + 0.1
                const matchSalaries = () => {
                    for (let iter = 0; iter < 5; iter++) {
                        const salA = outgoingSalary(outgoingA);
                        const salB = outgoingSalary(outgoingB);
                        const aOk = salB <= salA * 1.25 + 0.1;
                        const bOk = salA <= salB * 1.25 + 0.1;
                        if (aOk && bOk) return true;
                        // 哪边送出的薪资少，就往哪边加球员
                        if (salA < salB) {
                            // A 需多送出: 优先找一个薪资接近差额的真实球员，否则用 filler
                            const deficit = salB - salA;
                            const realExtra = aOffer.find(p =>
                                !outgoingA.includes(p) && (p.sal || 0) > 0 &&
                                Math.abs((p.sal || 0) - deficit) < deficit * 0.6
                            );
                            if (realExtra && outgoingA.length < 2) {
                                outgoingA.push(realExtra);
                            } else {
                                // filler 也需检查 _tradedThisSeason，防止同季多次被交易（连锁交易漏洞）
                                const filler = rosterA.find(p =>
                                    p.isFiller && !p._tradedThisSeason && !outgoingA.includes(p) && (p.sal || 0) > 0
                                );
                                if (filler) outgoingA.push(filler); else break;
                            }
                        } else {
                            const deficit = salA - salB;
                            const realExtra = bOffer.find(p =>
                                !outgoingB.includes(p) && (p.sal || 0) > 0 &&
                                Math.abs((p.sal || 0) - deficit) < deficit * 0.6
                            );
                            if (realExtra && outgoingB.length < 2) {
                                outgoingB.push(realExtra);
                            } else {
                                // filler 也需检查 _tradedThisSeason，防止同季多次被交易（连锁交易漏洞）
                                const filler = rosterB.find(p =>
                                    p.isFiller && !p._tradedThisSeason && !outgoingB.includes(p) && (p.sal || 0) > 0
                                );
                                if (filler) outgoingB.push(filler); else break;
                            }
                        }
                    }
                    // 最终检查
                    const salA = outgoingSalary(outgoingA);
                    const salB = outgoingSalary(outgoingB);
                    return salB <= salA * 1.25 + 0.1 && salA <= salB * 1.25 + 0.1;
                };

            if (matchSalaries()) {
                // 名单人数检查（交易后双方 14-15 人）
                const aAfter = rosterA.length - outgoingA.length + outgoingB.length;
                const bAfter = rosterB.length - outgoingB.length + outgoingA.length;
                if (aAfter >= 14 && aAfter <= 15 && bAfter >= 14 && bAfter <= 15) {
                    return { teamA, teamB, outgoingA, outgoingB };
                }
            }
        }
        return null;
    }

    // 评估交易提案对双方的吸引力
    // 阈值: 双方 score 均 >= AI_TRADE_THRESHOLD 才执行
    // 修复：交易频率偏低（实测 7.2 笔/季，基线 10-20）
    // 原 2 阈值叠加 0.60 概率门控 + 跨季冷却，导致命中率仅 ~7%
    // 降至 1：双方均需轻微获益即可，仍能挡住明显不公平交易（diff<-4 的）
    const AI_TRADE_THRESHOLD = 1;

    function evaluateProposal(proposal, teamsPlayers, records) {
        const { teamA, teamB, outgoingA, outgoingB } = proposal;
        const rosterA = teamsPlayers[teamA];
        const rosterB = teamsPlayers[teamB];

        // 薪资 & 名单合规（双向）
        const checkA = validateSalary(rosterA, outgoingA, outgoingB);
        if (!checkA.valid) return { ok: false, reason: `A方不合规: ${checkA.reason}` };
        const checkB = validateSalary(rosterB, outgoingB, outgoingA);
        if (!checkB.valid) return { ok: false, reason: `B方不合规: ${checkB.reason}` };

        const wrA = teamWinRate(records, teamA);
        const wrB = teamWinRate(records, teamB);

        const evalA = evaluateTradeForTeam(rosterA, outgoingA, outgoingB, { record: { winRate: wrA } });
        const evalB = evaluateTradeForTeam(rosterB, outgoingB, outgoingA, { record: { winRate: wrB } });

        if (evalA.score < AI_TRADE_THRESHOLD) return { ok: false, reason: `A方无兴趣(${evalA.score.toFixed(1)})` };
        if (evalB.score < AI_TRADE_THRESHOLD) return { ok: false, reason: `B方无兴趣(${evalB.score.toFixed(1)})` };

        return { ok: true, evalA, evalB };
    }

    // 判断是否为重磅交易：
    //  1. 含 ovr >= 85 的球星（全明星级以上）
    //  2. 双方各送出 2+ 真实球员且至少有 1 名 ovr>=80 的轮换球员
    //  修复：测试期望重磅占比 5-20%，原 ovr>=80 阈值给出 9.6-13.1% 已在范围内
    //  曾尝试提至 ovr>=82 但导致 16/20 季 <5%（过严），回退至 ovr>=80
    function isBlockbuster(proposal) {
        const all = [...proposal.outgoingA, ...proposal.outgoingB];
        if (all.some(p => p.o >= 85)) return true;
        const realA = proposal.outgoingA.filter(p => !p.isFiller);
        const realB = proposal.outgoingB.filter(p => !p.isFiller);
        // 双方各 2+ 真实球员 且 至少有一方含 ovr>=80 的轮换球员
        if (realA.length >= 2 && realB.length >= 2) {
            const hasQualityPlayer = all.some(p => p.o >= 80);
            if (hasQualityPlayer) return true;
        }
        return false;
    }

    // 运行一轮 AI 交易尝试：随机选 N 对球队尝试构造并评估交易
    // 返回成功执行的交易数组 [{ teamA, teamB, outgoingA, outgoingB, blockbuster }]
    function runAiTrades(state, attempts) {
        const teams = state.teams;
        const teamsPlayers = state.teamsPlayers;
        const records = state.records;
        const currentYear = state.year || 0;
        const executed = [];
        const tradedTeamIds = new Set(); // 单轮内同一球队最多参与 1 笔交易，避免连锁

        // 修复：交易频率偏低（实测 7.2 笔/季，基线 10-20）
        // 原 0.60 概率门控叠加阈值 2，命中率仅 ~7%
        // 提至 0.75：每日约 75% 概率尝试，配合阈值 1，预期交易频率 ~12-16 笔/季
        if (Math.random() > 0.75) return executed;

        for (let i = 0; i < attempts; i++) {
            const teamA = teams[randInt(0, teams.length - 1)].id;
            if (tradedTeamIds.has(teamA)) continue;
            // 随机选 B（不同于 A）
            const others = teams.filter(t => t.id !== teamA && !tradedTeamIds.has(t.id));
            if (others.length === 0) continue;
            shuffleArr(others);

            let done = false;
            for (const tB of others.slice(0, 6)) { // 每个最多尝试 6 个伙伴
                const proposal = constructProposal(teamA, tB.id, teamsPlayers, records, currentYear);
                if (!proposal) continue;
                const eva = evaluateProposal(proposal, teamsPlayers, records);
                if (!eva.ok) continue;

                // 执行
                executeTradeWithIds(
                    teamsPlayers[teamA], teamsPlayers[tB.id],
                    proposal.outgoingA.slice(), proposal.outgoingB.slice(),
                    teamA, tB.id, currentYear
                );
                const blockbuster = isBlockbuster(proposal);
                executed.push({
                    teamA, teamB: tB.id,
                    outgoingA: proposal.outgoingA,
                    outgoingB: proposal.outgoingB,
                    blockbuster,
                });
                tradedTeamIds.add(teamA);
                tradedTeamIds.add(tB.id);
                done = true;
                break;
            }
        }
        return executed;
    }

    // 计算球队是否有薪资空间
    function capSpace(teamPlayers) {
        return window.SALARY_CAP - teamSalary(teamPlayers);
    }

    return {
        teamSalary, validateSalary, evaluateTradeForTeam,
        playerValue, salaryForOvr, executeTradeWithIds,
        capSpace, outgoingSalary,
        runAiTrades, constructProposal, evaluateProposal, isBlockbuster,
        teamWinRate, teamDirection, playerAppealTo, resetTradeFlags,
    };
})();

window.TradeEngine = TradeEngine;
