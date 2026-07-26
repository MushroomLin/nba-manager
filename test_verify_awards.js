// 验证奖项评选：MIP 修复 + 东西部MVP + 总决赛MVP
// 跑 20 赛季模拟，统计各类奖项的当选情况和数据合理性

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
const SimEngine = sandbox.SimEngine;
const TradeEngine = sandbox.TradeEngine;
const DraftEngine = sandbox.DraftEngine;
const TEAMS_DATA = sandbox.TEAMS_DATA;
const PLAYERS_DATA = sandbox.PLAYERS_DATA;
const ROOKIE_PROTOTYPES = sandbox.ROOKIE_PROTOTYPES;
const ROOKIE_POS_PROFILES = sandbox.ROOKIE_POS_PROFILES;

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));

function generateFiller(teamId, idx) {
    const positions = ["PG", "SG", "SF", "PF", "C"];
    const pos = positions[idx % 5];
    const profile = ROOKIE_POS_PROFILES[pos];
    const ovr = randInt(62, 70);
    const v = () => randInt(-4, 4);
    const fn = ROOKIE_PROTOTYPES.firstNames[Math.floor(Math.random() * ROOKIE_PROTOTYPES.firstNames.length)];
    const ln = ROOKIE_PROTOTYPES.lastNames[Math.floor(Math.random() * ROOKIE_PROTOTYPES.lastNames.length)];
    return {
        id: `bench_${teamId}_${idx}`,
        n: `${fn}·${ln}_F${idx}`,
        t: teamId, p: pos, a: randInt(22, 32), o: ovr, pot: ovr + randInt(0, 2),
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
}

function initState() {
    const teams = JSON.parse(JSON.stringify(TEAMS_DATA));
    const players = PLAYERS_DATA.map((p, i) => ({
        ...p, id: `p_${i}`, pot: p.o + randInt(0, 4),
        isRookie: false, draftYear: null, yrsInLeague: 5,
    }));
    const teamsPlayers = {};
    teams.forEach(t => teamsPlayers[t.id] = []);
    players.forEach(p => { if (teamsPlayers[p.t]) teamsPlayers[p.t].push(p); });
    let fIdx = 0;
    teams.forEach(t => {
        while (teamsPlayers[t.id].length < 14) {
            const fp = generateFiller(t.id, fIdx++);
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
        year: 2026, phase: 'regular', teams, players, teamsPlayers,
        records, schedule: null, currentDay: 0, standings: null, playoffs: null,
        freeAgents: [], rookieClass: [], draftOrder: null, draftPick: 0,
        statAccum, history: [], champions: [], awardsHistory: [],
        playerHistory: {}, tradeLog: [],
    };
}

function accumulateStats(state, teamId, line) {
    const acc = state.statAccum[teamId];
    if (!acc[line.player.id]) {
        acc[line.player.id] = { gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0 };
    }
    const s = acc[line.player.id];
    s.gp++; s.min += line.min;
    s.pts += line.pts; s.reb += line.reb; s.ast += line.ast;
    s.stl += line.stl; s.blk += line.blk; s.tov += line.tov; s.pf += line.pf;
    s.fgm += line.fgm; s.fga += line.fga; s.tpm += line.tpm; s.tpa += line.tpa;
    s.ftm += line.ftm; s.fta += line.fta; s.oreb += line.oreb || 0;
}

function recordPlayerHistory(state) {
    const prevYear = state.year - 1;
    state.players.forEach(p => {
        if (p.draftYear === state.year) return;
        if (!state.playerHistory[p.id]) state.playerHistory[p.id] = [];
        let hasRecord = false;
        state.teams.forEach(t => {
            const acc = state.statAccum[t.id] && state.statAccum[t.id][p.id];
            if (!acc || acc.gp === 0) return;
            hasRecord = true;
            const gp = acc.gp;
            const div = v => +(v / Math.max(1, gp)).toFixed(1);
            state.playerHistory[p.id].push({
                year: prevYear, ovr: p.o, teamId: t.id, age: p.a, gp: gp,
                min: div(acc.min), pts: div(acc.pts), reb: div(acc.reb), ast: div(acc.ast),
                stl: div(acc.stl), blk: div(acc.blk), tov: div(acc.tov), pf: div(acc.pf),
                fgm: div(acc.fgm), fga: div(acc.fga), tpm: div(acc.tpm), tpa: div(acc.tpa),
                ftm: div(acc.ftm), fta: div(acc.fta), oreb: div(acc.oreb),
                fg_pct: acc.fga > 0 ? +(acc.fgm / acc.fga).toFixed(3) : 0,
                fg3_pct: acc.tpa > 0 ? +(acc.tpm / acc.tpa).toFixed(3) : 0,
                ft_pct: acc.fta > 0 ? +(acc.ftm / acc.fta).toFixed(3) : 0,
            });
        });
    });
}

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
            toRelease.isFreeAgent = true; toRelease.t = null; toRelease.yearsInFreeAgency = 0;
        }
    }
}

function simulateSeason(state) {
    TradeEngine.resetTradeFlags(state);
    state.teams.forEach(t => {
        state.statAccum[t.id] = {};
        state.records[t.id] = { win: 0, loss: 0, streak: 0, ptsFor: 0, ptsAgt: 0 };
    });
    const schedule = SeasonEngine.generateSchedule(state.teams);
    state.schedule = schedule;
    for (let day = 0; day < schedule.length; day++) {
        const games = schedule[day];
        for (const g of games) {
            const homePlayers = state.teamsPlayers[g.home];
            const awayPlayers = state.teamsPlayers[g.away];
            if (!homePlayers || !awayPlayers || homePlayers.length === 0 || awayPlayers.length === 0) continue;
            const res = SimEngine.simulateGame(homePlayers, awayPlayers);
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

function runPlayoffs(state) {
    // 简化季后赛：直接按战绩打单轮淘汰到总决赛
    const po = {
        round: 1,
        east: SeasonEngine.setupPlayoffs(state.standings).east,
        west: SeasonEngine.setupPlayoffs(state.standings).west,
        exits: {},
    };
    // 3 轮东西部
    let pairings = { east: po.east, west: po.west };
    for (let r = 1; r <= 3; r++) {
        const eRes = SeasonEngine.simulatePlayoffRound(pairings.east, state.teamsPlayers);
        const wRes = SeasonEngine.simulatePlayoffRound(pairings.west, state.teamsPlayers);
        [...eRes, ...wRes].forEach(res => {
            const loser = res.high.teamId === res.winner.teamId ? res.low : res.high;
            po.exits[loser.teamId] = r;
        });
        if (r < 3) {
            pairings = { east: SeasonEngine.nextRound(eRes), west: SeasonEngine.nextRound(wRes) };
        } else {
            po.eastChamp = eRes[0].winner;
            po.westChamp = wRes[0].winner;
        }
    }
    // 总决赛
    const eR = state.records[po.eastChamp.teamId];
    const wR = state.records[po.westChamp.teamId];
    const eWinRate = eR.win / (eR.win + eR.loss);
    const wWinRate = wR.win / (wR.win + wR.loss);
    po.finalsPair = eWinRate >= wWinRate
        ? { high: po.eastChamp, low: po.westChamp }
        : { high: po.westChamp, low: po.eastChamp };
    po.finalsResult = SeasonEngine.simulatePlayoffRound([po.finalsPair], state.teamsPlayers)[0];
    const champ = po.finalsResult.winner;
    const loser = po.finalsPair.high.teamId === champ.teamId ? po.finalsPair.low : po.finalsPair.high;
    po.exits[loser.teamId] = 4;
    po.exits[champ.teamId] = 5;

    // 评选 FMVP
    const fmvp = SeasonEngine.computeFinalsMVP(
        po.finalsResult,
        po.finalsPair.high.teamId,
        po.finalsPair.low.teamId,
        champ.teamId
    );
    return { champ, loser, fmvp, finalsResult: po.finalsResult };
}

function offseason(state) {
    state.year++;
    recordPlayerHistory(state);
    if (state.freeAgents && state.freeAgents.length > 0) {
        const r = SeasonEngine.ageFreeAgents(state);
        if (r.retired > 0) {
            const ids = new Set(state.freeAgents.filter(p => p.isRetired).map(p => p.id));
            state.players = state.players.filter(p => !ids.has(p.id));
        }
    }
    const prog = SeasonEngine.offseasonProgression(state.players);
    const retired = prog.retired;
    if (retired.length > 0) {
        const retiredIds = new Set(retired.map(p => p.id));
        state.teams.forEach(t => {
            state.teamsPlayers[t.id] = state.teamsPlayers[t.id].filter(p => !retiredIds.has(p.id));
        });
        state.players = state.players.filter(p => !retiredIds.has(p.id));
    }
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
                state.players = state.players.filter(p => p.id !== toRelease.id);
            } else {
                toRelease.isFreeAgent = true; toRelease.t = null; toRelease.yearsInFreeAgency = 0;
            }
        }
    });
    SeasonEngine.enforceHardCap(state);
    // 选秀
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
    // 补足 filler
    let fIdx = 5000;
    state.teams.forEach(t => {
        while (state.teamsPlayers[t.id].length < 14) {
            const fp = generateFiller(t.id, fIdx++);
            state.players.push(fp);
            state.teamsPlayers[t.id].push(fp);
        }
    });
    state.players.forEach(p => p.injured = 0);
    return { retiredCount: retired.length };
}

// ============ 主流程 ============
const state = initState();
console.log(`[初始] 球员: ${state.players.length}`);

const stats = {
    mvp: 0, eastMvp: 0, westMvp: 0, dpoy: 0, roy: 0, sixMan: 0, mip: 0, fmvp: 0,
    mipNullSeasons: 0, fmvpNullSeasons: 0,
    totalSeasons: 0,
};
const samples = { mvp: [], eastMvp: [], westMvp: [], mip: [], fmvp: [] };

for (let s = 1; s <= 15; s++) {
    simulateSeason(state);
    const awards = SeasonEngine.computeAwards(state);
    state.awardsHistory.push(awards);

    // 季后赛 + FMVP
    const playoffResult = runPlayoffs(state);
    state.champions.push({
        year: state.year, team: playoffResult.champ.teamId, name: playoffResult.champ.name,
        finalsMVP: playoffResult.fmvp ? {
            id: playoffResult.fmvp.player.id, n: playoffResult.fmvp.player.n,
            ppg: playoffResult.fmvp.ppg, rpg: playoffResult.fmvp.rpg, apg: playoffResult.fmvp.apg,
        } : null,
        finalsScore: `${playoffResult.finalsResult.highWins}-${playoffResult.finalsResult.lowWins}`,
    });

    stats.totalSeasons++;
    if (awards.mvp) { stats.mvp++; if (samples.mvp.length < 3) samples.mvp.push({ year: awards.year, ...awards.mvp }); }
    if (awards.eastMvp) { stats.eastMvp++; if (samples.eastMvp.length < 3) samples.eastMvp.push({ year: awards.year, ...awards.eastMvp }); }
    if (awards.westMvp) { stats.westMvp++; if (samples.westMvp.length < 3) samples.westMvp.push({ year: awards.year, ...awards.westMvp }); }
    if (awards.dpoy) stats.dpoy++;
    if (awards.roy) stats.roy++;
    if (awards.sixMan) stats.sixMan++;
    if (awards.mip) {
        stats.mip++;
        if (samples.mip.length < 5) samples.mip.push({
            year: awards.year, n: awards.mip.player.n, ovr: awards.mip.player.o,
            ppg: awards.mip.ppg, rpg: awards.mip.rpg, apg: awards.mip.apg,
            ppgDelta: awards.mip.ppgDelta, rpgDelta: awards.mip.rpgDelta, apgDelta: awards.mip.apgDelta,
            ovrDelta: awards.mip.ovrDelta, lastPpg: awards.mip.lastPpg, lastRpg: awards.mip.lastRpg, lastApg: awards.mip.lastApg,
        });
    } else {
        stats.mipNullSeasons++;
    }
    if (playoffResult.fmvp) {
        stats.fmvp++;
        if (samples.fmvp.length < 5) samples.fmvp.push({
            year: state.year, n: playoffResult.fmvp.player.n,
            teamId: playoffResult.fmvp.teamId,
            ppg: playoffResult.fmvp.ppg, rpg: playoffResult.fmvp.rpg, apg: playoffResult.fmvp.apg,
            spg: playoffResult.fmvp.spg, bpg: playoffResult.fmvp.bpg,
            fgPct: playoffResult.fmvp.fgPct, gp: playoffResult.fmvp.gp, min: playoffResult.fmvp.min,
            champ: playoffResult.champ.name,
        });
    } else {
        stats.fmvpNullSeasons++;
    }

    offseason(state);
}

console.log('\n=== 奖项统计 ===');
console.log(`总赛季: ${stats.totalSeasons}`);
console.log(`MVP: ${stats.mvp}/${stats.totalSeasons}`);
console.log(`东部MVP: ${stats.eastMvp}/${stats.totalSeasons}`);
console.log(`西部MVP: ${stats.westMvp}/${stats.totalSeasons}`);
console.log(`DPOY: ${stats.dpoy}/${stats.totalSeasons}`);
console.log(`ROY: ${stats.roy}/${stats.totalSeasons}`);
console.log(`6MOY: ${stats.sixMan}/${stats.totalSeasons}`);
console.log(`MIP: ${stats.mip}/${stats.totalSeasons} (空缺 ${stats.mipNullSeasons} 季)`);
console.log(`FMVP: ${stats.fmvp}/${stats.totalSeasons} (空缺 ${stats.fmvpNullSeasons} 季)`);

console.log('\n=== MVP 样本（前3）===');
samples.mvp.forEach(s => console.log(`  [${s.year}] ${s.player.n} (${s.teamId}) ${s.ppg.toFixed(1)}分 ${s.rpg.toFixed(1)}板 ${s.apg.toFixed(1)}助 胜率${(s.winRate*100).toFixed(0)}%`));

console.log('\n=== 东部MVP 样本（前3）===');
samples.eastMvp.forEach(s => console.log(`  [${s.year}] ${s.player.n} (${s.teamId}) ${s.ppg.toFixed(1)}分 ${s.rpg.toFixed(1)}板 ${s.apg.toFixed(1)}助 胜率${(s.winRate*100).toFixed(0)}%`));

console.log('\n=== 西部MVP 样本（前3）===');
samples.westMvp.forEach(s => console.log(`  [${s.year}] ${s.player.n} (${s.teamId}) ${s.ppg.toFixed(1)}分 ${s.rpg.toFixed(1)}板 ${s.apg.toFixed(1)}助 胜率${(s.winRate*100).toFixed(0)}%`));

console.log('\n=== MIP 样本（前5）===');
samples.mip.forEach(s => console.log(`  [${s.year}] ${s.n} ovr${s.ovr}(Δ${s.ovrDelta>=0?'+':''}${s.ovrDelta}) | 本季 ${s.ppg.toFixed(1)}分${s.rpg.toFixed(1)}板${s.apg.toFixed(1)}助 | 上季 ${s.lastPpg.toFixed(1)}分${s.lastRpg.toFixed(1)}板${s.lastApg.toFixed(1)}助 | 提升 +${s.ppgDelta.toFixed(1)}分+${s.rpgDelta.toFixed(1)}板+${s.apgDelta.toFixed(1)}助`));

console.log('\n=== FMVP 样本（前5）===');
samples.fmvp.forEach(s => console.log(`  [${s.year}] ${s.n} (${s.teamId}) 冠军:${s.champ} | ${s.ppg}分 ${s.rpg}板 ${s.apg}助 ${s.spg}断 ${s.bpg}帽 | 命中${(s.fgPct*100).toFixed(1)}% | ${s.gp}场均${s.min}分钟`));

// 验证 FMVP 来自冠军队（FMVP 球队 = 冠军球队）
const fmvpFromChamp = samples.fmvp.every(s => {
    const champ = state.champions.find(c => c.year === s.year);
    return champ && champ.finalsMVP && champ.finalsMVP.n === s.n && champ.team === s.teamId;
});
console.log(`\n[校验] FMVP 数据完整性: ${fmvpFromChamp ? 'OK' : 'FAIL'}`);

// 验证东西部MVP正确分类
const teamConf = {};
TEAMS_DATA.forEach(t => { teamConf[t.id] = t.conf; });
const eastOk = samples.eastMvp.every(s => teamConf[s.teamId] === 'East');
const westOk = samples.westMvp.every(s => teamConf[s.teamId] === 'West');
console.log(`[校验] 东部MVP 球队归属: ${eastOk ? 'OK' : 'FAIL'}`);
console.log(`[校验] 西部MVP 球队归属: ${westOk ? 'OK' : 'FAIL'}`);

console.log('\n=== 验证完成 ===');
