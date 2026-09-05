// 剖析：2003 CLE 玩到第 3 季，AI 豪强（60+胜）阵容来源与轮换结构
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
const { App } = sandbox;
const S = sandbox.SimEngine;

function advanceOneStep(st) {
    if (st.phase === 'regular' || st.phase === 'playoffs' || st.phase === 'finals') { App.fastAdvance(); return; }
    if (st.phase === 'draft') {
        if (st.draftOrder[st.draftPick] === 'CLE') {
            const available = st.rookieClass.filter(r => r.t === null);
            if (available.length) { App.userDraftPick(available[0].id); return; }
            st.draftPick++; return;
        }
        App.advance(); return;
    }
    if (st.phase === 'offseason' || st.phase === 'freeAgency') { App.advance(); return; }
}
function runFullSeason(st) {
    const y0 = st.year;
    let guard = 0;
    while (guard++ < 3000) { advanceOneStep(st); if (st.year !== y0) break; }
}

App.init('X9', 'CLE', 2003);
const st = App.state;
for (let s = 1; s <= 3; s++) runFullSeason(st);

const confRecs = st.teams.map(t => ({ tid: t.id, conf: t.conf, r: st.records[t.id] }))
    .filter(x => x.conf === 'East').sort((a, b) => b.r.win - a.r.win);
console.log(`第 3 季东部: ` + confRecs.map(x => `${x.tid}${x.r.win}`).join(' '));
console.log(`CLE: ${st.records['CLE'].win}胜 第${confRecs.findIndex(x => x.tid === 'CLE') + 1}\n`);

// 剖析东部前 3 + CLE 轮换结构
[...confRecs.slice(0, 3).map(x => x.tid), 'CLE'].forEach(tid => {
    const roster = (st.teamsPlayers[tid] || []).slice().sort((a, b) => b.o - a.o);
    const rot = S.buildRotation(st.teamsPlayers[tid] || [], null);
    const rotStr = rot.map(r => `${r.player.n.slice(0, 5)}${r.player.o}`).join(' ');
    console.log(`${tid} ${st.records[tid].win}胜 rating=${S.teamRating(st.teamsPlayers[tid]).toFixed(1)} | 轮换: ${rotStr}`);
});

// AI 交易统计
console.log(`\n3 季 AI 交易: ${(st.tradeLog || []).length} 笔`);
// 全联盟 90+ 与 85+
let c90 = 0, c85 = 0;
st.teams.forEach(t => (st.teamsPlayers[t.id] || []).forEach(p => { if (p.o >= 90) c90++; if (p.o >= 85) c85++; }));
console.log(`全联盟 90+: ${c90} 人, 85+: ${c85} 人`);
