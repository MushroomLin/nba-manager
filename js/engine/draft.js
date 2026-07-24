// 选秀引擎 —— NBA 选秀规则: 乐透抽签(前4) + 两轮各30顺位
// 1. 未进季后赛的14支球队参与乐透，按战绩倒序分配组合数
// 2. 前4顺位由抽签决定，5-14顺位按战绩倒序
// 3. 15-30顺位按季后赛球队战绩倒序（季后赛出局轮次加成）
// 4. 第二轮同样按战绩倒序
// 5. 新秀合同为薪资帽对应比例（首轮秀4年保障）

const DraftEngine = (() => {

    let rookieIdCounter = 0;

    // 生成新秀池（60人左右）
    function generateRookieClass(year) {
        const proto = window.ROOKIE_PROTOTYPES;
        const names = [...proto.names];
        // 打乱名字
        shuffle(names);
        const rookies = [];
        const count = 70;
        // 按模板权重分配名额
        const pool = [];
        proto.templates.forEach(t => { for (let i = 0; i < t.weight; i++) pool.push(t); });

        for (let i = 0; i < count; i++) {
            const template = pool[Math.floor(Math.random() * pool.length)];
            const name = names[i % names.length] + (i >= names.length ? " " + String.fromCharCode(65 + (i % 26)) : "");
            const pos = pick(proto.positions);
            const profile = window.ROOKIE_POS_PROFILES[pos];

            const pot = randInt(template.potMin, template.potMax);
            const base = randInt(template.baseMin, template.baseMax);

            // 基于位置档案 + base 偏移生成各项能力
            const variance = () => randInt(-6, 6);
            const ins = clamp(profile.ins + (base - 68) * 0.6 + variance(), 40, 88);
            const sh = clamp(profile.sh + (base - 68) * 0.7 + variance(), 35, 88);
            const pa = clamp(profile.pa + (base - 68) * 0.5 + variance(), 30, 85);
            const re = clamp(profile.re + (base - 68) * 0.4 + variance(), 30, 88);
            const de = clamp(profile.de + (base - 68) * 0.5 + variance(), 35, 85);
            const at = clamp(profile.at + variance(), 50, 90);
            const iq = clamp(profile.iq + (base - 68) * 0.4 + variance(), 45, 85);

            // 综合 ovr 基于位置加权
            const ovr = computeOvr(pos, { ins, sh, pa, re, de, at, iq });

            rookies.push({
                id: `rookie_${year}_${rookieIdCounter++}`,
                n: name,
                t: null,
                p: pos,
                a: randInt(19, 23),
                o: ovr,
                pot: pot,
                sal: rookieSalary(ovr, 1),
                ins, sh, pa, re, de, at, iq,
                isRookie: true,
                draftYear: year,
                tier: template.tier,
            });
        }
        // 按综合能力排序（模拟选秀榜单）
        rookies.sort((a, b) => b.o + b.pot * 0.3 - (a.o + a.pot * 0.3));
        return rookies;
    }

    // 位置加权综合值
    function computeOvr(pos, s) {
        const weights = {
            PG: { ins:0.10, sh:0.22, pa:0.28, re:0.05, de:0.13, at:0.10, iq:0.12 },
            SG: { ins:0.14, sh:0.28, pa:0.15, re:0.06, de:0.14, at:0.13, iq:0.10 },
            SF: { ins:0.16, sh:0.22, pa:0.12, re:0.10, de:0.16, at:0.14, iq:0.10 },
            PF: { ins:0.20, sh:0.14, pa:0.08, re:0.18, de:0.16, at:0.14, iq:0.10 },
            C:  { ins:0.22, sh:0.08, pa:0.06, re:0.22, de:0.18, at:0.12, iq:0.12 },
        };
        const w = weights[pos] || weights.SF;
        let o = 0;
        for (const k in w) o += (s[k] || 60) * w[k];
        return Math.round(o);
    }

    // 新秀薪资（首轮秀薪资帽比例）
    function rookieSalary(ovr, round) {
        // 首轮根据顺位，这里用 ovr 近似
        if (round === 1) {
            if (ovr >= 80) return 11.0;
            if (ovr >= 76) return 7.5;
            if (ovr >= 72) return 4.5;
            return 3.0;
        }
        return 1.2; // 次轮/落选秀双向合同
    }

    // 确定选秀顺位
    // standings: [{teamId, win, loss, madePlayoffs, playoffExitRound}]
    // playoffExitRound: 0=未进季后赛, 1=首轮, 2=次轮, 3=分区决赛, 4=总决赛, 5=冠军
    function determineDraftOrder(standings) {
        const lottery = standings.filter(s => s.madePlayoffs === false);
        const playoff = standings.filter(s => s.madePlayoffs === true);

        // 乐透队按战绩倒序（最差战绩组合数最多）
        lottery.sort((a, b) => a.win - b.win || a.loss - b.loss);

        // 乐透抽签：前4顺位
        const lotteryOrder = runLottery(lottery);

        // 季后赛球队排序：冠军最后(30)，亚军29，以此类推；同轮次按战绩
        playoff.sort((a, b) => {
            // 走得越远顺位越靠后
            const aRank = a.playoffExitRound || 1;
            const bRank = b.playoffExitRound || 1;
            if (aRank !== bRank) return bRank - aRank; // 走得远排后
            return a.win - b.win; // 同轮次战绩差排前
        });

        const firstRound = [...lotteryOrder, ...playoff];
        // 第二轮同样顺序
        const secondRound = [...firstRound];
        return { firstRound, secondRound };
    }

    // 乐透抽签：14支球队，前4顺位抽签
    function runLottery(lotteryTeams) {
        // 组合数分配（最差战绩250，依次递减）
        const combos = [250, 199, 156, 119, 88, 63, 43, 28, 17, 11, 8, 7, 6, 5];
        // 抽前4
        const top4 = [];
        const remaining = [...lotteryTeams];
        const remainingCombos = [...combos].slice(0, remaining.length);
        while (top4.length < 4 && remaining.length > 0) {
            const total = remainingCombos.reduce((a, b) => a + b, 0);
            let r = Math.random() * total;
            let idx = 0;
            for (let i = 0; i < remaining.length; i++) {
                r -= remainingCombos[i];
                if (r <= 0) { idx = i; break; }
            }
            top4.push(remaining[idx]);
            remaining.splice(idx, 1);
            remainingCombos.splice(idx, 1);
        }
        // 5-14 按战绩倒序
        remaining.sort((a, b) => a.win - b.win);
        return [...top4, ...remaining];
    }

    // AI 选秀决策：选择剩余新秀中价值最高的
    function aiPick(availableRookies, teamRoster) {
        // 考虑位置需求
        const posCounts = {};
        teamRoster.forEach(p => { posCounts[p.p] = (posCounts[p.p] || 0) + 1; });
        // 选综合分最高，若位置极度缺乏则略加权
        let best = null, bestScore = -1;
        availableRookies.forEach(r => {
            let score = r.o + r.pot * 0.4;
            // 位置需求
            const need = (posCounts[r.p] || 0) < 2 ? 3 : 0;
            score += need;
            if (score > bestScore) { bestScore = score; best = r; }
        });
        return best;
    }

    // 玩家选某新秀
    function playerPick(availableRookies, rookieId) {
        return availableRookies.find(r => r.id === rookieId);
    }

    // 将新秀加入球队
    function assignRookieToTeam(rookie, teamId, pickNumber) {
        rookie.t = teamId;
        rookie.sal = rookieSalary(rookie.o, pickNumber <= 30 ? 1 : 2);
        rookie.draftPick = pickNumber;
        return rookie;
    }

    function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } }

    return {
        generateRookieClass,
        determineDraftOrder,
        runLottery,
        aiPick,
        playerPick,
        assignRookieToTeam,
        computeOvr,
        rookieSalary,
    };
})();

window.DraftEngine = DraftEngine;
