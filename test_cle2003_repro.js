// 复现用户场景：2003 年骑士，玩两个赛季后 3 个 90+ 球员进不了季后赛
// 真实模拟：完整 App 流程（regular→playoffs→offseason→draft→freeAgency）
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

// 推进一步（fastAdvance 只管 regular/playoffs，其余用 advance）
function advanceOneStep(st) {
    if (st.phase === 'regular' || st.phase === 'playoffs' || st.phase === 'finals') {
        App.fastAdvance();
        return true;
    }
    if (st.phase === 'offseason' || st.phase === 'draft' || st.phase === 'freeAgency') {
        App.advance();
        if (st.phase === 'draft' && st.draftOrder && st.draftOrder[st.draftPick] === st.manager.teamId) {
            const available = st.rookieClass.filter(r => r.t === null);
            if (available.length) App.userDraftPick(available[0].id);
        }
        return true;
    }
    return false;
}

// 跑完当前赛季，返回常规赛战绩+排名
function runFullSeason(st, teamId) {
    const y0 = st.year;
    const result = { win: 0, loss: 0, rank: 0, made: false, line8: -1, stars: [] };
    let guard = 0;
    while (guard++ < 3000) {
        const prevPhase = st.phase;
        advanceOneStep(st);
        if (prevPhase === 'regular' && st.phase !== 'regular') {
            // 常规赛结束快照
            const rec = st.records[teamId];
            result.win = rec.win; result.loss = rec.loss;
            const conf = st.teams.find(t => t.id === teamId).conf;
            const confRecs = st.teams.map(t => ({ tid: t.id, r: st.records[t.id] }))
                .filter(x => st.teams.find(t => t.id === x.tid).conf === conf)
                .sort((a, b) => b.r.win - a.r.win || a.r.loss - b.r.loss);
            result.rank = confRecs.findIndex(x => x.tid === teamId) + 1;
            result.made = result.rank <= 8;
            result.line8 = confRecs[7] ? confRecs[7].r.win : -1;
        }
        if (st.year !== y0) break;
    }
    result.stars = st.teamsPlayers[teamId].filter(p => p.o >= 90).map(p => `${p.n}(${p.o},${p.a}岁)`);
    return result;
}

// ============ 场景 A：2003 CLE 原始阵容，纯 AI 玩 3 季 ============
console.log('==== 场景 A: 2003 CLE 原始阵容，自动玩 3 季（无人工干预）====');
App.init('骑士测试', 'CLE', 2003);
let stA = App.state;
console.log(`开局年份: ${stA.year}, 阶段: ${stA.phase}`);
const roster0 = stA.teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o);
console.log('开局 CLE 前 8 人:');
roster0.slice(0, 8).forEach(p => console.log(`   ${p.n} ${p.p} ${p.a}岁 ovr=${p.o} pot=${p.pot} sal=${p.sal}`));

for (let s = 1; s <= 3; s++) {
    const r = runFullSeason(stA, 'CLE');
    const inj = stA.teamsPlayers['CLE'].filter(p => p.injured > 0).length;
    console.log(`赛季${s} (${stA.year - 1}-${stA.year}): ${r.win}-${r.loss} 东部第${r.rank} ${r.made ? '✅' : '❌未进季后赛'} (第8线${r.line8}胜)`);
    console.log(`   90+: ${r.stars.join(', ') || '无'} | 当前伤员: ${inj}`);
}

// ============ 场景 B：模拟用户玩法——第 3 季注入 3 个 90+（99/95/91）============
console.log('\n==== 场景 B: 2003 CLE 玩 2 季后，注入 3 个 90+（99/95/91），跑第 3 季 ====');
for (let run = 1; run <= 3; run++) {
    App.init(`注入${run}`, 'CLE', 2003);
    const st = App.state;
    // 前 2 季正常玩
    for (let s = 1; s <= 2; s++) runFullSeason(st, 'CLE');
    // 第 3 季开始前注入 3 个 90+（改造现有最强 3 人，模拟用户培养/交易所得）
    const roster = st.teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o);
    const ratings = [99, 95, 91];
    for (let i = 0; i < 3; i++) {
        const p = roster[i];
        const delta = ratings[i] - p.o;
        p.o = ratings[i];
        ['ins', 'sh', 'pa'].forEach(k => { p[k] = Math.max(40, Math.min(99, p[k] + delta)); });
        p.de = Math.max(40, Math.min(99, p.de + delta));
        p.iq = Math.max(40, Math.min(99, p.iq + delta));
        p.re = Math.max(40, Math.min(99, p.re + Math.round(delta / 2)));
        p.at = Math.max(40, Math.min(99, p.at + Math.round(delta / 2)));
        p.injured = 0;
    }
    const before = st.teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o);
    console.log(`run${run} 第3季阵容: ${before.slice(0, 6).map(p => `${p.n}(${p.o})`).join(', ')} ... (第7人 ovr=${before[6] ? before[6].o : '-'})`);
    const r = runFullSeason(st, 'CLE');
    console.log(`run${run} 赛季3: ${r.win}-${r.loss} 东部第${r.rank} ${r.made ? '✅' : '❌未进季后赛'} (第8线${r.line8}胜)`);
}

// ============ 场景 C：从开局直接 3 个 90+（排除前两季因素）============
console.log('\n==== 场景 C: 2003 CLE 开局即注入 3 个 90+（99/95/91），立即跑 1 季 ====');
for (let run = 1; run <= 2; run++) {
    App.init(`开局注入${run}`, 'CLE', 2003);
    const st = App.state;
    const roster = st.teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o);
    const ratings = [99, 95, 91];
    for (let i = 0; i < 3; i++) {
        const p = roster[i];
        const delta = ratings[i] - p.o;
        p.o = ratings[i];
        ['ins', 'sh', 'pa'].forEach(k => { p[k] = Math.max(40, Math.min(99, p[k] + delta)); });
        p.de = Math.max(40, Math.min(99, p.de + delta));
        p.iq = Math.max(40, Math.min(99, p.iq + delta));
        p.injured = 0;
    }
    const r = runFullSeason(st, 'CLE');
    console.log(`run${run}: ${r.win}-${r.loss} 东部第${r.rank} ${r.made ? '✅' : '❌未进季后赛'} (第8线${r.line8}胜)`);
    console.log(`   90+: ${r.stars.join(', ') || '无'}`);
}

console.log('\n==== 测试完成 ====');
