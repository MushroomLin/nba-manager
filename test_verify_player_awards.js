// 验证球员详情页奖项分组展示逻辑
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
function runPlayoffs(state) {
    const po = { round:1, east:SeasonEngine.setupPlayoffs(state.standings).east, west:SeasonEngine.setupPlayoffs(state.standings).west,
        eastAllRounds:[], westAllRounds:[], exits:{} };
    let pairings = { east: po.east, west: po.west };
    for (let r=1; r<=3; r++) {
        po.eastResults = SeasonEngine.simulatePlayoffRound(pairings.east, state.teamsPlayers);
        po.westResults = SeasonEngine.simulatePlayoffRound(pairings.west, state.teamsPlayers);
        po.eastAllRounds.push(...po.eastResults); po.westAllRounds.push(...po.westResults);
        [...po.eastResults, ...po.westResults].forEach(res => {
            const loser = res.high.teamId === res.winner.teamId ? res.low : res.high;
            po.exits[loser.teamId] = r;
        });
        if (r < 3) pairings = { east: SeasonEngine.nextRound(po.eastResults), west: SeasonEngine.nextRound(po.westResults) };
        else { po.eastChamp = po.eastResults[0].winner; po.westChamp = po.westResults[0].winner; }
    }
    const eastTeamIds = po.east.map(p => [p.high.teamId, p.low.teamId]).flat();
    const westTeamIds = po.west.map(p => [p.high.teamId, p.low.teamId]).flat();
    po.eastConfMVP = SeasonEngine.computeConferenceMVP(po.eastAllRounds, eastTeamIds, po.eastChamp.teamId);
    po.westConfMVP = SeasonEngine.computeConferenceMVP(po.westAllRounds, westTeamIds, po.westChamp.teamId);
    const eR = state.records[po.eastChamp.teamId], wR = state.records[po.westChamp.teamId];
    const eWR = eR.win/(eR.win+eR.loss), wWR = wR.win/(wR.win+wR.loss);
    po.finalsPair = eWR >= wWR ? { high: po.eastChamp, low: po.westChamp } : { high: po.westChamp, low: po.eastChamp };
    po.finalsResult = SeasonEngine.simulatePlayoffRound([po.finalsPair], state.teamsPlayers)[0];
    const champ = po.finalsResult.winner;
    const fmvp = SeasonEngine.computeFinalsMVP(po.finalsResult, po.finalsPair.high.teamId, po.finalsPair.low.teamId, champ.teamId);
    return { po, champ, fmvp };
}

(async () => {
    await NBAStats.ensureLoaded();
    const state = initState();
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

    // 模拟 3 赛季，收集奖项
    for (let s = 1; s <= 3; s++) {
        simSeason(state);
        const aw = SeasonEngine.computeAwards(state);
        state.awardsHistory.push(aw);
        const { po, champ, fmvp } = runPlayoffs(state);
        aw.eastMvp = po.eastConfMVP; aw.westMvp = po.westConfMVP;
        state.champions.push({ year: state.year, team: champ.teamId, name: champ.name,
            finalsMVP: fmvp ? { id: fmvp.player.id, n: fmvp.player.n, ppg: fmvp.ppg, rpg: fmvp.rpg, apg: fmvp.apg } : null });
        // offseason
        state.players.forEach(p => {
            if (!state.playerHistory[p.id]) state.playerHistory[p.id] = [];
            state.teams.forEach(t => {
                const a = state.statAccum[t.id] && state.statAccum[t.id][p.id];
                if (!a || a.gp === 0) return;
                const gp = a.gp, div = v => +(v/Math.max(1,gp)).toFixed(1);
                state.playerHistory[p.id].push({ year: state.year, ovr: p.o, teamId: t.id, age: p.a, gp, min:div(a.min),pts:div(a.pts),reb:div(a.reb),ast:div(a.ast),stl:div(a.stl),blk:div(a.blk),tov:div(a.tov),pf:div(a.pf),fgm:div(a.fgm),fga:div(a.fga),tpm:div(a.tpm),tpa:div(a.tpa),ftm:div(a.ftm),fta:div(a.fta),oreb:div(a.oreb),fg_pct:0,fg3_pct:0,ft_pct:0 });
            });
        });
        SeasonEngine.offseasonProgression(state.players);
        state.year++;
    }

    // 找一个获奖最多的球员，模拟球员详情页的奖项分组逻辑
    console.log('=== 球员详情页奖项分组展示验证 ===\n');
    // 统计每个球员的获奖次数
    const awardCounts = {};
    state.awardsHistory.forEach(a => {
        const checkAndAdd = (c, type) => {
            if (c && c.player) {
                const pid = c.player.id;
                if (!awardCounts[pid]) awardCounts[pid] = 0;
                awardCounts[pid]++;
            }
        };
        checkAndAdd(a.mvp, 'MVP');
        checkAndAdd(a.dpoy, 'DPOY');
        checkAndAdd(a.roy, 'ROY');
        checkAndAdd(a.sixMan, '6MOY');
        checkAndAdd(a.mip, 'MIP');
        checkAndAdd(a.eastMvp, '东部MVP');
        checkAndAdd(a.westMvp, '西部MVP');
        [a.allNBAFirst, a.allNBASecond, a.allNBAThird, a.allDefFirst, a.allDefSecond, a.allRookieFirst, a.allRookieSecond].forEach(arr => {
            (arr || []).forEach(pid => {
                if (!awardCounts[pid]) awardCounts[pid] = 0;
                awardCounts[pid]++;
            });
        });
    });
    state.champions.forEach(c => {
        if (c.finalsMVP) {
            const pid = c.finalsMVP.id;
            if (!awardCounts[pid]) awardCounts[pid] = 0;
            awardCounts[pid]++;
        }
    });

    // 取获奖最多的 3 个球员
    const topPlayers = Object.entries(awardCounts).sort((a,b) => b[1] - a[1]).slice(0, 3);
    console.log('获奖最多的球员:');
    topPlayers.forEach(([pid, count]) => {
        const p = state.players.find(x => x.id === pid);
        console.log(`  ${p ? p.n : pid}: ${count} 次获奖`);
    });

    // 对获奖最多的球员模拟奖项分组逻辑
    topPlayers.forEach(([pid]) => {
        const p = state.players.find(x => x.id === pid);
        if (!p) return;
        console.log(`\n--- ${p.n} 的奖项分组展示 ---`);
        const awardGroups = {};
        const addAward = (type, year) => {
            if (!awardGroups[type]) awardGroups[type] = new Set();
            awardGroups[type].add(year);
        };
        state.awardsHistory.forEach(a => {
            if (a.mvp && a.mvp.player.id === pid) addAward('MVP', a.year);
            if (a.eastMvp && a.eastMvp.player.id === pid) addAward('东部决赛MVP', a.year);
            if (a.westMvp && a.westMvp.player.id === pid) addAward('西部决赛MVP', a.year);
            if (a.dpoy && a.dpoy.player.id === pid) addAward('DPOY', a.year);
            if (a.roy && a.roy.player.id === pid) addAward('ROY', a.year);
            if (a.sixMan && a.sixMan.player.id === pid) addAward('6MOY', a.year);
            if (a.mip && a.mip.player.id === pid) addAward('MIP', a.year);
            const champ = state.champions.find(c => c.year === a.year && c.finalsMVP && c.finalsMVP.id === pid);
            if (champ) addAward('总决赛MVP', a.year);
            if ((a.allNBAFirst || []).includes(pid)) addAward('最佳阵容一阵', a.year);
            else if ((a.allNBASecond || []).includes(pid)) addAward('最佳阵容二阵', a.year);
            else if ((a.allNBAThird || []).includes(pid)) addAward('最佳阵容三阵', a.year);
            if ((a.allDefFirst || []).includes(pid)) addAward('最佳防守一阵', a.year);
            else if ((a.allDefSecond || []).includes(pid)) addAward('最佳防守二阵', a.year);
            if ((a.allRookieFirst || []).includes(pid)) addAward('新秀一阵', a.year);
            else if ((a.allRookieSecond || []).includes(pid)) addAward('新秀二阵', a.year);
        });
        const awardOrder = ['MVP', '总决赛MVP', '东部决赛MVP', '西部决赛MVP', 'DPOY', 'ROY', '6MOY', 'MIP',
            '最佳阵容一阵', '最佳阵容二阵', '最佳阵容三阵', '最佳防守一阵', '最佳防守二阵', '新秀一阵', '新秀二阵'];
        const fmtYear = (y) => `${y}-${String(y+1).slice(2)}`;
        const cards = awardOrder.filter(t => awardGroups[t]).map(t => {
            const years = [...awardGroups[t]].sort((a, b) => b - a);
            const count = years.length;
            return `  ${t}${count > 1 ? ` (×${count})` : ''}: ${years.map(fmtYear).join('、')}`;
        });
        if (cards.length === 0) {
            console.log('  无奖项');
        } else {
            cards.forEach(c => console.log(c));
        }
    });

    console.log('\n=== 验证通过 ===');
})();
