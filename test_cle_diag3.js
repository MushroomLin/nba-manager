// 诊断场景 B 方差根因：跑 N 次，追踪第 3 季 99/95/91 阵容的
// 1) 战绩分布  2) 球星伤病  3) 球星实际出场数  4) CLE 交易记录
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
    document: doc, localStorage: {
        getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k), clear: () => store.clear()
    },
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
        App.fastAdvance(); return true;
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

const N = 8;
const records = [];
for (let run = 1; run <= N; run++) {
    App.init(`诊断${run}`, 'CLE', 2003);
    const st = App.state;
    // 记录交易日志引用（赛季3 开始后读取新增部分）
    for (let s = 1; s <= 2; s++) runFullSeason(st, 'CLE');

    // 注入 3 个 90+
    const roster = st.teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o);
    const ratings = [99, 95, 91];
    const starIds = [];
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
        starIds.push(p.id);
    }
    const tradeLogBefore = (st.tradeLog || []).length;
    const injuryLogBefore = (st.injuryLog || []).length;

    const r = runFullSeason(st, 'CLE');

    // 第3季伤病（CLE 球星）
    const inj3 = (st.injuryLog || []).slice(injuryLogBefore)
        .filter(x => x.teamId === 'CLE' && starIds.includes(x.playerId));
    // 第3季 CLE 交易
    const tr3 = (st.tradeLog || []).slice(tradeLogBefore)
        .filter(x => x.teams && x.teams.includes('CLE'));
    // 球星出场数
    const gp = starIds.map(id => {
        const acc = (st.statAccum['CLE'] || {})[id];
        return acc ? acc.gp : 0;
    });

    records.push(r);
    console.log(`run${run}: ${r.win}-${r.loss} 东部第${r.rank} ${r.made ? '✅' : '❌'} | 球星GP: ${gp.join('/')} | 球星伤病: ${inj3.map(i => `${i.player.split('·').pop()}${i.days}场`).join(',') || '无'} | CLE交易: ${tr3.length}`);
}

const wins = records.map(r => r.win).sort((a, b) => a - b);
const misses = records.filter(r => !r.made).length;
console.log(`\n==== 汇总 (${N} 次) ====`);
console.log(`胜场分布: [${wins.join(', ')}] 均值=${(wins.reduce((a, b) => a + b, 0) / N).toFixed(1)}`);
console.log(`未进季后赛: ${misses}/${N}`);
