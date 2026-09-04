// 对比测试：现役模式 8 赛季 vs 历史模式 8 赛季的 90+ 球员数量
// 用于判断历史模式的明星膨胀是否为游戏固有成长设计
const fs = require('fs'), path = require('path'), vm = require('vm');

function makeEl(id, extra = {}) {
    const el = {
        id, _innerHTML: '',
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) { this._innerHTML = String(v); },
        textContent: '', value: '', scrollTop: 0, disabled: false,
        dataset: {}, style: {}, title: '', className: '', tagName: 'DIV',
        classList: { add(...cs) { el.className += ' ' + cs.join(' '); }, remove(c) {}, toggle() {}, contains(c) { return el.className.split(/\s+/).includes(c); } },
        _listeners: {}, addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); },
        appendChild() {}, remove() {},
    };
    return Object.assign(el, extra);
}
const elements = {};
const doc = { getElementById: id => (elements[id] || (elements[id] = makeEl(id))), querySelectorAll: () => [], querySelector: () => null, createElement: t => makeEl(t), body: makeEl('body'), head: makeEl('head'), addEventListener() {} };
const store = new Map();
const sandbox = {
    console: { log() {}, warn() {}, error() {} }, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean, Promise,
    parseInt, parseFloat, isNaN, isFinite,
    setTimeout: fn => { try { fn(); } catch (e) {} }, clearTimeout: () => {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    Blob: class {}, FileReader: class { readAsText() {} },
    location: { reload: () => {} }, confirm: () => true, alert: () => {},
    fetch: () => Promise.reject(new Error('x')),
    document: doc, localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() },
};
sandbox.window = sandbox; sandbox.global = sandbox;
vm.createContext(sandbox);
const load = rel => vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', rel), 'utf8'), sandbox, { filename: rel });
load('data/teams.js'); load('data/players.js'); load('data/rookies.js'); load('data/nba_stats.js');
load('data/history/history_seasons.js'); load('engine/history.js');
load('engine/simulation.js'); load('engine/trade.js'); load('engine/season.js'); load('engine/draft.js');
load('engine/save.js'); load('engine/achievements.js'); load('ui/app.js');
const { App } = sandbox;

function runSeasons(startYear, teamId, nSeasons) {
    App.init('对比', teamId, startYear);
    let st = App.state;
    const snap = [];
    for (let i = 0; i < nSeasons; i++) {
        App.fastAdvance();
        let g = 0;
        while ((st.phase === 'playoffs' || st.phase === 'finals') && g++ < 10) App.fastAdvance();
        if (st.phase !== 'offseason') break;
        App.advance();
        let g2 = 0;
        while (st.phase !== 'regular' && g2++ < 400) {
            if (st.phase === 'draft') {
                if (st.draftPick >= 60) { App.advance(); }
                else if (st.draftOrder[st.draftPick] === teamId) {
                    const avail = st.rookieClass.filter(r => r.t === null);
                    avail.sort((a, b) => (b.o + b.pot) - (a.o + a.pot));
                    if (avail.length) App.userDraftPick(avail[0].id); else App.advance();
                } else App.advance();
            } else if (st.phase === 'freeAgency' || st.phase === 'offseason') App.advance();
            else break;
        }
        st = App.state;
        if (st.phase !== 'regular') break;
        const rostered = [];
        st.teams.forEach(t => st.teamsPlayers[t.id].forEach(p => rostered.push(p)));
        snap.push({
            year: st.year,
            total: rostered.length,
            elite: rostered.filter(p => p.o >= 90).length,
            elite85: rostered.filter(p => p.o >= 85).length,
        });
    }
    return { snap, st };
}

console.log('==== 现役模式 2026 开局，8 个赛季 ====');
const cur = runSeasons(2026, 'LAL', 8);
cur.snap.forEach(s => console.log(`  ${s.year}: 90+=${s.elite}, 85+=${s.elite85}, 在册=${s.total}`));

console.log('\n==== 历史模式 1996 开局，8 个赛季 ====');
const hist = runSeasons(1996, 'CHI', 8);
hist.snap.forEach(s => console.log(`  ${s.year}: 90+=${s.elite}, 85+=${s.elite85}, 在册=${s.total}`));
