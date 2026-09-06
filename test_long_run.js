// 多赛季全面审计 v2：12 季追踪联盟健康度 + 定位异常
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
const App = sandbox.App;
const Sim = sandbox.SimEngine;

const SEASONS = parseInt(process.argv[2] || '12', 10);
App.init('DRAFT', 'CLE', 2003);
const st = App.state;
const myId = 'CLE';

const fmt1 = v => (Math.round(v * 10) / 10).toFixed(1);
const std = arr => { const m = arr.reduce((a, b) => a + b, 0) / arr.length; return Math.sqrt(arr.reduce((s, v) => s + (v - m) * (v - m), 0) / arr.length); };
function log(...a) { console.log(...a); }

const champCount = {};
const playoffTeams = new Set();
const issues = [];
let prevSuperStar = null;

// ===== 完整跑一个赛季循环 =====
function runFullSeason() {
    let guard = 0;
    while (guard++ < 60000) {
        const ph = st.phase;
        if (ph === 'regular' || ph === 'playoffs' || ph === 'finals') {
            App.fastAdvance();
        } else if (ph === 'offseason') {
            App.advance(); // -> draft
        } else if (ph === 'draft') {
            if (st.draftPick < 60) App.skipRemainingDraft();
            else App.advance();
        } else if (ph === 'freeAgency') {
            App.advance(); // -> regular new season
        } else {
            log('  [warn] 未知阶段', ph); return 'unknown';
        }
        if (st.phase === 'offseason') return 'offseason';
    }
    return 'timeout';
}

function collectMetrics(y) {
    const wins = Object.values(st.records).map(r => r.win);
    const gpBad = st.teams.filter(t => { const r = st.records[t.id]; return !r || r.win + r.loss !== 82; }).map(t => t.id);
    const best = Math.max(...wins), worst = Math.min(...wins);
    const over500 = wins.filter(w => w >= 42).length;
    const winStd = std(wins);
    const ppg = Object.values(st.records).reduce((s2, r) => s2 + r.ptsFor, 0) / (30 * 82);
    const active = st.players.filter(p => !p.isRetired);
    const superStars = active.filter(p => p.o >= 90).length;
    const stars = active.filter(p => p.o >= 80).length;
    const avgAge = active.reduce((s2, p) => s2 + (p.a || 25), 0) / active.length;
    const rosterSizes = st.teams.map(t => (st.teamsPlayers[t.id] || []).length);
    const minRoster = Math.min(...rosterSizes), maxRoster = Math.max(...rosterSizes);
    const salaries = st.teams.map(t => (st.teamsPlayers[t.id] || []).reduce((s2, p) => s2 + (p.sal || 0), 0));
    const maxSal = Math.max(...salaries);
    const ratings = st.teams.map(t => Sim.teamRating(st.teamsPlayers[t.id] || []));
    const avgR = ratings.reduce((a, b) => a + b, 0) / 30;
    const rStd = std(ratings);
    const champ = st.champions[st.champions.length - 1];
    if (champ && champ.year === y) champCount[champ.team] = (champCount[champ.team] || 0) + 1;
    const po = st.playoffs;
    if (po && po.east && po.west) [...po.east, ...po.west].forEach(id => playoffTeams.add(id));

    // MVP
    const aw = st.awardsHistory[st.awardsHistory.length - 1];
    let mvpStr = '无';
    if (aw && aw.year === y && aw.mvp && aw.mvp.player) {
        const rec = st.records[aw.mvp.teamId] || { win: 0, loss: 0 };
        mvpStr = `${aw.mvp.player.n.slice(0, 8)} ${(rec.win / 82 * 100).toFixed(0)}% ${fmt1(aw.mvp.ppg)}分`;
        if (rec.win / 82 < 0.5) issues.push(`S${y}: MVP 来自${rec.win}胜球队`);
        if (aw.mvp.ppg < 20) issues.push(`S${y}: MVP 场均仅 ${fmt1(aw.mvp.ppg)} 分`);
    }
    // 异常定位
    if (gpBad.length) issues.push(`S${y}: 场次!=82 → ${gpBad.join(',')}`);
    if (worst <= 8) {
        const bad = st.teams.find(t => st.records[t.id] && st.records[t.id].win === worst);
        if (bad) {
            const r = st.teamsPlayers[bad.id] || [];
            const top = r.slice().sort((a, b) => b.o - a.o).slice(0, 3).map(p => p.n.slice(0, 6) + '(o' + p.o + ')').join(' ');
            issues.push(`S${y}: ${bad.name} 仅 ${worst} 胜（名单${r.length}人: ${top}）`);
        }
    }
    if (best > 72) issues.push(`S${y}: 最佳战绩 ${best} 胜过高（真实上限 ~73）`);
    if (ppg > 120 || ppg < 106) issues.push(`S${y}: 联盟场均 ${fmt1(ppg)} 分越界`);
    if (superStars > 25) issues.push(`S${y}: 超巨 ${superStars} 过多`);
    if (superStars < 5) issues.push(`S${y}: 超巨仅 ${superStars}（塌缩）`);
    if (prevSuperStar != null && superStars < prevSuperStar * 0.5 && superStars < 8) issues.push(`S${y}: 超巨 ${prevSuperStar}→${superStars} 骤降`);
    prevSuperStar = superStars;
    if (minRoster < 13) issues.push(`S${y}: 名单最少 ${minRoster} 人`);
    if (maxRoster > 15) {
        const fat = st.teams.filter(t => (st.teamsPlayers[t.id] || []).length > 15).map(t => t.id + ':' + st.teamsPlayers[t.id].length);
        issues.push(`S${y}: 名单超15人 → ${fat.join(', ')}`);
    }
    if (maxSal > 183) issues.push(`S${y}: 最高薪资 ${fmt1(maxSal)}M 超硬帽`);
    if (winStd > 16) issues.push(`S${y}: 胜场 std ${fmt1(winStd)} 分化过大`);
    if (rStd > 7) issues.push(`S${y}: rating std ${fmt1(rStd)} 失衡`);
    if (active.length < 390) issues.push(`S${y}: 活跃球员仅 ${active.length}`);

    log(`S${y}: 最佳${best} 最差${worst} 42+胜${over500}场std${fmt1(winStd)} | 场均${fmt1(ppg)}分 | 超巨${superStars} 全明星${stars} | 均龄${fmt1(avgAge)} | 名单${minRoster}-${maxRoster} | 最高薪${fmt1(maxSal)}M | rating均${fmt1(avgR)}±${fmt1(rStd)} | 冠军${champ && champ.year === y ? champ.team : '?'} | MVP:${mvpStr}`);
}

for (let s = 0; s < SEASONS; s++) {
    const y = st.year;
    const res = runFullSeason();
    if (res !== 'offseason') { log(`[fatal] S${y} ${res} phase=${st.phase}`); break; }
    collectMetrics(y);
}

// ===== 总结 =====
log('\n===== 总结 =====');
const champEntries = Object.entries(champCount).sort((a, b) => b[1] - a[1]);
log(`冠军分布: ${champEntries.map(([t, c]) => t + '×' + c).join(', ') || '无'}`);
log(`季后赛多样性: ${playoffTeams.size}/30`);
if (champEntries.length && champEntries[0][1] >= Math.ceil((SEASONS) / 2)) issues.push(`冠军过于集中: ${champEntries[0][0]} ${champEntries[0][1]} 冠`);
if (playoffTeams.size < 24) issues.push(`季后赛固化: 仅 ${playoffTeams.size} 队`);

log(`\n发现问题 ${issues.length} 个:`);
[...new Set(issues)].slice(0, 40).forEach(i => log('  ⚠ ' + i));
if (!issues.length) log('  （无）');
