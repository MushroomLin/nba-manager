// 验证 ROY 多赛季连续性 + 东西部 MVP 时机
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
    // 镜像 app.js init 修复：给 age<=20 的初始球员标记为新秀（draftYear=2026），
    // 让第一赛季有 ROY 候选（模拟上赛季选秀进联盟的球员）
    const START_YEAR = 2026;
    const players = PLAYERS_DATA.map((p,i)=>{
        const isRookie = p.a <= 20;
        return {...p, id:`p_${i}`, pot:p.o+randInt(0,4),
            isRookie, draftYear: isRookie ? START_YEAR : null,
            yrsInLeague: isRookie ? 0 : 5};
    });
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

// 镜像 startNewSeason（ offseason ）：记录历史 + 老化 + 退役清理
function offseason(state) {
    // 1. recordPlayerHistory：基于刚结束赛季（state.year）记录
    const prevYear = state.year;
    state.players.forEach(p => {
        if (p.draftYear === state.year + 1) return; // 跳过刚选中的新秀
        if (!state.playerHistory[p.id]) state.playerHistory[p.id] = [];
        let hasRecord = false;
        state.teams.forEach(t => {
            const a = state.statAccum[t.id] && state.statAccum[t.id][p.id];
            if (!a || a.gp === 0) return;
            hasRecord = true;
            const gp = a.gp, div = v => +(v/Math.max(1,gp)).toFixed(1);
            state.playerHistory[p.id].push({ year: prevYear, ovr: p.o, teamId: t.id, age: p.a, gp,
                min:div(a.min), pts:div(a.pts), reb:div(a.reb), ast:div(a.ast), stl:div(a.stl), blk:div(a.blk),
                tov:div(a.tov), pf:div(a.pf), fgm:div(a.fgm), fga:div(a.fga), tpm:div(a.tpm), tpa:div(a.tpa),
                ftm:div(a.ftm), fta:div(a.fta), oreb:div(a.oreb), fg_pct:0, fg3_pct:0, ft_pct:0 });
        });
        if (!hasRecord && p.draftYear === prevYear) {
            state.playerHistory[p.id].push({ year: prevYear, ovr: p.o, teamId: p.t, age: p.a, gp:0,min:0,pts:0,reb:0,ast:0,stl:0,blk:0,tov:0,pf:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,oreb:0,fg_pct:0,fg3_pct:0,ft_pct:0 });
        }
    });
    // 2. offseasonProgression
    const prog = SeasonEngine.offseasonProgression(state.players);
    const retired = prog.retired;
    if (retired.length > 0) {
        const ids = new Set(retired.map(p=>p.id));
        state.teams.forEach(t=>{state.teamsPlayers[t.id]=state.teamsPlayers[t.id].filter(p=>!ids.has(p.id));});
        state.players = state.players.filter(p=>!ids.has(p.id));
    }
    state.teams.forEach(t=>{
        const r = state.teamsPlayers[t.id];
        while (r.length > 15) {
            let rel = r.filter(p=>p.isFiller).sort((a,b)=>a.o-b.o)[0] || [...r].sort((a,b)=>a.o-b.o)[0];
            if (!rel) break;
            const i = r.findIndex(p=>p.id===rel.id); if (i>=0) r.splice(i,1);
            if (rel.isFiller) state.players = state.players.filter(p=>p.id!==rel.id);
            else { rel.isFreeAgent=true; rel.t=null; rel.yearsInFreeAgency=0; }
        }
    });
    SeasonEngine.enforceHardCap(state);
    // 3. 选秀（startDraft: state.year++）
    state.year++;
    const rc = DraftEngine.generateRookieClass(state.year);
    state.rookieClass = rc;
    const order = [...state.teams].sort((a,b)=>state.records[a.id].win-state.records[b.id].win).map(t=>t.id);
    state.draftOrder = [...order, ...order];
    state.draftPick = 0;
    while (state.draftPick < state.draftOrder.length) {
        const o = state.draftOrder[state.draftPick];
        const av = rc.filter(r=>r.t===null); if (av.length===0) break;
        const roster = state.teamsPlayers[o]||[];
        const pk = DraftEngine.aiPick(av, roster);
        if (pk) {
            while (state.teamsPlayers[o].length >= 15) {
                let rel = state.teamsPlayers[o].filter(p=>p.isFiller).sort((a,b)=>a.o-b.o)[0] || [...state.teamsPlayers[o]].sort((a,b)=>a.o-b.o)[0];
                if (!rel) break;
                const i = state.teamsPlayers[o].findIndex(p=>p.id===rel.id); if (i>=0) state.teamsPlayers[o].splice(i,1);
                if (rel.isFiller) state.players = state.players.filter(p=>p.id!==rel.id);
                else { rel.isFreeAgent=true; rel.t=null; rel.yearsInFreeAgency=0; }
            }
            DraftEngine.assignRookieToTeam(pk, o, state.draftPick+1);
            if (state.teamsPlayers[o]) state.teamsPlayers[o].push(pk);
            state.players.push(pk);
        }
        state.draftPick++;
    }
    let fi = 5000;
    state.teams.forEach(t=>{while(state.teamsPlayers[t.id].length<14){const x=genFiller(t.id,fi++);state.players.push(x);state.teamsPlayers[t.id].push(x);}});
    state.players.forEach(p=>p.injured=0);
}

(async () => {
    await NBAStats.ensureLoaded();
    const state = initState();
    // 预填真实历史数据
    const nameMap = NBAStats.getNameMap(), stats = NBAStats.getStats();
    state.players.forEach(p => {
        const id = nameMap[p.n]; if (!id) return;
        const np = stats[String(id)]; if (!np || !np.seasons) return;
        let s = np.seasons.find(s=>s.year===state.year-1);
        if (!s) { const past = np.seasons.filter(s=>s.year<state.year); if (!past.length) return; s = past[past.length-1]; }
        state.playerHistory[p.id] = [{ year: state.year-1, ovr: p.o, teamId: p.t, age: s.age||p.a, gp: s.gp||0, min: s.min||0, pts: s.pts||0, reb: s.reb||0, ast: s.ast||0, stl: s.stl||0, blk: s.blk||0, tov: s.tov||0, pf: s.pf||0, fgm: s.fgm||0, fga: s.fga||0, tpm: s.fg3m||0, tpa: s.fg3a||0, ftm: s.ftm||0, fta: s.fta||0, oreb: s.oreb||0, fg_pct:0, fg3_pct:0, ft_pct:0 }];
    });

    // 修复：实际游戏第一赛季前不选秀，新秀在第一赛季结束后才选秀。
    // 第一赛季的 ROY 候选 = init 时标记为 draftYear=2026 的年轻初始球员（age<=20）
    // 后续赛季的 ROY 候选 = 上一年选秀进联盟的新秀

    // 模拟 5 个赛季
    for (let s = 1; s <= 5; s++) {
        simSeason(state);
        const aw = SeasonEngine.computeAwards(state);
        const rks = state.players.filter(p => p.draftYear === state.year);
        const rksPlayed = rks.filter(p => {
            const a = state.statAccum[p.t] && state.statAccum[p.t][p.id];
            return a && a.gp >= 20;
        });
        const rksQualified = rksPlayed.filter(p => {
            const a = state.statAccum[p.t][p.id];
            return a.pts/a.gp >= 10 && a.gp >= 30;
        });
        console.log(`[S${s}] state.year=${state.year} | ROY: ${aw.roy ? aw.roy.player.n+' '+aw.roy.ppg.toFixed(1)+'分' : '空缺'} | draftYear=${state.year}新秀: ${rks.length}人, 出场≥20: ${rksPlayed.length}人, 达标(ppg≥10,gp≥30): ${rksQualified.length}人`);
        if (aw.roy) {
            console.log(`       ROY详情: ${aw.roy.player.n} draftYear=${aw.roy.player.draftYear} isRookie=${aw.roy.player.isRookie} lastRookieYear=${aw.roy.player.lastRookieYear}`);
        } else if (rksQualified.length > 0) {
            // 调试：为什么达标新秀没当选
            rksQualified.slice(0,3).forEach(p => {
                const a = state.statAccum[p.t][p.id];
                console.log(`       [达标未选] ${p.n} ppg=${(a.pts/a.gp).toFixed(1)} draftYear=${p.draftYear} isRookie=${p.isRookie} lastRookieYear=${p.lastRookieYear}`);
            });
        }
        offseason(state);
    }
})();
