// 选秀引擎 —— NBA 选秀规则: 乐透抽签(前4) + 两轮各30顺位
// 1. 未进季后赛的14支球队参与乐透，按战绩倒序分配组合数
// 2. 前4顺位由抽签决定，5-14顺位按战绩倒序
// 3. 15-30顺位按季后赛球队战绩倒序（季后赛出局轮次加成）
// 4. 第二轮同样按战绩倒序
// 5. 新秀合同为薪资帽对应比例（首轮秀4年保障）

const DraftEngine = (() => {

    let rookieIdCounter = 0;

    // 按权重随机选择国籍（来源：ROOKIE_COUNTRIES，USA 占 ~75%）
    function pickCountry() {
        const countries = window.ROOKIE_COUNTRIES || [{ country: "USA", weight: 1 }];
        const total = countries.reduce((s, c) => s + c.weight, 0);
        let r = Math.random() * total;
        for (const c of countries) {
            r -= c.weight;
            if (r <= 0) return c.country;
        }
        return countries[0].country;
    }

    // 根据位置生成身高（英寸）和体重（磅）
    // 用正态分布近似：以中位为均值，在 min~max 范围内波动
    function pickHeightWeight(pos) {
        const prof = (window.ROOKIE_PHYSICAL_PROFILES || {})[pos];
        if (!prof) return { height: "6-7", weight: 200 };
        // 身高：中位数附近概率最高，用三角分布近似正态
        const htInches = randTriangleInt(prof.htMin, prof.htMax, prof.htMedian);
        const height = Math.floor(htInches / 12) + "-" + (htInches % 12);
        // 体重：与身高正相关，身高每 +1 英寸体重约 +5lb
        const htOffset = (htInches - prof.htMedian) * 5;
        const wt = Math.round(randTriangleInt(prof.wtMin, prof.wtMax, prof.wtMedian) + htOffset);
        return { height, weight: Math.max(160, Math.min(300, wt)) };
    }

    // 三角分布随机整数（mode 为众数，概率最高）
    function randTriangleInt(min, max, mode) {
        const u = Math.random();
        const range = max - min;
        const d = (mode - min) / range;
        let v;
        if (u <= d) {
            v = min + Math.sqrt(u * range * (mode - min));
        } else {
            v = max - Math.sqrt((1 - u) * range * (max - mode));
        }
        return Math.round(v);
    }

    // 选大学：美国球员 80% 有大学，国际球员无大学（来自本国联赛）
    function pickCollege(country) {
        if (country !== "USA") return "None";
        if (Math.random() > 0.8) return "None"; // 20% 高中直进/发展联盟
        const colleges = window.ROOKIE_COLLEGES;
        if (!colleges || !colleges.length) return "None";
        return colleges[Math.floor(Math.random() * colleges.length)];
    }

    // 跨年度累积已生成新秀姓名，避免多年选秀出现重名
    const allTimeRookieNames = new Set();

    // 生成新秀池（60 人，匹配两轮选秀权数）
    // 修复 v7：原 count=70 导致每年多生成 10 个落选新秀进入自由市场，
    //   叠加淘汰机制后自由市场无限膨胀。真实 NBA 每年 60 个选秀权，
    //   次轮后段落选并去海外/发展联盟，不进入 NBA 自由市场。
    //   调整为 60：与选秀权数匹配，落选新秀数量降至 0（或极少）
    function generateRookieClass(year) {
        const proto = window.ROOKIE_PROTOTYPES;
        const rookies = [];
        const count = 60;
        // 按模板权重分配名额
        const pool = [];
        proto.templates.forEach(t => { for (let i = 0; i < t.weight; i++) pool.push(t); });

        // 名字组合生成 + 单年内去重 + 跨年去重（避免与历史新秀重名）
        const usedNames = new Set();
        // 全联盟现役球员姓名，避免新秀与老将重名
        const usedRookieIds = new Set();
        // NBA 球员名字组件黑名单（名 + 姓 各自拆分）
        // 修复：原代码只检查全名匹配，导致 "詹姆斯·史密斯" 这种组合能通过
        // （全名不匹配 "勒布朗·詹姆斯"，但名 "詹姆斯" 正是 LeBron 的姓）
        // 现在拆分 NBA 球员姓名，把每个组件加入黑名单，名或姓任一匹配即拒绝
        const nbaNameParts = new Set();
        if (window.PLAYERS_DATA) {
            window.PLAYERS_DATA.forEach(p => {
                usedRookieIds.add(p.n);
                if (typeof p.n === 'string') {
                    const parts = p.n.split('·');
                    parts.forEach(part => {
                        const trimmed = part.trim();
                        if (trimmed) nbaNameParts.add(trimmed);
                    });
                }
            });
        }
        function genName() {
            for (let attempt = 0; attempt < 300; attempt++) {
                const fn = proto.firstNames[Math.floor(Math.random() * proto.firstNames.length)];
                const ln = proto.lastNames[Math.floor(Math.random() * proto.lastNames.length)];
                // 拒绝：名或姓与任何 NBA 球员的名/姓组件相同
                if (nbaNameParts.has(fn) || nbaNameParts.has(ln)) continue;
                const full = `${fn}·${ln}`;
                if (!usedNames.has(full) && !usedRookieIds.has(full) && !allTimeRookieNames.has(full)) {
                    usedNames.add(full);
                    allTimeRookieNames.add(full);
                    return full;
                }
            }
            // 极端情况：300 次都撞名（池子过小），从已过滤的安全名中随机取并加后缀
            const safeFn = proto.firstNames.filter(n => !nbaNameParts.has(n));
            const safeLn = proto.lastNames.filter(n => !nbaNameParts.has(n));
            const fn = safeFn.length ? safeFn[Math.floor(Math.random() * safeFn.length)] : proto.firstNames[0];
            const ln = safeLn.length ? safeLn[Math.floor(Math.random() * safeLn.length)] : proto.lastNames[0];
            const suffix = String.fromCharCode(65 + Math.floor(Math.random() * 26));
            const full = `${fn}·${ln}${suffix}`;
            usedNames.add(full);
            allTimeRookieNames.add(full);
            return full;
        }

        for (let i = 0; i < count; i++) {
            const template = pool[Math.floor(Math.random() * pool.length)];
            const name = genName();
            const pos = pick(proto.positions);
            const profile = window.ROOKIE_POS_PROFILES[pos];

            const potRaw = randInt(template.potMin, template.potMax);
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

            // 潜力 pot 是"能力上限"，必须高于当前总评 ovr；
            // 模板 potRaw 可能因 base+variance 推高 ovr 而不满足，这里兜底
            const pot = Math.max(potRaw, ovr + 2);

            // 生成球员物理属性与背景信息（与真实 NBA 球员数据对齐）
            const country = pickCountry();
            const { height, weight } = pickHeightWeight(pos);
            const college = pickCollege(country);

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
                yrsInLeague: 0,  // 新秀合同期第 1 年（offseasonProgression 会 +1）
                tier: template.tier,
                // 物理属性与背景（与真实 NBA 球员数据结构对齐，供球员详情展示）
                height: height,       // 身高 "6-9" 格式
                weight: weight,       // 体重 磅
                country: country,     // 国籍
                college: college,     // 大学（国际球员为 "None"）
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
            if (aRank !== bRank) return aRank - bRank; // exitRound 升序：首轮出局靠前，冠军末尾
            return a.win - b.win; // 同轮次战绩差排前
        });

        const firstRound = [...lotteryOrder, ...playoff];

        // 第二轮：纯按战绩倒序（无乐透抽签）
        // NBA 规则：次轮顺位不受乐透影响，按常规赛战绩倒序排列；
        // 季后赛球队按出局轮次（首轮出局在前，冠军在末），同轮次按战绩
        const secondRound = [...standings].sort((a, b) => {
            // 非季后赛球队排在季后赛球队之前
            if (a.madePlayoffs !== b.madePlayoffs) return a.madePlayoffs ? 1 : -1;
            if (a.madePlayoffs) {
                const aRank = a.playoffExitRound || 1;
                const bRank = b.playoffExitRound || 1;
                if (aRank !== bRank) return aRank - bRank;
            }
            // 战绩差（win 少）排前
            return a.win - b.win;
        });

        return { firstRound, secondRound };
    }

    // 乐透球队组合数：rank 从 0 开始（最差战绩 rank=0）
    // 前14名沿用 NBA 实际概率量级（最差战绩250，依次递减）；
    // 超过14支乐透球队时，给剩余球队少量递减组合数，避免 undefined
    function combosForRank(rank) {
        const table = [250, 199, 156, 119, 88, 63, 43, 28, 17, 11, 8, 7, 6, 5];
        if (rank < table.length) return table[rank];
        // 第15+ 支球队：组合数继续递减，最低保留1组
        const extra = rank - table.length;
        return Math.max(1, 5 - extra);
    }

    // 乐透抽签：14支球队，前4顺位抽签
    function runLottery(lotteryTeams) {
        // 抽前4
        const top4 = [];
        const remaining = [...lotteryTeams];
        const remainingCombos = remaining.map((_, i) => combosForRank(i));
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
        // 选秀信息（与真实 NBA 球员数据结构对齐，供球员详情展示）
        // draftYear 已在生成时设置；此处补充 round/number
        rookie.draft_round = pickNumber <= 30 ? 1 : 2;
        rookie.draft_number = pickNumber <= 30 ? pickNumber : pickNumber - 30;
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
        combosForRank,
        aiPick,
        playerPick,
        assignRookieToTeam,
        computeOvr,
        rookieSalary,
    };
})();

window.DraftEngine = DraftEngine;
