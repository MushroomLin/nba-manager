// 诊断：用户培养出的 90+ 球星，"显示 o" vs "引擎实际属性(offOf/de)" 的差距
// 以及 3星+filler 阵容的 rating 分解（找出 rating 被什么拖垮）
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

function advanceOneStep(st) {
    if (st.phase === 'regular' || st.phase === 'playoffs' || st.phase === 'finals') { App.fastAdvance(); return; }
    if (st.phase === 'offseason' || st.phase === 'draft' || st.phase === 'freeAgency') {
        App.advance();
        if (st.phase === 'draft' && st.draftOrder && st.draftOrder[st.draftPick] === st.manager.teamId) {
            const available = st.rookieClass.filter(r => r.t === null);
            if (available.length) App.userDraftPick(available[0].id);
        }
    }
}
function runFullSeason(st) {
    const y0 = st.year;
    let guard = 0;
    while (guard++ < 3000) { advanceOneStep(st); if (st.year !== y0) break; }
}

// 跑 6 次，找一次 90+ ≥ 3 或接近的场景，打印球星属性分解
for (let run = 1; run <= 6; run++) {
    App.init(`诊断${run}`, 'CLE', 2003);
    const st = App.state;
    for (let s = 1; s <= 2; s++) runFullSeason(st);

    const roster = st.teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o);
    const stars = roster.filter(p => p.o >= 88).slice(0, 4);
    if (run <= 3 || stars.length >= 3) {
        console.log(`\n===== run${run}（2季后）CLE 前 6 =====`);
        roster.slice(0, 6).forEach(p => {
            const offOf = ((p.ins + p.sh + p.pa) / 3).toFixed(1);
            console.log(`  ${p.n.slice(0, 8).padEnd(10)} ${p.p} ${p.a}岁 o=${p.o} pot=${p.pot} | 引擎视角: off=${offOf} de=${p.de} re=${p.re} iq=${p.iq} | o-实际差=${(p.o - offOf).toFixed(1)}`);
        });
        // 联盟各队 rating 分布
        const ratings = st.teams.map(t => ({ tid: t.id, r: sandbox.SimEngine.teamRating(st.teamsPlayers[t.id]) }))
            .sort((a, b) => b.r - a.r);
        console.log(`  联盟 rating: 最高 ${ratings[0].tid}=${ratings[0].r.toFixed(1)}, 最低 ${ratings[29].tid}=${ratings[29].r.toFixed(1)}, 中位 ${ratings[15].tid}=${ratings[15].r.toFixed(1)}`);
        const cleR = ratings.find(x => x.tid === 'CLE');
        console.log(`  CLE rating=${cleR.r.toFixed(1)}, 联盟排名 ${ratings.findIndex(x => x.tid === 'CLE') + 1}/30`);
        console.log(`  联盟前8: ${ratings.slice(0, 8).map(x => `${x.tid}${x.r.toFixed(0)}`).join(' ')}`);
    }
}
