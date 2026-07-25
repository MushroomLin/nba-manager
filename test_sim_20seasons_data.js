// 20 赛季模拟测试 —— 聚焦球员数据统计 / 联盟榜单 / 奖项评选
// 不修改源代码，仅通过 vm 加载引擎并在 Node 中跑模拟

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
const SimEngine = sandbox.SimEngine;
const TradeEngine = sandbox.TradeEngine;
const DraftEngine = sandbox.DraftEngine;
const TEAMS_DATA = sandbox.TEAMS_DATA;
const PLAYERS_DATA = sandbox.PLAYERS_DATA;
const ROOKIE_PROTOTYPES = sandbox.ROOKIE_PROTOTYPES;
const ROOKIE_POS_PROFILES = sandbox.ROOKIE_POS_PROFILES;

// ============ helpers ============
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));

// 模拟 app.js 中 generateBenchPlayer 的逻辑（filler 球员）
let fillerIdCounter = 0;
function generateFiller(teamId) {
    const positions = ["PG", "SG", "SF", "PF", "C"];
    const pos = positions[fillerIdCounter % 5];
    const profile = ROOKIE_POS_PROFILES[pos];
    const ovr = randInt(62, 70);
    const v = () => randInt(-4, 4);
    const fn = ROOKIE_PROTOTYPES.firstNames[Math.floor(Math.random() * ROOKIE_PROTOTYPES.firstNames.length)];
    const ln = ROOKIE_PROTOTYPES.lastNames[Math.floor(Math.random() * ROOKIE_PROTOTYPES.lastNames.length)];
    // 名字加唯一后缀避免与历史 filler / 新秀重名
    const idx = fillerIdCounter++;
    const name = `${fn}·${ln}_F${idx}`;
    return {
        id: `bench_${teamId}_${idx}`,
        n: name,
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
        isRookie: false,
        isFiller: true,
        draftYear: null,
        yrsInLeague: 5,
    };
}

// ============ 初始化 state ============
function initState() {
    const teams = JSON.parse(JSON.stringify(TEAMS_DATA));
    // 深拷贝球员并赋 id/pot/isRookie，模拟 app.js init
    const players = PLAYERS_DATA.map((p, i) => ({
        ...p,
        id: `p_${i}`,
        pot: p.o + randInt(0, 4),
        isRookie: false,
        draftYear: null,
        yrsInLeague: 5, // 老将默认已过新秀期
    }));

    const teamsPlayers = {};
    teams.forEach(t => teamsPlayers[t.id] = []);
    players.forEach(p => { if (teamsPlayers[p.t]) teamsPlayers[p.t].push(p); });

    // 每队补足 14 人
    teams.forEach(t => {
        while (teamsPlayers[t.id].length < 14) {
            const fp = generateFiller(t.id);
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
        year: 2026,
        phase: 'regular',
        teams,
        players,
        teamsPlayers,
        records,
        schedule: null,
        currentDay: 0,
        standings: null,
        playoffs: null,
        freeAgents: [],
        rookieClass: [],
        draftOrder: null,
        draftPick: 0,
        statAccum,
        history: [],
        champions: [],
        awardsHistory: [],
        playerHistory: {},
        tactics: { pace: 1, defense: 1, rotation: 1 },
        injuryLog: [],
        tradeLog: [],
    };
}

// ============ accumulateStats (镜像 app.js) ============
function accumulateStats(state, teamId, line) {
    const acc = state.statAccum[teamId];
    if (!acc[line.player.id]) {
        acc[line.player.id] = { gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0 };
    }
    const s = acc[line.player.id];
    s.gp++; s.min += line.min;
    s.pts += line.pts; s.reb += line.reb; s.ast += line.ast; s.stl += line.stl; s.blk += line.blk; s.tov += line.tov; s.pf += line.pf;
    s.fgm += line.fgm; s.fga += line.fga; s.tpm += line.tpm; s.tpa += line.tpa; s.ftm += line.ftm; s.fta += line.fta; s.oreb += line.oreb || 0;
}

// ============ recordPlayerHistory (镜像 app.js) ============
function recordPlayerHistory(state) {
    const prevYear = state.year - 1;
    state.players.forEach(p => {
        if (p.draftYear === state.year) return; // 跳过刚选中的新秀
        if (!state.playerHistory[p.id]) state.playerHistory[p.id] = [];
        let hasRecord = false;
        state.teams.forEach(t => {
            const acc = state.statAccum[t.id] && state.statAccum[t.id][p.id];
            if (!acc || acc.gp === 0) return;
            hasRecord = true;
            const gp = acc.gp;
            const div = v => +(v / Math.max(1, gp)).toFixed(1);
            state.playerHistory[p.id].push({
                year: prevYear,
                ovr: p.o,
                teamId: t.id,
                age: p.a,
                gp: gp,
                min: div(acc.min),
                pts: div(acc.pts),
                reb: div(acc.reb),
                ast: div(acc.ast),
                stl: div(acc.stl),
                blk: div(acc.blk),
                tov: div(acc.tov),
                pf: div(acc.pf),
                fgm: div(acc.fgm),
                fga: div(acc.fga),
                tpm: div(acc.tpm),
                tpa: div(acc.tpa),
                ftm: div(acc.ftm),
                fta: div(acc.fta),
                oreb: div(acc.oreb),
                fg_pct: acc.fga > 0 ? +(acc.fgm / acc.fga).toFixed(3) : 0,
                fg3_pct: acc.tpa > 0 ? +(acc.tpm / acc.tpa).toFixed(3) : 0,
                ft_pct: acc.fta > 0 ? +(acc.ftm / acc.fta).toFixed(3) : 0,
            });
        });
        // 新秀首赛季即使 gp=0（未进轮换）也记录一条零数据行，保证生涯时间线连续
        if (!hasRecord && p.draftYear === prevYear) {
            state.playerHistory[p.id].push({
                year: prevYear,
                ovr: p.o,
                teamId: p.t,
                age: p.a,
                gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
                fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0,
                fg_pct: 0, fg3_pct: 0, ft_pct: 0,
            });
        }
    });
}

// ============ makeRoomForRookie (镜像 app.js) ============
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
        state.players = state.players.filter(p => p.id !== toRelease.id);
    }
}

// ============ 模拟一个赛季 ============
function simulateSeason(state) {
    // 新赛季开始：清除赛季交易标记（_tradedThisSeason），让球员重新可被交易
    TradeEngine.resetTradeFlags(state);

    // 重置 statAccum / records
    state.teams.forEach(t => {
        state.statAccum[t.id] = {};
        state.records[t.id] = { win: 0, loss: 0, streak: 0, ptsFor: 0, ptsAgt: 0 };
    });

    // 生成赛程
    const schedule = SeasonEngine.generateSchedule(state.teams);
    state.schedule = schedule;

    let totalGames = 0;
    let tradeCount = 0;
    let injurySkipped = 0;

    // 逐日模拟
    for (let day = 0; day < schedule.length; day++) {
        const games = schedule[day];
        for (const g of games) {
            const homePlayers = state.teamsPlayers[g.home];
            const awayPlayers = state.teamsPlayers[g.away];
            if (!homePlayers || !awayPlayers || homePlayers.length === 0 || awayPlayers.length === 0) {
                injurySkipped++;
                continue;
            }
            const res = SimEngine.simulateGame(homePlayers, awayPlayers);
            // 累积双方统计
            res.home.lines.forEach(l => accumulateStats(state, g.home, l));
            res.away.lines.forEach(l => accumulateStats(state, g.away, l));
            // 更新战绩
            const homeWin = res.winner === 'home';
            state.records[g.home][homeWin ? 'win' : 'loss']++;
            state.records[g.away][!homeWin ? 'win' : 'loss']++;
            state.records[g.home].ptsFor += res.home.score;
            state.records[g.home].ptsAgt += res.away.score;
            state.records[g.away].ptsFor += res.away.score;
            state.records[g.away].ptsAgt += res.home.score;
            totalGames++;
        }
        // 每天一次 AI 交易尝试
        const trades = TradeEngine.runAiTrades(state, 1);
        tradeCount += trades.length;
    }

    // 更新 standings
    state.standings = SeasonEngine.computeStandings(state.teams, state.records);

    return { totalGames, tradeCount, injurySkipped, days: schedule.length };
}

// ============ 休赛期处理 ============
function offseason(state) {
    // 1. state.year++ (进入新赛季年份，新秀 draftYear 用此)
    state.year++;
    // 2. 记录球员历史（基于刚结束赛季、成长前的 ovr）
    recordPlayerHistory(state);
    // 3. 球员成长与退役
    const prog = SeasonEngine.offseasonProgression(state.players);
    const retired = prog.retired;
    // 4. 清理退役球员
    if (retired.length > 0) {
        const retiredIds = new Set(retired.map(p => p.id));
        state.teams.forEach(t => {
            state.teamsPlayers[t.id] = state.teamsPlayers[t.id].filter(p => !retiredIds.has(p.id));
        });
        state.players = state.players.filter(p => !retiredIds.has(p.id));
    }
    // 5. 修剪超额名单至 15 人
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
            state.players = state.players.filter(p => p.id !== toRelease.id);
        }
    });
    // 5.5 强制执行硬帽：超帽球队释放最低性价比球员
    SeasonEngine.enforceHardCap(state);
    // 6. 选秀：生成新秀池，按战绩倒序分配（无季后赛模拟，用常规赛战绩）
    const rookieClass = DraftEngine.generateRookieClass(state.year);
    state.rookieClass = rookieClass;
    // 选秀顺位：未进"季后赛"的按战绩倒序；这里我们简化：所有球队按 win 升序
    const draftOrder = [...state.teams].sort((a, b) => {
        const wa = state.records[a.id].win;
        const wb = state.records[b.id].win;
        return wa - wb;
    }).map(t => t.id);
    // 2 轮 × 30 = 60 顺位
    state.draftOrder = [];
    for (let round = 0; round < 2; round++) {
        state.draftOrder.push(...draftOrder);
    }
    // 逐顺位选新秀
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
    // 7. 补足到 14 人（filler）
    state.teams.forEach(t => {
        while (state.teamsPlayers[t.id].length < 14) {
            const fp = generateFiller(t.id);
            state.players.push(fp);
            state.teamsPlayers[t.id].push(fp);
        }
    });
    // 8. 清空伤病
    state.players.forEach(p => p.injured = 0);

    return {
        retiredCount: retired.length,
        retiredNotable: retired.filter(p => !p.isFiller).slice(0, 5).map(p => ({ n: p.n, o: p.o, a: p.a })),
        rookiesDrafted: state.draftPick,
        progressionChanges: prog.changes.length,
    };
}

// ============ 聚合球员数据（处理交易）============
function aggregatePlayerStats(state) {
    const playerAgg = {};
    // pid -> { p, s(合并统计), gp, teamId, teamIds: Set }
    Object.entries(state.statAccum).forEach(([teamId, acc]) => {
        Object.entries(acc).forEach(([pid, s]) => {
            const p = state.players.find(x => x.id === pid);
            // 注意：退役球员已被移除，但 statAccum 仍可能有他们的记录；这里跳过
            if (!p) return;
            if (!playerAgg[pid]) {
                playerAgg[pid] = {
                    p,
                    s: { ...s },
                    gp: s.gp || 0,
                    teamId: p.t,
                    teamIds: new Set([teamId]),
                };
            } else {
                const dst = playerAgg[pid].s;
                const keys = ["gp", "min", "pts", "reb", "ast", "stl", "blk", "tov", "pf", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb"];
                keys.forEach(k => { dst[k] = (dst[k] || 0) + (s[k] || 0); });
                playerAgg[pid].gp = dst.gp;
                playerAgg[pid].teamIds.add(teamId);
            }
        });
    });
    return playerAgg;
}

// ============ 计算联盟榜单 ============
function computeLeaders(state, minGp = 20) {
    const agg = aggregatePlayerStats(state);
    const eligible = Object.values(agg).filter(x => x.gp >= minGp);

    const perGame = (s, key) => s[key] / Math.max(1, s.gp);

    const leader = (key) => {
        const sorted = [...eligible].sort((a, b) => perGame(b.s, key) - perGame(a.s, key));
        const top = sorted[0];
        if (!top) return null;
        return {
            name: top.p.n,
            ovr: top.p.o,
            teamId: top.teamId,
            teamIds: [...top.teamIds],
            gp: top.gp,
            value: +perGame(top.s, key).toFixed(2),
            ppg: +perGame(top.s, 'pts').toFixed(1),
            rpg: +perGame(top.s, 'reb').toFixed(1),
            apg: +perGame(top.s, 'ast').toFixed(1),
            multiTeam: top.teamIds.size > 1,
        };
    };

    return {
        pts: leader('pts'),
        reb: leader('reb'),
        ast: leader('ast'),
        stl: leader('stl'),
        blk: leader('blk'),
    };
}

// ============ 数据完整性检查 ============
function checkDataIntegrity(state) {
    const issues = [];
    const allFields = ["gp", "min", "pts", "reb", "ast", "stl", "blk", "tov", "pf", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb"];
    let playersChecked = 0;
    let playersWithStats = 0;

    Object.entries(state.statAccum).forEach(([teamId, acc]) => {
        Object.entries(acc).forEach(([pid, s]) => {
            playersChecked++;
            // 检查每个字段
            allFields.forEach(f => {
                const v = s[f];
                if (v == null) {
                    issues.push({ type: 'missing_field', teamId, pid, field: f });
                } else if (typeof v !== 'number') {
                    issues.push({ type: 'non_number', teamId, pid, field: f, value: v });
                } else if (Number.isNaN(v)) {
                    issues.push({ type: 'NaN', teamId, pid, field: f });
                } else if (!Number.isFinite(v)) {
                    issues.push({ type: 'Infinity', teamId, pid, field: f });
                } else if (v < 0) {
                    issues.push({ type: 'negative', teamId, pid, field: f, value: v });
                }
            });
            // gp 应为正整数
            if (s.gp > 0) playersWithStats++;
            if (s.gp > 0 && s.min === 0) {
                issues.push({ type: 'gp_positive_min_zero', teamId, pid, gp: s.gp });
            }
            // 异常高数据（场均 50+ 分等）
            if (s.gp > 0) {
                const ppg = s.pts / s.gp;
                const apg = s.ast / s.gp;
                const rpg = s.reb / s.gp;
                if (ppg > 50) issues.push({ type: 'extreme_pts', teamId, pid, ppg: +ppg.toFixed(1), gp: s.gp });
                if (apg > 25) issues.push({ type: 'extreme_ast', teamId, pid, apg: +apg.toFixed(1), gp: s.gp });
                if (rpg > 30) issues.push({ type: 'extreme_reb', teamId, pid, rpg: +rpg.toFixed(1), gp: s.gp });
            }
            // fgm > fga 等不合理
            if (s.fgm > s.fga) issues.push({ type: 'fgm_gt_fga', teamId, pid, fgm: s.fgm, fga: s.fga });
            if (s.tpm > s.tpa) issues.push({ type: 'tpm_gt_tpa', teamId, pid, tpm: s.tpm, tpa: s.tpa });
            if (s.ftm > s.fta) issues.push({ type: 'ftm_gt_fta', teamId, pid, ftm: s.ftm, fta: s.fta });
            if (s.oreb > s.reb) issues.push({ type: 'oreb_gt_reb', teamId, pid, oreb: s.oreb, reb: s.reb });
        });
    });

    return { issues, playersChecked, playersWithStats };
}

// ============ 主流程 ============
function main() {
    console.log('=== 20 赛季模拟测试开始 ===');
    console.log('PLAYERS_DATA 球员数:', PLAYERS_DATA.length, ' 球队数:', TEAMS_DATA.length);
    console.log('球员首条样例:', JSON.stringify(PLAYERS_DATA[0]).slice(0, 200));

    const state = initState();
    console.log('初始 state 球员数:', state.players.length, ' (各队人数:', state.teams.map(t => state.teamsPlayers[t.id].length).join(','), ')');

    const seasonsLog = [];
    const allIntegrityIssues = [];
    const t0 = Date.now();

    for (let s = 0; s < 20; s++) {
        const seasonStartYear = state.year;
        const tStart = Date.now();
        const simRes = simulateSeason(state);

        // 数据完整性检查
        const integrity = checkDataIntegrity(state);
        if (integrity.issues.length > 0) {
            allIntegrityIssues.push({ year: seasonStartYear, issues: integrity.issues });
        }

        // 计算榜单
        const leaders = computeLeaders(state);

        // 评选奖项
        const awards = SeasonEngine.computeAwards(state);
        state.awardsHistory.push(awards);

        // 收集本季摘要
        const summary = {
            seasonIdx: s + 1,
            year: seasonStartYear,
            totalGames: simRes.totalGames,
            days: simRes.days,
            tradeCount: simRes.tradeCount,
            injurySkipped: simRes.injurySkipped,
            playersChecked: integrity.playersChecked,
            playersWithStats: integrity.playersWithStats,
            integrityIssueCount: integrity.issues.length,
            leaders,
            mvp: awards.mvp ? {
                name: awards.mvp.player.n, ovr: awards.mvp.player.o,
                teamId: awards.mvp.teamId, ppg: +awards.mvp.ppg.toFixed(1),
                rpg: +awards.mvp.rpg.toFixed(1), apg: +awards.mvp.apg.toFixed(1),
                winRate: +awards.mvp.winRate.toFixed(3), gp: awards.mvp.gp,
                mvpScore: +awards.mvp.mvpScore.toFixed(1),
            } : null,
            dpoy: awards.dpoy ? {
                name: awards.dpoy.player.n, ovr: awards.dpoy.player.o,
                teamId: awards.dpoy.teamId, spg: +awards.dpoy.spg.toFixed(1),
                bpg: +awards.dpoy.bpg.toFixed(1), gp: awards.dpoy.gp,
            } : null,
            roy: awards.roy ? {
                name: awards.roy.player.n, ovr: awards.roy.player.o,
                teamId: awards.roy.teamId, ppg: +awards.roy.ppg.toFixed(1),
                rpg: +awards.roy.rpg.toFixed(1), apg: +awards.roy.apg.toFixed(1),
                draftYear: awards.roy.player.draftYear, gp: awards.roy.gp,
            } : null,
            mip: awards.mip ? {
                name: awards.mip.player.n, ovr: awards.mip.player.o,
                teamId: awards.mip.teamId, ovrDelta: awards.mip.ovrDelta,
                ppg: +awards.mip.ppg.toFixed(1), gp: awards.mip.gp,
            } : null,
            sixMan: awards.sixMan ? {
                name: awards.sixMan.player.n, ovr: awards.sixMan.player.o,
                teamId: awards.sixMan.teamId, ppg: +awards.sixMan.ppg.toFixed(1),
                isBench: awards.sixMan.isBench, gp: awards.sixMan.gp,
            } : null,
            allNBAFirst: (awards.allNBAFirstDetail || []).map(c => ({
                name: c.player.n, pos: c.player.p, ovr: c.player.o,
                teamId: c.teamId, ppg: +c.ppg.toFixed(1),
                multiTeam: c.gp > 0 && (c.gp !== state.statAccum[c.teamId]?.[c.player.id]?.gp),
            })),
            allRookieFirst: (awards.allRookieFirstDetail || []).map(c => ({
                name: c.player.n, pos: c.player.p, ovr: c.player.o,
                draftYear: c.player.draftYear, ppg: +c.ppg.toFixed(1), gp: c.gp,
            })),
        };
        seasonsLog.push(summary);

        const elapsed = Date.now() - tStart;
        console.log(`\n--- 第 ${s + 1} 季 (${seasonStartYear}-${seasonStartYear + 1}) 用时 ${elapsed}ms ---`);
        console.log(`  比赛 ${simRes.totalGames} 场 / ${simRes.days} 天 / 交易 ${simRes.tradeCount} 笔 / 跳过 ${simRes.injurySkipped}`);
        console.log(`  数据检查: ${integrity.playersWithStats}/${integrity.playersChecked} 球员有数据, 异常 ${integrity.issues.length} 项`);
        if (leaders.pts) console.log(`  得分王: ${leaders.pts.name}(${leaders.pts.teamId}) ${leaders.pts.value}分 gp=${leaders.pts.gp}${leaders.pts.multiTeam ? ' [交易过]' : ''}`);
        if (leaders.ast) console.log(`  助攻王: ${leaders.ast.name}(${leaders.ast.teamId}) ${leaders.ast.value}助 gp=${leaders.ast.gp}`);
        if (leaders.reb) console.log(`  篮板王: ${leaders.reb.name}(${leaders.reb.teamId}) ${leaders.reb.value}板 gp=${leaders.reb.gp}`);
        if (leaders.stl) console.log(`  抢断王: ${leaders.stl.name}(${leaders.stl.teamId}) ${leaders.stl.value}抢 gp=${leaders.stl.gp}`);
        if (leaders.blk) console.log(`  盖帽王: ${leaders.blk.name}(${leaders.blk.teamId}) ${leaders.blk.value}帽 gp=${leaders.blk.gp}`);
        if (summary.mvp) console.log(`  MVP: ${summary.mvp.name}(${summary.mvp.teamId}, ovr=${summary.mvp.ovr}, 胜率=${summary.mvp.winRate}) ${summary.mvp.ppg}分 ${summary.mvp.rpg}板 ${summary.mvp.apg}助`);
        if (summary.dpoy) console.log(`  DPOY: ${summary.dpoy.name}(${summary.dpoy.teamId}, ovr=${summary.dpoy.ovr}) ${summary.dpoy.spg}抢 ${summary.dpoy.bpg}帽`);
        if (summary.roy) console.log(`  ROY: ${summary.roy.name}(${summary.roy.teamId}, draftYear=${summary.roy.draftYear}) ${summary.roy.ppg}分 ${summary.roy.apg}助 gp=${summary.roy.gp}`);
        if (summary.mip) console.log(`  MIP: ${summary.mip.name}(${summary.mip.teamId}) ovrΔ=${summary.mip.ovrDelta} ${summary.mip.ppg}分`);
        if (summary.sixMan) console.log(`  6MOY: ${summary.sixMan.name}(${summary.sixMan.teamId}, isBench=${summary.sixMan.isBench}) ${summary.sixMan.ppg}分`);
        console.log(`  一阵: ${summary.allNBAFirst.map(c => `${c.name}(${c.pos})`).join(', ')}`);

        // 进入休赛期
        const offRes = offseason(state);
        console.log(`  休赛期: 退役 ${offRes.retiredCount} 人 (知名: ${offRes.retiredNotable.map(r => `${r.n}(${r.o})`).join(',') || '无'}) / 选秀 ${offRes.rookiesDrafted} 人 / 成长记录 ${offRes.progressionChanges} 条`);

        // 检查每队人数
        const rosterSizes = state.teams.map(t => state.teamsPlayers[t.id].length);
        const minSize = Math.min(...rosterSizes);
        const maxSize = Math.max(...rosterSizes);
        if (minSize < 14 || maxSize > 15) {
            console.log(`  ⚠️ 名单人数异常: min=${minSize} max=${maxSize}`);
        }
    }

    const totalElapsed = Date.now() - t0;
    console.log(`\n=== 20 赛季模拟完成, 总用时 ${totalElapsed}ms ===\n`);

    // ============ 分析 ============
    console.log('=== 数据分析 ===\n');

    // 1. 榜单合理性
    console.log('--- 1. 联盟榜单合理性 ---');
    const leaderRanges = { pts: [25, 35], ast: [9, 13], reb: [11, 16], stl: [1.5, 3], blk: [2, 4] };
    Object.keys(leaderRanges).forEach(key => {
        const vals = seasonsLog.map(s => s.leaders[key]?.value).filter(v => v != null);
        const [lo, hi] = leaderRanges[key];
        const outOfRange = vals.filter(v => v < lo || v > hi);
        const min = Math.min(...vals), max = Math.max(...vals);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        console.log(`  ${key}王: 平均 ${avg.toFixed(2)}, 范围 [${min.toFixed(2)}, ${max.toFixed(2)}], 期望 [${lo}, ${hi}], 越界 ${outOfRange.length} 次`);
        if (outOfRange.length > 0) {
            const offenders = seasonsLog.filter(s => s.leaders[key] && (s.leaders[key].value < lo || s.leaders[key].value > hi));
            offenders.forEach(s => console.log(`    第${s.seasonIdx}季 ${s.year}: ${s.leaders[key].name} ${s.leaders[key].value}`));
        }
    });

    // 2. 奖项一致性
    console.log('\n--- 2. 奖项一致性 ---');
    // MVP 是否来自强队
    const mvpWinRates = seasonsLog.map(s => s.mvp?.winRate).filter(v => v != null);
    console.log(`  MVP 球队胜率: 平均 ${(mvpWinRates.reduce((a, b) => a + b, 0) / mvpWinRates.length).toFixed(3)}, 最低 ${Math.min(...mvpWinRates).toFixed(3)}, 最高 ${Math.max(...mvpWinRates).toFixed(3)}`);
    // ROY 是否新秀
    const royCheck = seasonsLog.filter(s => s.roy);
    const royBad = royCheck.filter(s => s.roy.draftYear !== s.year);
    console.log(`  ROY: ${royCheck.length} 季有获奖, 其中 draftYear 与赛季年不一致: ${royBad.length} 季`);
    royBad.forEach(s => console.log(`    第${s.seasonIdx}季 ${s.year}: ${s.roy.name} draftYear=${s.roy.draftYear} (期望 ${s.year})`));
    // MIP ovrDelta 分布
    const mipDeltas = seasonsLog.map(s => s.mip?.ovrDelta).filter(v => v != null);
    if (mipDeltas.length) console.log(`  MIP ovrDelta: 平均 ${(mipDeltas.reduce((a, b) => a + b, 0) / mipDeltas.length).toFixed(1)}, 范围 [${Math.min(...mipDeltas)}, ${Math.max(...mipDeltas)}]`);
    // 6MOY 是否替补
    const sixManBench = seasonsLog.map(s => s.sixMan?.isBench).filter(v => v != null);
    console.log(`  6MOY isBench=true: ${sixManBench.filter(Boolean).length}/${sixManBench.length}`);

    // 3. 一阵含交易球员
    console.log('\n--- 3. 一阵含交易球员验证 ---');
    let totalFirst = 0, totalMultiTeam = 0;
    seasonsLog.forEach(s => {
        s.allNBAFirst.forEach(c => {
            totalFirst++;
            if (c.multiTeam) totalMultiTeam++;
        });
    });
    console.log(`  一阵总人次: ${totalFirst}, 标记为 multiTeam(交易过): ${totalMultiTeam}`);

    // 4. 数据完整性
    console.log('\n--- 4. 数据完整性 ---');
    console.log(`  累计异常项: ${allIntegrityIssues.reduce((sum, x) => sum + x.issues.length, 0)}`);
    const issueTypes = {};
    allIntegrityIssues.forEach(x => x.issues.forEach(i => { issueTypes[i.type] = (issueTypes[i.type] || 0) + 1; }));
    Object.entries(issueTypes).forEach(([t, c]) => console.log(`    ${t}: ${c}`));

    // 5. 生涯数据 / 退役检查
    console.log('\n--- 5. 生涯数据 / 退役检查 ---');
    const historyCounts = Object.values(state.playerHistory).map(arr => arr.length);
    console.log(`  playerHistory 条目数: ${historyCounts.length}, 平均 ${historyCounts.reduce((a, b) => a + b, 0) / historyCounts.length} 季, 最多 ${Math.max(...historyCounts)} 季`);
    // 检查交易球员多队记录
    let multiTeamHistoryCount = 0;
    Object.entries(state.playerHistory).forEach(([pid, arr]) => {
        const teamIds = new Set(arr.map(h => h.teamId));
        if (teamIds.size > 1) multiTeamHistoryCount++;
    });
    console.log(`  有多队记录的球员数: ${multiTeamHistoryCount}`);
    // 检查退役球员 history 是否停止增长（最后一个 history 年份应早于当前 state.year）
    // 注意：state.players 已不含退役球员，但我们没有保留他们的 id 列表
    // 改为检查：每个 history 数组中所有记录的 year 是否都 < state.year
    const currentYear = state.year;
    let historyAfterCurrent = 0;
    Object.values(state.playerHistory).forEach(arr => {
        if (arr.some(h => h.year >= currentYear)) historyAfterCurrent++;
    });
    console.log(`  含 year >= 当前(${currentYear}) 的 history 条目数: ${historyAfterCurrent}`);

    // 6. 新秀首赛季数据
    console.log('\n--- 6. 新秀首赛季数据 ---');
    let rookieSeasonsChecked = 0, rookieZeroGp = 0, rookieNoHistory = 0;
    Object.entries(state.playerHistory).forEach(([pid, arr]) => {
        const p = state.players.find(x => x.id === pid);
        // 也可能已退役，跳过
        if (!p) return;
        if (p.draftYear == null) return; // 非新秀
        rookieSeasonsChecked++;
        // 第一季应是 draftYear（state.year 是新秀赛季的起始年）
        const firstSeason = arr.find(h => h.year === p.draftYear);
        if (!firstSeason) {
            rookieNoHistory++;
        } else if (firstSeason.gp === 0) {
            rookieZeroGp++;
        }
    });
    console.log(`  新秀球员检查: ${rookieSeasonsChecked} 人, 无第一季历史记录: ${rookieNoHistory}, 首季 gp=0: ${rookieZeroGp}`);

    // 7. 每季球员总数 / 退役数变化
    console.log('\n--- 7. 联盟球员总数变化 ---');
    console.log(`  当前 state.players 数: ${state.players.length}, 当前 state.year: ${state.year}`);
    const totalPlayers = state.players.length;
    const fillers = state.players.filter(p => p.isFiller).length;
    const rookies = state.players.filter(p => p.draftYear === state.year - 1 || p.draftYear === state.year).length;
    console.log(`  filler: ${fillers}, 最近2届新秀: ${rookies}`);

    // 8. 输出每季摘要表
    console.log('\n--- 8. 20 季摘要表 ---');
    console.log('季 | 年份 | 得分王 | 助攻王 | 篮板王 | 抢断王 | 盖帽王 | MVP | ROY | MIPΔ');
    seasonsLog.forEach(s => {
        const fmt = (x, key) => x ? `${x.name.slice(0,6)}${x.value != null ? '/' + x.value : ''}` : '-';
        console.log(`${s.seasonIdx}|${s.year}|${fmt(s.leaders.pts, 'pts')}|${fmt(s.leaders.ast, 'ast')}|${fmt(s.leaders.reb, 'reb')}|${fmt(s.leaders.stl, 'stl')}|${fmt(s.leaders.blk, 'blk')}|${s.mvp ? s.mvp.name.slice(0,6) + '/' + s.mvp.winRate : '-'}|${s.roy ? s.roy.name.slice(0,6) : '-'}|${s.mip ? s.mip.ovrDelta : '-'}`);
    });

    // 9. 异常榜单值
    console.log('\n--- 9. 极端值检测 ---');
    const extremeLeaders = [];
    seasonsLog.forEach(s => {
        ['pts', 'ast', 'reb', 'stl', 'blk'].forEach(key => {
            const l = s.leaders[key];
            if (!l) return;
            const [lo, hi] = leaderRanges[key];
            if (l.value < lo * 0.7 || l.value > hi * 1.5) {
                extremeLeaders.push({ season: s.seasonIdx, year: s.year, key, name: l.name, value: l.value, gp: l.gp });
            }
        });
    });
    if (extremeLeaders.length === 0) console.log('  无极端榜单值');
    else extremeLeaders.forEach(e => console.log(`  第${e.season}季 ${e.year} ${e.key}王 ${e.name} ${e.value} gp=${e.gp}`));

    // 10. gp=0 出现在榜单
    console.log('\n--- 10. gp=0 出现在榜单 ---');
    const gpZeroInLeaders = seasonsLog.filter(s =>
        Object.values(s.leaders).some(l => l && l.gp === 0)
    );
    console.log(`  ${gpZeroInLeaders.length} 季存在 gp=0 的榜单球员`);

    // 输出全量数据供后续分析
    console.log('\n=== JSON 摘要输出 ===');
    console.log(JSON.stringify({
        totalElapsed,
        seasonsLog: seasonsLog.map(s => ({
            seasonIdx: s.seasonIdx,
            year: s.year,
            totalGames: s.totalGames,
            tradeCount: s.tradeCount,
            injurySkipped: s.injurySkipped,
            playersWithStats: s.playersWithStats,
            integrityIssueCount: s.integrityIssueCount,
            leaders: s.leaders,
            mvp: s.mvp,
            dpoy: s.dpoy,
            roy: s.roy,
            mip: s.mip,
            sixMan: s.sixMan,
            allNBAFirst: s.allNBAFirst,
            allRookieFirst: s.allRookieFirst,
        })),
        allIntegrityIssues: allIntegrityIssues.slice(0, 5).map(x => ({ year: x.year, issues: x.issues.slice(0, 10) })),
        playerHistoryCount: Object.keys(state.playerHistory).length,
        currentPlayerCount: state.players.length,
    }, null, 2));
}

main();
