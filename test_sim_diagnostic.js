// 诊断脚本：深入检查新秀首赛季历史缺失问题 + 交易球员验证
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {
    console, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean,
    parseInt, parseFloat, isNaN,
    setTimeout: () => {}, clearTimeout: () => {},
    document: { getElementById: () => ({ innerHTML: '', classList: { add: () => {}, remove: () => {}, toggle: () => {} }, addEventListener: () => {}, scrollTop: 0 }), querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem: () => {} }
};
sandbox.window = sandbox; sandbox.global = sandbox;
vm.createContext(sandbox);
const baseDir = path.join(__dirname, 'js');
const load = rel => vm.runInContext(fs.readFileSync(path.join(baseDir, rel), 'utf8'), sandbox, { filename: rel });
load('data/teams.js'); load('data/players.js'); load('data/rookies.js'); load('data/nba_stats.js');
load('engine/simulation.js'); load('engine/season.js'); load('engine/trade.js'); load('engine/draft.js');

const SeasonEngine = sandbox.SeasonEngine;
const SimEngine = sandbox.SimEngine;
const TradeEngine = sandbox.TradeEngine;
const DraftEngine = sandbox.DraftEngine;
const TEAMS_DATA = sandbox.TEAMS_DATA;
const PLAYERS_DATA = sandbox.PLAYERS_DATA;
const ROOKIE_PROTOTYPES = sandbox.ROOKIE_PROTOTYPES;
const ROOKIE_POS_PROFILES = sandbox.ROOKIE_POS_PROFILES;

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));

let fillerIdCounter = 0;
function generateFiller(teamId) {
    const positions = ["PG", "SG", "SF", "PF", "C"];
    const pos = positions[fillerIdCounter % 5];
    const profile = ROOKIE_POS_PROFILES[pos];
    const ovr = randInt(62, 70);
    const v = () => randInt(-4, 4);
    const fn = ROOKIE_PROTOTYPES.firstNames[Math.floor(Math.random() * ROOKIE_PROTOTYPES.firstNames.length)];
    const ln = ROOKIE_PROTOTYPES.lastNames[Math.floor(Math.random() * ROOKIE_PROTOTYPES.lastNames.length)];
    const idx = fillerIdCounter++;
    const name = `${fn}·${ln}_F${idx}`;
    return {
        id: `bench_${teamId}_${idx}`, n: name, t: teamId, p: pos, a: randInt(22, 32), o: ovr,
        pot: ovr + randInt(0, 2), sal: Math.round(TradeEngine.salaryForOvr(ovr) * (0.6 + Math.random() * 0.5) * 10) / 10,
        ins: clamp(profile.ins + v(), 40, 72), sh: clamp(profile.sh + v(), 40, 74),
        pa: clamp(profile.pa + v(), 35, 72), re: clamp(profile.re + v(), 35, 75),
        de: clamp(profile.de + v(), 40, 74), at: clamp(profile.at + v(), 50, 80), iq: clamp(profile.iq + v(), 50, 76),
        isRookie: false, isFiller: true, draftYear: null, yrsInLeague: 5,
    };
}

function initState() {
    const teams = JSON.parse(JSON.stringify(TEAMS_DATA));
    const players = PLAYERS_DATA.map((p, i) => ({ ...p, id: `p_${i}`, pot: p.o + randInt(0, 4), isRookie: false, draftYear: null, yrsInLeague: 5 }));
    const teamsPlayers = {};
    teams.forEach(t => teamsPlayers[t.id] = []);
    players.forEach(p => { if (teamsPlayers[p.t]) teamsPlayers[p.t].push(p); });
    teams.forEach(t => { while (teamsPlayers[t.id].length < 14) { const fp = generateFiller(t.id); players.push(fp); teamsPlayers[t.id].push(fp); } });
    const records = {};
    teams.forEach(t => records[t.id] = { win: 0, loss: 0, streak: 0, ptsFor: 0, ptsAgt: 0 });
    const statAccum = {};
    teams.forEach(t => statAccum[t.id] = {});
    return { manager: { name: 'Test', teamId: 'BOS' }, year: 2026, phase: 'regular', teams, players, teamsPlayers, records, schedule: null, currentDay: 0, standings: null, playoffs: null, freeAgents: [], rookieClass: [], draftOrder: null, draftPick: 0, statAccum, history: [], champions: [], awardsHistory: [], playerHistory: {}, tactics: { pace: 1, defense: 1, rotation: 1 }, injuryLog: [], tradeLog: [] };
}

function accumulateStats(state, teamId, line) {
    const acc = state.statAccum[teamId];
    if (!acc[line.player.id]) acc[line.player.id] = { gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0 };
    const s = acc[line.player.id];
    s.gp++; s.min += line.min;
    s.pts += line.pts; s.reb += line.reb; s.ast += line.ast; s.stl += line.stl; s.blk += line.blk; s.tov += line.tov; s.pf += line.pf;
    s.fgm += line.fgm; s.fga += line.fga; s.tpm += line.tpm; s.tpa += line.tpa; s.ftm += line.ftm; s.fta += line.fta; s.oreb += line.oreb || 0;
}

function recordPlayerHistory(state) {
    const prevYear = state.year - 1;
    state.players.forEach(p => {
        if (p.draftYear === state.year) return;
        if (!state.playerHistory[p.id]) state.playerHistory[p.id] = [];
        state.teams.forEach(t => {
            const acc = state.statAccum[t.id] && state.statAccum[t.id][p.id];
            if (!acc || acc.gp === 0) return;
            const gp = acc.gp;
            const div = v => +(v / Math.max(1, gp)).toFixed(1);
            state.playerHistory[p.id].push({ year: prevYear, ovr: p.o, teamId: t.id, age: p.a, gp: gp, min: div(acc.min), pts: div(acc.pts), reb: div(acc.reb), ast: div(acc.ast) });
        });
    });
}

function makeRoomForRookie(state, teamId) {
    const roster = state.teamsPlayers[teamId];
    if (!roster) return;
    while (roster.length >= 15) {
        let toRelease = null;
        const fillers = roster.filter(p => p.isFiller);
        if (fillers.length > 0) { fillers.sort((a, b) => a.o - b.o); toRelease = fillers[0]; }
        else { toRelease = [...roster].sort((a, b) => a.o - b.o)[0]; }
        if (!toRelease) break;
        const idx = roster.findIndex(p => p.id === toRelease.id);
        if (idx >= 0) roster.splice(idx, 1);
        state.players = state.players.filter(p => p.id !== toRelease.id);
    }
}

function simulateSeason(state) {
    state.teams.forEach(t => { state.statAccum[t.id] = {}; state.records[t.id] = { win: 0, loss: 0, streak: 0, ptsFor: 0, ptsAgt: 0 }; });
    const schedule = SeasonEngine.generateSchedule(state.teams);
    for (let day = 0; day < schedule.length; day++) {
        for (const g of schedule[day]) {
            const res = SimEngine.simulateGame(state.teamsPlayers[g.home], state.teamsPlayers[g.away]);
            res.home.lines.forEach(l => accumulateStats(state, g.home, l));
            res.away.lines.forEach(l => accumulateStats(state, g.away, l));
            const homeWin = res.winner === 'home';
            state.records[g.home][homeWin ? 'win' : 'loss']++;
            state.records[g.away][!homeWin ? 'win' : 'loss']++;
        }
        TradeEngine.runAiTrades(state, 1);
    }
    state.standings = SeasonEngine.computeStandings(state.teams, state.records);
}

function offseason(state) {
    state.year++;
    recordPlayerHistory(state);
    const prog = SeasonEngine.offseasonProgression(state.players);
    const retired = prog.retired;
    if (retired.length > 0) {
        const retiredIds = new Set(retired.map(p => p.id));
        state.teams.forEach(t => { state.teamsPlayers[t.id] = state.teamsPlayers[t.id].filter(p => !retiredIds.has(p.id)); });
        state.players = state.players.filter(p => !retiredIds.has(p.id));
    }
    state.teams.forEach(t => {
        const roster = state.teamsPlayers[t.id];
        while (roster.length > 15) {
            let toRelease = null;
            const fillers = roster.filter(p => p.isFiller);
            if (fillers.length > 0) { fillers.sort((a, b) => a.o - b.o); toRelease = fillers[0]; }
            else { toRelease = [...roster].sort((a, b) => a.o - b.o)[0]; }
            if (!toRelease) break;
            const idx = roster.findIndex(p => p.id === toRelease.id);
            if (idx >= 0) roster.splice(idx, 1);
            state.players = state.players.filter(p => p.id !== toRelease.id);
        }
    });
    const rookieClass = DraftEngine.generateRookieClass(state.year);
    const draftOrder = [...state.teams].sort((a, b) => state.records[a.id].win - state.records[b.id].win).map(t => t.id);
    state.draftOrder = [...draftOrder, ...draftOrder];
    state.draftPick = 0;
    while (state.draftPick < state.draftOrder.length) {
        const owner = state.draftOrder[state.draftPick];
        const available = rookieClass.filter(r => r.t === null);
        if (available.length === 0) break;
        const pick = DraftEngine.aiPick(available, state.teamsPlayers[owner] || []);
        if (pick) {
            makeRoomForRookie(state, owner);
            DraftEngine.assignRookieToTeam(pick, owner, state.draftPick + 1);
            if (state.teamsPlayers[owner]) state.teamsPlayers[owner].push(pick);
            state.players.push(pick);
        }
        state.draftPick++;
    }
    state.teams.forEach(t => { while (state.teamsPlayers[t.id].length < 14) { const fp = generateFiller(t.id); state.players.push(fp); state.teamsPlayers[t.id].push(fp); } });
    state.players.forEach(p => p.injured = 0);
}

// ============ 诊断主流程 ============
console.log('=== 新秀首赛季历史诊断 ===');
const state = initState();

// 跑 5 季足够看清模式
for (let s = 0; s < 5; s++) {
    const seasonYear = state.year;
    simulateSeason(state);

    // 收集本季新秀（上赛季选秀）的出场数据
    // 本季 state.year = seasonYear，新秀 draftYear = seasonYear（在上个休赛期被选）
    const rookiesThisSeason = state.players.filter(p => p.draftYear === seasonYear);
    const rookiePlayData = rookiesThisSeason.map(p => {
        // 查找该新秀在所有队伍的 statAccum
        let totalGp = 0, totalMin = 0, teams = [];
        state.teams.forEach(t => {
            const acc = state.statAccum[t.id]?.[p.id];
            if (acc && acc.gp > 0) {
                totalGp += acc.gp;
                totalMin += acc.min;
                teams.push(t.id);
            }
        });
        return {
            name: p.n, ovr: p.o, pos: p.p, draftPick: p.draftPick,
            teamId: p.t, gp: totalGp, min: totalMin, avgMin: totalGp > 0 ? +(totalMin / totalGp).toFixed(1) : 0,
            teams: teams.length, played: totalGp > 0,
        };
    });

    const played = rookiePlayData.filter(r => r.played);
    const notPlayed = rookiePlayData.filter(r => !r.played);
    console.log(`\n--- 第 ${s + 1} 季 (${seasonYear}-${seasonYear + 1}) ---`);
    console.log(`  本季新秀: ${rookiesThisSeason.length} 人, 出场过: ${played.length}, 未出场: ${notPlayed.length}`);
    if (played.length > 0) {
        const avgOvrPlayed = played.reduce((s, r) => s + r.ovr, 0) / played.length;
        console.log(`  出场新秀平均 ovr: ${avgOvrPlayed.toFixed(1)}, 平均顺位: ${(played.reduce((s, r) => s + r.draftPick, 0) / played.length).toFixed(0)}, 平均分钟: ${(played.reduce((s, r) => s + r.avgMin, 0) / played.length).toFixed(1)}`);
    }
    if (notPlayed.length > 0) {
        const avgOvrNotPlayed = notPlayed.reduce((s, r) => s + r.ovr, 0) / notPlayed.length;
        console.log(`  未出场新秀平均 ovr: ${avgOvrNotPlayed.toFixed(1)}, 平均顺位: ${(notPlayed.reduce((s, r) => s + r.draftPick, 0) / notPlayed.length).toFixed(0)}`);
        // 列出几个未出场的新秀
        console.log(`  未出场样例(前5): ${notPlayed.slice(0, 5).map(r => `${r.name}(o${r.ovr},#${r.draftPick})`).join(', ')}`);
    }

    // 进入休赛期
    offseason(state);
}

// 检查第 5 季后所有还在 state.players 的新秀
console.log('\n=== 5 季后新秀历史检查 ===');
const allRookies = state.players.filter(p => p.draftYear != null);
console.log(`state.players 中的新秀(有 draftYear): ${allRookies.length} 人`);

const rookieHistoryCheck = allRookies.map(p => {
    const hist = state.playerHistory[p.id] || [];
    const firstSeason = hist.find(h => h.year === p.draftYear);
    return {
        name: p.n, draftYear: p.draftYear, ovr: p.o,
        histYears: hist.map(h => h.year),
        hasFirstSeason: !!firstSeason,
        firstGp: firstSeason?.gp,
    };
});

const noFirst = rookieHistoryCheck.filter(r => !r.hasFirstSeason);
const hasFirst = rookieHistoryCheck.filter(r => r.hasFirstSeason);
console.log(`有首季历史: ${hasFirst.length}, 无首季历史: ${noFirst.length}`);

// 分析无首季历史的新秀
if (noFirst.length > 0) {
    console.log(`\n无首季历史的新秀样例(前10):`);
    noFirst.slice(0, 10).forEach(r => {
        console.log(`  ${r.name} draftYear=${r.draftYear} ovr=${r.ovr} histYears=[${r.histYears.join(',')}]`);
    });
    // 这些新秀是否有任何历史？
    const noHistAtAll = noFirst.filter(r => r.histYears.length === 0);
    const someHist = noFirst.filter(r => r.histYears.length > 0);
    console.log(`\n  其中完全无历史: ${noHistAtAll.length}, 有其他年份历史: ${someHist.length}`);
    if (someHist.length > 0) {
        console.log(`  有其他年份历史的样例(前5):`);
        someHist.slice(0, 5).forEach(r => console.log(`    ${r.name} draftYear=${r.draftYear} histYears=[${r.histYears.join(',')}]`));
    }
}

// ============ 交易球员验证 ============
console.log('\n=== 交易球员验证 ===');
// 重置一个新 state，跑 3 季，检查 league leaders 中是否有交易球员
const state2 = initState();
for (let s = 0; s < 3; s++) {
    simulateSeason(state2);
    // 聚合球员数据，检查 multiTeam
    const playerAgg = {};
    Object.entries(state2.statAccum).forEach(([teamId, acc]) => {
        Object.entries(acc).forEach(([pid, s]) => {
            const p = state2.players.find(x => x.id === pid);
            if (!p) return;
            if (!playerAgg[pid]) playerAgg[pid] = { p, gp: s.gp, teams: new Set([teamId]), pts: s.pts };
            else { playerAgg[pid].gp += s.gp; playerAgg[pid].pts += s.pts; playerAgg[pid].teams.add(teamId); }
        });
    });
    const multiTeam = Object.values(playerAgg).filter(x => x.teams.size > 1);
    console.log(`第${s + 1}季: 交易过(gp>0 且多队)球员数 = ${multiTeam.length}`);
    if (multiTeam.length > 0) {
        multiTeam.slice(0, 3).forEach(x => {
            console.log(`  ${x.p.n} ovr=${x.p.o} gp=${x.gp} teams=[${[...x.teams].join(',')}] ppg=${+(x.pts / x.gp).toFixed(1)}`);
        });
    }
    offseason(state2);
}
