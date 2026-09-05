// 验证：蒙特卡洛预测器(teamRating+logistic) vs 实际比赛引擎 的胜率预测一致性
const fs = require('fs'), path = require('path'), vm = require('vm');
const sandbox = { console, Math, JSON, window: {} };
sandbox.window = sandbox; vm.createContext(sandbox);
['data/teams.js', 'data/players.js', 'engine/simulation.js'].forEach(r =>
    vm.runInContext(fs.readFileSync(path.join('js', r), 'utf8'), sandbox, { filename: r }));
const SimEngine = sandbox.SimEngine, PLAYERS = sandbox.PLAYERS_DATA;

const teams = [...new Set(PLAYERS.map(p => p.t))].map(tid => ({
    id: tid, roster: PLAYERS.filter(p => p.t === tid).map(p => ({ ...p, injured: 0 })),
}));

// 各队 teamRating（MC 用的公式）
teams.forEach(t => t.rating = SimEngine.teamRating(t.roster));
teams.sort((a, b) => b.rating - a.rating);

// 实际引擎胜率：每队打全联盟各 40 场
console.log("teamRating 排名 vs 实际引擎胜率（每队 420 场）:");
const winPct = {};
for (const t of teams) {
    let w = 0, n = 0;
    for (const opp of teams) {
        if (opp.id === t.id) continue;
        for (let i = 0; i < 15; i++) {
            const home = i % 2 === 0;
            const r = home ? SimEngine.simulateGame(t.roster, opp.roster) : SimEngine.simulateGame(opp.roster, t.roster);
            const won = home ? r.winner === 'home' : r.winner === 'away';
            if (won) w++; n++;
        }
    }
    winPct[t.id] = w / n;
}

console.log('排名 teamRating | 实际胜率 | 旧MC(+1.6/7) | 新MC(+1.0/2.5)');
teams.forEach((t, i) => {
    // MC 的每场胜率近似：对联盟平均 rating
    const avgRating = teams.reduce((s, x) => s + x.rating, 0) / teams.length;
    const pOld = 1 / (1 + Math.exp(-(t.rating + 1.6 - avgRating) / 7));
    const pNew = 1 / (1 + Math.exp(-(t.rating + 1.0 - avgRating) / 2.5));
    console.log(`${String(i + 1).padStart(2)} ${t.id} ${t.rating.toFixed(1).padStart(5)} | 实际 ${(winPct[t.id] * 100).toFixed(0)}% | 旧 ${(pOld * 100).toFixed(0)}% | 新 ${(pNew * 100).toFixed(0)}%`);
});

// 相关性
const xs = teams.map(t => t.rating), ys = teams.map(t => winPct[t.id]);
const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
const sx = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0));
const sy = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0));
console.log(`\n相关系数: ${(cov / (sx * sy)).toFixed(3)}`);
