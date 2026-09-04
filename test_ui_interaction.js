// 交互级测试：模拟 DOM 事件流，验证球员对比的选择状态机
// 覆盖：勾选→按钮激活→点击弹窗→第3名拒绝→行点击不冲突
const fs = require('fs'), path = require('path'), vm = require('vm');

// ---- 事件感知 DOM mock ----
function makeEl(id, extra = {}) {
    const el = {
        id, _innerHTML: '',
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) { this._innerHTML = String(v); },
        textContent: '', value: '', scrollTop: 0, disabled: false,
        _checked: false,
        get checked() { return this._checked; },
        set checked(v) { this._checked = v; },
        dataset: {}, style: {}, title: '', className: '',
        classList: {
            add(...cs) { el.className += ' ' + cs.join(' '); },
            remove(c) { el.className = el.className.split(/\s+/).filter(x => x !== c).join(' '); },
            toggle() {}, contains(c) { return el.className.split(/\s+/).includes(c); },
        },
        _listeners: {},
        addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
        // 模拟用户点击复选框：切换 checked + 依次触发 click/change 监听器
        userClick() {
            this._checked = !this._checked;
            (this._listeners.click || []).forEach(fn => fn({ stopPropagation() {} }));
            (this._listeners.change || []).forEach(fn => fn({ stopPropagation() {} }));
        },
        // 模拟点击普通元素（按钮/行）
        userClickNoToggle() {
            (this._listeners.click || []).forEach(fn => fn({ stopPropagation() {} }));
        },
        appendChild() {}, remove() {},
    };
    return Object.assign(el, extra);
}

// 选择器注册表：bindViewEvents 按选择器查询，这里注入受控元素
const selRegistry = {};       // selector -> elements[]
const elements = {};          // id -> element
const doc = {
    getElementById: id => (elements[id] || (elements[id] = makeEl(id))),
    querySelectorAll: sel => selRegistry[sel] || [],
    querySelector: () => null,
    createElement: tag => makeEl(tag),
    body: makeEl('body'), head: makeEl('head'),
};

const store = new Map();
const localStorageMock = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k), clear: () => store.clear(),
};
const sandbox = {
    console, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean, Promise,
    parseInt, parseFloat, isNaN, setTimeout: fn => { try { fn(); } catch (e) {} }, clearTimeout: () => {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    Blob: class {}, FileReader: class { readAsText() {} },
    location: { reload: () => {} }, confirm: () => true, alert: () => {},
    document: doc, localStorage: localStorageMock,
};
sandbox.window = sandbox; sandbox.global = sandbox;
vm.createContext(sandbox);

const baseDir = path.join(__dirname, 'js');
const load = rel => vm.runInContext(fs.readFileSync(path.join(baseDir, rel), 'utf8'), sandbox, { filename: rel });
load('data/teams.js'); load('data/players.js'); load('data/rookies.js'); load('data/nba_stats.js');
load('engine/simulation.js'); load('engine/trade.js'); load('engine/season.js'); load('engine/draft.js'); load('engine/save.js');
load('engine/achievements.js');
load('ui/app.js');

const { App } = sandbox;
let passCount = 0, failCount = 0;
const assert = (c, m) => { if (c) { passCount++; console.log(`  ✓ ${m}`); } else { failCount++; console.log(`  ✗ ${m}`); } };
const modalHtml = () => doc.getElementById('modal-box').innerHTML;

App.init('测试', sandbox.TEAMS_DATA[0].id);
const myId = App.state.manager.teamId;

// ---- 准备：为 playersearch 视图注入受控 DOM 元素 ----
const topPlayers = App.state.teamsPlayers[myId].slice().sort((a, b) => b.o - a.o);
const cbEls = topPlayers.map(p => makeEl('cb_' + p.id, { dataset: { pid: String(p.id) }, className: 'ps-cmp' }));
const rowEls = topPlayers.map(p => makeEl('row_' + p.id, { dataset: { pid: String(p.id) } }));
const cmpBtn = doc.getElementById('ps-compare-btn');
cmpBtn.textContent = '⚖️ 对比 (0/2)'; // 模拟真实 DOM：按钮文本来自初始 HTML 渲染
cmpBtn.disabled = true;               // 初始无选择时按钮带 disabled 属性
selRegistry['.ps-cmp'] = cbEls;
selRegistry['[data-pid]'] = [...cbEls, ...rowEls]; // 复选框和行都有 data-pid（与真实 DOM 一致）

App.renderView('playersearch');
const getState = () => ({ checked: cbEls.filter(e => e.checked).length, btnText: cmpBtn.textContent, btnDisabled: cmpBtn.disabled });

console.log('==== [I1] 对比选择状态机 ====');
{
    let s = getState();
    assert(s.btnDisabled === true && /0\/2/.test(s.btnText), `初始状态：按钮禁用显示 0/2（${s.btnText}）`);

    cbEls[0].userClick(); // 勾选第 1 名
    s = getState();
    assert(/1\/2/.test(s.btnText) && s.btnDisabled === true, `勾选 1 名后：按钮显示 1/2 且禁用（${s.btnText}）`);

    cbEls[1].userClick(); // 勾选第 2 名
    s = getState();
    assert(/2\/2/.test(s.btnText) && s.btnDisabled === false, `勾选 2 名后：按钮显示 2/2 且激活（${s.btnText}）`);

    // 点击对比按钮 → 弹出对比弹窗
    cmpBtn.userClickNoToggle();
    const html = modalHtml();
    assert(html.includes('⚖️ 球员对比'), '点击对比按钮弹出对比弹窗');
    assert(html.includes(topPlayers[0].n) && html.includes(topPlayers[1].n), '弹窗含两名被选球员');
    App.closeModal();
}

console.log('==== [I2] 第 3 名拒绝 ====');
{
    // 已选 2 名，再勾选第 3 名：复选框被弹回，选择数不变
    cbEls[2].userClick(); // 勾选第 3 名（应被拒绝并回弹）
    const s = getState();
    assert(cbEls[2].checked === false, '第 3 名复选框被回弹（checked=false）');
    assert(/2\/2/.test(s.btnText), `选择数保持 2/2（${s.btnText}）`);
}

console.log('==== [I3] 取消勾选 ====');
{
    cbEls[0].userClick(); // 取消第 1 名
    const s = getState();
    assert(/1\/2/.test(s.btnText) && s.btnDisabled === true, `取消 1 名后：按钮回到 1/2 且禁用（${s.btnText}）`);
}

console.log('==== [I4] 行点击与复选框不冲突 ====');
{
    // 行（tr[data-pid]）点击应打开球员详情，而非对比弹窗
    rowEls[0].userClickNoToggle();
    const html = modalHtml();
    assert(html.includes(topPlayers[0].n), '行点击打开球员详情弹窗');
    assert(!html.includes('⚖️ 球员对比'), '行点击不触发对比弹窗');
    // 复选框自身点击（带 data-pid）也不应触发详情弹窗
    App.closeModal();
    doc.getElementById('modal-box').innerHTML = ''; // 清掉残留弹窗内容，便于判断是否弹出新窗
    cbEls[0].userClick(); // 重新勾选（此时已有 1 名，共 2 名）
    const html2 = modalHtml();
    assert(!html2.includes('潜力上限') && !html2.includes('⚖️ 球员对比'), '复选框点击不触发任何弹窗');
}

console.log('========== 测试总结 ==========');
console.log(`通过: ${passCount}, 失败: ${failCount}`);
process.exit(failCount > 0 ? 1 : 0);
