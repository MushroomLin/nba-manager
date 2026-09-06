// v21 星光系数调整后的综合校准：
// 1. 联盟场均得分（防通胀，真实 NBA ~114）
// 2. 历史强队还原（2015-16 勇士 73 胜级、2016-17 勇士 67 胜级应显著强于平均）
// 3. 星级梯度合理性
const fs = require('fs'), path = require('path'), vm = require('vm');
function makeEl(id, extra = {}) {
    const el = { id, _innerHTML: '', get innerHTML() { return this._innerHTML; }, set innerHTML(v) { this._innerHTML = String(v); },
        textContent: '', value: '', scrollTop: 0, disabled: false, dataset: {}, style: {}, title: '', className: '', tagName: 'DIV',
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, _listeners: {},
        addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }, appendChild() {}, remove() {} };
    return Object.assign(el, extra);
}
const elements = {};
const doc = { getElementById: id => (elements[id] || (elements[id] = makeEl(id))), querySelectorAll: () => [], querySelector: () => null,
    createElement: tag => makeEl(tag), body: makeEl('body'), head: makeEl('head'), addEventListener() {} };
const store = new Map();
const sandbox = { console, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean, Promise,
    parseInt, parseFloat, isNaN, isFinite, setTimeout: fn => { try { fn(); } catch (e) {} }, clearTimeout: () => {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }, Blob: class {}, FileReader: class { readAsText() {} },
    location: { reload: () => {} }, confirm: () => true, alert: () => {}, fetch: () => Promise.reject(new Error('no fetch')),
    document: doc, localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() } };
sandbox.window = sandbox; sandbox.global = sandbox;
vm.createContext(sandbox);
const load = rel => vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', rel), 'utf8'), sandbox, { filename: rel });
load('data/teams.js'); load('data/players.js'); load('data/rookies.js'); load('data/nba_stats.js');
load('data/history/history_seasons.js'); load('engine/history.js');
load('engine/simulation.js'); load('engine/trade.js'); load('engine/season.js'); load('engine/draft.js');
load('engine/save.js'); load('engine/achievements.js'); load('ui/app.js');
const Sim = sandbox.SimEngine;
const App = sandbox.App;

// ===== Part 1: 历史开局球队互打，场均得分 + 强弱排序 =====
console.log('===== Part 1: 2015-16 赛季（勇士 73 胜级）联盟校准 =====');
App.init('DRAFT', 'GSW', 2015);
const st = App.state;
// 所有球队 rating
const ratings = st.teams.map(t => ({ id: t.id, name: t.name, rating: Sim.teamRating(st.teamsPlayers[t.id]) }))
    .sort((a, b) => b.rating - a.rating);
console.log('联盟 rating 排名（前8/后3）:');
ratings.slice(0, 8).forEach((r, i) => console.log(`  ${i + 1}. ${r.name} ${r.rating.toFixed(1)}`));
ratings.slice(-3).forEach((r, i) => console.log(`  ${28 + i}. ${r.name} ${r.rating.toFixed(1)}`));

// 勇士 vs 联盟平均队：300 场
const gsw = st.teamsPlayers['GSW'];
const avgTeam = st.teamsPlayers[ratings[14].id]; // 中游队
let gswWin = 0, scoreSum = 0, gameCount = 0;
for (let i = 0; i < 300; i++) {
    const gswHome = i % 2 === 0;
    const g = gswHome ? Sim.simulateGame(gsw, avgTeam) : Sim.simulateGame(avgTeam, gsw);
    const gs = gswHome ? g.home.score : g.away.score;
    const as = gswHome ? g.away.score : g.home.score;
    if (gs > as) gswWin++;
    scoreSum += gs + as; gameCount += 2;
}
console.log(`\n勇士 vs 中游队(${ratings[14].name}): 胜率 ${(gswWin / 3).toFixed(1)}% | 场均得分 ${(scoreSum / gameCount).toFixed(1)}（真实 NBA ~114）`);

// ===== Part 2: 联盟整体得分（随机 100 场） =====
let totalPts = 0, totalG = 0;
for (let i = 0; i < 100; i++) {
    const a = st.teams[Math.floor(Math.random() * 30)].id;
    let b = st.teams[Math.floor(Math.random() * 30)].id;
    while (b === a) b = st.teams[Math.floor(Math.random() * 30)].id;
    const g = Sim.simulateGame(st.teamsPlayers[a], st.teamsPlayers[b]);
    totalPts += g.home.score + g.away.score; totalG += 2;
}
console.log(`\n联盟随机 100 场场均得分: ${(totalPts / totalG).toFixed(1)}（期望 112-116）`);

// ===== Part 3: 1996-97 公牛（72 胜卫冕）=====
console.log('\n===== Part 3: 1996-97 公牛校准 =====');
App.init('DRAFT', 'CHI', 1996);
const st2 = App.state;
const chi = st2.teamsPlayers['CHI'];
const r2 = st2.teams.map(t => ({ id: t.id, name: t.name, rating: Sim.teamRating(st2.teamsPlayers[t.id]) }))
    .sort((a, b) => b.rating - a.rating);
console.log(`公牛 rating 排名: ${r2.findIndex(r => r.id === 'CHI') + 1}/30（期望前3）`);
const avg2 = st2.teamsPlayers[r2[14].id];
let chiWin = 0;
for (let i = 0; i < 300; i++) {
    const chiHome = i % 2 === 0;
    const g = chiHome ? Sim.simulateGame(chi, avg2) : Sim.simulateGame(avg2, chi);
    const cs = chiHome ? g.home.score : g.away.score;
    const as = chiHome ? g.away.score : g.home.score;
    if (cs > as) chiWin++;
}
console.log(`公牛 vs 中游队(${r2[14].name}): 胜率 ${(chiWin / 3).toFixed(1)}%（72 胜球队期望 75-90%）`);
