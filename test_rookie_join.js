// 诊断：新秀进队全链路追踪——选秀选中 → 新赛季开始后是否仍在名单
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

App.init('RK', 'CLE', 2003);
const st = App.state;
const myId = 'CLE';

// 完整跑一个休赛期+选秀+新赛季开始，追踪新秀去向
function trackSeason() {
    // offseason → draft
    let guard = 0;
    while (st.phase !== 'draft' && guard++ < 50) {
        if (st.phase === 'regular' || st.phase === 'playoffs' || st.phase === 'finals') App.fastAdvance();
        else App.advance();
    }
    // 选秀：记录选中快照
    const pickedHere = []; // {name, team, o}
    const cls = st.rookieClass;
    guard = 0;
    while (st.draftPick < 60 && guard++ < 100) {
        if (st.draftOrder[st.draftPick] === myId) {
            const available = cls.filter(r => r.t === null);
            if (available.length) {
                App.userDraftPick(available[0].id);
                continue;
            }
            st.draftPick++;
        } else {
            App.autoAdvanceDraft();
        }
    }
    cls.forEach(r => { if (r.t != null) pickedHere.push({ name: r.n, team: r.t, o: r.o, id: r.id }); });
    // 进入自由市场 → 新赛季开始
    guard = 0;
    while (st.phase !== 'regular' && guard++ < 50) {
        App.advance();
        if (st.phase === 'freeAgency') { App.advance(); } // startNewSeason
    }
    // 验证：新赛季开始后，每个选中的新秀在哪
    let ok = 0, missing = [], moved = [], fa = [];
    pickedHere.forEach(pk => {
        const p = st.players.find(x => x.id === pk.id);
        if (!p) { missing.push(`${pk.name}(${pk.team},o${pk.o}) 完全消失`); return; }
        if (p.isRetired) { missing.push(`${pk.name}(${pk.team}) 已退役??`); return; }
        const onTeam = (st.teamsPlayers[p.t] || []).some(x => x.id === pk.id);
        if (onTeam && p.t === pk.team) ok++;
        else if (onTeam && p.t !== pk.team) moved.push(`${pk.name}: ${pk.team}→${p.t}(交易)`);
        else if (p.t == null && p.isFreeAgent) fa.push(`${pk.name}(${pk.team},o${pk.o}) 变自由球员`);
        else missing.push(`${pk.name}(${pk.team},o${pk.o}) 状态异常 t=${p.t} fa=${!!p.isFreeAgent}`);
    });
    console.log(`${st.year} 新秀 ${pickedHere.length} 人: 在队${ok} | 变FA ${fa.length}${fa.length ? ' → ' + fa.slice(0, 6).join(', ') : ''} | 转会${moved.length} | 异常${missing.length}${missing.length ? ' → ' + missing.slice(0, 6).join(', ') : ''}`);
}

for (let s = 0; s < 6; s++) {
    trackSeason();
    // 跑完一个赛季
    const y0 = st.year;
    let guard = 0;
    while (guard++ < 3000) {
        if (st.phase === 'regular' || st.phase === 'playoffs' || st.phase === 'finals') App.fastAdvance();
        else break;
        if (st.year !== y0) break;
    }
}
