// 复现 29 胜阵容后做头对头 + 深挖（轮换/伤病/逐月战绩）
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

// 复现 test_ai_stacking 的 run（同 init 顺序不行，随机不同；直接跑多季找 29 胜类似案例）
App.init('H29', 'CLE', 2003);
const st = App.state;
for (let s = 1; s <= 2; s++) runFullSeason(st);
// 第 3 季开始前快照（无伤病）
const snap = {};
st.teams.forEach(t => snap[t.id] = (st.teamsPlayers[t.id] || []).map(p => ({ ...p, injured: 0 })));
runFullSeason(st);

const recs = st.teams.map(t => ({ tid: t.id, conf: t.conf, w: st.records[t.id].win }))
    .filter(x => x.conf === 'East').sort((a, b) => b.w - a.w);
console.log(`第 3 季东部: ` + recs.map(x => `${x.tid}${x.w}`).join(' '));
const cleW = st.records['CLE'].win;
const cleRank = recs.findIndex(x => x.tid === 'CLE') + 1;
console.log(`CLE: ${cleW}胜 第${cleRank} | rating=${S.teamRating(snap['CLE']).toFixed(1)}`);

// 头对头 CLE vs 东部前4（无伤病快照）
console.log('\n--- 头对头 400 场（无伤病快照） ---');
recs.slice(0, 6).forEach(x => {
    if (x.tid === 'CLE') return;
    let cw = 0;
    for (let i = 0; i < 400; i++) {
        const home = i % 2 === 0 ? snap['CLE'] : snap[x.tid];
        const away = i % 2 === 0 ? snap[x.tid] : snap['CLE'];
        const g = S.simulateGame(home, away, false, null, null);
        const cleHome = i % 2 === 0;
        if ((cleHome ? g.home.score : g.away.score) > (cleHome ? g.away.score : g.home.score)) cw++;
    }
    console.log(`CLE vs ${x.tid}(${x.w}胜, rating=${S.teamRating(snap[x.tid]).toFixed(1)}): ${(cw / 4).toFixed(1)}%`);
});

// CLE 伤病统计
const inj = (st.injuryLog || []).filter(i => i.teamId === 'CLE');
console.log(`\n本季 CLE 伤病: ${inj.length} 起 共${inj.reduce((s, i) => s + i.days, 0)}天`);
inj.slice(0, 8).forEach(i => console.log(`  ${i.playerName || i.name || i.pid}: ${i.days}天`));

// 轮换位置分布（找位置失衡）
const rot = S.buildRotation(snap['CLE'], null);
console.log('\nCLE 轮换: ' + rot.map(r => `${r.player.p}:${r.player.n.slice(0, 5)}${r.player.o}(${r.minutes.toFixed(0)}min)`).join(' '));
const rotW = S.buildRotation(snap[recs[0].tid], null);
console.log(`${recs[0].tid} 轮换: ` + rotW.map(r => `${r.player.p}:${r.player.n.slice(0, 5)}${r.player.o}(${r.minutes.toFixed(0)}min)`).join(' '));
