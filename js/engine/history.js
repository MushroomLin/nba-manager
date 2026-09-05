// 历史赛季引擎 —— 支持从任意过去赛季（1996-97 ~ 2025-26）开始职业生涯
//
// 数据源: js/data/history/history_seasons.js (window.HISTORY_DATA)
//   players: { pid: [英文名, 中文名|null, 位置原文, 身高in, 体重lb, 选秀年, 轮, 顺位, 首秀年, 生涯末年] }
//   seasons: { "1996": [[pid, 球队缩写, 位置idx, 年龄, 总评, 薪资, 潜力,
//                        ins, sh, pa, re, de, at, iq,
//                        gp, min, pts, reb, ast, stl, blk, tov], ...] }
//
// 球队映射策略（历史缩写 → 现役 30 队）:
//   城市连续性优先：老夏洛特黄蜂(CHH)→现夏洛特(CHA)，新奥尔良链条(NOH/NOK/NOP)→NOP。
//   1996-2001 无新奥尔良球队（CHA 槽位为老黄蜂）；2002-2003 无夏洛特球队（山猫 2004 年成立）。
//   缺席球队用替补填充球员补齐 14 人，保证 30 队引擎正常运转。

const HistoryEngine = (() => {

    const D = window.HISTORY_DATA || null;
    const POS_LIST = ["PG", "SG", "SF", "PF", "C"];

    // 历史球队缩写 → 现役球队 ID
    const ABBR_MAP = {
        SEA: "OKC",   // 西雅图超音速 → 雷霆 (2008)
        VAN: "MEM",   // 温哥华灰熊 → 孟菲斯 (2001)
        NJN: "BKN",   // 新泽西篮网 → 布鲁克林 (2012)
        WSB: "WAS",   // 华盛顿子弹 → 奇才 (1997)
        CHH: "CHA",   // 老夏洛特黄蜂 (1988-2001) → 现黄蜂（城市连续性）
        CHB: "CHA",   // 夏洛特山猫旧缩写（防御性映射）
        NOH: "NOP",   // 新奥尔良黄蜂 → 鹈鹕
        NOK: "NOP",   // 新奥尔良/俄克拉荷马城黄蜂（卡特里娜时期）
        NO:  "NOP",   // 新奥尔良黄蜂短缩写
    };

    // 历史队名覆盖（按赛季起始年 year 判断生效区间）
    const TEAM_LABELS = [
        { id: "OKC", until: 2007, city: "西雅图",   name: "超音速" },
        { id: "MEM", until: 2000, city: "温哥华",   name: "灰熊" },
        { id: "BKN", until: 2011, city: "新泽西",   name: "篮网" },
        { id: "WAS", until: 1996, city: "华盛顿",   name: "子弹" },
        { id: "NOP", from: 2002, until: 2012, city: "新奥尔良", name: "黄蜂" },
        { id: "CHA", from: 2004, until: 2013, city: "夏洛特",   name: "山猫" },
    ];

    // 真实总冠军（1946-47 起全部赛季，year = 赛季起始年）
    // 用于历史开局时预填 state.champions，联盟页可查看完整冠军史
    const REAL_CHAMPIONS = [
        [1946, "GSW", "费城勇士"], [1947, "WAS", "巴尔的摩子弹"], [1948, "LAL", "明尼阿波利斯湖人"],
        [1949, "LAL", "明尼阿波利斯湖人"], [1950, "SAC", "罗切斯特皇家"], [1951, "LAL", "明尼阿波利斯湖人"],
        [1952, "LAL", "明尼阿波利斯湖人"], [1953, "LAL", "明尼阿波利斯湖人"], [1954, "PHI", "锡拉丘兹民族"],
        [1955, "GSW", "费城勇士"], [1956, "BOS", "波士顿凯尔特人"], [1957, "ATL", "圣路易斯鹰"],
        [1958, "BOS", "波士顿凯尔特人"], [1959, "BOS", "波士顿凯尔特人"], [1960, "BOS", "波士顿凯尔特人"],
        [1961, "BOS", "波士顿凯尔特人"], [1962, "BOS", "波士顿凯尔特人"], [1963, "BOS", "波士顿凯尔特人"],
        [1964, "BOS", "波士顿凯尔特人"], [1965, "BOS", "波士顿凯尔特人"], [1966, "PHI", "费城76人"],
        [1967, "BOS", "波士顿凯尔特人"], [1968, "BOS", "波士顿凯尔特人"], [1969, "NYK", "纽约尼克斯"],
        [1970, "MIL", "密尔沃基雄鹿"], [1971, "LAL", "洛杉矶湖人"], [1972, "NYK", "纽约尼克斯"],
        [1973, "BOS", "波士顿凯尔特人"], [1974, "GSW", "金州勇士"], [1975, "BOS", "波士顿凯尔特人"],
        [1976, "POR", "波特兰开拓者"], [1977, "WAS", "华盛顿子弹"], [1978, "OKC", "西雅图超音速"],
        [1979, "LAL", "洛杉矶湖人"], [1980, "BOS", "波士顿凯尔特人"], [1981, "LAL", "洛杉矶湖人"],
        [1982, "PHI", "费城76人"], [1983, "BOS", "波士顿凯尔特人"], [1984, "LAL", "洛杉矶湖人"],
        [1985, "BOS", "波士顿凯尔特人"], [1986, "LAL", "洛杉矶湖人"], [1987, "LAL", "洛杉矶湖人"],
        [1988, "DET", "底特律活塞"], [1989, "DET", "底特律活塞"], [1990, "CHI", "芝加哥公牛"],
        [1991, "CHI", "芝加哥公牛"], [1992, "CHI", "芝加哥公牛"], [1993, "HOU", "休斯顿火箭"],
        [1994, "HOU", "休斯顿火箭"], [1995, "CHI", "芝加哥公牛"], [1996, "CHI", "芝加哥公牛"],
        [1997, "CHI", "芝加哥公牛"], [1998, "SAS", "圣安东尼奥马刺"], [1999, "LAL", "洛杉矶湖人"],
        [2000, "LAL", "洛杉矶湖人"], [2001, "LAL", "洛杉矶湖人"], [2002, "SAS", "圣安东尼奥马刺"],
        [2003, "DET", "底特律活塞"], [2004, "SAS", "圣安东尼奥马刺"], [2005, "MIA", "迈阿密热火"],
        [2006, "SAS", "圣安东尼奥马刺"], [2007, "BOS", "波士顿凯尔特人"], [2008, "LAL", "洛杉矶湖人"],
        [2009, "LAL", "洛杉矶湖人"], [2010, "DAL", "达拉斯小牛"], [2011, "MIA", "迈阿密热火"],
        [2012, "MIA", "迈阿密热火"], [2013, "SAS", "圣安东尼奥马刺"], [2014, "GSW", "金州勇士"],
        [2015, "CLE", "克利夫兰骑士"], [2016, "GSW", "金州勇士"], [2017, "GSW", "金州勇士"],
        [2018, "TOR", "多伦多猛龙"], [2019, "LAL", "洛杉矶湖人"], [2020, "MIL", "密尔沃基雄鹿"],
        [2021, "GSW", "金州勇士"], [2022, "DEN", "丹佛掘金"], [2023, "BOS", "波士顿凯尔特人"],
        [2024, "OKC", "俄克拉荷马雷霆"],
    ];

    function isAvailable() { return !!(D && D.seasons); }

    function availableYears() {
        return isAvailable() ? { first: D.first, last: D.last } : null;
    }

    function seasonRows(year) {
        return isAvailable() ? (D.seasons[String(year)] || null) : null;
    }

    function registry(pid) {
        return isAvailable() ? (D.players[String(pid)] || null) : null;
    }

    function mapTeam(abbr) {
        if (!abbr) return null;
        if (ABBR_MAP[abbr]) return ABBR_MAP[abbr];
        if (window.TEAMS_DATA && window.TEAMS_DATA.some(t => t.id === abbr)) return abbr;
        return null;
    }

    // 某赛季的历史队名（迁移/更名前），返回 {city, name} 或 null
    function teamLabel(teamId, year) {
        for (const t of TEAM_LABELS) {
            if (t.id !== teamId) continue;
            if (t.from != null && year < t.from) return null;
            if (t.until != null && year > t.until) return null;
            return { city: t.city, name: t.name };
        }
        return null;
    }

    // 某赛季有真实名单的球队集合（≥10 名真实球员）
    function teamsAvailable(year) {
        const rows = seasonRows(year);
        const counts = {};
        if (rows) {
            rows.forEach(r => {
                const t = mapTeam(r[1]);
                if (t) counts[t] = (counts[t] || 0) + 1;
            });
        }
        const set = new Set();
        for (const t in counts) if (counts[t] >= 10) set.add(t);
        return set;
    }

    function heightStr(hIn) {
        if (!hIn) return null;
        return Math.floor(hIn / 12) + "-" + (hIn % 12);
    }

    // ============ 构建历史赛季联盟 ============
    // 返回游戏格式的球员数组（t 为现役球队 ID；历史缩写已映射）
    function buildLeague(year) {
        const rows = seasonRows(year);
        if (!rows) return null;
        const players = [];
        rows.forEach(r => {
            const pid = r[0];
            const g = registry(pid) || [];
            const t = mapTeam(r[1]);
            const fromYear = (g[8] != null && g[8] > 0) ? g[8] : year;
            const draftYear = g[5] || null;
            const isRookie = fromYear >= year;
            players.push({
                id: `h${pid}`,
                histId: pid,
                n: g[1] || g[0] || `球员${pid}`,
                t,
                p: POS_LIST[r[2]] || "SF",
                a: r[3],
                o: r[4],
                sal: r[5],
                pot: r[6],
                ins: r[7], sh: r[8], pa: r[9], re: r[10], de: r[11], at: r[12], iq: r[13],
                isRookie,
                // ROY 评选依据 draftYear === state.year；无选秀数据的新秀用首秀年兜底
                draftYear: draftYear || (isRookie ? year : null),
                yrsInLeague: Math.max(0, year - fromYear),
                draft_round: g[6] || null,
                draft_number: g[7] || null,
                height: heightStr(g[3]),
                weight: g[4] || null,
            });
        });
        return players;
    }

    // ============ 真实选秀班级 ============
    // draftYear 年选秀进入联盟的真实球员（含海外滞留后首秀者）
    // 返回 { drafted: [按真实顺位], undrafted: [落选/未参选] } 或 null（无真实数据时用生成班级）
    function getDraftClass(draftYear) {
        if (!isAvailable() || draftYear <= D.first || draftYear > D.last) return null;

        const drafted = [];
        const undrafted = [];
        for (const pidStr in D.players) {
            const g = D.players[pidStr];
            // 落选真实新秀：无选秀记录（g[5] 为 0/null，数据源用 0 表示落选）
            // 但首秀年恰为 draftYear（如 2003 落选的马奎斯·丹尼尔斯、2016 落选的范弗里特）
            // 修复 v19：原逻辑只收录有选秀记录的球员，每年 4-16 个生成假新秀混进
            // 60 顺位选秀（用户反馈"历史赛季的新秀有时候不是真实的"）
            const isUndraftedDebut = (g[5] === 0 || g[5] == null) && g[8] === draftYear;
            if (g[5] !== draftYear && !isUndraftedDebut) continue;
            const fromYear = g[8];
            if (fromYear == null || fromYear < D.first || fromYear > D.last) continue;
            const rows = D.seasons[String(fromYear)];
            if (!rows) continue;
            const row = rows.find(r => r[0] === Number(pidStr));
            if (!row) continue;

            const rookie = rowToRookie(row, g, draftYear);
            if (g[6] && g[7]) drafted.push(rookie);
            else undrafted.push(rookie);
        }
        if (drafted.length === 0) return null;

        drafted.sort((a, b) => (a.draft_round - b.draft_round) || (a.draft_number - b.draft_number));
        undrafted.sort((a, b) => b.o - a.o);
        return { drafted, undrafted };
    }

    function tierForPot(pot) {
        if (pot >= 90) return "elite";
        if (pot >= 84) return "high";
        if (pot >= 78) return "solid";
        if (pot >= 72) return "role";
        return "deep";
    }

    // 赛季数据行 → 游戏新秀格式
    function rowToRookie(row, g, draftYear) {
        const pid = row[0];
        const fromYear = g[8];
        // 海外滞留（首秀晚于选秀年）的球员用选秀年年龄近似
        const ageAdj = Math.max(18, row[3] - (fromYear - draftYear));
        return {
            id: `h${pid}`,
            histId: pid,
            n: g[1] || g[0] || `球员${pid}`,
            t: null,
            p: POS_LIST[row[2]] || "SF",
            a: ageAdj,
            o: row[4],
            pot: row[6],
            sal: null, // assignRookieToTeam 会按顺位设置新秀合同
            ins: row[7], sh: row[8], pa: row[9], re: row[10], de: row[11], at: row[12], iq: row[13],
            isRookie: true,
            draftYear,
            yrsInLeague: 0,
            draft_round: g[6] || null,
            draft_number: g[7] || null,
            height: heightStr(g[3]),
            weight: g[4] || null,
            tier: tierForPot(row[6]),
        };
    }

    // ============ 真实生涯历史（playerHistory 预填） ============
    // 返回 { pid: [{year(结束年语义), ovr, teamId, age, gp, min, pts, reb, ast, stl, blk, tov}] }
    // 只包含 uptoYear（不含）之前的数据赛季
    function allCareerHistories(uptoYear) {
        const result = {};
        if (!isAvailable()) return result;
        for (let s = D.first; s < uptoYear; s++) {
            const rows = D.seasons[String(s)];
            if (!rows) continue;
            for (const r of rows) {
                const t = mapTeam(r[1]);
                if (!t) continue;
                const list = result[r[0]] || (result[r[0]] = []);
                list.push({
                    year: s + 1, // 结束年语义（1996-97 赛季 → 1997）
                    ovr: r[4],
                    teamId: t,
                    age: r[3],
                    gp: r[14], min: r[15], pts: r[16], reb: r[17], ast: r[18],
                    stl: r[19], blk: r[20], tov: r[21],
                });
            }
        }
        return result;
    }

    // ============ 真实冠军史预填 ============
    // 返回 startYear 之前的真实冠军条目（与 state.champions 格式一致）
    function championsBefore(startYear) {
        return REAL_CHAMPIONS
            .filter(c => c[0] < startYear)
            .map(c => ({ year: c[0], team: c[1], name: c[2], finalsMVP: null, finalsScore: "-", loserTeamId: null, isReal: true }));
    }

    return {
        isAvailable, availableYears, mapTeam, teamLabel, teamsAvailable,
        buildLeague, getDraftClass, allCareerHistories, championsBefore,
        POS_LIST,
    };
})();

window.HistoryEngine = HistoryEngine;
