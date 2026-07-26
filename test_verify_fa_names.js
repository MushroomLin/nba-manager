// 验证脚本 —— 自由球员来源 + 新秀名字过滤
// 验证两个用户要求：
//   1. 选秀球员名字不与 NBA 球员重名（组件级过滤）
//   2. 自由球员来自各球队裁员/新秀离队，而非纯随机生成

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ============ vm sandbox ============
const sandbox = {
    console, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean,
    parseInt, parseFloat, isNaN,
    setTimeout: () => {}, clearTimeout: () => {},
    document: {
        getElementById: () => ({ innerHTML: '', classList: { add: () => {}, remove: () => {}, toggle: () => {} }, addEventListener: () => {}, scrollTop: 0 }),
        querySelectorAll: () => []
    },
    localStorage: { getItem: () => null, setItem: () => {} }
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

const baseDir = path.join(__dirname, 'js');
const load = rel => vm.runInContext(fs.readFileSync(path.join(baseDir, rel), 'utf8'), sandbox, { filename: rel });
load('data/teams.js');
load('data/players.js');
load('data/rookies.js');
load('data/nba_stats.js');
load('engine/simulation.js');
load('engine/season.js');
load('engine/trade.js');
load('engine/draft.js');

const SeasonEngine = sandbox.SeasonEngine;
const DraftEngine = sandbox.DraftEngine;
const TradeEngine = sandbox.TradeEngine;
const TEAMS_DATA = sandbox.TEAMS_DATA;
const PLAYERS_DATA = sandbox.PLAYERS_DATA;
const ROOKIE_PROTOTYPES = sandbox.ROOKIE_PROTOTYPES;
const ROOKIE_POS_PROFILES = sandbox.ROOKIE_POS_PROFILES;

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));

// ============ 构建 NBA 名字组件黑名单 ============
const nbaNameParts = new Set();
PLAYERS_DATA.forEach(p => {
    if (typeof p.n === 'string') {
        p.n.split('·').forEach(part => {
            const t = part.trim();
            if (t) nbaNameParts.add(t);
        });
    }
});
console.log(`[信息] NBA 球员名字组件黑名单大小: ${nbaNameParts.size}`);
console.log(`[信息] 新秀名字池: 名 ${ROOKIE_PROTOTYPES.firstNames.length} × 姓 ${ROOKIE_PROTOTYPES.lastNames.length} = ${ROOKIE_PROTOTYPES.firstNames.length * ROOKIE_PROTOTYPES.lastNames.length} 组合`);

// 检查名字池本身是否有 NBA 组件
const poolFnConflict = ROOKIE_PROTOTYPES.firstNames.filter(n => nbaNameParts.has(n));
const poolLnConflict = ROOKIE_PROTOTYPES.lastNames.filter(n => nbaNameParts.has(n));
console.log(`[检查] 名字池中与 NBA 组件冲突的名: ${poolFnConflict.length} 个 ${poolFnConflict.slice(0, 10).join('/')}`);
console.log(`[检查] 名字池中与 NBA 组件冲突的姓: ${poolLnConflict.length} 个 ${poolLnConflict.slice(0, 10).join('/')}`);

// ============ 生成新秀并验证名字 ============
console.log('\n=== 测试 1: 新秀名字过滤 ===');
let totalCollisions = 0;
const sampleRookieNames = [];
for (let year = 2026; year <= 2030; year++) {
    const rookies = DraftEngine.generateRookieClass(year);
    rookies.forEach(r => {
        const parts = r.n.split('·');
        const fn = parts[0]?.trim();
        const ln = parts[1]?.trim();
        if (nbaNameParts.has(fn) || nbaNameParts.has(ln)) {
            totalCollisions++;
            console.log(`  [冲突] ${r.n} (fn=${fn} ln=${ln})`);
        }
        if (sampleRookieNames.length < 20) sampleRookieNames.push(r.n);
    });
}
console.log(`[结果] 5 年新秀共生成约 ${70 * 5} 人，与 NBA 组件冲突: ${totalCollisions} 个`);
console.log(`[样本] 新秀名字示例:`);
sampleRookieNames.forEach(n => console.log(`  - ${n}`));

// ============ 模拟自由球员来源 ============
console.log('\n=== 测试 2: 自由球员来源验证 ===');

// 初始化 state
function initState() {
    const teams = JSON.parse(JSON.stringify(TEAMS_DATA));
    const players = PLAYERS_DATA.map((p, i) => ({
        ...p,
        id: `p_${i}`,
        pot: p.o + randInt(0, 4),
        isRookie: false,
        draftYear: null,
        yrsInLeague: 5,
    }));
    const teamsPlayers = {};
    teams.forEach(t => teamsPlayers[t.id] = []);
    players.forEach(p => { if (teamsPlayers[p.t]) teamsPlayers[p.t].push(p); });
    // 补足 filler
    let fillerIdx = 0;
    teams.forEach(t => {
        while (teamsPlayers[t.id].length < 14) {
            const positions = ["PG", "SG", "SF", "PF", "C"];
            const pos = positions[fillerIdx % 5];
            const profile = ROOKIE_POS_PROFILES[pos];
            const ovr = randInt(62, 70);
            const v = () => randInt(-4, 4);
            const fn = ROOKIE_PROTOTYPES.firstNames[Math.floor(Math.random() * ROOKIE_PROTOTYPES.firstNames.length)];
            const ln = ROOKIE_PROTOTYPES.lastNames[Math.floor(Math.random() * ROOKIE_PROTOTYPES.lastNames.length)];
            const fp = {
                id: `bench_${t.id}_${fillerIdx++}`,
                n: `${fn}·${ln}_F${fillerIdx}`,
                t: t.id, p: pos, a: randInt(22, 32), o: ovr, pot: ovr + randInt(0, 2),
                sal: Math.round(TradeEngine.salaryForOvr(ovr) * (0.6 + Math.random() * 0.5) * 10) / 10,
                ins: clamp(profile.ins + v(), 40, 72),
                sh: clamp(profile.sh + v(), 40, 74),
                pa: clamp(profile.pa + v(), 35, 72),
                re: clamp(profile.re + v(), 35, 75),
                de: clamp(profile.de + v(), 40, 74),
                at: clamp(profile.at + v(), 50, 80),
                iq: clamp(profile.iq + v(), 50, 76),
                isRookie: false, isFiller: true, draftYear: null, yrsInLeague: 5,
            };
            players.push(fp);
            teamsPlayers[t.id].push(fp);
        }
    });
    const records = {};
    teams.forEach(t => records[t.id] = { win: 0, loss: 0, streak: 0, ptsFor: 0, ptsAgt: 0 });
    const statAccum = {};
    teams.forEach(t => statAccum[t.id] = {});
    return {
        manager: { name: 'Test', teamId: 'BOS' },
        year: 2026, phase: 'regular',
        teams, players, teamsPlayers, records,
        schedule: null, currentDay: 0, standings: null, playoffs: null,
        freeAgents: [], rookieClass: [], draftOrder: null, draftPick: 0,
        statAccum, history: [], champions: [], awardsHistory: [],
        playerHistory: {}, tactics: { pace: 1, defense: 1, rotation: 1 },
        injuryLog: [], tradeLog: [],
    };
}

// 镜像 app.js makeRoomForRookie（修复版：filler 直接删除，真实球员进自由市场，重置滞留计时）
function makeRoomForRookie(state, teamId) {
    const roster = state.teamsPlayers[teamId];
    if (!roster) return;
    while (roster.length >= 15) {
        let toRelease = null;
        const fillers = roster.filter(p => p.isFiller);
        if (fillers.length > 0) {
            fillers.sort((a, b) => a.o - b.o);
            toRelease = fillers[0];
        } else {
            toRelease = [...roster].sort((a, b) => a.o - b.o)[0];
        }
        if (!toRelease) break;
        const idx = roster.findIndex(p => p.id === toRelease.id);
        if (idx >= 0) roster.splice(idx, 1);
        if (toRelease.isFiller) {
            state.players = state.players.filter(p => p.id !== toRelease.id);
        } else {
            toRelease.isFreeAgent = true;
            toRelease.t = null;
            toRelease.yearsInFreeAgency = 0;
        }
    }
}

// 镜像 app.js aiSignFreeAgents（增强版：替换低能力 filler + 28+岁低 ovr 真实球员，每队 4 人）
function aiSignFreeAgents(state) {
    let signed = 0;
    const myId = state.manager.teamId;
    const availableFas = [...state.freeAgents];
    const existingIds = new Set(state.freeAgents.map(p => p.id));
    state.players.forEach(p => {
        if (p.isFreeAgent && !p.isRetired && p.t === null && !existingIds.has(p.id)) {
            availableFas.push(p);
            existingIds.add(p.id);
        }
    });
    if (availableFas.length === 0) return 0;
    availableFas.sort((a, b) => b.o - a.o);
    const cap = sandbox.SALARY_CAP;

    function trySign(teamId, roster, target) {
        const currentSal = roster.reduce((s, p) => s + (p.sal || 0), 0);
        const remainingSal = cap != null ? cap - currentSal : Infinity;
        if ((target.sal || 0) > remainingSal && (target.sal || 0) > 2) return false;
        target.t = teamId;
        target.isFreeAgent = false;
        target.yearsInFreeAgency = 0;
        roster.push(target);
        const faIdx = state.freeAgents.findIndex(p => p.id === target.id);
        if (faIdx >= 0) state.freeAgents.splice(faIdx, 1);
        signed++;
        return true;
    }

    state.teams.forEach(t => {
        if (t.id === myId) return;
        const roster = state.teamsPlayers[t.id];
        while (roster.length < 14) {
            let target = null;
            for (const fa of availableFas) {
                if (fa.t !== null || fa.isRetired) continue;
                target = fa; break;
            }
            if (!target) break;
            if (!trySign(t.id, roster, target)) break;
        }
        let replaced = 0;
        const MAX_REPLACE = 4;
        for (let i = 0; i < roster.length && replaced < MAX_REPLACE; i++) {
            const p = roster[i];
            const isReplaceable = p.isFiller
                || (!p.isFiller && p.a >= 28 && p.o < 68 && (p.yrsInLeague || 5) > 2);
            if (!isReplaceable) continue;
            if (p.o >= 70) continue;
            let target = null;
            for (const fa of availableFas) {
                if (fa.t !== null || fa.isRetired) continue;
                if (fa.o > p.o + 2) { target = fa; break; }
            }
            if (!target) continue;
            roster.splice(i, 1);
            if (p.isFiller) {
                state.players = state.players.filter(x => x.id !== p.id);
            } else {
                p.isFreeAgent = true;
                p.t = null;
                p.yearsInFreeAgency = 0;
                if (!state.freeAgents.find(x => x.id === p.id)) state.freeAgents.push(p);
                if (!availableFas.find(x => x.id === p.id)) availableFas.push(p);
            }
            i--;
            if (!trySign(t.id, roster, target)) {
                roster.push(p);
                if (p.isFiller) state.players.push(p);
                else { p.isFreeAgent = false; p.t = t.id; }
                break;
            }
            replaced++;
        }
    });
    return signed;
}

// 镜像 app.js offseason（修复版）
function offseason(state) {
    state.year++;
    // 1. 老化现有自由球员
    if (state.freeAgents && state.freeAgents.length > 0) {
        const faResult = SeasonEngine.ageFreeAgents(state);
        if (faResult.retired > 0) {
            const retiredFaIds = new Set(state.freeAgents.filter(p => p.isRetired).map(p => p.id));
            state.players = state.players.filter(p => !retiredFaIds.has(p.id));
        }
    }
    // 2. 球员成长与退役
    const prog = SeasonEngine.offseasonProgression(state.players);
    const retired = prog.retired;
    // 3. 清理退役球员
    if (retired.length > 0) {
        const retiredIds = new Set(retired.map(p => p.id));
        state.teams.forEach(t => {
            state.teamsPlayers[t.id] = state.teamsPlayers[t.id].filter(p => !retiredIds.has(p.id));
        });
        state.players = state.players.filter(p => !retiredIds.has(p.id));
    }
    // 4. 修剪超额名单至 15 人（修复版：filler 直接删除，真实球员进自由市场）
    const offseasonReleasedIds = new Set();
    state.teams.forEach(t => {
        const roster = state.teamsPlayers[t.id];
        while (roster.length > 15) {
            let toRelease = null;
            const fillers = roster.filter(p => p.isFiller);
            if (fillers.length > 0) {
                fillers.sort((a, b) => a.o - b.o);
                toRelease = fillers[0];
            } else {
                toRelease = [...roster].sort((a, b) => a.o - b.o)[0];
            }
            if (!toRelease) break;
            const idx = roster.findIndex(p => p.id === toRelease.id);
            if (idx >= 0) roster.splice(idx, 1);
            if (toRelease.isFiller) {
                offseasonReleasedIds.add(toRelease.id);
            } else {
                toRelease.isFreeAgent = true;
                toRelease.t = null;
                toRelease.yearsInFreeAgency = 0;
            }
        }
    });
    if (offseasonReleasedIds.size > 0) {
        state.players = state.players.filter(p => !offseasonReleasedIds.has(p.id));
    }
    // 4.5 硬帽
    const hardCapReleased = SeasonEngine.enforceHardCap(state);
    // 硬帽释放的 filler 直接删除
    if (hardCapReleased.length > 0) {
        const fillerIds = new Set(hardCapReleased.filter(p => p.isFiller).map(p => p.id));
        if (fillerIds.size > 0) {
            state.players = state.players.filter(p => !fillerIds.has(p.id));
        }
    }
    // 4.6 AI 球队从自由市场签约补强（镜像 app.js aiSignFreeAgents）
    const aiSigned = aiSignFreeAgents(state);
    // 5. 补足 filler
    let fillerIdx = 1000;
    state.teams.forEach(t => {
        while (state.teamsPlayers[t.id].length < 14) {
            const positions = ["PG", "SG", "SF", "PF", "C"];
            const pos = positions[fillerIdx % 5];
            const profile = ROOKIE_POS_PROFILES[pos];
            const ovr = randInt(62, 70);
            const v = () => randInt(-4, 4);
            const fn = ROOKIE_PROTOTYPES.firstNames[Math.floor(Math.random() * ROOKIE_PROTOTYPES.firstNames.length)];
            const ln = ROOKIE_PROTOTYPES.lastNames[Math.floor(Math.random() * ROOKIE_PROTOTYPES.lastNames.length)];
            const fp = {
                id: `bench2_${t.id}_${fillerIdx++}`,
                n: `${fn}·${ln}_F${fillerIdx}`,
                t: t.id, p: pos, a: randInt(22, 32), o: ovr, pot: ovr + randInt(0, 2),
                sal: Math.round(TradeEngine.salaryForOvr(ovr) * (0.6 + Math.random() * 0.5) * 10) / 10,
                ins: clamp(profile.ins + v(), 40, 72),
                sh: clamp(profile.sh + v(), 40, 74),
                pa: clamp(profile.pa + v(), 35, 72),
                re: clamp(profile.re + v(), 35, 75),
                de: clamp(profile.de + v(), 40, 74),
                at: clamp(profile.at + v(), 50, 80),
                iq: clamp(profile.iq + v(), 50, 76),
                isRookie: false, isFiller: true, draftYear: null, yrsInLeague: 5,
            };
            state.players.push(fp);
            state.teamsPlayers[t.id].push(fp);
        }
    });
    // 6. 选秀
    const rookieClass = DraftEngine.generateRookieClass(state.year);
    state.rookieClass = rookieClass;
    const draftOrder = [...state.teams].sort((a, b) => state.records[a.id].win - state.records[b.id].win).map(t => t.id);
    state.draftOrder = [];
    for (let round = 0; round < 2; round++) state.draftOrder.push(...draftOrder);
    state.draftPick = 0;
    while (state.draftPick < state.draftOrder.length) {
        const owner = state.draftOrder[state.draftPick];
        const available = rookieClass.filter(r => r.t === null);
        if (available.length === 0) break;
        const roster = state.teamsPlayers[owner] || [];
        const pick = DraftEngine.aiPick(available, roster);
        if (pick) {
            makeRoomForRookie(state, owner);
            DraftEngine.assignRookieToTeam(pick, owner, state.draftPick + 1);
            if (state.teamsPlayers[owner]) state.teamsPlayers[owner].push(pick);
            state.players.push(pick);
        }
        state.draftPick++;
    }
    // 7. 选秀结束 → 收集自由球员（镜像 advanceDraft 修复版）
    const existingFaIds = new Set(state.freeAgents.map(p => p.id));
    const collected = [];
    // 落选新秀
    rookieClass.forEach(r => {
        if (r.t === null && !existingFaIds.has(r.id)) {
            r.isFreeAgent = true;
            r.t = null;
            r.yearsInFreeAgency = 0;
            collected.push(r);
            existingFaIds.add(r.id);
            if (!state.players.find(p => p.id === r.id)) state.players.push(r);
        }
    });
    // state.players 中标记 isFreeAgent=true 的球员
    state.players.forEach(p => {
        if (p.isFreeAgent && !p.isRetired && p.t === null && !existingFaIds.has(p.id)) {
            collected.push(p);
            existingFaIds.add(p.id);
        }
    });
    state.freeAgents.push(...collected);
    // 仅在数量严重不足时少量补充（镜像 app.js，MIN_FA=8）
    const MIN_FA = 8;
    if (state.freeAgents.length < MIN_FA) {
        const supplement = SeasonEngine.generateFreeAgents(MIN_FA - state.freeAgents.length);
        state.freeAgents.push(...supplement);
    }
    // 8. 清空伤病
    state.players.forEach(p => p.injured = 0);
    return { retiredCount: retired.length, hardCapReleased: hardCapReleased.length, collectedFa: collected.length, aiSigned };
}

const state = initState();
console.log(`[初始] 球员总数: ${state.players.length}, 自由球员: ${state.freeAgents.length}`);

// 跑 20 个赛季，观察自由球员来源和长期趋势（验证池不膨胀）
let maxFaSeen = 0;
for (let s = 1; s <= 20; s++) {
    const beforeFa = state.freeAgents.length;
    const beforePlayers = state.players.length;
    const result = offseason(state);
    const afterFa = state.freeAgents.length;
    const afterPlayers = state.players.length;
    if (afterFa > maxFaSeen) maxFaSeen = afterFa;

    // 分析自由球员来源
    const undrafted = state.freeAgents.filter(p => p.isRookie).length;
    const releasedFromTeams = state.freeAgents.filter(p => !p.isRookie && !p.isFiller && p.id.startsWith('p_')).length;
    const releasedFillers = state.freeAgents.filter(p => p.isFiller).length;
    const generatedFa = state.freeAgents.filter(p => p.id.startsWith('fa_')).length;

    // 滞留时间分布
    const yifBuckets = { '0年': 0, '1年': 0, '2年': 0, '3年': 0, '4+年': 0 };
    state.freeAgents.forEach(p => {
        const y = p.yearsInFreeAgency || 0;
        if (y === 0) yifBuckets['0年']++;
        else if (y === 1) yifBuckets['1年']++;
        else if (y === 2) yifBuckets['2年']++;
        else if (y === 3) yifBuckets['3年']++;
        else yifBuckets['4+年']++;
    });

    // 仅前 10 季 + 最后 1 季详细输出，中间季简略
    if (s <= 10 || s === 20) {
        console.log(`\n[赛季 ${state.year}]`);
        console.log(`  退役: ${result.retiredCount} 人, 硬帽释放: ${result.hardCapReleased} 人, AI签约: ${result.aiSigned} 人`);
        console.log(`  自由市场: ${beforeFa} → ${afterFa} (新增 ${result.collectedFa})`);
        console.log(`  自由球员来源分析:`);
        console.log(`    - 落选新秀(isRookie): ${undrafted}`);
        console.log(`    - 球队裁员(真实球员): ${releasedFromTeams}`);
        console.log(`    - 球队裁员(filler): ${releasedFillers}`);
        console.log(`    - 随机补充(fa_): ${generatedFa}`);
        const realSource = undrafted + releasedFromTeams + releasedFillers;
        const realRatio = afterFa > 0 ? (realSource / afterFa * 100).toFixed(1) : 0;
        console.log(`    → 真实来源占比: ${realRatio}% (${realSource}/${afterFa})`);
        console.log(`  滞留时间分布: ${JSON.stringify(yifBuckets)}`);
    } else if (s % 5 === 0) {
        console.log(`[赛季 ${state.year}] FA: ${beforeFa}→${afterFa}, AI签约: ${result.aiSigned}, 真实来源占比: ${((undrafted + releasedFromTeams + releasedFillers) / Math.max(1, afterFa) * 100).toFixed(1)}%`);
    }

    // 检查自由球员是否双重老化
    const doubleAged = state.freeAgents.filter(p => p.a > 40 && !p.isRetired);
    if (doubleAged.length > 5) {
        console.log(`  [警告] ${doubleAged.length} 名 40+ 岁自由球员未退役（可能老化逻辑问题）`);
    }
}
console.log(`\n[汇总] 20 季自由市场峰值: ${maxFaSeen} 人`);

// ============ 最终总结 ============
console.log('\n=== 最终自由市场样本（按能力降序前 15）===');
const sortedFa = [...state.freeAgents].sort((a, b) => b.o - a.o);
const sample = sortedFa.slice(0, 15);
sample.forEach(p => {
    const source = p.isRookie ? '落选新秀' : (p.isFiller ? '裁减filler' : (p.id.startsWith('fa_') ? '随机补充' : '裁减球员'));
    console.log(`  - ${p.n} | ${p.p} | ${p.a}岁 | ${p.o} OVR | $${p.sal}M | 滞留${p.yearsInFreeAgency||0}年 | 来源: ${source}`);
});

// ============ 验证自由球员名字 ============
console.log('\n=== 测试 3: 自由球员名字过滤（仅检查落选新秀和随机补充，被裁真实球员本就是 NBA 球员）===');
let faCollision = 0;
let checkedCount = 0;
state.freeAgents.forEach(p => {
    // 跳过被裁的真实 NBA 球员（id 以 p_ 开头，本就是 NBA 球员，名字相同正常）
    if (p.id.startsWith('p_')) return;
    checkedCount++;
    const parts = p.n.split('·');
    parts.forEach(part => {
        const t = part.trim().replace(/_[A-Z0-9]+$/, ''); // 去掉 filler 后缀
        if (nbaNameParts.has(t)) {
            faCollision++;
            console.log(`  [冲突] ${p.n} (组件: ${t})`);
        }
    });
});
console.log(`[结果] 检查 ${checkedCount} 名落选新秀/随机补充自由球员, 与 NBA 组件冲突: ${faCollision} 个`);

console.log('\n=== 验证完成 ===');
