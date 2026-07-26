// 验证第一赛季 MIP：用真实 NBA 历史数据预填 playerHistory
// 模拟 app.js 的 seedInitialPlayerHistory 逻辑，确认第一赛季 MIP 不再空缺

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {
    console, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean,
    parseInt, parseFloat, isNaN,
    setTimeout: () => {}, clearTimeout: () => {},
    fetch: async (url) => {
        // 拦截 nba_stats.js 的 fetch，加载本地 JSON
        let filePath;
        if (url.includes('nba_stats.json')) filePath = path.join(__dirname, 'js/data/nba_stats.json');
        else if (url.includes('name_map.json')) filePath = path.join(__dirname, 'js/data/name_map.json');
        else throw new Error('unexpected fetch: ' + url);
        const text = fs.readFileSync(filePath, 'utf8');
        return { ok: true, json: async () => JSON.parse(text) };
    },
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
const NBAStats = sandbox.NBAStats;

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
        id: `bench_${teamId}_${idx}`, n: `${fn}·${ln}_F${idx}`,
        t: teamId, p: pos, a: randInt(22, 32), o: ovr, pot: ovr + randInt(0, 2),
        sal: Math.round(TradeEngine.salaryForOvr(ovr) * (0.6 + Math.random() * 0.5) * 10) / 10,
        ins: clamp(profile.ins + v(), 40, 72), sh: clamp(profile.sh + v(), 40, 74),
        pa: clamp(profile.pa + v(), 35, 72), re: clamp(profile.re + v(), 35, 75),
        de: clamp(profile.de + v(), 40, 74), at: clamp(profile.at + v(), 50, 80),
        iq: clamp(profile.iq + v(), 50, 76), isRookie: false, isFiller: true, draftYear: null, yrsInLeague: 5,
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

// 镜像 app.js seedInitialPlayerHistory
function seedInitialPlayerHistory(state) {
    if (Object.keys(state.playerHistory).length > 0) return 0;
    const prevYear = state.year - 1;
    const nameMap = NBAStats.getNameMap();
    const stats = NBAStats.getStats();
    let seeded = 0;
    state.players.forEach(p => {
        const nbaId = nameMap[p.n];
        if (!nbaId) return;
        const nbaPlayer = stats[String(nbaId)];
        if (!nbaPlayer || !nbaPlayer.seasons || nbaPlayer.seasons.length === 0) return;
        let season = nbaPlayer.seasons.find(s => s.year === prevYear);
        if (!season) {
            const past = nbaPlayer.seasons.filter(s => s.year < state.year);
            if (past.length === 0) return;
            season = past[past.length - 1];
        }
        state.playerHistory[p.id] = [{
            year: prevYear, ovr: p.o, teamId: p.t, age: season.age || p.a,
            gp: season.gp || 0, min: season.min || 0,
            pts: season.pts || 0, reb: season.reb || 0, ast: season.ast || 0,
            stl: season.stl || 0, blk: season.blk || 0, tov: season.tov || 0, pf: season.pf || 0,
            fgm: season.fgm || 0, fga: season.fga || 0, tpm: season.fg3m || 0, tpa: season.fg3a || 0,
            ftm: season.ftm || 0, fta: season.fta || 0, oreb: season.oreb || 0,
            fg_pct: season.fg_pct || 0, fg3_pct: season.fg3_pct || 0, ft_pct: season.ft_pct || 0,
        }];
        seeded++;
    });
    return seeded;
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

(async () => {
    console.log('=== 加载真实 NBA 历史数据 ===');
    await NBAStats.ensureLoaded();
    console.log('NBA 数据加载完成，可匹配球员:', Object.keys(NBAStats.getStats()).length);

    const state = initState();
    console.log('[初始] 球员: ' + state.players.length + ', playerHistory 为空: ' + (Object.keys(state.playerHistory).length === 0));

    console.log('\n=== 测试 1: 未预填时第一赛季 MIP ===');
    simulateSeason(state);
    const awardsNoSeed = SeasonEngine.computeAwards(state);
    console.log('MIP: ' + (awardsNoSeed.mip ? awardsNoSeed.mip.player.n + ' ' + awardsNoSeed.mip.ppg.toFixed(1) + '分' : '空缺'));
    console.log('MIP Top5 数量: ' + (awardsNoSeed.mipTop5 ? awardsNoSeed.mipTop5.length : 0));

    console.log('\n=== 测试 2: 预填真实数据后第一赛季 MIP ===');
    // 重置 state 重新模拟
    const state2 = initState();
    const seeded = seedInitialPlayerHistory(state2);
    console.log('预填球员数: ' + seeded);
    console.log('playerHistory 已填充: ' + Object.keys(state2.playerHistory).length + ' 名球员');
    // 抽样：塔图姆的真实上赛季数据
    const tatum = state2.players.find(p => p.n === '杰森·塔图姆');
    if (tatum && state2.playerHistory[tatum.id]) {
        const last = state2.playerHistory[tatum.id][0];
        console.log('塔图姆上赛季(真实): ' + last.pts + '分 ' + last.reb + '板 ' + last.ast + '助 gp=' + last.gp);
    }

    simulateSeason(state2);
    const awardsSeeded = SeasonEngine.computeAwards(state2);
    console.log('\n预填后第一赛季奖项:');
    console.log('MVP: ' + (awardsSeeded.mvp ? awardsSeeded.mvp.player.n : '空缺'));
    console.log('东部MVP: ' + (awardsSeeded.eastMvp ? awardsSeeded.eastMvp.player.n : '空缺'));
    console.log('西部MVP: ' + (awardsSeeded.westMvp ? awardsSeeded.westMvp.player.n : '空缺'));
    console.log('MIP: ' + (awardsSeeded.mip
        ? awardsSeeded.mip.player.n + ' | 本季 ' + awardsSeeded.mip.ppg.toFixed(1) + '分' +
          awardsSeeded.mip.rpg.toFixed(1) + '板' + awardsSeeded.mip.apg.toFixed(1) + '助' +
          ' | 上季(真实) ' + awardsSeeded.mip.lastPpg.toFixed(1) + '分' +
          awardsSeeded.mip.lastRpg.toFixed(1) + '板' + awardsSeeded.mip.lastApg.toFixed(1) + '助' +
          ' | 提升 +' + awardsSeeded.mip.ppgDelta.toFixed(1) + '分'
        : '空缺'));
    console.log('MIP Top5:');
    (awardsSeeded.mipTop5 || []).forEach((c, i) => {
        console.log('  ' + (i+1) + '. ' + c.player.n + ' | 本季 ' + c.ppg.toFixed(1) + '分 vs 上季 ' + c.lastPpg.toFixed(1) + '分 (Δ+' + c.ppgDelta.toFixed(1) + ')');
    });

    console.log('\n=== 校验 ===');
    const firstSeasonMipOk = !!awardsSeeded.mip;
    const mipHasRealData = awardsSeeded.mip && awardsSeeded.mip.lastPpg > 0;
    console.log('第一赛季 MIP 当选: ' + (firstSeasonMipOk ? 'OK' : 'FAIL'));
    console.log('MIP 上赛季数据来自真实NBA: ' + (mipHasRealData ? 'OK' : 'FAIL'));
})();
