// 复现：黄蜂 2003-04 赛季 0 胜问题
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
const App = sandbox.App;
const Sim = sandbox.SimEngine;

App.init('DRAFT', 'CLE', 2003);
const st = App.state;

// 1. 黄蜂的初始名单与 rating
const cha = st.teams.find(t => /黄蜂/.test(t.name)) || st.teams.find(t => t.abbr === 'NOH' || t.abbr === 'CHA');
console.log(`黄蜂: id=${cha.id} name=${cha.name} conf=${cha.conf}`);
const chaRoster = st.teamsPlayers[cha.id];
console.log(`初始名单 ${chaRoster.length} 人: ${chaRoster.slice().sort((a,b)=>b.o-a.o).slice(0,5).map(p=>p.n.slice(0,8)+'(o'+p.o+',filler='+!!p.isFiller+')').join(' ')}`);
console.log(`黄蜂 rating: ${Sim.teamRating(chaRoster).toFixed(1)}`);
// 伤病状态
const inj = chaRoster.filter(p => p.injured);
console.log(`受伤球员: ${inj.length}`);

// 2. 黄蜂 vs 联盟平均队 200 场
const ratings = st.teams.map(t => ({ id: t.id, r: Sim.teamRating(st.teamsPlayers[t.id]) })).sort((a, b) => b.r - a.r);
const midTeam = st.teamsPlayers[ratings[15].id];
let w = 0, mySum = 0, oppSum = 0;
for (let i = 0; i < 200; i++) {
    const home = i % 2 === 0;
    const g = home ? Sim.simulateGame(chaRoster, midTeam) : Sim.simulateGame(midTeam, chaRoster);
    const cs = home ? g.home.score : g.away.score;
    const os = home ? g.away.score : g.home.score;
    if (cs > os) w++;
    mySum += cs; oppSum += os;
}
console.log(`黄蜂 vs 中游队(${ratings[15].id}): 胜率 ${(w / 2).toFixed(1)}% | 得分 ${(mySum / 200).toFixed(1)} vs ${(oppSum / 200).toFixed(1)}`);

// 3. 检查黄蜂的赛程：多少场比赛
const chaGames = [];
st.schedule.forEach((day, di) => day.forEach(g => { if (g.home === cha.id || g.away === cha.id) chaGames.push(g); }));
console.log(`赛程中黄蜂比赛数: ${chaGames.length}（期望 82）`);

// 4. 检查其他低胜场球队的名单构成
const sizes = st.teams.map(t => ({ id: t.id, name: t.name, n: st.teamsPlayers[t.id].length, fillers: st.teamsPlayers[t.id].filter(p => p.isFiller).length, r: +Sim.teamRating(st.teamsPlayers[t.id]).toFixed(1) })).sort((a, b) => a.n - b.n);
console.log('\n各队名单人数/填充数/rating（最少6队）:');
sizes.slice(0, 6).forEach(s => console.log(`  ${s.name}: ${s.n}人(fillers=${s.fillers}) rating=${s.r}`));
console.log('最多3队:');
sizes.slice(-3).forEach(s => console.log(`  ${s.name}: ${s.n}人(fillers=${s.fillers}) rating=${s.r}`));
