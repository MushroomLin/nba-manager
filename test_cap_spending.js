// 单测：aiSignFreeAgents 新增的"薪资空间消费"逻辑
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
load('data/history/history_seasons.js'); load('engine/history.js');
load('engine/simulation.js'); load('engine/trade.js'); load('engine/season.js'); load('engine/draft.js');
load('engine/save.js'); load('engine/achievements.js'); load('ui/app.js');
const { App } = sandbox;

// 构造：OKC 名单 14 人全是新秀合同（薪资空间来自 yrsInLeague≤4 的 5 折合同），
// 自由市场有 78/75 ovr 球员
// 注：不能直接把 sal 改小 —— 休赛期 adjustSalaryByAge 会按市场价重算全部薪资，
//     人为压薪资无法穿过 offseason；真实空间来源是新秀合同折扣。
App.init('薪资测试', 'CHI');
const st = App.state;
const okc = st.teamsPlayers['OKC'];
// OKC 全员改为新秀合同（第 3 年）→ 休赛期重算后约市场价 5 折
okc.forEach(p => { p.yrsInLeague = 2; p.a = 23; p.isRookie = false; });
const okcSal = okc.reduce((s, p) => s + p.sal, 0);
console.log(`OKC 构造后薪资: $${okcSal}M (空间 ${sandbox.SALARY_CAP - okcSal}M)`);
// 自由市场加入 2 名优质球员
const fa1 = { id: 'fa_test_1', n: '测试球星A', p: 'SF', a: 27, o: 78, pot: 80, sal: 12, ins: 75, sh: 78, pa: 70, re: 65, de: 74, at: 78, iq: 76, isFreeAgent: true, t: null, yearsInFreeAgency: 0 };
const fa2 = { id: 'fa_test_2', n: '测试球星B', p: 'PF', a: 28, o: 75, pot: 77, sal: 9, ins: 74, sh: 70, pa: 66, re: 72, de: 72, at: 75, iq: 74, isFreeAgent: true, t: null, yearsInFreeAgency: 0 };
st.freeAgents.push(fa1, fa2);
st.players.push(fa1, fa2);

// 调用 app 内部函数（通过 VM 上下文无法直接访问，改用走 offseason 流程）
// 直接验证：找到 App 暴露的接口或用 SeasonEngine? aiSignFreeAgents 是闭包内私有函数。
// 简化：通过 App.advance 走完 offseason → draft → freeAgency 阶段不可控。
// 这里直接重新执行 aiSignFreeAgents 的源码片段验证逻辑正确性：
// 改为运行一个完整 offseason（App.fastAdvance 从 offseason 开始）
const before = okc.length;
console.log(`OKC 名单 ${before} 人`);

// 通过完整 App 流程验证：把阶段设为 offseason，用 advance 逐阶段推进
// （fastAdvance 只处理 regular/playoffs，不覆盖 offseason/draft/freeAgency）
st.phase = 'offseason';
let guard = 0;
while (st.phase !== 'regular' && guard++ < 200) {
    App.advance();
    // 选秀轮到玩家时自动选最强新秀
    if (st.phase === 'draft' && st.draftOrder && st.draftOrder[st.draftPick] === 'CHI') {
        const available = st.rookieClass.filter(r => r.t === null);
        if (available.length) App.userDraftPick(available[0].id);
    }
}
const okcAfter = st.teamsPlayers['OKC'];
const okcSalAfter = okcAfter.reduce((s, p) => s + p.sal, 0);
const hasFA1 = okcAfter.find(p => p.id === 'fa_test_1');
const hasFA2 = okcAfter.find(p => p.id === 'fa_test_2');
// 追踪两个测试 FA 的最终去向
const dest1 = st.teamsPlayers[fa1.t] ? `球队 ${fa1.t}` : (fa1.isRetired ? '退役' : '仍失业');
const dest2 = st.teamsPlayers[fa2.t] ? `球队 ${fa2.t}` : (fa2.isRetired ? '退役' : '仍失业');
console.log(`offseason 后: OKC 名单 ${okcAfter.length} 人, 薪资 $${okcSalAfter.toFixed(1)}M (空间 ${(sandbox.SALARY_CAP - okcSalAfter).toFixed(1)}M)`);
console.log(`  测试球星A(ovr78) 去向: ${hasFA1 ? '✅ OKC 已签约' : dest1}`);
console.log(`  测试球星B(ovr75) 去向: ${hasFA2 ? '✅ OKC 已签约' : dest2}`);
// 门槛诊断：OKC 第 9/10 人能力
const sorted = okcAfter.slice().sort((a, b) => b.o - a.o);
const ninth = sorted[8], tenth = sorted[9];
console.log(`  OKC 第9人 ovr=${ninth ? ninth.o : '-'} 第10人 ovr=${tenth ? tenth.o : '-'} → 签约门槛 ${Math.max(ninth ? ninth.o : 60, tenth ? tenth.o : 60) + 3}`);
console.log(`  名单 ≤15: ${okcAfter.length <= 15 ? '✅' : '❌ ' + okcAfter.length}`);
console.log(`  薪资 ≤ 帽: ${okcSalAfter <= sandbox.SALARY_CAP ? '✅' : '❌'}`);
