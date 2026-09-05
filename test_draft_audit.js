// 诊断：历史选秀两个问题
// 1. 每年选秀班级中真实 vs 生成新秀占比（60 顺位窗口内）
// 2. 每个顺位选中的新秀是否真的进入球队名单
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
const DE = sandbox.DraftEngine;
const HE = sandbox.HistoryEngine;

// ===== Part 1: 静态统计各选秀年真实覆盖 =====
console.log('===== Part 1: 各选秀年真实新秀覆盖率（数据范围 1997-2025） =====');
let lowYears = 0;
for (let y = 1997; y <= 2025; y++) {
    const real = HE.getDraftClass(y);
    if (!real) { console.log(`${y}: 无真实数据（回退全生成）`); lowYears++; continue; }
    const drafted = real.drafted.length;
    const undrafted = real.undrafted.length;
    // 当前逻辑：60 窗口 = drafted + 生成填充(60-drafted)，undrafted 只追加前 15
    const genFill = Math.max(0, 60 - drafted);
    // 优化后：drafted + undrafted 全部优先
    const genFillNew = Math.max(0, 60 - drafted - undrafted);
    if (genFill > 0 || y % 7 === 0) {
        console.log(`${y}: 真实选中 ${drafted} + 落选 ${undrafted} | 当前生成填充 ${genFill} → 优化后 ${genFillNew}`);
    }
}

// ===== Part 2: 动态追踪选秀进队情况 =====
console.log('\n===== Part 2: 2003 开局连续 5 季选秀追踪 =====');
App.init('DRAFT', 'CLE', 2003);
const st = App.state;
const myId = 'CLE';

function advanceOneStep(st) {
    if (st.phase === 'regular' || st.phase === 'playoffs' || st.phase === 'finals') { App.fastAdvance(); return; }
    if (st.phase === 'offseason') { App.advance(); return; }
    if (st.phase === 'draft') {
        // 记录选秀班级快照
        const cls = st.rookieClass || [];
        const real60 = cls.slice(0, 60).filter(r => r.histId != null).length;
        const gen60 = 60 - real60;
        // 选秀快照：每队名单人数
        const rosterSizes = {};
        st.teams.forEach(t => rosterSizes[t.id] = (st.teamsPlayers[t.id] || []).length);
        // 自动完成选秀（AI 全选 + 轮到玩家时选第一个可用）
        let guard = 0;
        while (st.draftPick < 60 && guard++ < 100) {
            if (st.draftOrder[st.draftPick] === myId) {
                const available = cls.filter(r => r.t === null);
                if (available.length) App.userDraftPick(available[0].id);
                else st.draftPick++;
            } else {
                App.autoAdvanceDraft();
                // autoAdvanceDraft 跑到玩家顺位或结束
                if (st.draftOrder[st.draftPick] === myId && st.draftPick < 60) {
                    const available = cls.filter(r => r.t === null);
                    if (available.length) App.userDraftPick(available[0].id);
                    else st.draftPick++;
                }
            }
        }
        // 若还有残余（<60 顺位被跳过），直接结束
        App.advance(); // 进入 freeAgency
        // 验证：班级中每个 t !== null 的新秀都在对应名单中
        let joined = 0, notOnRoster = [], released = [];
        cls.forEach(r => {
            if (r.t == null) return; // 落选 → 自由市场（正常）
            joined++;
            const roster = st.teamsPlayers[r.t] || [];
            if (!roster.find(p => p.id === r.id)) notOnRoster.push(`${r.n}(o${r.o}→${r.t})`);
        });
        // 新秀被裁情况：选中的新秀 t 被改回 null 且 isFreeAgent
        cls.forEach(r => {
            if (r.t == null && r.isFreeAgent && r.isRookie) released.push(r.n);
        });
        console.log(`${st.year} 选秀: 班级${cls.length}人(60窗口真实${real60}/生成${gen60}) | 选中${joined}人 | 未在名单${notOnRoster.length}${notOnRoster.length ? ' → ' + notOnRoster.slice(0, 5).join(', ') : ''} | 选后被释放${released.length}${released.length ? ' → ' + released.slice(0, 5).join(',') : ''}`);
        // 记录玩家名单
        const myRoster = st.teamsPlayers[myId];
        console.log(`  我队名单 ${myRoster.length} 人，新秀: ${myRoster.filter(p => p.isRookie).map(p => p.n.slice(0, 6) + '(o' + p.o + ')').join(' ') || '无'}`);
        return;
    }
    if (st.phase === 'freeAgency') { App.advance(); return; }
}

for (let s = 0; s < 5; s++) {
    advanceOneStep(st);
    // 跑完一个赛季
    const y0 = st.year;
    let guard = 0;
    while (guard++ < 3000) {
        if (st.phase === 'regular' || st.phase === 'playoffs' || st.phase === 'finals') App.fastAdvance();
        else if (st.phase === 'offseason' || st.phase === 'draft' || st.phase === 'freeAgency') {
            if (st.phase === 'draft') break; // 交给上面的追踪
            App.advance();
        }
        if (st.year !== y0) break;
    }
}
