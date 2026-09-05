// 诊断：2003 开局，第 1/2/3 季开局时联盟球员 o 分布（检测联盟通胀）
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

function leagueProfile(st, label) {
    // 每队取轮换前 9 人（实际打球的人）统计 o 分布
    const all = [];
    st.teams.forEach(t => {
        const rot = S.buildRotation(st.teamsPlayers[t.id] || [], null);
        rot.forEach(r => all.push(r.player));
    });
    all.sort((a, b) => b.o - a.o);
    const n = all.length;
    const c = (lo) => all.filter(p => p.o >= lo).length;
    const avg = all.reduce((s, p) => s + p.o, 0) / n;
    // 真实 2005-06 参考: 90+ ≈ 10人, 85+ ≈ 26人, 80+ ≈ 70人, 轮换均值 ≈ 75-76
    console.log(`${label}: 轮换球员${n}人 | 90+:${c(90)} 85+:${c(85)} 80+:${c(80)} 75+:${c(75)} | 均值o=${avg.toFixed(1)} | 前12: ${all.slice(0, 12).map(p => p.n.slice(0, 6) + p.o).join(' ')}`);
}

for (let run = 1; run <= 3; run++) {
    App.init('D' + run, 'CLE', 2003);
    const st = App.state;
    leagueProfile(st, `run${run} 第1季开局(2003真实)`);
    for (let s = 2; s <= 4; s++) {
        runFullSeason(st);
        // st.year 已 +1，此时是 offseason 结束后的新赛季
        leagueProfile(st, `run${run} 第${s}季开局(${st.year - 1}-${st.year})`);
    }
    console.log('');
}
