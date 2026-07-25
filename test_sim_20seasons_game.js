// 20 赛季模拟测试 —— 聚焦比赛模拟/阵容完整性/排名/季后赛/球员能力分布
// 不修改任何源代码，仅作研究与分析
const fs = require('fs'), path = require('path'), vm = require('vm');

// ============================================================
// 1. 构建 vm 沙箱并加载引擎
// ============================================================
const sandbox = {
    console, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean,
    parseInt, parseFloat, isNaN,
    setTimeout: () => {}, clearTimeout: () => {},
    document: {
        getElementById: () => ({ innerHTML: '', classList: { add: () => {}, remove: () => {}, toggle: () => {} }, addEventListener: () => {}, scrollTop: 0 }),
        querySelectorAll: () => [],
    },
    localStorage: { getItem: () => null, setItem: () => {} },
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

const baseDir = path.join(__dirname, 'js');
const load = rel => vm.runInContext(fs.readFileSync(path.join(baseDir, rel), 'utf8'), sandbox, { filename: rel });

load('data/teams.js');
load('data/players.js');
load('data/rookies.js');
// 跳过 nba_stats.js：依赖 fetch，本模拟不需要真实历史数据
load('engine/simulation.js');
load('engine/season.js');
load('engine/trade.js');
load('engine/draft.js');

const SimEngine = sandbox.SimEngine;
const SeasonEngine = sandbox.SeasonEngine;
const TradeEngine = sandbox.TradeEngine;
const DraftEngine = sandbox.DraftEngine;

// ============================================================
// 2. 检查球员字段结构
// ============================================================
console.log('=== PLAYERS_DATA[0] 字段结构 ===');
console.log(JSON.stringify(sandbox.PLAYERS_DATA[0]));
console.log('PLAYERS_DATA 总数:', sandbox.PLAYERS_DATA.length);

// ============================================================
// 3. 辅助函数
// ============================================================
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function std(arr) { if (arr.length < 2) return 0; const m = mean(arr); return Math.sqrt(mean(arr.map(x => (x - m) ** 2))); }
function pct(arr, p) { if (!arr.length) return 0; const sorted = [...arr].sort((a, b) => a - b); return sorted[Math.floor(sorted.length * p)]; }

const FIRST_NAMES = sandbox.ROOKIE_PROTOTYPES.firstNames;
const LAST_NAMES = sandbox.ROOKIE_PROTOTYPES.lastNames;
const POS_PROFILES = sandbox.ROOKIE_POS_PROFILES;

let fillerCounter = 0;
function makeFiller(teamId) {
    const positions = ["PG", "SG", "SF", "PF", "C"];
    const pos = positions[fillerCounter % 5];
    const profile = POS_PROFILES[pos];
    const ovr = randInt(62, 70);
    const v = () => randInt(-4, 4);
    const fn = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const ln = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    return {
        id: `filler_${fillerCounter++}`,
        n: `${fn}·${ln}`,
        t: teamId,
        p: pos,
        a: randInt(22, 32),
        o: ovr,
        pot: ovr + randInt(0, 2),
        sal: Math.round(TradeEngine.salaryForOvr(ovr) * (0.6 + Math.random() * 0.5) * 10) / 10,
        ins: clamp(profile.ins + v(), 40, 72),
        sh: clamp(profile.sh + v(), 40, 74),
        pa: clamp(profile.pa + v(), 35, 72),
        re: clamp(profile.re + v(), 35, 75),
        de: clamp(profile.de + v(), 40, 74),
        at: clamp(profile.at + v(), 50, 80),
        iq: clamp(profile.iq + v(), 50, 76),
        draftYear: undefined,
        yrsInLeague: randInt(1, 8),
        isFiller: true,
        isRookie: false,
        injured: 0,
    };
}

function makeRoomForRookie(teamId, teamsPlayers, players) {
    while (teamsPlayers[teamId].length >= 15) {
        let toRelease = null;
        const fillers = teamsPlayers[teamId].filter(p => p.isFiller);
        if (fillers.length > 0) {
            fillers.sort((a, b) => a.o - b.o);
            toRelease = fillers[0];
        } else {
            toRelease = [...teamsPlayers[teamId]].sort((a, b) => a.o - b.o)[0];
        }
        if (!toRelease) break;
        const idx = teamsPlayers[teamId].findIndex(p => p.id === toRelease.id);
        if (idx >= 0) teamsPlayers[teamId].splice(idx, 1);
    }
}

// ============================================================
// 4. 初始化 state
// ============================================================
const teams = JSON.parse(JSON.stringify(sandbox.TEAMS_DATA));
const players = sandbox.PLAYERS_DATA.map((p, i) => ({
    ...p,
    id: `p_${i}`,
    pot: p.o + randInt(0, 4),
    isRookie: false,
    isFiller: false,
    injured: 0,
    draftYear: undefined,
    yrsInLeague: randInt(1, 12),
}));

const teamsPlayers = {};
teams.forEach(t => teamsPlayers[t.id] = []);
players.forEach(p => { if (teamsPlayers[p.t]) teamsPlayers[p.t].push(p); });

// 每队补足 14 人
teams.forEach(t => {
    while (teamsPlayers[t.id].length < 14) {
        const fp = makeFiller(t.id);
        players.push(fp);
        teamsPlayers[t.id].push(fp);
    }
});

const state = {
    teams,
    players,
    teamsPlayers,
    records: {},
    statAccum: {},
    year: 2026,
};
teams.forEach(t => {
    state.records[t.id] = { win: 0, loss: 0, streak: 0, ptsFor: 0, ptsAgt: 0 };
    state.statAccum[t.id] = {};
});

// 初始阵容检查
{
    let minR = Infinity, maxR = -Infinity;
    teams.forEach(t => {
        const sz = teamsPlayers[t.id].length;
        if (sz < minR) minR = sz;
        if (sz > maxR) maxR = sz;
    });
    console.log(`\n=== 初始阵容 ===`);
    console.log(`球队人数范围: ${minR}-${maxR}, 总球员: ${players.length}`);
    const realCounts = teams.map(t => teamsPlayers[t.id].filter(p => !p.isFiller).length);
    console.log(`每队真实球员数: ${Math.min(...realCounts)}-${Math.max(...realCounts)} (均值 ${mean(realCounts).toFixed(1)})`);
}

// ============================================================
// 5. 20 赛季模拟主循环
// ============================================================
const NUM_SEASONS = 20;
const seasonResults = [];
const championCounts = {};  // 总冠军分布
const lastPlaceCounts = {};  // 垫底分布（胜率最低）
const t0overall = Date.now();

for (let s = 0; s < NUM_SEASONS; s++) {
    const t0season = Date.now();
    const seasonYear = state.year;

    // --- 新赛季：清除赛季交易标记 ---
    TradeEngine.resetTradeFlags(state);

    // --- 重置 records & statAccum ---
    teams.forEach(t => {
        state.records[t.id] = { win: 0, loss: 0, streak: 0, ptsFor: 0, ptsAgt: 0 };
        state.statAccum[t.id] = {};
    });

    // --- 生成赛程 ---
    const schedule = SeasonEngine.generateSchedule(state.teams);

    // --- 赛季指标容器 ---
    let gamesPlayed = 0;
    let homeWins = 0, awayWins = 0;
    let totalHomeScore = 0, totalAwayScore = 0;
    let otGames = 0;
    let ghostGames = 0;
    let lowScoreGames = 0;   // 任意一方 < 80
    let highScoreGames = 0;  // 任意一方 > 140
    let allScores = [];
    let allMargins = [];
    let rotationSizes = [];
    let minPlayerMins = [];
    let totalInjuries = 0;
    let rosterSizeIssues = 0;
    // 抽样：每 200 场取 1 场存详情
    let sampleBox = [];

    // --- 遍历比赛日 ---
    for (let dayIdx = 0; dayIdx < schedule.length; dayIdx++) {
        const day = schedule[dayIdx];

        // 每天恢复伤病（-1 天）
        state.players.forEach(p => {
            if (p.injured && p.injured > 0) p.injured = Math.max(0, p.injured - 1);
        });

        // 模拟当天比赛
        for (const g of day) {
            const homeP = state.teamsPlayers[g.home];
            const awayP = state.teamsPlayers[g.away];
            // 名单完整性检查
            if (!homeP || homeP.length < 5 || !awayP || awayP.length < 5) {
                rosterSizeIssues++;
            }
            const res = SimEngine.simulateGame(homeP, awayP);

            gamesPlayed++;
            totalHomeScore += res.home.score;
            totalAwayScore += res.away.score;
            allScores.push(res.home.score, res.away.score);
            allMargins.push(Math.abs(res.home.score - res.away.score));
            if (res.winner === "home") homeWins++; else awayWins++;
            if (res.ot > 0) otGames++;
            if (res.home.score === 0 || res.away.score === 0) ghostGames++;
            if (res.home.score < 80 || res.away.score < 80) lowScoreGames++;
            if (res.home.score > 140 || res.away.score > 140) highScoreGames++;

            // 轮换大小（用 lines.length 等价于 rotation.length）
            const hRotSize = res.home.lines.length;
            const aRotSize = res.away.lines.length;
            rotationSizes.push(hRotSize, aRotSize);
            if (hRotSize > 0) minPlayerMins.push(Math.min(...res.home.lines.map(l => l.min)));
            if (aRotSize > 0) minPlayerMins.push(Math.min(...res.away.lines.map(l => l.min)));

            // 更新 records
            const hr = state.records[g.home];
            const ar = state.records[g.away];
            hr.ptsFor += res.home.score; hr.ptsAgt += res.away.score;
            ar.ptsFor += res.away.score; ar.ptsAgt += res.home.score;
            if (res.winner === "home") {
                hr.win++; hr.streak = hr.streak >= 0 ? hr.streak + 1 : 1;
                ar.loss++; ar.streak = ar.streak <= 0 ? ar.streak - 1 : -1;
            } else {
                ar.win++; ar.streak = ar.streak >= 0 ? ar.streak + 1 : 1;
                hr.loss++; hr.streak = hr.streak <= 0 ? hr.streak - 1 : -1;
            }

            // 伤病判定
            [g.home, g.away].forEach((teamId, idx) => {
                const rot = idx === 0 ? res.home.lines.map(l => l) : res.away.lines;
                const injuries = SimEngine.rollInjuries(rot);
                injuries.forEach(inj => {
                    const p = state.players.find(x => x.id === inj.playerId);
                    if (p && !p.injured) {
                        p.injured = inj.days;
                        totalInjuries++;
                    }
                });
            });

            // 抽样
            if (gamesPlayed % 200 === 1) {
                sampleBox.push({ home: g.home, away: g.away, hs: res.home.score, as: res.away.score, ot: res.ot, hRot: hRotSize, aRot: aRotSize });
            }
        }

        // 每天一次 AI 交易
        TradeEngine.runAiTrades(state, 1);
    }

    // --- 赛季末：统计同时受伤人数 ---
    let maxSimulInjured = 0;
    let teamsWithHighInjury = [];
    teams.forEach(t => {
        let cnt = 0;
        state.teamsPlayers[t.id].forEach(p => { if (p.injured && p.injured > 0) cnt++; });
        if (cnt > maxSimulInjured) maxSimulInjured = cnt;
        if (cnt >= 5) teamsWithHighInjury.push({ team: t.id, cnt });
    });

    // --- 排名 ---
    const standings = SeasonEngine.computeStandings(state.teams, state.records);
    const east8 = standings.east.slice(0, 8);
    const west8 = standings.west.slice(0, 8);
    const allStandings = [...standings.east, ...standings.west];
    const winRates = allStandings.map(e => e.winRate);
    const wins = allStandings.map(e => e.win);

    // 验证每队 82 场
    let gamesPerTeamIssues = 0;
    teams.forEach(t => {
        const r = state.records[t.id];
        if (r.win + r.loss !== 82) gamesPerTeamIssues++;
    });

    // --- 季后赛 ---
    const po = {
        east: SeasonEngine.setupPlayoffs(standings).east,
        west: SeasonEngine.setupPlayoffs(standings).west,
    };
    const exits = {};
    const allSeries = [];

    function playRound(pairings, roundNum) {
        const results = SeasonEngine.simulatePlayoffRound(pairings, state.teamsPlayers);
        results.forEach(r => {
            const loser = r.high.teamId === r.winner.teamId ? r.low : r.high;
            exits[loser.teamId] = roundNum;
            const sweep = (r.highWins === 4 && r.lowWins === 0) || (r.lowWins === 4 && r.highWins === 0);
            const winnerEntry = r.winner;
            const loserEntry = loser;
            const upset = winnerEntry.seed > loserEntry.seed;
            allSeries.push({
                round: roundNum,
                highSeed: r.high.seed, lowSeed: r.low.seed,
                highWins: r.highWins, lowWins: r.lowWins,
                winnerSeed: winnerEntry.seed, loserSeed: loserEntry.seed,
                sweep, upset, games: r.games.length,
                highTeam: r.high.teamId, lowTeam: r.low.teamId, winnerTeam: winnerEntry.teamId,
            });
        });
        return results;
    }

    // R1
    let eastRes = playRound(po.east, 1);
    let westRes = playRound(po.west, 1);
    let eastNext = SeasonEngine.nextRound(eastRes);
    let westNext = SeasonEngine.nextRound(westRes);
    // R2
    eastRes = playRound(eastNext, 2);
    westRes = playRound(westNext, 2);
    eastNext = SeasonEngine.nextRound(eastRes);
    westNext = SeasonEngine.nextRound(westRes);
    // R3 分区决赛
    eastRes = playRound(eastNext, 3);
    westRes = playRound(westNext, 3);
    const eastChamp = eastRes[0].winner;
    const westChamp = westRes[0].winner;
    // R4 总决赛
    const eWR = eastChamp.winRate, wWR = westChamp.winRate;
    const finalsPair = eWR >= wWR ? { high: eastChamp, low: westChamp } : { high: westChamp, low: eastChamp };
    const finalsRes = SeasonEngine.simulatePlayoffRound([finalsPair], state.teamsPlayers)[0];
    const champion = finalsRes.winner;
    const finalsLoser = finalsPair.high.teamId === champion.teamId ? finalsPair.low : finalsPair.high;
    exits[finalsLoser.teamId] = 4;
    exits[champion.teamId] = 5;
    allSeries.push({
        round: 4,
        highSeed: finalsPair.high.seed, lowSeed: finalsPair.low.seed,
        highWins: finalsRes.highWins, lowWins: finalsRes.lowWins,
        winnerSeed: champion.seed, loserSeed: finalsLoser.seed,
        sweep: (finalsRes.highWins === 4 && finalsRes.lowWins === 0) || (finalsRes.lowWins === 4 && finalsRes.highWins === 0),
        upset: champion.seed > finalsLoser.seed,
        games: finalsRes.games.length,
        highTeam: finalsPair.high.teamId, lowTeam: finalsPair.low.teamId, winnerTeam: champion.teamId,
    });

    // 季后赛统计
    const sweeps = allSeries.filter(s => s.sweep).length;
    const upsets = allSeries.filter(s => s.upset).length;
    const finalsSweep = allSeries.filter(s => s.round === 4 && s.sweep).length;
    const finalsGames = allSeries.filter(s => s.round === 4)[0].games;
    const r1Sweeps = allSeries.filter(s => s.round === 1 && s.sweep).length;

    // --- 球员能力分布 ---
    const allActivePlayers = [];
    teams.forEach(t => state.teamsPlayers[t.id].forEach(p => allActivePlayers.push(p)));
    const ovrs = allActivePlayers.map(p => p.o);
    const avgOvr = mean(ovrs);
    const ovr90 = allActivePlayers.filter(p => p.o >= 90).length;
    const ovr85 = allActivePlayers.filter(p => p.o >= 85).length;
    const ovr80 = allActivePlayers.filter(p => p.o >= 80).length;
    const ovrLt65 = allActivePlayers.filter(p => p.o < 65).length;

    // 新秀 ovr
    const rookies = allActivePlayers.filter(p => p.draftYear === seasonYear);
    const rookieOvrs = rookies.map(p => p.o);

    // teamRating 分布
    const teamRatings = teams.map(t => SimEngine.teamRating(state.teamsPlayers[t.id]));

    // 阵容完整性
    let rosterMin = Infinity, rosterMax = -Infinity;
    let rosterUnder14 = 0, rosterOver15 = 0;
    teams.forEach(t => {
        const sz = state.teamsPlayers[t.id].length;
        if (sz < rosterMin) rosterMin = sz;
        if (sz > rosterMax) rosterMax = sz;
        if (sz < 14) rosterUnder14++;
        if (sz > 15) rosterOver15++;
    });

    // --- 记录赛季结果 ---
    const champId = champion.teamId;
    championCounts[champId] = (championCounts[champId] || 0) + 1;
    const lastPlaceTeam = allStandings[allStandings.length - 1].teamId;
    lastPlaceCounts[lastPlaceTeam] = (lastPlaceCounts[lastPlaceTeam] || 0) + 1;

    const result = {
        season: s + 1,
        year: seasonYear,
        gamesPlayed,
        avgHomeScore: +(totalHomeScore / gamesPlayed).toFixed(1),
        avgAwayScore: +(totalAwayScore / gamesPlayed).toFixed(1),
        homeWinRate: +(homeWins / gamesPlayed).toFixed(3),
        otRate: +(otGames / gamesPlayed).toFixed(3),
        ghostGames,
        lowScoreGames,
        highScoreGames,
        scoreMin: Math.min(...allScores),
        scoreMax: Math.max(...allScores),
        scoreMean: +mean(allScores).toFixed(1),
        scoreStd: +std(allScores).toFixed(1),
        marginMean: +mean(allMargins).toFixed(1),
        avgMarginP90: +pct(allMargins, 0.9).toFixed(1),
        rotationMin: Math.min(...rotationSizes),
        rotationMax: Math.max(...rotationSizes),
        rotationMean: +mean(rotationSizes).toFixed(2),
        rotationUnder6: rotationSizes.filter(x => x < 6).length,
        minPlayerMinAvg: +mean(minPlayerMins).toFixed(1),
        minPlayerMinMin: Math.min(...minPlayerMins),
        totalInjuries,
        maxSimulInjured,
        teamsWithHighInjury: teamsWithHighInjury.length,
        rosterMin, rosterMax, rosterUnder14, rosterOver15,
        gamesPerTeamIssues,
        // 排名
        east1: { team: east8[0].teamId, win: east8[0].win, loss: east8[0].loss, wr: +east8[0].winRate.toFixed(3) },
        east8: { team: east8[7].teamId, win: east8[7].win, loss: east8[7].loss, wr: +east8[7].winRate.toFixed(3) },
        west1: { team: west8[0].teamId, win: west8[0].win, loss: west8[0].loss, wr: +west8[0].winRate.toFixed(3) },
        west8: { team: west8[7].teamId, win: west8[7].win, loss: west8[7].loss, wr: +west8[7].winRate.toFixed(3) },
        bestWin: Math.max(...wins),
        worstWin: Math.min(...wins),
        bestWr: +Math.max(...winRates).toFixed(3),
        worstWr: +Math.min(...winRates).toFixed(3),
        // 季后赛
        champion: champId,
        championSeed: champion.seed,
        finalsLoser: finalsLoser.teamId,
        finalsLoserSeed: finalsLoser.seed,
        finalsScore: `${finalsRes.highWins}-${finalsRes.lowWins}`,
        finalsGames,
        finalsSweep,
        r1Sweeps,
        totalSweeps: sweeps,
        totalUpsets: upsets,
        totalSeries: allSeries.length,
        // 球员能力
        avgOvr: +avgOvr.toFixed(2),
        ovr90, ovr85, ovr80, ovrLt65,
        rookieCount: rookies.length,
        rookieOvrMean: rookies.length ? +mean(rookieOvrs).toFixed(1) : null,
        rookieOvrMin: rookies.length ? Math.min(...rookieOvrs) : null,
        rookieOvrMax: rookies.length ? Math.max(...rookieOvrs) : null,
        teamRatingMin: +Math.min(...teamRatings).toFixed(1),
        teamRatingMax: +Math.max(...teamRatings).toFixed(1),
        teamRatingMean: +mean(teamRatings).toFixed(1),
        teamRatingStd: +std(teamRatings).toFixed(1),
        activePlayers: allActivePlayers.length,
    };
    seasonResults.push(result);

    const dt = Date.now() - t0season;
    console.log(`[S${s + 1}] ${seasonYear}-${seasonYear + 1} | 冠军:${champId}(${champion.seed}) | 东1:${east8[0].teamId}(${east8[0].win}胜) 东8:${east8[7].teamId}(${east8[7].win}胜) | 西1:${west8[0].teamId}(${west8[0].win}胜) | 均${result.avgHomeScore}-${result.avgAwayScore} 主胜率${result.homeWinRate} OT${result.otRate} | 横扫${sweeps}/${allSeries.length} | avgOvr${result.avgOvr} ovr90=${ovr90} | ${dt}ms`);

    // --- 休赛期 ---
    // 1) 成长 & 退役
    const progression = SeasonEngine.offseasonProgression(state.players);
    const retired = progression.retired;
    const retiredIds = new Set(retired.map(p => p.id));
    // 2) 移除退役
    teams.forEach(t => {
        state.teamsPlayers[t.id] = state.teamsPlayers[t.id].filter(p => !retiredIds.has(p.id));
    });
    // 3) 修剪超额至 15
    const releasedIds = new Set();
    teams.forEach(t => {
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
            releasedIds.add(toRelease.id);
        }
    });
    // 4) 重建 players 数组
    state.players = [];
    teams.forEach(t => state.teamsPlayers[t.id].forEach(p => state.players.push(p)));
    // 4.5) 强制执行硬帽：超帽球队释放最低性价比球员
    SeasonEngine.enforceHardCap(state);
    // 5) 补充 filler 至 14
    teams.forEach(t => {
        while (state.teamsPlayers[t.id].length < 14) {
            const fp = makeFiller(t.id);
            state.players.push(fp);
            state.teamsPlayers[t.id].push(fp);
        }
    });
    // 6) 选秀
    state.year++;
    const rookieClass = DraftEngine.generateRookieClass(state.year);
    const standingsData = teams.map(t => {
        const r = state.records[t.id];
        const madePlayoffs = standings.east.slice(0, 8).some(e => e.teamId === t.id) || standings.west.slice(0, 8).some(e => e.teamId === t.id);
        const playoffExitRound = madePlayoffs ? (exits[t.id] || 1) : 0;
        return { teamId: t.id, win: r.win, loss: r.loss, madePlayoffs, playoffExitRound };
    });
    const order = DraftEngine.determineDraftOrder(standingsData);
    const draftOrder = order.firstRound.concat(order.secondRound).map(s => s.teamId);
    for (let pick = 0; pick < draftOrder.length; pick++) {
        const owner = draftOrder[pick];
        const available = rookieClass.filter(r => r.t === null);
        const roster = state.teamsPlayers[owner];
        const rookie = DraftEngine.aiPick(available, roster);
        if (rookie) {
            makeRoomForRookie(owner, state.teamsPlayers, state.players);
            DraftEngine.assignRookieToTeam(rookie, owner, pick + 1);
            state.teamsPlayers[owner].push(rookie);
            state.players.push(rookie);
        }
    }
    // 7) 再补充 filler（防止选秀后名单异常）
    teams.forEach(t => {
        while (state.teamsPlayers[t.id].length < 14) {
            const fp = makeFiller(t.id);
            state.players.push(fp);
            state.teamsPlayers[t.id].push(fp);
        }
    });
    // 8) 清空伤病
    state.players.forEach(p => p.injured = 0);
}

const totalDt = Date.now() - t0overall;
console.log(`\n=== 20 赛季模拟完成，总耗时 ${totalDt}ms ===\n`);

// ============================================================
// 6. 汇总分析
// ============================================================
const summary = {
    seasons: seasonResults,
    championCounts,
    lastPlaceCounts,
    // 聚合统计
    avgHomeScoreAll: +mean(seasonResults.map(r => r.avgHomeScore)).toFixed(2),
    avgAwayScoreAll: +mean(seasonResults.map(r => r.avgAwayScore)).toFixed(2),
    homeWinRateAll: +mean(seasonResults.map(r => r.homeWinRate)).toFixed(3),
    homeWinRateMin: +Math.min(...seasonResults.map(r => r.homeWinRate)).toFixed(3),
    homeWinRateMax: +Math.max(...seasonResults.map(r => r.homeWinRate)).toFixed(3),
    otRateAll: +mean(seasonResults.map(r => r.otRate)).toFixed(3),
    otRateMin: +Math.min(...seasonResults.map(r => r.otRate)).toFixed(3),
    otRateMax: +Math.max(...seasonResults.map(r => r.otRate)).toFixed(3),
    totalGhostGames: seasonResults.reduce((s, r) => s + r.ghostGames, 0),
    totalLowScoreGames: seasonResults.reduce((s, r) => s + r.lowScoreGames, 0),
    totalHighScoreGames: seasonResults.reduce((s, r) => s + r.highScoreGames, 0),
    scoreMinEver: Math.min(...seasonResults.map(r => r.scoreMin)),
    scoreMaxEver: Math.max(...seasonResults.map(r => r.scoreMax)),
    rotationMinEver: Math.min(...seasonResults.map(r => r.rotationMin)),
    rotationUnder6Total: seasonResults.reduce((s, r) => s + r.rotationUnder6, 0),
    avgOvrAll: +mean(seasonResults.map(r => r.avgOvr)).toFixed(2),
    avgOvrMin: Math.min(...seasonResults.map(r => r.avgOvr)),
    avgOvrMax: Math.max(...seasonResults.map(r => r.avgOvr)),
    ovr90Avg: +mean(seasonResults.map(r => r.ovr90)).toFixed(1),
    ovr90Min: Math.min(...seasonResults.map(r => r.ovr90)),
    ovr90Max: Math.max(...seasonResults.map(r => r.ovr90)),
    rookieOvrMeanAll: +mean(seasonResults.filter(r => r.rookieOvrMean != null).map(r => r.rookieOvrMean)).toFixed(2),
    bestWinAvg: +mean(seasonResults.map(r => r.bestWin)).toFixed(1),
    worstWinAvg: +mean(seasonResults.map(r => r.worstWin)).toFixed(1),
    east1WinAvg: +mean(seasonResults.map(r => r.east1.win)).toFixed(1),
    east8WinAvg: +mean(seasonResults.map(r => r.east8.win)).toFixed(1),
    west1WinAvg: +mean(seasonResults.map(r => r.west1.win)).toFixed(1),
    west8WinAvg: +mean(seasonResults.map(r => r.west8.win)).toFixed(1),
    sweepRateAvg: +(mean(seasonResults.map(r => r.totalSweeps / r.totalSeries))).toFixed(3),
    finalsSweepTotal: seasonResults.reduce((s, r) => s + r.finalsSweep, 0),
    finalsGamesAvg: +mean(seasonResults.map(r => r.finalsGames)).toFixed(2),
    upsetRateAvg: +(mean(seasonResults.map(r => r.totalUpsets / r.totalSeries))).toFixed(3),
    teamRatingMeanAll: +mean(seasonResults.map(r => r.teamRatingMean)).toFixed(2),
    teamRatingStdAvg: +mean(seasonResults.map(r => r.teamRatingStd)).toFixed(2),
    totalRosterIssues: seasonResults.reduce((s, r) => s + r.rosterUnder14 + r.rosterOver15 + r.gamesPerTeamIssues, 0),
    totalInjuries: seasonResults.reduce((s, r) => s + r.totalInjuries, 0),
    avgInjuriesPerSeason: +mean(seasonResults.map(r => r.totalInjuries)).toFixed(1),
    maxSimulInjuredEver: Math.max(...seasonResults.map(r => r.maxSimulInjured)),
};

console.log('=== 汇总统计 ===');
console.log(JSON.stringify(summary, null, 2));

console.log('\n=== 总冠军分布 ===');
Object.entries(championCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v} 次`));

console.log('\n=== 垫底分布（胜率最低）===');
Object.entries(lastPlaceCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v} 次`));

console.log('\n=== 各赛季详情 ===');
console.log('赛季 | 冠军(种子) | 东1胜 东8胜 | 西1胜 西8胜 | 最差 最佳 | 均分(主-客) 主胜率 OT率 | 横扫/总系列 | avgOvr ovr90 | 轮换范围 5人轮换场 | 总伤');
seasonResults.forEach(r => {
    console.log(`S${r.season} | ${r.champion}(${r.championSeed}) | ${r.east1.win} ${r.east8.win} | ${r.west1.win} ${r.west8.win} | ${r.worstWin} ${r.bestWin} | ${r.avgHomeScore}-${r.avgAwayScore} ${r.homeWinRate} ${r.otRate} | ${r.totalSweeps}/${r.totalSeries} | ${r.avgOvr} ${r.ovr90} | ${r.rotationMin}-${r.rotationMax} ${r.rotationUnder6} | ${r.totalInjuries}`);
});

console.log('\n=== 球员能力曲线（avgOvr / ovr90 / ovr85 / ovr80）===');
seasonResults.forEach(r => {
    console.log(`S${r.season}: avgOvr=${r.avgOvr} ovr90=${r.ovr90} ovr85=${r.ovr85} ovr80=${r.ovr80} ovr<65=${r.ovrLt65} | 新秀ovr均值=${r.rookieOvrMean} (${r.rookieOvrMin}-${r.rookieOvrMax}, n=${r.rookieCount}) | teamRating=${r.teamRatingMean}±${r.teamRatingStd} (${r.teamRatingMin}-${r.teamRatingMax})`);
});

console.log('\n=== 比赛比分抽样 ===');
seasonResults.forEach(r => {
    // 重新取每季第一场抽样
});
// 输出每个赛季的极端比分
console.log('赛季 | 最低分 最高分 | 低分场(<80) 高分场(>140) 幽灵场 | 均分±std | 最大分位90%');
seasonResults.forEach(r => {
    console.log(`S${r.season} | ${r.scoreMin} ${r.scoreMax} | ${r.lowScoreGames} ${r.highScoreGames} ${r.ghostGames} | ${r.scoreMean}±${r.scoreStd} | marginP90=${r.avgMarginP90} avgMargin=${r.marginMean}`);
});

console.log('\n=== 季后赛详情 ===');
console.log('赛季 | 冠军(种子) 亚军(种子) 总决赛比分 场数 横扫? | R1横扫 总横扫/总系列 下克上');
seasonResults.forEach(r => {
    console.log(`S${r.season} | ${r.champion}(${r.championSeed}) ${r.finalsLoser}(${r.finalsLoserSeed}) ${r.finalsScore} ${r.finalsGames}场 ${r.finalsSweep ? '横扫' : '否'} | R1横扫${r.r1Sweeps} ${r.totalSweeps}/${r.totalSeries} ${r.totalUpsets}下克上`);
});

console.log('\n=== 阵容完整性 ===');
console.log('赛季 | 人数范围 <14队 >15队 | 每队82场问题数 | 最大同时受伤 | 高伤病队数(>=5)');
seasonResults.forEach(r => {
    console.log(`S${r.season} | ${r.rosterMin}-${r.rosterMax} ${r.rosterUnder14} ${r.rosterOver15} | ${r.gamesPerTeamIssues} | ${r.maxSimulInjured} | ${r.teamsWithHighInjury}`);
});

// 写出完整 JSON 供分析
const outPath = path.join(__dirname, 'test_sim_20seasons_results.json');
fs.writeFileSync(outPath, JSON.stringify({ summary, seasonResults, championCounts, lastPlaceCounts }, null, 2));
console.log(`\n完整结果已写入: ${outPath}`);
