// 头对头验证：第 3 季 CLE vs 东部豪强直接对局 500 场，对比赛季实际战绩
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

App.init('H2H', 'CLE', 2003);
const st = App.state;
for (let s = 1; s <= 2; s++) runFullSeason(st);
// 现在处于第 3 季开始（offseason 已过），快照各队阵容（无伤病状态）
const rosterSnap = {};
st.teams.forEach(t => {
    rosterSnap[t.id] = (st.teamsPlayers[t.id] || []).map(p => ({ ...p, injured: 0 }));
});
// 跑第 3 季
runFullSeason(st);

const confRecs = st.teams.map(t => ({ tid: t.id, conf: t.conf, r: st.records[t.id] }))
    .filter(x => x.conf === 'East').sort((a, b) => b.r.win - a.r.win);
console.log(`第 3 季东部战绩: ` + confRecs.map(x => `${x.tid}${x.r.win}`).join(' '));
const cleRank = confRecs.findIndex(x => x.tid === 'CLE') + 1;
console.log(`CLE 实际: ${st.records['CLE'].win}-${st.records['CLE'].loss} 东部第${cleRank}\n`);

// 头对头：CLE(无伤病快照) vs 东部前8，各 400 场（主客各半）
console.log('--- 头对头 400 场（第 3 季开局无伤病快照） ---');
confRecs.slice(0, 8).forEach(x => {
    if (x.tid === 'CLE') return;
    let cleWin = 0, n = 400;
    for (let i = 0; i < n; i++) {
        const homePlayers = i % 2 === 0 ? rosterSnap['CLE'] : rosterSnap[x.tid];
        const awayPlayers = i % 2 === 0 ? rosterSnap[x.tid] : rosterSnap['CLE'];
        const g = S.simulateGame(homePlayers, awayPlayers, false, null, null);
        const cleHome = i % 2 === 0;
        const cleScore = cleHome ? g.home.score : g.away.score;
        const oppScore = cleHome ? g.away.score : g.home.score;
        if (cleScore > oppScore) cleWin++;
    }
    const rC = S.teamRating(rosterSnap['CLE']).toFixed(1);
    const rO = S.teamRating(rosterSnap[x.tid]).toFixed(1);
    console.log(`CLE(${rC}) vs ${x.tid}(${rO}, 赛季${x.r.win}胜): CLE 胜率 ${(cleWin / n * 100).toFixed(1)}%`);
});

// CLE 对全联盟平均胜率（各队 100 场）
let totalW = 0, totalN = 0;
st.teams.forEach(t => {
    if (t.id === 'CLE') return;
    for (let i = 0; i < 100; i++) {
        const homePlayers = i % 2 === 0 ? rosterSnap['CLE'] : rosterSnap[t.id];
        const awayPlayers = i % 2 === 0 ? rosterSnap[t.id] : rosterSnap['CLE'];
        const g = S.simulateGame(homePlayers, awayPlayers, false, null, null);
        const cleHome = i % 2 === 0;
        const cleScore = cleHome ? g.home.score : g.away.score;
        const oppScore = cleHome ? g.away.score : g.home.score;
        if (cleScore > oppScore) totalW++;
        totalN++;
    }
});
console.log(`\nCLE 对全联盟(无伤病)综合胜率: ${(totalW / totalN * 100).toFixed(1)}% → 期望胜场 ~${(totalW / totalN * 82).toFixed(0)}`);
console.log(`CLE 实际胜场: ${st.records['CLE'].win}（差距 = 伤病/赛程/单场波动）`);

// 本季 CLE 伤病总天数
const inj = (st.injuryLog || []).filter(i => i.teamId === 'CLE');
console.log(`本季 CLE 伤病: ${inj.length} 起 共${inj.reduce((s, i) => s + i.days, 0)}天`);
