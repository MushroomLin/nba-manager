// 验证：AI 交易系统是否会未经同意交易用户球队的球员
const fs = require('fs'), path = require('path'), vm = require('vm');

function makeEl(id, extra = {}) {
    const el = {
        id, _innerHTML: '',
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) { this._innerHTML = String(v); },
        textContent: '', value: '', scrollTop: 0, disabled: false,
        dataset: {}, style: {}, title: '', className: '', tagName: 'DIV',
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        _listeners: {},
        addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
        appendChild() {}, remove() {},
    };
    return Object.assign(el, extra);
}
const elements = {};
const doc = {
    getElementById: id => (elements[id] || (elements[id] = makeEl(id))),
    querySelectorAll: () => [], querySelector: () => null,
    createElement: tag => makeEl(tag), body: makeEl('body'), head: makeEl('head'),
    addEventListener() {},
};
const store = new Map();
const sandbox = {
    console, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean, Promise,
    parseInt, parseFloat, isNaN, isFinite,
    setTimeout: fn => { try { fn(); } catch (e) {} }, clearTimeout: () => {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    Blob: class {}, FileReader: class { readAsText() {} },
    location: { reload: () => {} }, confirm: () => true, alert: () => {},
    fetch: () => Promise.reject(new Error('no fetch')),
    document: doc, localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() },
};
sandbox.window = sandbox; sandbox.global = sandbox;
vm.createContext(sandbox);
const load = rel => vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', rel), 'utf8'), sandbox, { filename: rel });
load('data/teams.js'); load('data/players.js'); load('data/rookies.js'); load('data/nba_stats.js');
load('engine/simulation.js'); load('engine/trade.js'); load('engine/season.js'); load('engine/draft.js');
load('engine/save.js'); load('engine/achievements.js'); load('ui/app.js');
const { App } = sandbox;

App.init('偷星测试', 'CHI');
const st = App.state;
const myId = 'CHI';

// 注入 4 个 90+ 球员（记录初始名单）
const roster = st.teamsPlayers[myId].slice().sort((a, b) => b.o - a.o);
const ratings = [99, 99, 91, 90];
const originalStars = [];
for (let i = 0; i < 4; i++) {
    const p = roster[i];
    const delta = ratings[i] - p.o;
    p.o = ratings[i];
    ['ins', 'sh', 'pa'].forEach(k => { p[k] = Math.min(99, p[k] + delta); });
    p.de = Math.min(99, p.de + delta);
    p.iq = Math.min(99, p.iq + delta);
    originalStars.push({ id: p.id, n: p.n, o: p.o, a: p.a });
}
console.log(`初始 4 星: ${originalStars.map(p => `${p.n}(${p.o},${p.a}岁)`).join(', ')}`);

// 监控 tradeLog 中涉及用户队的交易
let userTrades = [];
const origRunDailyAiTrades = null; // 通过 state.tradeLog 检测

// 模拟完整常规赛（快速推进，非 fast 模式逐日跑以观察 tradeLog）
let days = 0;
while (st.phase === 'regular' && days < 400) {
    App.advance(); // 逐场推进（advanceToUserGame 逐日）
    days++;
    // 检查 tradeLog 新增
    while (st.tradeLog.length > 0 && userTrades.length < 100) {
        // 只关心涉及 CHI 的
        break;
    }
}

// 检查所有涉及用户队的交易
const myTrades = st.tradeLog.filter(t => t.teamA === myId || t.teamB === myId);
console.log(`\n涉及用户队(CHI)的 AI 交易: ${myTrades.length} 笔`);
myTrades.slice(0, 10).forEach(t => {
    const out = t.teamA === myId ? t.outgoingA : t.outgoingB;
    const inc = t.teamA === myId ? t.outgoingB : t.outgoingA;
    console.log(`  [Day${t.day}] CHI 送出: ${out.map(p => `${p.n}(${p.o})`).join(',')} | 得到: ${inc.map(p => `${p.n}(${p.o})`).join(',')}`);
});

// 检查初始 4 星现在还在不在
console.log('\n赛季结束后 4 星去向:');
originalStars.forEach(s => {
    const p = st.players.find(x => x.id === s.id);
    if (!p) { console.log(`  ${s.n}(${s.o}): 已不在联盟!`); return; }
    const onMyTeam = st.teamsPlayers[myId].some(x => x.id === s.id);
    console.log(`  ${s.n}(${s.o}): ${onMyTeam ? '✅ 仍在 CHI' : `❌ 已被交易到 ${p.t || p.teamId || '?'}`} (现 ovr=${p.o})`);
});

const rec = st.records[myId];
console.log(`\nCHI 战绩: ${rec.win}-${rec.loss} (phase=${st.phase})`);
