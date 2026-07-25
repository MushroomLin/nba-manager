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
                    fetch('js/data/nba_stats.json?v=20260725q'),
                    fetch('js/data/name_map.json?v=20260725q'),
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
    function careerSummary(seasons) {
        if (!seasons || seasons.length === 0) return null;
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
            return acc;
        }, { gp:0, pts:0, reb:0, ast:0, stl:0, blk:0, tov:0, fgm:0, fga:0, fg3m:0, fg3a:0, ftm:0, fta:0, min:0 });
        if (totals.gp === 0) return null;
        const avg = (v) => (v / totals.gp);
        return {
            gp: totals.gp,
            seasons: seasons.length,
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

    return {
        ensureLoaded,
        getNameMap,
        getStats,
        nbaIdByZh,
        statsByNbaId,
        careerSummary,
        get ready() { return !!(statsCache && nameMapCache); },
    };
})();

window.NBAStats = NBAStats;
