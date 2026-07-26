// 验证东西部决赛 MVP + ROY 多赛季连续性
const fs = require('fs'), path = require('path'), vm = require('vm');
const sandbox = {
    console, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean,
    parseInt, parseFloat, isNaN, setTimeout: () => {}, clearTimeout: () => {},
    fetch: async (url) => {
        let f = url.includes('nba_stats.json') ? 'js/data/nba_stats.json' : 'js/data/name_map.json';
        return { ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) };
    },
    document: { getElementById: () => ({ innerHTML: '', classList: { add: () => {}, remove: () => {}, toggle: () => {} }, addEventListener: () => {}, scrollTop: 0 }), querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem: () => {} }
};
sandbox.window = sandbox; sandbox.global = sandbox; vm.createContext(sandbox);
const load = r => vm.runInContext(fs.readFileSync(path.join('js', r), 'utf8'), sandbox, { filename: r });
['data/teams.js','data/players.js','data/rookies.js','data/nba_stats.js','engine/simulation.js','engine/season.js','engine/trade.js','engine/draft.js'].forEach(load);

const SeasonEngine = sandbox.SeasonEngine, SimEngine = sandbox.SimEngine, TradeEngine = sandbox.TradeEngine, DraftEngine = sandbox.DraftEngine;
const TEAMS_DATA = sandbox.TEAMS_DATA, PLAYERS_DATA = sandbox.PLAYERS_DATA, ROOKIE_PROTOTYPES = sandbox.ROOKIE_PROTOTYPES, ROOKIE_POS_PROFILES = sandbox.ROOKIE_POS_PROFILES, NBAStats = sandbox.NBAStats;
const randInt = (a,b)=>Math.floor(Math.random()*(b-a+1))+a, clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

function genFiller(tid, idx) {
    const pos = ['PG','SG','SF','PF','C'][idx%5], pr = ROOKIE_POS_PROFILES[pos], o = randInt(62,70), v = ()=>randInt(-4,4);
    return { id:`bench_${tid}_${idx}`, n:`F${idx}`, t:tid, p:pos, a:randInt(22,32), o, pot:o+randInt(0,2),
        ins:clamp(pr.ins+v(),40,72), sh:clamp(pr.sh+v(),40,74), pa:clamp(pr.pa+v(),35,72), re:clamp(pr.re+v(),35,75),
        de:clamp(pr.de+v(),40,74), at:clamp(pr.at+v(),50,80), iq:clamp(pr.iq+v(),50,76), isFiller:true, draftYear:null, yrsInLeague:5 };
}
function initState() {
    const teams = JSON.parse(JSON.stringify(TEAMS_DATA));
    const players = PLAYERS_DATA.map((p,i)=>({...p, id:`p_${i}`, pot:p.o+randInt(0,4), isRookie:false, draftYear:null, yrsInLeague:5}));
    const tp = {}; teams.forEach(t=>tp[t.id]=[]); players.forEach(p=>{if(tp[p.t])tp[p.t].push(p);});
    let f=0; teams.forEach(t=>{while(tp[t.id].length<14){const x=genFiller(t.id,f++);players.push(x);tp[t.id].push(x);}});
    const rec={}; teams.forEach(t=>rec[t.id]={win:0,loss:0,streak:0,ptsFor:0,ptsAgt:0});
    const sa={}; teams.forEach(t=>sa[t.id]={});
    return { manager:{teamId:'BOS'}, year:2026, phase:'regular', teams, players, teamsPlayers:tp, records:rec, schedule:null,
        currentDay:0, standings:null, playoffs:null, freeAgents:[], rookieClass:[], draftOrder:null, draftPick:0,
        statAccum:sa, history:[], champions:[], awardsHistory:[], playerHistory:{}, tradeLog:[] };
}
function acc(state, tid, l) {
    const a = state.statAccum[tid];
    if (!a[l.player.id]) a[l.player.id] = {gp:0,min:0,pts:0,reb:0,ast:0,stl:0,blk:0,tov:0,pf:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,oreb:0};
    const s=a[l.player.id]; s.gp++; s.min+=l.min; s.pts+=l.pts; s.reb+=l.reb; s.ast+=l.ast; s.stl+=l.stl; s.blk+=l.blk; s.tov+=l.tov; s.pf+=l.pf;
    s.fgm+=l.fgm; s.fga+=l.fga; s.tpm+=l.tpm; s.tpa+=l.tpa; s.ftm+=l.ftm; s.fta+=l.fta; s.oreb+=l.oreb||0;
}
function simSeason(state) {
    TradeEngine.resetTradeFlags(state);
    state.teams.forEach(t=>{state.statAccum[t.id]={};state.records[t.id]={win:0,loss:0,streak:0,ptsFor:0,ptsAgt:0};});
    const sch = SeasonEngine.generateSchedule(state.teams);
    for (let d=0; d<sch.length; d++) {
        for (const g of sch[d]) {
            const h=state.teamsPlayers[g.home], a=state.teamsPlayers[g.away];
            if (!h||!a) continue;
            const r = SimEngine.simulateGame(h,a);
            r.home.lines.forEach(l=>acc(state,g.home,l)); r.away.lines.forEach(l=>acc(state,g.away,l));
            const hw = r.winner==='home';
            state.records[g.home][hw?'win':'loss']++; state.records[g.away][!hw?'win':'loss']++;
        }
        TradeEngine.runAiTrades(state, 1);
    }
    state.standings = SeasonEngine.computeStandings(state.teams, state.records);
}
// 镜像 app.js advancePlayoffs（完整 4 轮 + 东西部 MVP 评选）
function runPlayoffsWithConfMVP(state) {
    const po = {
        round: 1,
        east: SeasonEngine.setupPlayoffs(state.standings).east,
        west: SeasonEngine.setupPlayoffs(state.standings).west,
        eastAllRounds: [], westAllRounds: [],
        exits: {},
    };
    let pairings = { east: po.east, west: po.west };
    for (let r = 1; r <= 3; r++) {
        po.eastResults = SeasonEngine.simulatePlayoffRound(pairings.east, state.teamsPlayers);
        po.westResults = SeasonEngine.simulatePlayoffRound(pairings.west, state.teamsPlayers);
        po.eastAllRounds.push(...po.eastResults);
        po.westAllRounds.push(...po.westResults);
        [...po.eastResults, ...po.westResults].forEach(res => {
            const loser = res.high.teamId === res.winner.teamId ? res.low : res.high;
            po.exits[loser.teamId] = r;
        });
        if (r < 3) {
            pairings = { east: SeasonEngine.nextRound(po.eastResults), west: SeasonEngine.nextRound(po.westResults) };
        } else {
            po.eastChamp = po.eastResults[0].winner;
            po.westChamp = po.westResults[0].winner;
        }
    }
    // 评选东西部 MVP
    const eastTeamIds = po.east.map(p => [p.high.teamId, p.low.teamId]).flat();
    const westTeamIds = po.west.map(p => [p.high.teamId, p.low.teamId]).flat();
    po.eastConfMVP = SeasonEngine.computeConferenceMVP(po.eastAllRounds, eastTeamIds, po.eastChamp.teamId);
    po.westConfMVP = SeasonEngine.computeConferenceMVP(po.westAllRounds, westTeamIds, po.westChamp.teamId);
    // 总决赛
    const eR = state.records[po.eastChamp.teamId], wR = state.records[po.westChamp.teamId];
    const eWR = eR.win/(eR.win+eR.loss), wWR = wR.win/(wR.win+wR.loss);
    po.finalsPair = eWR >= wWR ? { high: po.eastChamp, low: po.westChamp } : { high: po.westChamp, low: po.eastChamp };
    po.finalsResult = SeasonEngine.simulatePlayoffRound([po.finalsPair], state.teamsPlayers)[0];
    const champ = po.finalsResult.winner;
    const loser = po.finalsPair.high.teamId === champ.teamId ? po.finalsPair.low : po.finalsPair.high;
    po.exits[loser.teamId] = 4; po.exits[champ.teamId] = 5;
    const fmvp = SeasonEngine.computeFinalsMVP(po.finalsResult, po.finalsPair.high.teamId, po.finalsPair.low.teamId, champ.teamId);
    return { po, champ, loser, fmvp };
}

(async () => {
    await NBAStats.ensureLoaded();
    const state = initState();
    // 预填真实历史
    const nameMap = NBAStats.getNameMap(), stats = NBAStats.getStats();
    state.players.forEach(p => {
        const id = nameMap[p.n]; if (!id) return;
        const np = stats[String(id)]; if (!np || !np.seasons) return;
        let s = np.seasons.find(s=>s.year===state.year-1);
        if (!s) { const past = np.seasons.filter(s=>s.year<state.year); if (!past.length) return; s = past[past.length-1]; }
        state.playerHistory[p.id] = [{ year: state.year-1, ovr: p.o, teamId: p.t, age: s.age||p.a, gp: s.gp||0, min: s.min||0, pts: s.pts||0, reb: s.reb||0, ast: s.ast||0, stl: s.stl||0, blk: s.blk||0, tov: s.tov||0, pf: s.pf||0, fgm: s.fgm||0, fga: s.fga||0, tpm: s.fg3m||0, tpa: s.fg3a||0, ftm: s.ftm||0, fta: s.fta||0, oreb: s.oreb||0, fg_pct:0, fg3_pct:0, ft_pct:0 }];
    });
    // 2026 选秀
    const rc0 = DraftEngine.generateRookieClass(2026);
    const order0 = [...state.teams].map(t=>t.id); let dp = 0;
    while (dp < [...order0,...order0].length) {
        const o = [...order0,...order0][dp];
        const av = rc0.filter(r=>r.t===null); if (av.length===0) break;
        const pk = DraftEngine.aiPick(av, state.teamsPlayers[o]||[]);
        if (pk) {
            while (state.teamsPlayers[o].length>=15){let rel=state.teamsPlayers[o].filter(p=>p.isFiller).sort((a,b)=>a.o-b.o)[0]||[...state.teamsPlayers[o]].sort((a,b)=>a.o-b.o)[0];if(!rel)break;const i=state.teamsPlayers[o].findIndex(p=>p.id===rel.id);if(i>=0)state.teamsPlayers[o].splice(i,1);if(rel.isFiller)state.players=state.players.filter(p=>p.id!==rel.id);}
            DraftEngine.assignRookieToTeam(pk, o, dp+1);
            if (state.teamsPlayers[o]) state.teamsPlayers[o].push(pk);
            state.players.push(pk);
        }
        dp++;
    }

    const teamConf = {}; TEAMS_DATA.forEach(t => teamConf[t.id] = t.conf);
    function teamAbbr(tid) { const t = TEAMS_DATA.find(x=>x.id===tid); return t?t.abbr:tid; }
    console.log('=== 验证东西部决赛 MVP + ROY 连续性 ===\n');
    for (let s = 1; s <= 5; s++) {
        simSeason(state);
        const aw = SeasonEngine.computeAwards(state);
        state.awardsHistory.push(aw);
        // 季后赛 + 东西部 MVP
        const { po, champ, fmvp } = runPlayoffsWithConfMVP(state);
        // 同步东西部 MVP 到 awards
        aw.eastMvp = po.eastConfMVP;
        aw.westMvp = po.westConfMVP;
        state.champions.push({ year: state.year, team: champ.teamId, name: champ.name, finalsMVP: fmvp?{id:fmvp.player.id,n:fmvp.player.n,ppg:fmvp.ppg,rpg:fmvp.rpg,apg:fmvp.apg}:null });

        console.log(`[S${s}] ${state.year}-${state.year+1} 赛季`);
        console.log(`  ROY: ${aw.roy ? aw.roy.player.n+' '+aw.roy.ppg.toFixed(1)+'分' : '空缺'}`);
        console.log(`  东部决赛MVP: ${po.eastConfMVP ? po.eastConfMVP.player.n+' ('+teamAbbr(po.eastConfMVP.teamId)+') '+po.eastConfMVP.ppg+'分'+po.eastConfMVP.rpg+'板'+po.eastConfMVP.apg+'助 '+po.eastConfMVP.gp+'场' : '空缺'}`);
        console.log(`  西部决赛MVP: ${po.westConfMVP ? po.westConfMVP.player.n+' ('+teamAbbr(po.westConfMVP.teamId)+') '+po.westConfMVP.ppg+'分'+po.westConfMVP.rpg+'板'+po.westConfMVP.apg+'助 '+po.westConfMVP.gp+'场' : '空缺'}`);
        console.log(`  总冠军: ${champ.name} | FMVP: ${fmvp ? fmvp.player.n+' '+fmvp.ppg+'分' : '空缺'}`);

        // 校验：东西部 MVP 必须来自对应联盟的分区冠军
        const eastOk = po.eastConfMVP && teamConf[po.eastConfMVP.teamId] === 'East' && po.eastConfMVP.teamId === po.eastChamp.teamId;
        const westOk = po.westConfMVP && teamConf[po.westConfMVP.teamId] === 'West' && po.westConfMVP.teamId === po.westChamp.teamId;
        if (!eastOk) console.log(`  [FAIL] 东部MVP归属错误: conf=${po.eastConfMVP?teamConf[po.eastConfMVP.teamId]:'null'}, champ=${po.eastChamp.teamId}`);
        if (!westOk) console.log(`  [FAIL] 西部MVP归属错误: conf=${po.westConfMVP?teamConf[po.westConfMVP.teamId]:'null'}, champ=${po.westChamp.teamId}`);

        // offseason
        // recordPlayerHistory
        state.players.forEach(p => {
            if (p.draftYear === state.year + 1) return;
            if (!state.playerHistory[p.id]) state.playerHistory[p.id] = [];
            let hasRecord = false;
            state.teams.forEach(t => {
                const a = state.statAccum[t.id] && state.statAccum[t.id][p.id];
                if (!a || a.gp === 0) return;
                hasRecord = true;
                const gp = a.gp, div = v => +(v/Math.max(1,gp)).toFixed(1);
                state.playerHistory[p.id].push({ year: state.year, ovr: p.o, teamId: t.id, age: p.a, gp, min:div(a.min),pts:div(a.pts),reb:div(a.reb),ast:div(a.ast),stl:div(a.stl),blk:div(a.blk),tov:div(a.tov),pf:div(a.pf),fgm:div(a.fgm),fga:div(a.fga),tpm:div(a.tpm),tpa:div(a.tpa),ftm:div(a.ftm),fta:div(a.fta),oreb:div(a.oreb),fg_pct:0,fg3_pct:0,ft_pct:0 });
            });
        });
        const prog = SeasonEngine.offseasonProgression(state.players);
        const retired = prog.retired;
        if (retired.length > 0) {
            const ids = new Set(retired.map(p=>p.id));
            state.teams.forEach(t=>{state.teamsPlayers[t.id]=state.teamsPlayers[t.id].filter(p=>!ids.has(p.id));});
            state.players = state.players.filter(p=>!ids.has(p.id));
        }
        SeasonEngine.enforceHardCap(state);
        state.year++;
        const rc = DraftEngine.generateRookieClass(state.year);
        const order = [...state.teams].sort((a,b)=>state.records[a.id].win-state.records[b.id].win).map(t=>t.id);
        state.draftOrder = [...order, ...order]; state.draftPick = 0;
        while (state.draftPick < state.draftOrder.length) {
            const o = state.draftOrder[state.draftPick];
            const av = rc.filter(r=>r.t===null); if (av.length===0) break;
            const pk = DraftEngine.aiPick(av, state.teamsPlayers[o]||[]);
            if (pk) {
                while (state.teamsPlayers[o].length>=15){let rel=state.teamsPlayers[o].filter(p=>p.isFiller).sort((a,b)=>a.o-b.o)[0]||[...state.teamsPlayers[o]].sort((a,b)=>a.o-b.o)[0];if(!rel)break;const i=state.teamsPlayers[o].findIndex(p=>p.id===rel.id);if(i>=0)state.teamsPlayers[o].splice(i,1);if(rel.isFiller)state.players=state.players.filter(p=>p.id!==rel.id);else{rel.isFreeAgent=true;rel.t=null;rel.yearsInFreeAgency=0;}}
                DraftEngine.assignRookieToTeam(pk, o, state.draftPick+1);
                if (state.teamsPlayers[o]) state.teamsPlayers[o].push(pk);
                state.players.push(pk);
            }
            state.draftPick++;
        }
        let fi = 5000;
        state.teams.forEach(t=>{while(state.teamsPlayers[t.id].length<14){const x=genFiller(t.id,fi++);state.players.push(x);state.teamsPlayers[t.id].push(x);}});
        state.players.forEach(p=>p.injured=0);
        console.log('');
    }

    console.log('=== 校验总结 ===');
    const allRoy = state.awardsHistory.filter(a => a.roy).length;
    const allEastMvp = state.awardsHistory.filter(a => a.eastMvp).length;
    const allWestMvp = state.awardsHistory.filter(a => a.westMvp).length;
    console.log(`5 赛季 ROY 当选: ${allRoy}/5`);
    console.log(`5 赛季 东部MVP 当选: ${allEastMvp}/5`);
    console.log(`5 赛季 西部MVP 当选: ${allWestMvp}/5`);
})();
