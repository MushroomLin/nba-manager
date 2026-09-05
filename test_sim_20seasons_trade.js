// 20 赛季模拟测试 —— 聚焦交易系统/退役逻辑/选秀/薪资
// 用 vm 模块加载浏览器环境模拟，不修改任何源代码
const fs = require('fs'), path = require('path'), vm = require('vm');

const sandbox = {
    console, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean,
    parseInt, parseFloat, isNaN, setTimeout: () => {}, clearTimeout: () => {},
    document: {
        getElementById: () => ({ innerHTML: '', classList: { add: () => {}, remove: () => {}, toggle: () => {} }, addEventListener: () => {}, scrollTop: 0 }),
        querySelectorAll: () => [],
    },
    localStorage: { getItem: () => null, setItem: () => {} },
};
sandbox.window = sandbox; sandbox.global = sandbox; vm.createContext(sandbox);
const baseDir = path.join(__dirname, 'js');
const load = rel => vm.runInContext(fs.readFileSync(path.join(baseDir, rel), 'utf8'), sandbox, { filename: rel });
load('data/teams.js'); load('data/players.js'); load('data/rookies.js'); load('data/nba_stats.js');
load('engine/simulation.js'); load('engine/season.js'); load('engine/trade.js'); load('engine/draft.js');

const TradeEngine = sandbox.TradeEngine;
const SeasonEngine = sandbox.SeasonEngine;
const DraftEngine = sandbox.DraftEngine;
const SimEngine = sandbox.SimEngine;
const TEAMS_DATA = sandbox.TEAMS_DATA;
const PLAYERS_DATA = sandbox.PLAYERS_DATA;
const SALARY_CAP = sandbox.SALARY_CAP;

const randInt = (mn, mx) => Math.floor(Math.random() * (mx - mn + 1)) + mn;
const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
const round1 = v => Math.round(v * 10) / 10;

// ---- 生成 filler 球员（完全模仿 app.js generateBenchPlayer）----
function generateBenchPlayer(teamId, idx) {
    const positions = ["PG", "SG", "SF", "PF", "C"];
    const pos = positions[idx % 5];
    const profile = sandbox.ROOKIE_POS_PROFILES[pos];
    const ovr = randInt(62, 70);
    const v = () => randInt(-4, 4);
    const proto = sandbox.ROOKIE_PROTOTYPES;
    const fn = proto.firstNames[Math.floor(Math.random() * proto.firstNames.length)];
    const ln = proto.lastNames[Math.floor(Math.random() * proto.lastNames.length)];
    return {
        id: `bench_${teamId}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
        n: `${fn}·${ln}`, t: teamId, p: pos, a: randInt(22, 32), o: ovr, pot: ovr + randInt(0, 2),
        sal: round1(TradeEngine.salaryForOvr(ovr) * (0.6 + Math.random() * 0.5)),
        ins: clamp(profile.ins + v(), 40, 72), sh: clamp(profile.sh + v(), 40, 74),
        pa: clamp(profile.pa + v(), 35, 72), re: clamp(profile.re + v(), 35, 75),
        de: clamp(profile.de + v(), 40, 74), at: clamp(profile.at + v(), 50, 80),
        iq: clamp(profile.iq + v(), 50, 76), isRookie: false, isFiller: true,
        yrsInLeague: 5, injured: 0,
    };
}

// ============ 初始化 state ============
const teams = JSON.parse(JSON.stringify(TEAMS_DATA));
const players = PLAYERS_DATA.map((p, i) => ({
    ...p, id: `p_${i}`, pot: p.o + randInt(0, 4), isRookie: false, isFiller: false, injured: 0,
}));
const teamsPlayers = {};
teams.forEach(t => teamsPlayers[t.id] = []);
players.forEach(p => { if (teamsPlayers[p.t]) teamsPlayers[p.t].push(p); });

let fillerIdx = 0;
teams.forEach(t => {
    while (teamsPlayers[t.id].length < 14) {
        const fp = generateBenchPlayer(t.id, fillerIdx++);
        players.push(fp);
        teamsPlayers[t.id].push(fp);
    }
});

const state = {
    teams, teamsPlayers, players,
    year: 2026, records: {}, tradeLog: [],
    manager: { teamId: 'BOS' },
    statAccum: {}, currentDay: 0,
};
teams.forEach(t => { state.records[t.id] = { win: 0, loss: 0, streak: 0, ptsFor: 0, ptsAgt: 0 }; state.statAccum[t.id] = {}; });

console.log(`工资帽 SALARY_CAP = ${SALARY_CAP}M`);
console.log(`初始球员数: ${players.length} (真实 ${PLAYERS_DATA.length} + filler ${players.length - PLAYERS_DATA.length})`);
console.log(`初始各队人数: min=${Math.min(...teams.map(t=>teamsPlayers[t.id].length))} max=${Math.max(...teams.map(t=>teamsPlayers[t.id].length))}`);

// ============ 追踪数据 ============
const seasonsData = [];
const allTimeTradeLog = [];
const playerAllTimeTrades = {}; // pid -> total times traded across all seasons
let rookieNameSet = new Set();
let rookieDuplicateNames = [];

// ============ 20 赛季循环 ============
const SEASONS = 20;
for (let season = 0; season < SEASONS; season++) {
    const seasonYear = state.year;

    // 0. 新赛季开始：清除所有球员的赛季交易标记（_tradedThisSeason）
    // 修复：原脚本遗漏此调用，导致球员一旦被交易就永久退出可交易池，交易频率逐季衰减
    TradeEngine.resetTradeFlags(state);

    // 1. 生成赛程 + 重置战绩
    const schedule = SeasonEngine.generateSchedule(teams);
    teams.forEach(t => { state.records[t.id] = { win: 0, loss: 0, streak: 0, ptsFor: 0, ptsAgt: 0 }; });
    teams.forEach(t => { state.statAccum[t.id] = {}; });
    state.currentDay = 0;

    const seasonTrades = [];
    const playerTradeCountThisSeason = {};

    // 2. 常规赛逐日推进
    for (let day = 0; day < schedule.length; day++) {
        state.currentDay = day;
        const games = schedule[day];
        for (const g of games) {
            const homePlayers = state.teamsPlayers[g.home];
            const awayPlayers = state.teamsPlayers[g.away];
            if (!homePlayers || !awayPlayers || homePlayers.length === 0 || awayPlayers.length === 0) continue;
            const res = SimEngine.simulateGame(homePlayers, awayPlayers, false);
            if (res.winner === "home") {
                state.records[g.home].win++; state.records[g.away].loss++;
            } else {
                state.records[g.away].win++; state.records[g.home].loss++;
            }
        }
        // 当日 AI 交易（1 次尝试，模拟 app.js runDailyAiTrades）
        const executed = TradeEngine.runAiTrades(state, 1);
        for (const tr of executed) {
            const snapshot = {
                day, year: seasonYear, teamA: tr.teamA, teamB: tr.teamB,
                outgoingA: tr.outgoingA.map(p => ({ id: p.id, n: p.n, o: p.o, p: p.p, a: p.a, sal: p.sal, isFiller: p.isFiller })),
                outgoingB: tr.outgoingB.map(p => ({ id: p.id, n: p.n, o: p.o, p: p.p, a: p.a, sal: p.sal, isFiller: p.isFiller })),
                blockbuster: tr.blockbuster,
            };
            seasonTrades.push(snapshot);
            allTimeTradeLog.push(snapshot);
            [...tr.outgoingA, ...tr.outgoingB].forEach(p => {
                playerTradeCountThisSeason[p.id] = (playerTradeCountThisSeason[p.id] || 0) + 1;
                playerAllTimeTrades[p.id] = (playerAllTimeTrades[p.id] || 0) + 1;
            });
        }
    }

    // 3. 赛季末指标
    const allActive = state.players.filter(p => p.t && !p.isRetired);
    const avgOvr = allActive.reduce((s, p) => s + p.o, 0) / allActive.length;
    const superstars = allActive.filter(p => p.o >= 90);
    const teamSalaries = {}, teamSizes = {}, teamFillerCounts = {};
    let totalSalary = 0;
    teams.forEach(t => {
        const roster = state.teamsPlayers[t.id];
        const sal = roster.reduce((s, p) => s + (p.sal || 0), 0);
        teamSalaries[t.id] = round1(sal);
        totalSalary += sal;
        teamSizes[t.id] = roster.length;
        teamFillerCounts[t.id] = roster.filter(p => p.isFiller).length;
    });
    const avgSalary = totalSalary / teams.length;

    const ageBuckets = { u25: 0, mid25_30: 0, late31_35: 0, old36p: 0 };
    allActive.forEach(p => {
        if (p.a < 25) ageBuckets.u25++;
        else if (p.a <= 30) ageBuckets.mid25_30++;
        else if (p.a <= 35) ageBuckets.late31_35++;
        else ageBuckets.old36p++;
    });

    const tradeCount = seasonTrades.length;
    const blockbusterCount = seasonTrades.filter(t => t.blockbuster).length;

    // 4. 休赛期成长 + 退役
    const progression = SeasonEngine.offseasonProgression(state.players);
    const retired = progression.retired;
    const retiredIds = new Set(retired.map(p => p.id));
    teams.forEach(t => {
        state.teamsPlayers[t.id] = state.teamsPlayers[t.id].filter(p => !retiredIds.has(p.id));
    });
    state.players = state.players.filter(p => !retiredIds.has(p.id));

    // 4.5 强制执行硬帽：超帽球队释放最低性价比球员
    const hardCapReleased = SeasonEngine.enforceHardCap(state);
    if (hardCapReleased.length > 0) {
        console.log(`  [硬帽瘦身] 释放 ${hardCapReleased.length} 人: ${hardCapReleased.slice(0,3).map(p => `${p.n}($${p.sal}M,ovr${p.o})`).join(', ')}`);
    }

    const retiredInfo = retired.map(p => ({ n: p.n, a: p.a, o: p.o, t: p.t || '?', isFiller: !!p.isFiller }));
    const retiredReal = retiredInfo.filter(r => !r.isFiller);
    const retiredFiller = retiredInfo.filter(r => r.isFiller);

    // 5. 选秀
    state.year++;
    const rookieClass = DraftEngine.generateRookieClass(state.year);
    // 检查新秀名字重复
    rookieClass.forEach(r => {
        if (rookieNameSet.has(r.n)) rookieDuplicateNames.push({ year: state.year, n: r.n });
        rookieNameSet.add(r.n);
    });
    const rookieAssignments = [];
    // 按名单缺口最大优先分配
    const teamsByNeed = [...teams].sort((a, b) => state.teamsPlayers[a.id].length - state.teamsPlayers[b.id].length);
    for (const t of teamsByNeed) {
        while (state.teamsPlayers[t.id].length < 14) {
            const available = rookieClass.filter(r => r.t === null);
            if (available.length === 0) break;
            const roster = state.teamsPlayers[t.id];
            const pick = DraftEngine.aiPick(available, roster);
            if (!pick) break;
            // makeRoomForRookie: 若已达 15 先释放最低（此处不会触发，因循环条件 <14）
            while (state.teamsPlayers[t.id].length >= 15) {
                const fillers = roster.filter(p => p.isFiller);
                let toRelease;
                if (fillers.length > 0) { fillers.sort((a, b) => a.o - b.o); toRelease = fillers[0]; }
                else { toRelease = [...roster].sort((a, b) => a.o - b.o)[0]; }
                const idx = roster.findIndex(p => p.id === toRelease.id);
                if (idx >= 0) roster.splice(idx, 1);
                state.players = state.players.filter(p => p.id !== toRelease.id);
            }
            DraftEngine.assignRookieToTeam(pick, t.id, roster.length + 1, roster);
            state.teamsPlayers[t.id].push(pick);
            state.players.push(pick);
            rookieAssignments.push({ n: pick.n, o: pick.o, pot: pick.pot, team: t.id });
        }
    }
    // 6. filler 补足
    teams.forEach(t => {
        while (state.teamsPlayers[t.id].length < 14) {
            const fp = generateBenchPlayer(t.id, fillerIdx++);
            state.players.push(fp);
            state.teamsPlayers[t.id].push(fp);
        }
    });
    // 清伤病
    state.players.forEach(p => p.injured = 0);

    // 追踪指标
    const maxPlayerTrades = Math.max(0, ...Object.values(playerTradeCountThisSeason));
    const multiTradePlayers = Object.entries(playerTradeCountThisSeason).filter(([, c]) => c >= 3);
    // 交易薪资合规性抽检
    let salaryViolationCount = 0;
    seasonTrades.forEach(tr => {
        const salA = tr.outgoingA.reduce((s, p) => s + (p.sal || 0), 0);
        const salB = tr.outgoingB.reduce((s, p) => s + (p.sal || 0), 0);
        // 双向 125% 规则
        if (salB > salA * 1.25 + 0.1 || salA > salB * 1.25 + 0.1) salaryViolationCount++;
    });
    // 交易后名单合规性
    let rosterViolationCount = 0;
    teams.forEach(t => {
        if (teamSizes[t.id] < 14 || teamSizes[t.id] > 15) rosterViolationCount++;
    });

    seasonsData.push({
        season: season + 1, year: seasonYear,
        tradeCount, blockbusterCount,
        avgOvr: Math.round(avgOvr * 100) / 100,
        superstarCount: superstars.length,
        avgSalary: round1(avgSalary),
        teamSalaries, teamSizes, teamFillerCounts,
        ageBuckets,
        retiredCount: retired.length,
        retiredRealCount: retiredReal.length,
        retiredFillerCount: retiredFiller.length,
        retiredInfo,
        rookieCount: rookieAssignments.length,
        rookieOvrAvg: rookieAssignments.length ? round1(rookieAssignments.reduce((s, r) => s + r.o, 0) / rookieAssignments.length) : 0,
        rookiePotAvg: rookieAssignments.length ? round1(rookieAssignments.reduce((s, r) => s + r.pot, 0) / rookieAssignments.length) : 0,
        maxPlayerTrades,
        multiTradePlayers: multiTradePlayers.length,
        salaryViolationCount,
        rosterViolationCount,
        totalFiller: Object.values(teamFillerCounts).reduce((a, b) => a + b, 0),
        maxTeamSalary: Math.max(...Object.values(teamSalaries)),
        minTeamSalary: Math.min(...Object.values(teamSalaries)),
        maxTeamSize: Math.max(...Object.values(teamSizes)),
        minTeamSize: Math.min(...Object.values(teamSizes)),
    });

    console.log(`S${season + 1} Y${seasonYear}: trades=${tradeCount}(blk ${blockbusterCount}) | avgOvr=${avgOvr.toFixed(1)} super=${superstars.length} | retired=${retired.length}(real ${retiredReal.length},filler ${retiredFiller.length}) | rookies=${rookieAssignments.length}(ovr ${rookieAssignments.length ? (rookieAssignments.reduce((s, r) => s + r.o, 0) / rookieAssignments.length).toFixed(1) : '-'}) | avgSal=${avgSalary.toFixed(1)}M [${Math.min(...Object.values(teamSalaries)).toFixed(0)}~${Math.max(...Object.values(teamSalaries)).toFixed(0)}] | sizes ${Math.min(...Object.values(teamSizes))}-${Math.max(...Object.values(teamSizes))} | filler=${Object.values(teamFillerCounts).reduce((a, b) => a + b, 0)} | max1PTrades=${maxPlayerTrades} salVio=${salaryViolationCount}`);
}

// ============ 最终分析输出 ============
console.log("\n" + "=".repeat(80));
console.log("20 赛季模拟分析报告");
console.log("=".repeat(80));

// 1. 交易笔数曲线
console.log("\n--- 1. 交易笔数曲线 ---");
console.log("赛季 | 年份 | 交易数 | 重磅数 | 重磅占比 | 单人最多被交易次数 | 多次交易球员数(>=3)");
seasonsData.forEach(s => {
    const blkPct = s.tradeCount > 0 ? (s.blockbusterCount / s.tradeCount * 100).toFixed(1) + '%' : '-';
    console.log(`S${String(s.season).padStart(2)} | ${s.year} | ${String(s.tradeCount).padStart(3)} | ${String(s.blockbusterCount).padStart(3)} | ${blkPct.padStart(6)} | ${s.maxPlayerTrades} | ${s.multiTradePlayers}`);
});
const totalTrades = seasonsData.reduce((s, x) => s + x.tradeCount, 0);
const totalBlk = seasonsData.reduce((s, x) => s + x.blockbusterCount, 0);
console.log(`总计: ${totalTrades} 笔交易, ${totalBlk} 笔重磅 (${(totalBlk / totalTrades * 100).toFixed(1)}%)`);
console.log(`平均每季: ${(totalTrades / SEASONS).toFixed(1)} 笔`);

// 2. 退役人数曲线
console.log("\n--- 2. 退役人数曲线 ---");
console.log("赛季 | 年份 | 退役总数 | 真实球员 | filler | 新秀补充 | 净增减");
seasonsData.forEach(s => {
    const net = s.rookieCount - s.retiredRealCount;
    console.log(`S${String(s.season).padStart(2)} | ${s.year} | ${String(s.retiredCount).padStart(3)} | ${String(s.retiredRealCount).padStart(3)} | ${String(s.retiredFillerCount).padStart(3)} | ${String(s.rookieCount).padStart(3)} | ${net >= 0 ? '+' : ''}${net}`);
});
// 退役球员年龄分布
console.log("\n退役真实球员年龄分布(全部 20 季):");
const retireAgeBuckets = { lt32: 0, '32-34': 0, '35-37': 0, '38-40': 0, '41+': 0 };
const retireOvrBuckets = { lt65: 0, '65-74': 0, '75-82': 0, '83-89': 0, '90+': 0 };
let superstarRetired = [];
seasonsData.forEach(s => {
    s.retiredInfo.filter(r => !r.isFiller).forEach(r => {
        if (r.a < 32) retireAgeBuckets.lt32++;
        else if (r.a <= 34) retireAgeBuckets['32-34']++;
        else if (r.a <= 37) retireAgeBuckets['35-37']++;
        else if (r.a <= 40) retireAgeBuckets['38-40']++;
        else retireAgeBuckets['41+']++;
        if (r.o < 65) retireOvrBuckets.lt65++;
        else if (r.o <= 74) retireOvrBuckets['65-74']++;
        else if (r.o <= 82) retireOvrBuckets['75-82']++;
        else if (r.o <= 89) retireOvrBuckets['83-89']++;
        else retireOvrBuckets['90+']++;
        if (r.o >= 90) superstarRetired.push(r);
    });
});
console.log("  年龄: " + JSON.stringify(retireAgeBuckets));
console.log("  能力: " + JSON.stringify(retireOvrBuckets));
console.log(`  超巨(ovr>=90)退役人数: ${superstarRetired.length}`);
if (superstarRetired.length > 0) console.log("  超巨退役样本: " + JSON.stringify(superstarRetired.slice(0, 5)));

// 3. 联盟平均 ovr 曲线
console.log("\n--- 3. 联盟平均 OVR 曲线 ---");
console.log("赛季 | 年份 | 平均OVR | 超巨数(>=90) | 年龄分布(u25/25-30/31-35/36+)");
seasonsData.forEach(s => {
    const ab = s.ageBuckets;
    console.log(`S${String(s.season).padStart(2)} | ${s.year} | ${s.avgOvr.toFixed(2)} | ${String(s.superstarCount).padStart(3)} | ${ab.u25}/${ab.mid25_30}/${ab.late31_35}/${ab.old36p}`);
});

// 4. 薪资分布
console.log("\n--- 4. 薪资分布 ---");
console.log("赛季 | 年份 | 平均薪资 | 最低队 | 最高队 | 超200M队数 | 低于50M队数 | 超工资帽数");
seasonsData.forEach(s => {
    const vals = Object.values(s.teamSalaries);
    const over200 = vals.filter(v => v > 200).length;
    const under50 = vals.filter(v => v < 50).length;
    const overCap = vals.filter(v => v > SALARY_CAP).length;
    console.log(`S${String(s.season).padStart(2)} | ${s.year} | ${s.avgSalary.toFixed(1)}M | ${s.minTeamSalary.toFixed(1)}M | ${s.maxTeamSalary.toFixed(1)}M | ${over200} | ${under50} | ${overCap}/30`);
    // 超 200M 球队阵容明细转储（诊断用）
    Object.entries(s.teamSalaries).forEach(([tid, sal]) => {
        if (sal > 200) console.log(`  [>200M] S${s.season} ${tid} $${sal}M 名单=${s.teamSizes[tid]}人 filler=${s.teamFillerCounts[tid]}`);
    });
});

// 5. 名单人数 & filler
console.log("\n--- 5. 名单人数 & filler 数 ---");
console.log("赛季 | 年份 | 最小名单 | 最大名单 | 总filler | 超名单元组(<14或>15)");
seasonsData.forEach(s => {
    console.log(`S${String(s.season).padStart(2)} | ${s.year} | ${s.minTeamSize} | ${s.maxTeamSize} | ${s.totalFiller} | ${s.rosterViolationCount}`);
});

// 6. 选秀
console.log("\n--- 6. 选秀 ---");
console.log("赛季 | 年份 | 新秀数 | 新秀OVR均 | 新秀POT均 | 新秀名字重复(全季累计)");
const dupCountTillNow = [];
let cumDup = 0;
seasonsData.forEach(s => {
    const dups = rookieDuplicateNames.filter(d => d.year === s.year + 1).length; // year+1 因 state.year++
    cumDup += dups;
    console.log(`S${String(s.season).padStart(2)} | ${s.year} | ${s.rookieCount} | ${s.rookieOvrAvg} | ${s.rookiePotAvg} | ${dups}(累计${cumDup})`);
});

// 7. 连锁交易分析
console.log("\n--- 7. 连锁交易分析 ---");
const allMultiTrades = Object.entries(playerAllTimeTrades).filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]);
console.log(`全 20 季被交易 >=3 次的球员: ${allMultiTrades.length} 人`);
if (allMultiTrades.length > 0) {
    // 取前 10，附带名字
    const topMulti = allMultiTrades.slice(0, 10).map(([pid, c]) => {
        const p = state.players.find(x => x.id === pid) || allTimeTradeLog.flatMap(t => [...t.outgoingA, ...t.outgoingB]).find(x => x.id === pid);
        return { n: p ? p.n : '?', count: c };
    });
    console.log("  前10: " + JSON.stringify(topMulti));
}
// 单季多次交易的样本
const singleSeasonMulti = seasonsData.filter(s => s.multiTradePlayers > 0);
console.log(`单季被交易 >=3 次的赛季数: ${singleSeasonMulti.length}`);

// 8. 交易薪资合规性
console.log("\n--- 8. 交易合规性 ---");
const totalSalVio = seasonsData.reduce((s, x) => s + x.salaryViolationCount, 0);
console.log(`20 季薪资违规交易数: ${totalSalVio} (应为 0，引擎内置 validateSalary 保证)`);

// 9. 重磅交易样本
console.log("\n--- 9. 重磅交易样本(前 15) ---");
const blockbusters = allTimeTradeLog.filter(t => t.blockbuster);
console.log(`总重磅交易: ${blockbusters.length}`);
blockbusters.slice(0, 15).forEach((tr, i) => {
    const aSide = tr.outgoingA.map(p => `${p.n}(${p.o},${p.sal}M)`).join("+");
    const bSide = tr.outgoingB.map(p => `${p.n}(${p.o},${p.sal}M)`).join("+");
    console.log(`  #${i + 1} Y${tr.year} D${tr.day} ${tr.teamA}[${aSide}] ⇄ ${tr.teamB}[${bSide}]`);
});

// 10. 最终联盟状态
console.log("\n--- 10. 第 20 季末联盟快照 ---");
const last = seasonsData[seasonsData.length - 1];
console.log(`平均 OVR: ${last.avgOvr}, 超巨数: ${last.superstarCount}, 平均薪资: ${last.avgSalary}M`);
console.log(`各队薪资: ` + JSON.stringify(last.teamSalaries));
console.log(`各队人数: ` + JSON.stringify(last.teamSizes));
console.log(`各队 filler: ` + JSON.stringify(last.teamFillerCounts));
// 顶尖球员
const finalActive = state.players.filter(p => p.t && !p.isRetired);
const topPlayers = [...finalActive].sort((a, b) => b.o - a.o).slice(0, 15);
console.log("顶尖 15 球员: ");
topPlayers.forEach(p => console.log(`  ${p.n} (${p.t}) ovr=${p.o} age=${p.a} sal=${p.sal}M pot=${p.pot} yrs=${p.yrsInLeague} filler=${!!p.isFiller}`));

// 11. 异常汇总
console.log("\n" + "=".repeat(80));
console.log("异常汇总");
console.log("=".repeat(80));
const anomalies = [];
// 交易频率异常
const zeroTradeSeasons = seasonsData.filter(s => s.tradeCount === 0);
const highTradeSeasons = seasonsData.filter(s => s.tradeCount > 200);
if (zeroTradeSeasons.length) anomalies.push(`[交易频率] ${zeroTradeSeasons.length} 个赛季 0 交易`);
if (highTradeSeasons.length) anomalies.push(`[交易频率] ${highTradeSeasons.length} 个赛季交易 >200`);
// 修复：原阈值 <30 / >90 与引擎设计目标 12-16 笔/季不符，导致 19/20 季误报
// 引擎设计目标（trade.js runAiTrades 注释）：预期交易频率 ~12-16 笔/季
// 调整为 <10 / >25，与真实 NBA 约 10-20 笔/季 + 引擎设计区间一致
const lowTradeSeasons = seasonsData.filter(s => s.tradeCount < 10);
const highTrade2 = seasonsData.filter(s => s.tradeCount > 25);
if (lowTradeSeasons.length) anomalies.push(`[交易频率] ${lowTradeSeasons.length} 个赛季交易 <10 (期望 10-20)`);
if (highTrade2.length) anomalies.push(`[交易频率] ${highTrade2.length} 个赛季交易 >25 (期望 10-20)`);
// 重磅占比
const lowBlk = seasonsData.filter(s => s.tradeCount > 10 && s.blockbusterCount / s.tradeCount < 0.05);
const highBlk = seasonsData.filter(s => s.tradeCount > 10 && s.blockbusterCount / s.tradeCount > 0.20);
if (lowBlk.length) anomalies.push(`[重磅占比] ${lowBlk.length} 个赛季重磅占比 <5% (期望 5-20%)`);
if (highBlk.length) anomalies.push(`[重磅占比] ${highBlk.length} 个赛季重磅占比 >20% (期望 5-20%)`);
// 退役异常
const lowRetire = seasonsData.filter(s => s.retiredRealCount < 15);
const highRetire = seasonsData.filter(s => s.retiredRealCount > 35);
if (lowRetire.length) anomalies.push(`[退役] ${lowRetire.length} 个赛季真实球员退役 <15 (期望 15-35)`);
if (highRetire.length) anomalies.push(`[退役] ${highRetire.length} 个赛季真实球员退役 >35 (期望 15-35)`);
// 超巨过早退役
if (superstarRetired.length > 0) {
    const young = superstarRetired.filter(r => r.a < 38);
    if (young.length) anomalies.push(`[退役] ${young.length} 个超巨(ovr>=90)在 38 岁前退役 (引擎应有保护)`);
}
// ovr 膨胀/塌缩
const inflate = seasonsData.filter(s => s.avgOvr > 80);
const collapse = seasonsData.filter(s => s.avgOvr < 70);
if (inflate.length) anomalies.push(`[能力膨胀] ${inflate.length} 个赛季平均 OVR >80 (期望 73-78)`);
if (collapse.length) anomalies.push(`[能力塌缩] ${collapse.length} 个赛季平均 OVR <70 (期望 73-78)`);
// 超巨数
const lowSuper = seasonsData.filter(s => s.superstarCount < 5);
const highSuper = seasonsData.filter(s => s.superstarCount > 15);
if (lowSuper.length) anomalies.push(`[超巨数] ${lowSuper.length} 个赛季超巨 <5 (期望 5-15)`);
if (highSuper.length) anomalies.push(`[超巨数] ${highSuper.length} 个赛季超巨 >15 (期望 5-15)`);
// 薪资异常
const salExplosion = seasonsData.filter(s => s.maxTeamSalary > 200);
const salTooLow = seasonsData.filter(s => s.minTeamSalary < 50);
if (salExplosion.length) anomalies.push(`[薪资] ${salExplosion.length} 个赛季有球队薪资 >200M`);
if (salTooLow.length) anomalies.push(`[薪资] ${salTooLow.length} 个赛季有球队薪资 <50M`);
// 名单违规
const rosterVioSeasons = seasonsData.filter(s => s.rosterViolationCount > 0);
if (rosterVioSeasons.length) anomalies.push(`[名单] ${rosterVioSeasons.length} 个赛季存在名单人数违规(<14 或 >15)`);
// 连锁交易
if (singleSeasonMulti.length > 0) anomalies.push(`[连锁交易] ${singleSeasonMulti.length} 个赛季有球员被交易 >=3 次`);
// filler 累积
// 修复：原告警文案 "初始约 ${fillerIdx - rookieCount}" 计算无意义（生成数-分配数=负数）
// 改为直接显示初始 filler 数 120，仅当 filler >120（超过初始值）才算异常
const highFiller = seasonsData.filter(s => s.totalFiller > 120);
if (highFiller.length) anomalies.push(`[filler] ${highFiller.length} 个赛季 filler 总数 >120 (初始 120)`);
// 新秀名字重复
if (rookieDuplicateNames.length > 0) anomalies.push(`[选秀] 新秀名字重复 ${rookieDuplicateNames.length} 次`);
// 新秀 ovr/pot 异常
const badRookieOvr = seasonsData.filter(s => s.rookieCount > 0 && (s.rookieOvrAvg < 60 || s.rookieOvrAvg > 75));
const badRookiePot = seasonsData.filter(s => s.rookieCount > 0 && (s.rookiePotAvg < 70 || s.rookiePotAvg > 85));
if (badRookieOvr.length) anomalies.push(`[选秀] ${badRookieOvr.length} 个赛季新秀平均 OVR 越界 (期望 60-75)`);
if (badRookiePot.length) anomalies.push(`[选秀] ${badRookiePot.length} 个赛季新秀平均 POT 越界 (期望 70-85)`);

if (anomalies.length === 0) console.log("未发现明显异常");
else anomalies.forEach((a, i) => console.log(`${i + 1}. ${a}`));

console.log("\n=== 模拟结束 ===");
