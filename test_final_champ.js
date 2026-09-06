// 最终验证：三巨头阵容（真实用户场景：攻防不均衡球星）跑完整赛季能否夺冠
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

// 用户场景：CLE 交易得到 3 个"真实型球星"（攻强守弱，真实球员典型分布）
App.init('DRAFT', 'CLE', 2003);
const st = App.state;
const roster = st.teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o);
// 前3人改造为真实球星分布：进攻 90+ 防守 72-78（如东契奇/恩比德型）
roster.slice(0, 3).forEach((p, i) => {
    p.sh = [95, 92, 88][i]; p.ins = [86, 92, 90][i]; p.pa = [93, 82, 70][i];
    p.de = [72, 76, 80][i]; p.re = [62, 88, 85][i]; p.at = [85, 84, 82][i]; p.iq = [90, 87, 85][i];
    // 重算 o（与官方权重一致）
    p.o = Math.round((p.ins * 0.10 + p.sh * 0.22 + p.pa * 0.28 + p.re * 0.05 + p.de * 0.13 + p.at * 0.10 + p.iq * 0.12 + (i === 1 ? p.ins * 0.04 : 0)) || p.o);
    // 简化：用位置无关近似，保持 o 在 85-90
    p.o = [88, 89, 87][i];
});
const top3 = st.teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o).slice(0, 4);
console.log(`CLE 改造后前4: ${top3.map(p => p.n.slice(0, 8) + '(o' + p.o + ')').join(' ')}`);
console.log(`CLE rating: ${Sim.teamRating(st.teamsPlayers['CLE']).toFixed(1)}（联盟前8水平为强队）`);

// 跑 1 个完整赛季（offseason 之前停）
const y0 = st.year;
let guard = 0;
while (guard++ < 30000) {
    if (st.phase === 'regular' || st.phase === 'playoffs' || st.phase === 'finals') App.fastAdvance();
    else if (st.phase === 'offseason') break;
    else App.advance();
    if (st.year !== y0) break;
}
const rec = st.records && st.records.CLE;
console.log(`\n赛季 ${y0}-${(y0 + 1) % 100} 结束 | CLE 战绩: ${rec ? rec.win + '-' + rec.loss : '?'}`);
// 冠军
const champ = st.champions && st.champions[st.champions.length - 1];
console.log(`冠军: ${JSON.stringify(champ)}`);
// 季后赛结果
const po = st.playoffs;
if (po && po.finalsResult) {
    console.log(`总决赛: ${JSON.stringify(po.finalsResult).slice(0, 200)}`);
}
// 东部决赛/半决赛 CLE 是否在
['eastResults', 'westResults'].forEach(k => {
    if (po && po[k]) console.log(`${k}: ${JSON.stringify(po[k]).slice(0, 150)}`);
});
