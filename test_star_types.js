// 测试不同"明星类型"的实战强度：
// 1. 进攻型三巨头（sh/ins/pa 全高）—— 引擎已验证 100% 胜率
// 2. 防守型三巨头（ins/re/de 高，sh/pa 低）—— o 值高但 offOf 低
// 3. 全内线堆叠（3 个 C/PF 防守型明星）
// 4. 极端阵容：4 球星 + 垃圾配角（交易堆星的真实用户场景）
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
const Sim = sandbox.SimEngine;
const DE = sandbox.DraftEngine;

let idc = 0;
// 通用球员：直接指定各能力
function mkPlayer(cap, pos, name) {
    return {
        id: 'p' + (idc++), n: name, p: pos,
        o: cap.o, sh: cap.sh, ins: cap.ins, pa: cap.pa, de: cap.de, re: cap.re, at: cap.at, iq: cap.iq,
        injured: false, isRookie: false, a: 27, draftYear: 2010,
    };
}
// computeOvr 复算（与 draft.js 相同权重）
const OVR_W = {
    PG: { ins:0.10, sh:0.22, pa:0.28, re:0.05, de:0.13, at:0.10, iq:0.12 },
    SG: { ins:0.14, sh:0.28, pa:0.15, re:0.06, de:0.14, at:0.13, iq:0.10 },
    SF: { ins:0.16, sh:0.22, pa:0.12, re:0.10, de:0.16, at:0.14, iq:0.10 },
    PF: { ins:0.20, sh:0.14, pa:0.08, re:0.18, de:0.16, at:0.14, iq:0.10 },
    C:  { ins:0.22, sh:0.08, pa:0.06, re:0.22, de:0.18, at:0.12, iq:0.12 },
};
function ovrOf(p) { const w = OVR_W[p.p]; let o = 0; for (const k in w) o += p[k] * w[k]; return Math.round(o); }

// ===== 阵容定义 =====
// A. 进攻型三巨头（外线持核）
const offBig3 = [
    mkPlayer({ o: 0, sh: 95, ins: 88, pa: 92, de: 75, re: 60, at: 88, iq: 90 }, 'PG', '进攻核心PG'),
    mkPlayer({ o: 0, sh: 93, ins: 90, pa: 80, de: 78, re: 75, at: 90, iq: 88 }, 'SF', '进攻核心SF'),
    mkPlayer({ o: 0, sh: 85, ins: 92, pa: 70, de: 80, re: 85, at: 85, iq: 85 }, 'C', '进攻核心C'),
    mkPlayer({ o: 0, sh: 68, ins: 68, pa: 66, de: 66, re: 65, at: 68, iq: 66 }, 'SG'),
    mkPlayer({ o: 0, sh: 66, ins: 66, pa: 64, de: 66, re: 68, at: 66, iq: 66 }, 'PF'),
    mkPlayer({ o: 0, sh: 64, ins: 64, pa: 62, de: 64, re: 63, at: 64, iq: 64 }, 'SG'),
    mkPlayer({ o: 0, sh: 62, ins: 62, pa: 60, de: 62, re: 62, at: 62, iq: 62 }, 'SF'),
    mkPlayer({ o: 0, sh: 60, ins: 60, pa: 58, de: 60, re: 60, at: 60, iq: 60 }, 'PF'),
    mkPlayer({ o: 0, sh: 58, ins: 58, pa: 56, de: 58, re: 58, at: 58, iq: 58 }, 'C'),
];
// B. 防守型三巨头（内线铁闸，sh/pa 低 —— o 值虚高型）
const defBig3 = [
    mkPlayer({ o: 0, sh: 60, ins: 95, pa: 55, de: 95, re: 92, at: 80, iq: 70 }, 'C', '防守铁闸C'),
    mkPlayer({ o: 0, sh: 62, ins: 90, pa: 52, de: 92, re: 88, at: 78, iq: 68 }, 'PF', '防守铁闸PF'),
    mkPlayer({ o: 0, sh: 65, ins: 70, pa: 60, de: 95, re: 65, at: 90, iq: 72 }, 'SF', '外线大锁SF'),
    mkPlayer({ o: 0, sh: 68, ins: 68, pa: 66, de: 66, re: 65, at: 68, iq: 66 }, 'SG'),
    mkPlayer({ o: 0, sh: 66, ins: 66, pa: 64, de: 66, re: 68, at: 66, iq: 66 }, 'PG'),
    mkPlayer({ o: 0, sh: 64, ins: 64, pa: 62, de: 64, re: 63, at: 64, iq: 64 }, 'SG'),
    mkPlayer({ o: 0, sh: 62, ins: 62, pa: 60, de: 62, re: 62, at: 62, iq: 62 }, 'SF'),
    mkPlayer({ o: 0, sh: 60, ins: 60, pa: 58, de: 60, re: 60, at: 60, iq: 60 }, 'PF'),
    mkPlayer({ o: 0, sh: 58, ins: 58, pa: 56, de: 58, re: 58, at: 58, iq: 58 }, 'C'),
];
// C. 均衡无明星队（77 级）
const balanced = [];
for (let i = 0; i < 9; i++) {
    const pos = ['PG', 'SG', 'SF', 'PF', 'C'][i % 5];
    balanced.push(mkPlayer({ o: 0, sh: 77, ins: 77, pa: 77, de: 77, re: 77, at: 77, iq: 77 }, pos));
}
// D. 极端堆星：4 个 88 全能 + 5 个 o55 垃圾（交易堆星真实场景）
const stacked4 = [
    mkPlayer({ o: 0, sh: 88, ins: 88, pa: 88, de: 88, re: 80, at: 86, iq: 86 }, 'PG', '全能星1'),
    mkPlayer({ o: 0, sh: 88, ins: 88, pa: 84, de: 88, re: 85, at: 86, iq: 86 }, 'SG', '全能星2'),
    mkPlayer({ o: 0, sh: 86, ins: 88, pa: 82, de: 88, re: 86, at: 86, iq: 86 }, 'SF', '全能星3'),
    mkPlayer({ o: 0, sh: 84, ins: 88, pa: 78, de: 88, re: 88, at: 84, iq: 86 }, 'C', '全能星4'),
    mkPlayer({ o: 0, sh: 55, ins: 55, pa: 55, de: 55, re: 55, at: 55, iq: 55 }, 'PF', '底薪1'),
    mkPlayer({ o: 0, sh: 55, ins: 55, pa: 55, de: 55, re: 55, at: 55, iq: 55 }, 'PG', '底薪2'),
    mkPlayer({ o: 0, sh: 52, ins: 52, pa: 52, de: 52, re: 52, at: 52, iq: 52 }, 'SG', '底薪3'),
    mkPlayer({ o: 0, sh: 52, ins: 52, pa: 52, de: 52, re: 52, at: 52, iq: 52 }, 'SF', '底薪4'),
    mkPlayer({ o: 0, sh: 50, ins: 50, pa: 50, de: 50, re: 50, at: 50, iq: 50 }, 'PF', '底薪5'),
];
// E. 三个内线球星堆叠（位置重复：3 个 C 型明星 + 均衡配角）—— 用户"堆同位置球星"场景
const tripleC = [
    mkPlayer({ o: 0, sh: 75, ins: 92, pa: 62, de: 88, re: 92, at: 80, iq: 80 }, 'C', '明星C1'),
    mkPlayer({ o: 0, sh: 73, ins: 90, pa: 60, de: 86, re: 90, at: 78, iq: 78 }, 'C', '明星C2'),
    mkPlayer({ o: 0, sh: 74, ins: 88, pa: 62, de: 85, re: 88, at: 78, iq: 78 }, 'PF', '明星PF'),
    mkPlayer({ o: 0, sh: 70, ins: 65, pa: 70, de: 68, re: 60, at: 70, iq: 70 }, 'PG'),
    mkPlayer({ o: 0, sh: 70, ins: 65, pa: 68, de: 68, re: 62, at: 70, iq: 70 }, 'SG'),
    mkPlayer({ o: 0, sh: 68, ins: 68, pa: 66, de: 68, re: 66, at: 68, iq: 68 }, 'SF'),
    mkPlayer({ o: 0, sh: 66, ins: 66, pa: 64, de: 66, re: 66, at: 66, iq: 66 }, 'SG'),
    mkPlayer({ o: 0, sh: 64, ins: 64, pa: 62, de: 64, re: 64, at: 64, iq: 64 }, 'PG'),
    mkPlayer({ o: 0, sh: 62, ins: 62, pa: 60, de: 62, re: 62, at: 62, iq: 62 }, 'SF'),
];

// 计算各队 o（用官方权重）与 offOf
function teamInfo(team, name) {
    team.forEach(p => { p.o = ovrOf(p); });
    const rot = Sim.buildRotation(team);
    const offOf = p => (p.ins + p.sh + p.pa) / 3;
    const avg = rot.reduce((s, r) => s + offOf(r.player) * r.min, 0) / 240;
    const oTop3 = team.slice().sort((a, b) => b.o - a.o).slice(0, 3);
    return {
        name, rating: +Sim.teamRating(team).toFixed(1),
        top3Ovr: oTop3.map(p => p.o).join('/'),
        avgOffOf: +avg.toFixed(1),
    };
}

console.log('===== 各阵容信息（o 用官方 computeOvr 权重复算） =====');
const teams = [
    teamInfo(offBig3, '进攻型三巨头'),
    teamInfo(defBig3, '防守型三巨头(o虚高型)'),
    teamInfo(stacked4, '四星+底薪垃圾'),
    teamInfo(tripleC, '三内线球星堆叠'),
    teamInfo(balanced, '均衡无明星77'),
];
teams.forEach(t => console.log(`  ${t.name}: rating=${t.rating} | 前3 ovr=${t.top3Ovr} | 轮换 offOf均值=${t.avgOffOf}`));

console.log('\n===== 500 场对决（交替主场） =====');
function matchup(a, b) {
    let aWin = 0, aSum = 0, bSum = 0;
    for (let i = 0; i < 500; i++) {
        const aHome = i % 2 === 0;
        const g = aHome ? Sim.simulateGame(a, b, false) : Sim.simulateGame(b, a, false);
        const aScore = aHome ? g.home.score : g.away.score;
        const bScore = aHome ? g.away.score : g.home.score;
        if (aScore > bScore) aWin++;
        aSum += aScore; bSum += bScore;
    }
    return { winRate: +(aWin / 5).toFixed(1), aAvg: +(aSum / 500).toFixed(1), bAvg: +(bSum / 500).toFixed(1) };
}
const pairs = [
    [offBig3, balanced, '进攻型三巨头'],
    [defBig3, balanced, '防守型三巨头(o虚高)'],
    [stacked4, balanced, '四星+底薪垃圾'],
    [tripleC, balanced, '三内线球星堆叠'],
];
for (const [a, b, name] of pairs) {
    const r = matchup(a, b);
    console.log(`  ${name} vs 均衡无明星: 胜率 ${r.winRate}% | 得分 ${r.aAvg} vs ${r.bAvg}`);
}
