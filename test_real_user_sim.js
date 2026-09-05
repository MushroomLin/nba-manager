// 用户要求"真实模拟"：2003 骑士玩 3 季，3 个 90+ 球员能否进季后赛
// 本测试 = 完整 App 流程（与用户点按钮完全一致的代码路径）+ 多次独立运行
// 覆盖三种阵容形态：
//   A. 纯自动玩（无人工干预）— 用户什么都不做
//   B. 用户培养出的"3 星 + 正常替补"（92/93/97 + 原阵容角色球员）
//   C. 用户阵容被硬帽/裁员掏空后的"3 星 + 全 filler 替补"（62-70 ovr）
//   D. 最初投诉形态："4 星含两个 99 + filler 替补"
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

function runFullSeason(st, teamId) {
    const y0 = st.year;
    const result = { win: 0, loss: 0, rank: 0, made: false, line8: -1 };
    let guard = 0;
    while (guard++ < 3000) {
        const prevPhase = st.phase;
        advanceOneStep(st);
        if (prevPhase === 'regular' && st.phase !== 'regular') {
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
    return result;
}

// 构造"用户培养球星"：把指定球员各项能力拉升到目标 ovr（保持原属性分布形状）
function boostTo(p, targetO) {
    const delta = targetO - p.o;
    p.o = targetO;
    ['ins', 'sh', 'pa', 'de', 'iq'].forEach(k => { p[k] = Math.max(40, Math.min(99, p[k] + delta)); });
    p.injured = 0;
    return p;
}

// 生成 filler 球员（与 app.generateBenchPlayer 同规则：修复后 ovr 68-76 轮换边缘水平）
function makeFiller(teamId, i) {
    const positions = ["PG", "SG", "SF", "PF", "C"];
    const pos = positions[i % 5];
    const r = (mn, mx) => Math.floor(Math.random() * (mx - mn + 1)) + mn;
    const ovr = r(68, 76);
    return {
        id: `bench_${teamId}_${i}_${Date.now() % 100000}`,
        n: `填充${i}号`, t: teamId, p: pos, a: r(22, 32),
        o: ovr, pot: ovr + r(0, 2),
        sal: 2 + Math.random() * 3,
        ins: r(50, 74), sh: r(52, 76), pa: r(47, 74), re: r(50, 76), de: r(52, 74), at: r(54, 78), iq: r(56, 76),
        isRookie: false, isFiller: true,
    };
}

// 把 CLE 替换为指定阵容并同步 state.players
function replaceRoster(st, newRoster) {
    const oldIds = new Set(st.teamsPlayers['CLE'].map(p => p.id));
    st.players = st.players.filter(p => !oldIds.has(p.id));
    newRoster.forEach(p => st.players.push(p));
    st.teamsPlayers['CLE'] = newRoster;
}

function rosterStr(st, n = 8) {
    return st.teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o).slice(0, n)
        .map(p => `${p.n.slice(0, 6)}(${p.o})`).join(' ');
}

const scenario = process.argv[2] || 'all';

// ============ A. 纯自动玩 3 季 × 8 次 ============
if (scenario === 'all' || scenario === 'A') {
    console.log('==== A: 2003 CLE 纯自动玩 3 季 × 8 次（与用户按钮路径一致）====');
    let missTotal = 0, seasonCount = 0;
    for (let run = 1; run <= 8; run++) {
        App.init(`A${run}`, 'CLE', 2003);
        const st = App.state;
        const marks = [];
        for (let s = 1; s <= 3; s++) {
            const r = runFullSeason(st, 'CLE');
            seasonCount++;
            if (!r.made) missTotal++;
            const stars = st.teamsPlayers['CLE'].filter(p => p.o >= 90).length;
            marks.push(`S${s}:${r.win}-${r.loss}第${r.rank}${r.made ? '✅' : '❌'}(90+×${stars})`);
        }
        console.log(`run${run}: ${marks.join(' | ')}`);
    }
    console.log(`A 小结: ${seasonCount} 季中未进季后赛 ${missTotal} 次`);
}

// ============ B/C/D: 玩 2 季后注入指定阵容形态，跑第 3 季 ============
function injectAndRun(label, buildRoster, runs) {
    console.log(`\n==== ${label} ====`);
    for (let run = 1; run <= runs; run++) {
        App.init(`${label}${run}`, 'CLE', 2003);
        const st = App.state;
        // 前 2 季自然玩（用户培养期）
        for (let s = 1; s <= 2; s++) runFullSeason(st, 'CLE');
        // 注入阵容
        const roster = buildRoster(st);
        replaceRoster(st, roster);
        const sal = roster.reduce((s, p) => s + (p.sal || 0), 0);
        const r = runFullSeason(st, 'CLE');
        const rot = sandbox.SimEngine.buildRotation(st.teamsPlayers['CLE'], null);
        const confRecs = st.teams.map(t => ({ tid: t.id, r: st.records[t.id] }))
            .filter(x => st.teams.find(t => t.id === x.tid).conf === 'East')
            .sort((a, b) => b.r.win - a.r.win);
        console.log(`run${run}: 阵容[${rosterStr(st, 7)}] 薪资${sal.toFixed(0)}M rating=${sandbox.SimEngine.teamRating(st.teamsPlayers['CLE']).toFixed(1)} 轮换${rot.length}人`);
        console.log(`      → ${r.win}-${r.loss} 东部第${r.rank} ${r.made ? '✅进季后赛' : '❌未进'} (第8线${r.line8}胜, 东部前8: ${confRecs.slice(0, 8).map(x => `${x.tid}${x.r.win}`).join(' ')})`);
    }
}

if (scenario === 'all' || scenario === 'B') {
    // B: 3 星(97/93/91) + 保留自然阵容其余人（正常替补）
    injectAndRun('B: 3星(97/93/91)+正常替补', (st) => {
        const roster = st.teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o);
        boostTo(roster[0], 97);
        boostTo(roster[1], 93);
        boostTo(roster[2], 91);
        return roster;
    }, 3);
}

if (scenario === 'all' || scenario === 'C') {
    // C: 3 星(97/93/91) + 其余全部换成 filler（阵容被掏空的最坏情况）
    injectAndRun('C: 3星(97/93/91)+全filler替补(62-70)', (st) => {
        const roster = st.teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o);
        const stars = [roster[0], roster[1], roster[2]].map((p, i) => boostTo(p, [97, 93, 91][i]));
        const fillers = [];
        for (let i = 0; i < 11; i++) fillers.push(makeFiller('CLE', i));
        return [...stars, ...fillers];
    }, 3);
}

if (scenario === 'all' || scenario === 'D') {
    // D: 最初投诉形态 4 星(99/99/93/90) + filler
    injectAndRun('D: 4星(99/99/93/90)+全filler替补', (st) => {
        const roster = st.teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o);
        const stars = [roster[0], roster[1], roster[2], roster[3]].map((p, i) => boostTo(p, [99, 99, 93, 90][i]));
        const fillers = [];
        for (let i = 0; i < 10; i++) fillers.push(makeFiller('CLE', i));
        return [...stars, ...fillers];
    }, 3);
}

console.log('\n==== 完成 ====');
