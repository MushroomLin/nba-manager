// 验证新秀强度 vs 老球员成长
const fs = require('fs'), path = require('path'), vm = require('vm');
const sandbox = {
    console, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean,
    parseInt, parseFloat, isNaN, setTimeout: () => {}, clearTimeout: () => {},
    fetch: async (url) => ({ ok: true, json: async () => ({}) }),
    document: { getElementById: () => ({ innerHTML: '', classList: { add: () => {}, remove: () => {}, toggle: () => {} }, addEventListener: () => {}, scrollTop: 0 }), querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem: () => {} }
};
sandbox.window = sandbox; sandbox.global = sandbox; vm.createContext(sandbox);
const load = r => vm.runInContext(fs.readFileSync(path.join('js', r), 'utf8'), sandbox, { filename: r });
['data/teams.js','data/players.js','data/rookies.js','engine/simulation.js','engine/season.js','engine/trade.js','engine/draft.js'].forEach(load);

const SeasonEngine = sandbox.SeasonEngine, TradeEngine = sandbox.TradeEngine, DraftEngine = sandbox.DraftEngine;
const TEAMS_DATA = sandbox.TEAMS_DATA, PLAYERS_DATA = sandbox.PLAYERS_DATA, ROOKIE_PROTOTYPES = sandbox.ROOKIE_PROTOTYPES, ROOKIE_POS_PROFILES = sandbox.ROOKIE_POS_PROFILES;
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
function offseason(state) {
    const prog = SeasonEngine.offseasonProgression(state.players);
    const retired = prog.retired;
    if (retired.length > 0) {
        const ids = new Set(retired.map(p=>p.id));
        state.teams.forEach(t=>{state.teamsPlayers[t.id]=state.teamsPlayers[t.id].filter(p=>!ids.has(p.id));});
        state.players = state.players.filter(p=>!ids.has(p.id));
    }
    // 修复：offseasonProgression 第五阶段把球员标记为 isFreeAgent=true, t=null
    // 但这些球员仍然在 teamsPlayers 数组中，需要从球队名单移除
    state.teams.forEach(t=>{
        state.teamsPlayers[t.id] = state.teamsPlayers[t.id].filter(p => !p.isFreeAgent);
    });
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
    state.year++;
    const rc = DraftEngine.generateRookieClass(state.year);
    state.rookieClass = rc;
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
}

const state = initState();
// 第一年先选新秀
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

// 统计函数：联盟球员 ovr 分布（仅统计有球队的非自由球员）
function leagueStats(state) {
    const real = state.players.filter(p => !p.isFiller && !p.isRetired && !p.isFreeAgent && p.t != null);
    const buckets = {'>=90':0,'85-89':0,'80-84':0,'75-79':0,'70-74':0,'65-69':0,'<65':0};
    real.forEach(p => {
        if (p.o >= 90) buckets['>=90']++;
        else if (p.o >= 85) buckets['85-89']++;
        else if (p.o >= 80) buckets['80-84']++;
        else if (p.o >= 75) buckets['75-79']++;
        else if (p.o >= 70) buckets['70-74']++;
        else if (p.o >= 65) buckets['65-69']++;
        else buckets['<65']++;
    });
    const avg = real.reduce((s,p)=>s+p.o,0)/real.length;
    return { count: real.length, avg: +avg.toFixed(2), buckets };
}

// 追踪初始球员中的几个代表
const trackedIds = ['p_0','p_5','p_10','p_20','p_50']; // 塔图姆等
console.log('=== 初始（S1 前）===');
let st = leagueStats(state);
console.log('联盟球员:', st.count, '均 ovr:', st.avg, '分布:', JSON.stringify(st.buckets));
trackedIds.forEach(id => {
    const p = state.players.find(x => x.id === id);
    if (p) console.log(`  ${p.n} age=${p.a} ovr=${p.o} pot=${p.pot}`);
});

// 模拟 8 赛季
for (let s = 1; s <= 8; s++) {
    // 简化赛季（只跑 offseason）
    offseason(state);
    if (s === 2 || s === 4 || s === 6 || s === 8) {
        console.log(`\n=== S${s} offseason 后 (year=${state.year}) ===`);
        st = leagueStats(state);
        console.log('联盟球员:', st.count, '均 ovr:', st.avg, '分布:', JSON.stringify(st.buckets));
        // 追踪初始球员
        console.log('初始球员追踪:');
        trackedIds.forEach(id => {
            const p = state.players.find(x => x.id === id);
            if (p) console.log(`  ${p.n} age=${p.a} ovr=${p.o} pot=${p.pot} yrsInLeague=${p.yrsInLeague}`);
            else console.log(`  ${id}: 已退役`);
        });
        // 当年新秀
        const rookies = state.players.filter(p => p.draftYear === state.year);
        const rookieOvr = rookies.map(r=>r.o);
        const rookieAvg = rookieOvr.length ? (rookieOvr.reduce((a,b)=>a+b,0)/rookieOvr.length).toFixed(1) : 0;
        const elite = rookies.filter(r => r.o >= 75).length;
        console.log(`当年新秀: ${rookies.length}人, 均 ovr=${rookieAvg}, ovr≥75: ${elite}人`);
        // 追踪 S2 新秀的成长
        if (s === 4 || s === 8) {
            const s2Rookies = state.players.filter(p => p.draftYear === 2027);
            if (s2Rookies.length) {
                // 留联盟 = 仍有球队且非自由球员
                const stillIn = s2Rookies.filter(p => !p.isRetired && !p.isFreeAgent && p.t != null);
                const avgOvr = stillIn.length ? (stillIn.reduce((s,p)=>s+p.o,0)/stillIn.length).toFixed(1) : 0;
                const improved = stillIn.filter(p => p.o >= 80).length;
                const cutCount = s2Rookies.filter(p => p.isFreeAgent).length;
                const retiredCount = s2Rookies.filter(p => p.isRetired).length;
                console.log(`2027届新秀(3年后): 留联盟${stillIn.length}/${s2Rookies.length} (淘汰${cutCount}+退役${retiredCount}), 均ovr=${avgOvr}, ovr≥80: ${improved}人`);
            }
        }
    }
}
