// 自动剖析：跑场景A，一有失败赛季立刻完整转储上下文
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

function dissect(st, seasonIdx) {
    console.log(`\n########## 失败剖析：第 ${seasonIdx} 季 (${st.year - 1}-${st.year}) ##########`);
    const rec = st.records['CLE'];
    const confRecs = st.teams.map(t => ({ tid: t.id, r: st.records[t.id] }))
        .filter(x => st.teams.find(t => t.id === x.tid).conf === 'East')
        .sort((a, b) => b.r.win - a.r.win);
    console.log(`CLE ${rec.win}-${rec.loss} 东部第${confRecs.findIndex(x => x.tid === 'CLE') + 1}`);
    console.log('东部战绩: ' + confRecs.map(x => `${x.tid}${x.r.win}`).join(' '));
    // CLE 阵容
    console.log('--- CLE 阵容（赛后）---');
    st.teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o).slice(0, 12).forEach(p => {
        console.log(`  ${p.n.slice(0, 10).padEnd(12)} ${p.p} ${p.a}岁 o=${p.o} off=${((p.ins + p.sh + p.pa) / 3).toFixed(1)} de=${p.de} re=${p.re} iq=${p.iq} inj=${p.injured} ${p.isFiller ? '[filler]' : ''}`);
    });
    // 本季 CLE 伤病
    const inj = st.injuryLog.filter(i => i.teamId === 'CLE');
    console.log(`--- 本季 CLE 伤病 ${inj.length} 起 ---`);
    const byPlayer = {};
    inj.forEach(i => { (byPlayer[i.player] = byPlayer[i.player] || []).push(i.days); });
    Object.entries(byPlayer).forEach(([n, ds]) => console.log(`  ${n}: ${ds.length}次, 共${ds.reduce((a, b) => a + b, 0)}天 (${ds.join(',')})`));
    // CLE 交易
    const trades = st.tradeLog.filter(t => t.teamA === 'CLE' || t.teamB === 'CLE');
    console.log(`--- 本季 CLE 交易 ${trades.length} 笔 ---`);
    trades.forEach(t => console.log(`  ${t.teamA}⇄${t.teamB}: [${t.outgoingA.map(p => p.n.slice(0, 5) + p.o).join(',')}] ⇄ [${t.outgoingB.map(p => p.n.slice(0, 5) + p.o).join(',')}]`));
    // 轮换与 rating
    const rot = S.buildRotation(st.teamsPlayers['CLE'], null);
    console.log('--- 轮换 ---');
    rot.forEach(r => console.log(`  ${r.player.n.slice(0, 10).padEnd(12)} o=${r.player.o} ${r.min}min off=${((r.player.ins + r.player.sh + r.player.pa) / 3).toFixed(1)} de=${r.player.de}`));
    console.log(`CLE rating = ${S.teamRating(st.teamsPlayers['CLE']).toFixed(1)}`);
    const ratings = st.teams.map(t => ({ tid: t.id, r: S.teamRating(st.teamsPlayers[t.id]) })).sort((a, b) => b.r - a.r);
    console.log('联盟 rating: ' + ratings.map(x => `${x.tid}${x.r.toFixed(0)}`).join(' '));
    // 东西部前8对手 rating
    console.log('东部前8 rating: ' + confRecs.slice(0, 8).map(x => `${x.tid}${ratings.find(r => r.tid === x.tid).r.toFixed(1)}`).join(' '));
}

let found = 0;
for (let run = 1; run <= 10 && found < 2; run++) {
    App.init('F' + run, 'CLE', 2003);
    const st = App.state;
    let failed = false;
    for (let s = 1; s <= 3 && !failed; s++) {
        runFullSeason(st);
        const confRecs = st.teams.map(t => ({ tid: t.id, r: st.records[t.id] }))
            .filter(x => st.teams.find(t => t.id === x.tid).conf === 'East')
            .sort((a, b) => b.r.win - a.r.win);
        const rank = confRecs.findIndex(x => x.tid === 'CLE') + 1;
        const w = st.records['CLE'].win;
        if (rank > 8 || w < 40) { dissect(st, s); found++; failed = true; }
    }
}
console.log('\n剖析完成，共发现 ' + found + ' 个失败案例');
