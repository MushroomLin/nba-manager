// 极限复现测试：多种场景下 4 个 90+ 球员（含两个 99）能否错过季后赛
// 场景：现代模式 / 历史模式 / 极薄阵容 / 极端战术 / 多赛季老化
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

// 给用户队注入 4 个 90+ 球员（改造现有球员，保持薪资/年龄结构）
function injectStars(st, teamId, ratings = [99, 99, 91, 90]) {
    const roster = st.teamsPlayers[teamId].slice().sort((a, b) => b.o - a.o);
    for (let i = 0; i < 4; i++) {
        const p = roster[i];
        const delta = ratings[i] - p.o;
        p.o = ratings[i];
        ['ins', 'sh', 'pa'].forEach(k => { p[k] = Math.max(40, Math.min(99, p[k] + delta)); });
        p.de = Math.max(40, Math.min(99, p.de + delta));
        p.iq = Math.max(40, Math.min(99, p.iq + delta));
        p.re = Math.max(40, Math.min(99, p.re + Math.round(delta / 2)));
        p.injured = 0;
    }
}

// 把替补全部削弱到 55（模拟"为凑球星清空阵容"）
function weakenBench(st, teamId) {
    const roster = st.teamsPlayers[teamId].slice().sort((a, b) => b.o - a.o);
    roster.slice(4).forEach(p => {
        p.o = 55;
        ['ins', 'sh', 'pa', 'de', 'iq', 're'].forEach(k => { p[k] = 55; });
    });
}

// 跑一个完整赛季：regular → playoffs → offseason → draft → freeAgency → 新赛季
// 注意：fastAdvance 只处理 regular/playoffs；offseason/draft/freeAgency 必须用 advance
function advanceOneStep(st) {
    if (st.phase === 'regular' || st.phase === 'playoffs' || st.phase === 'finals') {
        App.fastAdvance();
        return true;
    }
    if (st.phase === 'offseason' || st.phase === 'draft' || st.phase === 'freeAgency') {
        App.advance();
        // 选秀轮到玩家时自动选最强新秀
        if (st.phase === 'draft' && st.draftOrder && st.draftOrder[st.draftPick] === st.manager.teamId) {
            const available = st.rookieClass.filter(r => r.t === null);
            if (available.length) App.userDraftPick(available[0].id);
        }
        return true;
    }
    return false;
}

// 跑完当前赛季（直到年份 +1 且 phase 回到 regular），返回该赛季战绩
function runFullSeason(st, teamId) {
    const y0 = st.year;
    const result = { win: 0, loss: 0, rank: 0, made: false, line8: -1 };
    // 先推进到赛季结束（offseason），期间记录常规赛最终战绩
    let guard = 0;
    while (guard++ < 2000) {
        const prevPhase = st.phase;
        advanceOneStep(st);
        // 常规赛刚结束（phase 离开 regular）时快照战绩
        if (prevPhase === 'regular' && st.phase !== 'regular') {
            Object.assign(result, seasonResult(st, teamId, y0));
        }
        if (st.year !== y0 && st.phase === 'regular') break; // 新赛季开始
        if (st.year !== y0 && (st.phase === 'offseason' || st.phase === 'draft' || st.phase === 'freeAgency')) break;
    }
    return result;
}

// 统计某赛季用户队战绩与排名（赛季结束后调用）
function seasonResult(st, teamId, year) {
    const rec = st.records[teamId];
    const recs = Object.entries(st.records).map(([tid, r]) => ({ tid, win: r.win, loss: r.loss }));
    const conf = st.teams.find(t => t.id === teamId).conf;
    const confRecs = recs.filter(r => st.teams.find(t => t.id === r.tid).conf === conf).sort((a, b) => b.win - a.win || a.loss - b.loss);
    const rank = confRecs.findIndex(r => r.tid === teamId) + 1;
    return { win: rec.win, loss: rec.loss, rank, made: rank <= 8, line8: confRecs[7] ? confRecs[7].win : -1 };
}

// ============ 场景 A: 现代模式，不同球队 ============
console.log('==== 场景 A: 现代模式（BOS/CHI/SAC，标准注入）====');
for (const tid of ['BOS', 'CHI', 'SAC']) {
    App.init(`测试-${tid}`, tid);
    const st = App.state;
    injectStars(st, tid);
    const r = runFullSeason(st, tid);
    console.log(`${tid}: ${r.win}-${r.loss} 第${r.rank} ${r.made ? '✅' : '❌未进季后赛'} (第8线${r.line8}胜)`);
}

// ============ 场景 B: 历史模式 1996（强队林立年代）============
console.log('\n==== 场景 B: 历史模式 1996（MEM=温哥华灰熊 = 最弱队 + 4星）====');
App.init('历史测试', 'MEM', 1996);
let stB = App.state;
injectStars(stB, 'MEM');
const rB = runFullSeason(stB, 'MEM');
console.log(`MEM(1996温哥华灰熊): ${rB.win}-${rB.loss} 第${rB.rank} ${rB.made ? '✅' : '❌未进季后赛'} (第8线${rB.line8}胜)`);

// ============ 场景 C: 极薄阵容（替补全 55）============
console.log('\n==== 场景 C: 现代模式 CHI + 替补全 55（清空深度）====');
for (let run = 1; run <= 3; run++) {
    App.init(`薄阵容${run}`, 'CHI');
    const st = App.state;
    injectStars(st, 'CHI');
    weakenBench(st, 'CHI');
    const r = runFullSeason(st, 'CHI');
    console.log(`run${run}: ${r.win}-${r.loss} 第${r.rank} ${r.made ? '✅' : '❌未进季后赛'} (第8线${r.line8}胜)`);
}

// ============ 场景 D: 极端战术（慢节奏+松防守+长轮换）============
console.log('\n==== 场景 D: 极端战术（pace=0 慢/defense=0 松/rotation=2 长）====');
App.init('战术测试', 'SAC');
const stD = App.state;
injectStars(stD, 'SAC');
if (stD.tactics) { stD.tactics.pace = 0; stD.tactics.defense = 0; stD.tactics.rotation = 2; }
const rD = runFullSeason(stD, 'SAC');
console.log(`SAC(慢+松+长轮换): ${rD.win}-${rD.loss} 第${rD.rank} ${rD.made ? '✅' : '❌未进季后赛'} (第8线${rD.line8}胜)`);

// ============ 场景 E: 连续 5 个赛季（老化/续约/伤病长期影响）============
console.log('\n==== 场景 E: 连续 5 个赛季（BOS，观察老化后是否跌出季后赛）====');
App.init('长线测试', 'BOS');
const stE = App.state;
injectStars(stE, 'BOS');
for (let s = 0; s < 5; s++) {
    const r = runFullSeason(stE, 'BOS');
    const stars = stE.teamsPlayers['BOS'].filter(p => p.o >= 90).map(p => `${p.n}(${p.o},${p.a}岁)`);
    console.log(`  赛季${s + 1}: ${r.win}-${r.loss} 第${r.rank} ${r.made ? '✅' : '❌未进季后赛'} | 90+: ${stars.join(', ') || '无'}`);
}
console.log('\n==== 测试完成 ====');
