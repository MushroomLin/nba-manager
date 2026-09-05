// 星光加成校准实验 v15：用真实历史阵容（2003 赛季真实球员）做 head-to-head 校准
// 设计目标（对标真实 NBA）：
//   三星豪阵(96/94/88) vs 联盟中游队 ≈ 75-90%（2017 勇士 vs 平均队 ~90%）
//   三星豪阵 vs 顶级豪强 ≈ 55-75%
//   单核超巨(98) vs 联盟中游队 ≈ 60-80%（2018 骑士）
//   中游队 vs 鱼腩 ≈ 75-90%
const fs = require('fs'), path = require('path'), vm = require('vm');
const sandbox = { console, Math, JSON, window: {} };
sandbox.window = sandbox; vm.createContext(sandbox);
['data/teams.js', 'data/players.js', 'data/rookies.js', 'data/nba_stats.js',
 'data/history/history_seasons.js', 'engine/history.js', 'engine/simulation.js'].forEach(rel =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', rel), 'utf8'), sandbox, { filename: rel }));
const SimEngine = sandbox.SimEngine;
const HistoryEngine = sandbox.HistoryEngine;

// 用 2003 赛季真实数据构造 30 队阵容
const allPlayers = HistoryEngine.buildLeague(2003);
const teamsPlayers = {};
allPlayers.forEach(p => {
    (teamsPlayers[p.t] = teamsPlayers[p.t] || []).push(p);
});

// CLE 注入三球星（模拟用户培养两年）：勒布朗 96 / 布泽尔 94 / 大Z 88
const cleRoster = teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o);
const boost = [
    { name: '勒布朗', o: 96 }, { name: '布泽尔', o: 94 }, { name: '伊尔戈斯卡斯', o: 88 },
];
boost.forEach((b, i) => {
    const p = cleRoster[i];
    const delta = b.o - p.o;
    p.o = b.o;
    ['ins', 'sh', 'pa'].forEach(k => { p[k] = Math.max(40, Math.min(99, p[k] + delta)); });
    p.de = Math.max(40, Math.min(99, p.de + delta));
    p.iq = Math.max(40, Math.min(99, p.iq + delta));
    p.injured = 0;
});
const threeStars = teamsPlayers['CLE'];

// 挑真实对手：按 2003 真实战绩分档
// 2003-04 真实强队：IND(61胜)/LAL/SAS/MIN；中游：MIA/DEN；鱼腩：ORL(21胜)/CHI(23胜)
const opponents = {
    '顶级豪强 IND': teamsPlayers['IND'],
    '顶级豪强 SAS': teamsPlayers['SAS'],
    '中游队 MIA': teamsPlayers['MIA'],
    '中游队 DEN': teamsPlayers['DEN'],
    '鱼腩 ORL': teamsPlayers['ORL'],
    '鱼腩 CHI': teamsPlayers['CHI'],
};

// 单核阵容：CLE 只注入勒布朗 98（其余保持原样）
const soloRoster = [];
teamsPlayers['CLE'].forEach(p => soloRoster.push(Object.assign({}, p)));
const soloSorted = soloRoster.slice().sort((a, b) => b.o - a.o);
{
    const p = soloSorted[0];
    const delta = 98 - p.o;
    p.o = 98;
    ['ins', 'sh', 'pa'].forEach(k => { p[k] = Math.max(40, Math.min(99, p[k] + delta)); });
    p.de = Math.max(40, Math.min(99, p.de + delta));
    p.iq = Math.max(40, Math.min(99, p.iq + delta));
    p.injured = 0;
}

function series(a, b, N) {
    let w = 0;
    for (let i = 0; i < N; i++) {
        const home = i % 2 === 0;
        const res = home ? SimEngine.simulateGame(a, b) : SimEngine.simulateGame(b, a);
        const won = home ? res.winner === 'home' : res.winner === 'away';
        if (won) w++;
    }
    return (w / N * 100).toFixed(0);
}

const N = 300;
console.log('==== v15 星光加成校准（2003 真实阵容）====');
console.log(`三星CLE(96/94/88注入) vs 中游 MIA: ${series(threeStars, opponents['中游队 MIA'], N)}%  (期望 70-88%)`);
console.log(`三星CLE(96/94/88注入) vs 中游 DEN: ${series(threeStars, opponents['中游队 DEN'], N)}%  (期望 70-88%)`);
console.log(`三星CLE(96/94/88注入) vs 豪强 IND: ${series(threeStars, opponents['顶级豪强 IND'], N)}%  (期望 50-75%)`);
console.log(`三星CLE(96/94/88注入) vs 豪强 SAS: ${series(threeStars, opponents['顶级豪强 SAS'], N)}%  (期望 50-75%)`);
console.log(`三星CLE(96/94/88注入) vs 鱼腩 ORL: ${series(threeStars, opponents['鱼腩 ORL'], N)}%  (期望 85-100%)`);
console.log(`单核CLE(98注入) vs 中游 MIA:      ${series(soloRoster, opponents['中游队 MIA'], N)}%  (期望 55-75%)`);
console.log(`单核CLE(98注入) vs 鱼腩 ORL:      ${series(soloRoster, opponents['鱼腩 ORL'], N)}%  (期望 70-90%)`);
console.log(`中游 MIA vs 鱼腩 ORL:             ${series(opponents['中游队 MIA'], opponents['鱼腩 ORL'], N)}%  (期望 70-88%)`);

console.log('\n==== teamRating（2003 真实阵容 + 注入）====');
console.log(`三星CLE rating: ${SimEngine.teamRating(threeStars).toFixed(1)}`);
console.log(`单核CLE rating: ${SimEngine.teamRating(soloRoster).toFixed(1)}`);
console.log(`原始CLE rating: ${SimEngine.teamRating(teamsPlayers['CLE'].map(p => Object.assign({}, p, { o: p.o }))).toFixed(1)}`);
Object.entries(opponents).slice(0, 6).forEach(([k, v]) =>
    console.log(`${k} rating: ${SimEngine.teamRating(v).toFixed(1)}`));
