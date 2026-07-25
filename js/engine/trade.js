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
        const beforeSalary = teamSalary(teamPlayersBefore);
        const outSal = outgoingSalary(outgoing);
        const inSal = outgoingSalary(incoming);
        const afterSalary = beforeSalary - outSal + inSal;

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
        if (p.a < 23) val += 2;
        else if (p.a > 34) val -= (p.a - 34) * 3;
        else if (p.a > 30) val -= (p.a - 30) * 1.2;
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
    function executeTrade(teamAPlayers, teamBPlayers, outgoingA, outgoingB) {
        const aIds = new Set(outgoingA.map(p => p.id));
        const bIds = new Set(outgoingB.map(p => p.id));
        // 移除
        for (let i = teamAPlayers.length - 1; i >= 0; i--) if (aIds.has(teamAPlayers[i].id)) teamAPlayers.splice(i, 1);
        for (let i = teamBPlayers.length - 1; i >= 0; i--) if (bIds.has(teamBPlayers[i].id)) teamBPlayers.splice(i, 1);
        // 加入并更新球队归属
        outgoingB.forEach(p => { p.t = teamAId; });
        outgoingA.forEach(p => { p.t = teamBId; });
        teamAPlayers.push(...outgoingB);
        teamBPlayers.push(...outgoingA);
    }

    // 用于执行时设置球队 id 的辅助（因 executeTrade 需要知道 abbr）
    let teamAId = "", teamBId = "";
    function executeTradeWithIds(teamAPlayers, teamBPlayers, outgoingA, outgoingB, aId, bId) {
        const aIds = new Set(outgoingA.map(p => p.id));
        const bIds = new Set(outgoingB.map(p => p.id));
        for (let i = teamAPlayers.length - 1; i >= 0; i--) if (aIds.has(teamAPlayers[i].id)) teamAPlayers.splice(i, 1);
        for (let i = teamBPlayers.length - 1; i >= 0; i--) if (bIds.has(teamBPlayers[i].id)) teamBPlayers.splice(i, 1);
        outgoingB.forEach(p => { p.t = aId; });
        outgoingA.forEach(p => { p.t = bId; });
        teamAPlayers.push(...outgoingB);
        teamBPlayers.push(...outgoingA);
    }

    // AI 球队发起交易提议（寻找潜在交易伙伴）
    function aiProposeTrades(myTeamId, allTeams, seasonContext) {
        // 简化版：返回若干可能的交易方案供玩家查看（本游戏以玩家发起为主）
        return [];
    }

    // 计算球队是否有薪资空间
    function capSpace(teamPlayers) {
        return window.SALARY_CAP - teamSalary(teamPlayers);
    }

    return {
        teamSalary, validateSalary, evaluateTradeForTeam,
        playerValue, salaryForOvr, executeTradeWithIds,
        capSpace, outgoingSalary,
    };
})();

window.TradeEngine = TradeEngine;
