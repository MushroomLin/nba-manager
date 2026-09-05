// 真实数据校准：用 2005-06 真实历史阵容验证星光加成
// 真实基准：骑士 50-32（东部第 4），勒布朗单核 31.4 分
const fs = require('fs'), path = require('path'), vm = require('vm');
const sandbox = { console, Math, JSON, window: {} };
sandbox.window = sandbox; vm.createContext(sandbox);
['data/teams.js', 'data/players.js', 'data/history/history_seasons.js', 'engine/simulation.js'].forEach(rel =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', rel), 'utf8'), sandbox, { filename: rel }));
const SimEngine = sandbox.SimEngine;
const HD = sandbox.HISTORY_DATA;

// 解析历史紧凑数组: [id, team, pos, age, ovr, sal, ins, sh, pa, re, de, at, iq, pot, ...]
function toPlayers(year) {
    const rows = HD.seasons[String(year)];
    return rows.map(r => ({
        id: `h${r[0]}`, n: `p${r[0]}`, t: r[1], p: ['PG','SG','SF','PF','C'][r[2]-1] || 'SG',
        a: r[3], o: r[4], pot: r[13] || r[4], sal: r[5],
        ins: r[6], sh: r[7], pa: r[8], re: r[9], de: r[10], at: r[11], iq: r[12], injured: 0,
    }));
}

const players2005 = toPlayers(2005); // 2005-06 赛季
const teams = {};
players2005.forEach(p => { (teams[p.t] = teams[p.t] || []).push(p); });
console.log('2005-06 球队数:', Object.keys(teams).length);

// 每队 rating
const ratings = Object.entries(teams).map(([id, ps]) => ({ id, r: SimEngine.teamRating(ps) })).sort((a, b) => b.r - a.r);
console.log('rating 前 8:', ratings.slice(0, 8).map(x => `${x.id}:${x.r.toFixed(1)}`).join(' '));
console.log('CLE rating:', ratings.find(x => x.id === 'CLE') ? ratings.find(x => x.id === 'CLE').r.toFixed(1) : '无');
console.log('CLE 前 5:', teams['CLE'].slice().sort((a,b)=>b.o-a.o).slice(0,5).map(p => `${p.p}${p.o}`).join(' '));

// CLE 打全联盟各队 N 场（主客各半），估算胜场
function simSeason(teamId, N) {
    const me = teams[teamId];
    let totalW = 0, totalG = 0;
    const detail = [];
    for (const [oid, ops] of Object.entries(teams)) {
        if (oid === teamId) continue;
        let w = 0;
        for (let i = 0; i < N; i++) {
            const home = i % 2 === 0;
            const res = home ? SimEngine.simulateGame(me, ops) : SimEngine.simulateGame(ops, me);
            const won = home ? res.winner === 'home' : res.winner === 'away';
            if (won) w++;
        }
        totalW += w; totalG += N;
        detail.push({ oid, pct: w / N });
    }
    // 82 场等比换算
    return { wins: Math.round(totalW / totalG * 82), detail: detail.sort((a, b) => a.pct - b.pct) };
}

const N = 60;
// CLE（勒布朗单核，真实 50-32）
const cle = simSeason('CLE', N);
console.log(`\nCLE 2005-06 模拟战绩: ${cle.wins}-82胜上下 (真实: 50-32)`);
console.log(`  最难打: ${cle.detail.slice(0, 3).map(d => `${d.oid} ${(d.pct*100).toFixed(0)}%`).join(', ')}`);
// 其他队校准点（真实 2005-06 战绩）
const benchmarks = [
    ['DET', 64], // 活塞 64-18 联盟第一
    ['SAS', 63], // 马刺 63-19
    ['DAL', 60], // 小牛 60-22
    ['PHX', 54], // 太阳 54-28
    ['MIA', 52], // 热火 52-30 (夺冠)
    ['NJN', 49], // 篮网 49-33
    ['TOR', 27], // 猛龙 27-55
    ['NYK', 23], // 尼克斯 23-59
    ['POR', 21], // 开拓者 21-61
];
console.log('\n全联盟校准（模拟 vs 真实）:');
let errs = [];
for (const [tid, real] of benchmarks) {
    if (!teams[tid]) { console.log(`  ${tid}: 无数据`); continue; }
    const s = simSeason(tid, N);
    const err = s.wins - real;
    errs.push(Math.abs(err));
    console.log(`  ${tid}: 模拟 ${s.wins} 胜 / 真实 ${real} 胜 (误差 ${err >= 0 ? '+' : ''}${err})`);
}
console.log(`\n平均绝对误差: ${(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(1)} 胜`);
