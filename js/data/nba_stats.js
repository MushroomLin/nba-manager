// NBA 真实球员历史数据加载器
// 数据来源: llimllib/nba_data (stats.nba.com 镜像)，由 scripts/gen_nba_stats.py 生成
//
// 数据结构:
//   nba_stats.json: { "player_id": { name, height, weight, college, country,
//                                    draft_year, draft_round, draft_number,
//                                    seasons: [{year, team, age, gp, min, pts, reb, ast, ...}] } }
//   name_map.json:  { "中文译名": nba_player_id }

const NBAStats = (() => {
    let statsCache = null;   // nba_stats.json
    let nameMapCache = null; // name_map.json
    let loadingPromise = null;

    // 异步加载真实数据（懒加载，第一次访问时触发）
    async function ensureLoaded() {
        if (statsCache && nameMapCache) return true;
        if (loadingPromise) return loadingPromise;

        loadingPromise = (async () => {
            try {
                const [statsResp, mapResp] = await Promise.all([
                    fetch('js/data/nba_stats.json?v=20260725s'),
                    fetch('js/data/name_map.json?v=20260725s'),
                ]);
                if (!statsResp.ok || !mapResp.ok) throw new Error('HTTP error');
                statsCache = await statsResp.json();
                nameMapCache = await mapResp.json();
                return true;
            } catch (e) {
                console.warn('[NBAStats] 加载真实数据失败，将仅显示模拟数据:', e.message);
                statsCache = {};
                nameMapCache = {};
                return false;
            }
        })();
        return loadingPromise;
    }

    // 同步访问（已加载后）
    function getNameMap() { return nameMapCache || {}; }
    function getStats() { return statsCache || {}; }

    // 根据中文译名拿 NBA player_id
    function nbaIdByZh(zhName) {
        if (!nameMapCache) return null;
        const id = nameMapCache[zhName];
        return id != null ? id : null;
    }

    // 根据 NBA player_id 拿真实数据
    function statsByNbaId(nbaId) {
        if (!statsCache || nbaId == null) return null;
        return statsCache[String(nbaId)] || null;
    }

    // 计算生涯汇总（场均/合计）
    // 注意：同一赛季可能有多条记录（赛季中交易），按 year 去重统计赛季数
    function careerSummary(seasons) {
        if (!seasons || seasons.length === 0) return null;
        const uniqueYears = new Set();
        const totals = seasons.reduce((acc, s) => {
            acc.gp += s.gp || 0;
            acc.pts += (s.pts || 0) * (s.gp || 0);
            acc.reb += (s.reb || 0) * (s.gp || 0);
            acc.ast += (s.ast || 0) * (s.gp || 0);
            acc.stl += (s.stl || 0) * (s.gp || 0);
            acc.blk += (s.blk || 0) * (s.gp || 0);
            acc.tov += (s.tov || 0) * (s.gp || 0);
            acc.fgm += (s.fgm || 0) * (s.gp || 0);
            acc.fga += (s.fga || 0) * (s.gp || 0);
            acc.fg3m += (s.fg3m || 0) * (s.gp || 0);
            acc.fg3a += (s.fg3a || 0) * (s.gp || 0);
            acc.ftm += (s.ftm || 0) * (s.gp || 0);
            acc.fta += (s.fta || 0) * (s.gp || 0);
            acc.min += (s.min || 0) * (s.gp || 0);
            if (s.year) uniqueYears.add(s.year);
            return acc;
        }, { gp:0, pts:0, reb:0, ast:0, stl:0, blk:0, tov:0, fgm:0, fga:0, fg3m:0, fg3a:0, ftm:0, fta:0, min:0 });
        if (totals.gp === 0) return null;
        const avg = (v) => (v / totals.gp);
        return {
            gp: totals.gp,
            seasons: uniqueYears.size,
            pts: +avg(totals.pts).toFixed(1),
            reb: +avg(totals.reb).toFixed(1),
            ast: +avg(totals.ast).toFixed(1),
            stl: +avg(totals.stl).toFixed(1),
            blk: +avg(totals.blk).toFixed(1),
            tov: +avg(totals.tov).toFixed(1),
            min: +avg(totals.min).toFixed(1),
            fg_pct: totals.fga > 0 ? +(totals.fgm / totals.fga).toFixed(3) : 0,
            fg3_pct: totals.fg3a > 0 ? +(totals.fg3m / totals.fg3a).toFixed(3) : 0,
            ft_pct: totals.fta > 0 ? +(totals.ftm / totals.fta).toFixed(3) : 0,
        };
    }

    // 合并「真实NBA历史赛季」与「游戏内模拟赛季」为统一的赛季列表
    // 真实数据覆盖 2003-2026，游戏内数据从 2027 起，按 year 去重合并
    // gameSeasons: 游戏内 playerHistory 记录 [{year, age, ovr, teamId, gp, pts, reb, ast}]
    //              + 当前赛季 statAccum 数据
    // 返回统一格式: [{year, team, age, gp, min, pts, reb, ast, stl, blk, tov,
    //                fgm, fga, fg3m, fg3a, ftm, fta, fg_pct, fg3_pct, ft_pct, source}]
    //   source: 'real'=真实NBA, 'game'=游戏内
    function mergeSeasons(nbaId, gameSeasons) {
        const merged = [];
        const seenYears = new Set();

        // 1. 真实 NBA 历史赛季
        const data = statsByNbaId(nbaId);
        if (data && data.seasons) {
            data.seasons.forEach(s => {
                merged.push({
                    year: s.year,
                    team: s.team || '-',
                    age: s.age || null,
                    gp: s.gp || 0,
                    min: s.min || 0,
                    pts: s.pts || 0,
                    reb: s.reb || 0,
                    ast: s.ast || 0,
                    stl: s.stl || 0,
                    blk: s.blk || 0,
                    tov: s.tov || 0,
                    fgm: s.fgm || 0,
                    fga: s.fga || 0,
                    fg3m: s.fg3m || 0,
                    fg3a: s.fg3a || 0,
                    ftm: s.ftm || 0,
                    fta: s.fta || 0,
                    fg_pct: s.fg_pct || 0,
                    fg3_pct: s.fg3_pct || 0,
                    ft_pct: s.ft_pct || 0,
                    ovr: null,
                    source: 'real',
                });
                seenYears.add(s.year);
            });
        }

        // 2. 游戏内赛季（playerHistory + 当前 statAccum）
        //    支持同一赛季多条记录（赛季中交易：每队一条），全部保留以分别展示
        //    year 语义：游戏内和真实数据都用"赛季结束年"，如 year=2027 = 2026-27 赛季
        //    真实数据覆盖到 maxRealYear，游戏内 year > maxRealYear 的才是游戏内独有赛季
        //    游戏内 year <= maxRealYear 的赛季（如 seedInitialPlayerHistory 预填的）会被真实数据覆盖，跳过
        if (gameSeasons && gameSeasons.length > 0) {
            // 计算真实数据的最大 year，用于过滤游戏内重复年份
            const maxRealYear = merged.length > 0
                ? Math.max(...merged.filter(s => s.source === 'real').map(s => s.year))
                : 0;
            gameSeasons.forEach(h => {
                // 跳过真实数据已覆盖的年份（避免同一赛季出现两条记录）
                if (h.year <= maxRealYear) return;
                merged.push({
                    year: h.year,
                    team: h.teamId ? null : '-',  // teamId 在 UI 层转 abbr
                    _teamId: h.teamId || null,
                    age: h.age || null,
                    gp: h.gp || 0,
                    min: h.min || 0,
                    pts: h.pts || 0,
                    reb: h.reb || 0,
                    ast: h.ast || 0,
                    stl: h.stl || 0,
                    blk: h.blk || 0,
                    tov: h.tov || 0,
                    fgm: h.fgm || 0,
                    fga: h.fga || 0,
                    fg3m: h.tpm || 0,   // 游戏内 tpm/tpa 对应 merged fg3m/fg3a
                    fg3a: h.tpa || 0,
                    ftm: h.ftm || 0,
                    fta: h.fta || 0,
                    fg_pct: h.fg_pct || 0,
                    fg3_pct: h.fg3_pct || 0,
                    ft_pct: h.ft_pct || 0,
                    ovr: h.ovr || null,  // 游戏内特有：能力值
                    source: 'game',
                });
            });
        }

        // 按 year 升序，同年按球队 id 排序（保持确定性）
        merged.sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return (a._teamId || a.team || '') < (b._teamId || b.team || '') ? -1 : 1;
        });
        return merged;
    }

    return {
        ensureLoaded,
        getNameMap,
        getStats,
        nbaIdByZh,
        statsByNbaId,
        careerSummary,
        mergeSeasons,
        get ready() { return !!(statsCache && nameMapCache); },
    };
})();

window.NBAStats = NBAStats;
