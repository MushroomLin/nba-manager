// 精确定位：新秀 t=球队 且 isFreeAgent=true 的产生路径
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

App.init('RK2', 'CLE', 2003);
const st = App.state;
const myId = 'CLE';

// 给所有新秀装钩子：isFreeAgent 从 false → true 时打印调用栈
function hookRookies(cls) {
    cls.forEach(r => {
        let v = false;
        Object.defineProperty(r, 'isFreeAgent', {
            configurable: true,
            get() { return v; },
            set(nv) {
                if (nv === true && v === false && r.t != null) {
                    const stack = new Error().stack.split('\n').slice(2, 6).join(' | ');
                    console.log(`>>> 钩子触发: ${r.n}(o${r.o}) 设fa=true 时 t=${r.t} ← ${stack}`);
                }
                v = nv;
            }
        });
    });
}

let guard = 0;
while (guard++ < 4000) {
    if (st.phase === 'regular' || st.phase === 'playoffs' || st.phase === 'finals') { App.fastAdvance(); continue; }
    if (st.phase === 'offseason') { App.advance(); continue; }
    if (st.phase === 'draft') {
        if (st.rookieClass && !st.rookieClass.__hooked) {
            st.rookieClass.__hooked = true;
            hookRookies(st.rookieClass);
        }
        if (st.draftOrder[st.draftPick] === myId) {
            const available = st.rookieClass.filter(r => r.t === null);
            if (available.length) { App.userDraftPick(available[0].id); continue; }
            st.draftPick++;
        } else {
            App.autoAdvanceDraft();
        }
        continue;
    }
    if (st.phase === 'freeAgency') { App.advance(); continue; }
    if (st.year > 2010) break;
}
console.log('完成, 最终年份', st.year);
