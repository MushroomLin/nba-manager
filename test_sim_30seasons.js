// 30 赛季完整模拟 + 真实 NBA 数据对比验证
const fs = require('fs');
const vm = require('vm');
const sandbox = { window: {}, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean, parseInt, parseFloat, isNaN, console, setTimeout:()=>{}, clearTimeout:()=>{} };
sandbox.window = sandbox; sandbox.global = sandbox; vm.createContext(sandbox);
['js/data/teams.js','js/data/players.js','js/data/rookies.js','js/data/nba_stats.js','js/engine/simulation.js','js/engine/season.js','js/engine/trade.js','js/engine/draft.js'].forEach(f => vm.runInContext(fs.readFileSync(f,'utf8'), sandbox, {filename:f}));

function genFiller(tid,i){return{id:'filler_'+tid+'_'+i,n:'填充'+i,t:tid,p:['PG','SG','SF','PF','C'][i%5],a:22+Math.floor(Math.random()*8),o:55+Math.floor(Math.random()*8),pot:60,ins:55,sh:55,pa:55,re:55,de:55,at:55,iq:55,sal:1.5,isFiller:true};}

function initState(){
    const teams = JSON.parse(JSON.stringify(sandbox.TEAMS_DATA));
    const START_YEAR = 2026;
    const players = sandbox.PLAYERS_DATA.map((p,i)=>{
        const isRookie = p.a <= 20;
        let pot = p.o + Math.floor(Math.random()*5);
        if (p.o >= 83 && p.a <= 27) pot = Math.max(pot, 90 + Math.floor(Math.random()*5));
        else if (p.o >= 80 && p.a <= 24) pot = Math.max(pot, 88 + Math.floor(Math.random()*4));
        return {...p, id:'p_'+i, pot, isRookie, draftYear:isRookie?START_YEAR:null, yrsInLeague:isRookie?0:5};
    });
    const tp={};teams.forEach(t=>tp[t.id]=[]);players.forEach(p=>{if(tp[p.t])tp[p.t].push(p);});
    let f=0;teams.forEach(t=>{while(tp[t.id].length<14){const x=genFiller(t.id,f++);players.push(x);tp[t.id].push(x);}});
    return {year:2026,teams,players,teamsPlayers:tp,records:{},statAccum:{},playerHistory:{},schemaVersion:2,freeAgents:[]};
}

function simSeason(state){
    state.schedule = sandbox.SeasonEngine.generateSchedule(state.teams);
    state.records = {}; state.statAccum = {};
    state.teams.forEach(t=>{state.records[t.id]={win:0,loss:0};state.statAccum[t.id]={};});
    state.currentDay=0;
    const seasonStats = {games:0, totalPts:0, topScorers:[], posStats:{PG:[],SG:[],SF:[],PF:[],C:[]}, teamScores:[]};
    const playerSeasonAgg = {}; // playerId -> {gp, min, pts, reb, ast, stl, blk, tov, fg, fga, pos, ovr, age}

    while(state.currentDay < state.schedule.length){
        const day = state.schedule[state.currentDay];
        day.forEach(g=>{
            const h=state.teamsPlayers[g.home],a=state.teamsPlayers[g.away];
            const r=sandbox.SimEngine.simulateGame(h,a);
            seasonStats.games++;
            [r.home,r.away].forEach(side=>{
                seasonStats.teamScores.push(side.score);
                seasonStats.totalPts += side.score;
                if(!side.lines)return;
                side.lines.forEach(line=>{
                    const p=line.player;
                    if(!p||p.isFiller)return;
                    const pid=p.id;
                    if(!playerSeasonAgg[pid])playerSeasonAgg[pid]={gp:0,min:0,pts:0,reb:0,ast:0,stl:0,blk:0,tov:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,pos:p.p,ovr:p.o,age:p.a,n:p.n};
                    const ps=playerSeasonAgg[pid];
                    ps.gp++;ps.min+=line.min||0;ps.pts+=line.pts||0;ps.reb+=line.reb||0;ps.ast+=line.ast||0;
                    ps.stl+=line.stl||0;ps.blk+=line.blk||0;ps.tov+=line.tov||0;
                    ps.fgm+=line.fgm||0;ps.fga+=line.fga||0;ps.tpm+=line.tpm||0;ps.tpa+=line.tpa||0;
                    ps.ftm+=line.ftm||0;ps.fta+=line.fta||0;
                    if(seasonStats.posStats[p.p])seasonStats.posStats[p.p].push({pts:line.pts,reb:line.reb,ast:line.ast,min:line.min,ovr:p.o});
                });
            });
        });
        state.currentDay++;
    }
    return {seasonStats, playerSeasonAgg};
}

function offseason(state){
    state.year++;
    state.rookieClass = sandbox.DraftEngine.generateRookieClass(state.year);
    const order=[...state.teams].map(t=>t.id);
    let dp=0;
    while(dp<60){
        const o=order[dp%order.length];
        const av=state.rookieClass.filter(r=>r.t===null);
        const pk=sandbox.DraftEngine.aiPick(av,state.teamsPlayers[o]||[]);
        if(pk){
            while(state.teamsPlayers[o].length>=15){
                const rel=[...state.teamsPlayers[o]].filter(p=>p.isFiller).sort((a,b)=>a.o-b.o)[0]||[...state.teamsPlayers[o]].sort((a,b)=>a.o-b.o)[0];
                if(!rel)break;
                const i=state.teamsPlayers[o].findIndex(p=>p.id===rel.id);
                if(i>=0)state.teamsPlayers[o].splice(i,1);
                if(rel.isFiller){
                    state.players=state.players.filter(p=>p.id!==rel.id);
                } else {
                    // 修复：释放真实球员必须标记 isFreeAgent + t=null，否则变成孤儿球员
                    rel.isFreeAgent = true;
                    rel.t = null;
                    rel.yearsInFreeAgency = 0;
                }
            }
            sandbox.DraftEngine.assignRookieToTeam(pk,o,dp+1);state.teamsPlayers[o].push(pk);state.players.push(pk);
        }
        dp++;
    }

    // 1.5 老化现有自由球员池（与 app.js 真实流程一致）
    if(!state.freeAgents) state.freeAgents = [];
    if(state.freeAgents.length > 0){
        const faResult = sandbox.SeasonEngine.ageFreeAgents(state);
        if(faResult.retired > 0){
            const retiredFaIds = new Set(state.freeAgents.filter(p=>p.isRetired).map(p=>p.id));
            state.players = state.players.filter(p => !retiredFaIds.has(p.id));
        }
    }

    // 2. 球员成长 + 退役 + 淘汰为自由球员
    const prog=sandbox.SeasonEngine.offseasonProgression(state.players);

    // 3. 清理退役球员
    if(prog.retired.length>0){
        const ids=new Set(prog.retired.map(p=>p.id));
        state.teams.forEach(t=>{state.teamsPlayers[t.id]=state.teamsPlayers[t.id].filter(p=>!ids.has(p.id));});
        state.players=state.players.filter(p=>!ids.has(p.id));
    }

    // 3.5 清理被淘汰为自由球员的球员（从 teamsPlayers 移除，保留在 state.players）
    state.teams.forEach(t=>{
        state.teamsPlayers[t.id]=state.teamsPlayers[t.id].filter(p=>!p.isFreeAgent);
    });

    // 4. 收集落选新秀 + isFreeAgent 球员到 state.freeAgents
    const existingFaIds = new Set(state.freeAgents.map(p=>p.id));
    if(state.rookieClass){
        state.rookieClass.forEach(r=>{
            if(r.t===null && !existingFaIds.has(r.id)){
                r.isFreeAgent=true; r.t=null; r.yearsInFreeAgency=0;
                if(!state.players.find(p=>p.id===r.id)) state.players.push(r);
                state.freeAgents.push(r); existingFaIds.add(r.id);
            }
        });
    }
    state.players.forEach(p=>{
        if(p.isFreeAgent && !p.isRetired && p.t===null && !existingFaIds.has(p.id)){
            state.freeAgents.push(p); existingFaIds.add(p.id);
        }
    });

    // 4.6 AI 球队从自由市场签约补强（名单不足 14 时优先签约 FA）
    // 修复 v10：原逻辑位置盲选（只看 ovr），SG ovr 略高于 SF 导致 SG 被优先签约，
    //   SF 滞留自由市场最终退役，位置分布失衡（SF 68 vs SG 107）
    //   新逻辑：优先补齐位置空缺（每位置 < 2 人时优先签该位置 FA），再按 ovr 排序
    const cap = sandbox.SALARY_CAP || 140;
    const availableFas = [...state.freeAgents].filter(p=>!p.isRetired).sort((a,b)=>b.o-a.o);
    state.teams.forEach(t=>{
        const roster = state.teamsPlayers[t.id];
        while(roster.length < 14 && availableFas.length > 0){
            // 统计各位置人数，找出最缺的位置
            const posCounts = {PG:0,SG:0,SF:0,PF:0,C:0};
            roster.forEach(p=>{if(posCounts[p.p]!==undefined)posCounts[p.p]++;});
            const needyPos = Object.keys(posCounts).filter(pos=>posCounts[pos]<2).sort((a,b)=>posCounts[a]-posCounts[b]);

            let target = null;
            // 优先签缺位位置的 FA
            for(const pos of needyPos){
                target = availableFas.find(fa=>{
                    if(fa.t!==null) return false;
                    if(fa.p!==pos) return false;
                    const sal = roster.reduce((s,p)=>s+(p.sal||0),0);
                    return (fa.sal||0) <= (cap - sal) || (fa.sal||0) <= 2;
                });
                if(target) break;
            }
            // 无缺位或缺位无合适 FA，签最高 ovr
            if(!target){
                target = availableFas.find(fa=>{
                    if(fa.t!==null) return false;
                    const sal = roster.reduce((s,p)=>s+(p.sal||0),0);
                    return (fa.sal||0) <= (cap - sal) || (fa.sal||0) <= 2;
                });
            }
            if(!target) break;
            target.t = t.id; target.isFreeAgent = false; target.yearsInFreeAgency = 0;
            roster.push(target);
            const idx = state.freeAgents.findIndex(p=>p.id===target.id);
            if(idx>=0) state.freeAgents.splice(idx,1);
            const aidx = availableFas.indexOf(target);
            if(aidx>=0) availableFas.splice(aidx,1);
        }
    });

    // 4.7 仍不足 14 人的球队用 filler 补足
    state.teams.forEach(t=>{
        while(state.teamsPlayers[t.id].length<14){
            const fp=genFiller(t.id,Date.now()%1000+state.teamsPlayers[t.id].length);
            state.players.push(fp);
            state.teamsPlayers[t.id].push(fp);
        }
    });

    return {retiredCount: prog.retired.length, changes: prog.changes.length, faCount: state.freeAgents.length};
}

const state = initState();
const avg=arr=>arr.reduce((s,v)=>s+v,0)/arr.length;
const allSeasonsData = [];

console.log('模拟 30 个赛季...\n');
for(let s=1;s<=30;s++){
    const {seasonStats, playerSeasonAgg} = simSeason(state);
    const off = offseason(state);
    allSeasonsData.push({season:s, year:state.year-1, seasonStats, playerSeasonAgg, retiredCount:off.retiredCount});
    if(s%5===0||s===1){
        const real=state.players.filter(p=>!p.isFiller&&!p.isRetired&&!p.isFreeAgent&&p.t);
        const b={'>=90':0,'85-89':0,'80-84':0,'75-79':0,'70-74':0,'<70':0};
        real.forEach(p=>{if(p.o>=90)b['>=90']++;else if(p.o>=85)b['85-89']++;else if(p.o>=80)b['80-84']++;else if(p.o>=75)b['75-79']++;else if(p.o>=70)b['70-74']++;else b['<70']++;});
        const avgScore = seasonStats.totalPts/seasonStats.games;
        console.log('S'+s+'(year='+(state.year-1)+'): 联盟'+real.length+'人 FA='+(state.freeAgents?state.freeAgents.length:0)+' avgScore='+avgScore.toFixed(1)+' 退役='+off.retiredCount+' 分布'+JSON.stringify(b));
    }
}

// ===== 综合分析 =====
console.log('\n========== 30 赛季综合分析 ==========\n');

// 1. 联盟人数趋势
console.log('【1. 联盟人数趋势】');
[1,5,10,15,20,25,30].forEach(s=>{
    const d=allSeasonsData[s-1];
    // 注: 这是最终态，各赛季态需重新统计
});
// 重新模拟统计人数（用最终态近似）
const finalReal=state.players.filter(p=>!p.isFiller&&!p.isRetired&&!p.isFreeAgent&&p.t);
console.log('  S30 最终联盟人数: '+finalReal.length+' (真实NBA约450人)');
console.log('  每队人数: min='+Math.min(...state.teams.map(t=>state.teamsPlayers[t.id].length))+' max='+Math.max(...state.teams.map(t=>state.teamsPlayers[t.id].length)));
console.log('  自由市场人数: '+(state.freeAgents?state.freeAgents.length:0)+' (真实NBA约50-150人)');
console.log('  state.players 总数: '+state.players.length);

// 2. 场均得分对比
console.log('\n【2. 场均得分对比（真实NBA 2024-25约114分/队）】');
const scoreStats = allSeasonsData.map(d=>d.seasonStats.totalPts/d.seasonStats.games/2);
console.log('  30赛季单队场均: '+avg(scoreStats).toFixed(1)+'分 (范围 '+Math.min(...scoreStats).toFixed(1)+'~'+Math.max(...scoreStats).toFixed(1)+')');
console.log('  真实NBA 2024-25: 约114分/队');

// 3. 得分王数据
console.log('\n【3. 得分王对比（真实NBA约30-33分）】');
const scoringLeaders = allSeasonsData.map(d=>{
    const players = Object.values(d.playerSeasonAgg).filter(p=>p.gp>=40);
    players.sort((a,b)=>(b.pts/b.gp)-(a.pts/a.gp));
    const top = players[0];
    return {season:d.season, year:d.year, name:top.n, ppg:(top.pts/top.gp).toFixed(1), gp:top.gp};
});
console.log('  30赛季得分王场均: '+avg(scoringLeaders.map(s=>+s.ppg)).toFixed(1)+'分');
console.log('  真实NBA 2024-25 SGA: 32.7分');
console.log('  样本(前5/后5):');
scoringLeaders.slice(0,5).forEach(s=>console.log('    S'+s.season+' '+s.name+' '+s.ppg+'分 ('+s.gp+'场)'));
console.log('    ...');
scoringLeaders.slice(-3).forEach(s=>console.log('    S'+s.season+' '+s.name+' '+s.ppg+'分 ('+s.gp+'场)'));

// 4. 各位置 per36 对比（只统计主力球员：min>=25，对齐真实 NBA per36 统计口径）
console.log('\n【4. 各位置 per36 对比（取S15-S30平均，仅主力 min>=25）】');
console.log('  位置 | per36分 | per36板 | per36助 | 真实NBA参考(主力均值)');
// 修复 v10：原参考值为顶级球星 per36（PG 27分=东契奇级），实际应为主力球员 per36 均值
// 真实 NBA 2024-25 主力(min>=25) per36 均值: PG 19/4.5/8, SG 17/4.5/4, SF 17/5.5/3.5, PF 16/9/3, C 15/11/2.5
const posRealRef = {PG:'19分/4.5板/8助',SG:'17分/4.5板/4助',SF:'17分/5.5板/3.5助',PF:'16分/9板/3助',C:'15分/11板/2.5助'};
['PG','SG','SF','PF','C'].forEach(pos=>{
    const arr=[];
    allSeasonsData.slice(14).forEach(d=>{
        const ps=d.seasonStats.posStats[pos];
        if(ps)arr.push(...ps);
    });
    const per36=v=>v.min>=25?{pts:v.pts*36/v.min,reb:v.reb*36/v.min,ast:v.ast*36/v.min}:null;
    const valid=arr.map(per36).filter(x=>x);
    console.log('  '+pos+' | '+avg(valid.map(v=>v.pts)).toFixed(1)+'分 | '+avg(valid.map(v=>v.reb)).toFixed(1)+'板 | '+avg(valid.map(v=>v.ast)).toFixed(1)+'助 | 真实:'+posRealRef[pos]);
});

// 5. ovr 分布对比
console.log('\n【5. ovr 分布对比（真实NBA超巨约15-20人）】');
const b={'>=90':0,'85-89':0,'80-84':0,'75-79':0,'70-74':0,'<70':0};
finalReal.forEach(p=>{if(p.o>=90)b['>=90']++;else if(p.o>=85)b['85-89']++;else if(p.o>=80)b['80-84']++;else if(p.o>=75)b['75-79']++;else if(p.o>=70)b['70-74']++;else b['<70']++;});
console.log('  S30 最终: '+JSON.stringify(b));
console.log('  真实NBA: >=90约15-20, 85-89约40, 80-84约80');

// 5.5 位置分布对比
console.log('\n【5.5 位置分布对比（真实NBA每位置约90人）】');
const posDist={PG:0,SG:0,SF:0,PF:0,C:0};
finalReal.forEach(p=>{if(posDist[p.p]!==undefined)posDist[p.p]++;});
console.log('  S30: '+JSON.stringify(posDist));
console.log('  真实NBA: 每位置约 80-100 人（PG/SG 略多，C 略少）');
// 各位置平均 ovr
console.log('  各位置平均 ovr:');
Object.keys(posDist).forEach(pos=>{
    const arr=finalReal.filter(p=>p.p===pos);
    const avgOvr=avg(arr.map(p=>p.o));
    console.log('    '+pos+': '+avgOvr.toFixed(1)+' ('+arr.length+'人)');
});

// 6. 球员年龄分布
console.log('\n【6. 球员年龄分布（真实NBA主力22-32岁）】');
const ageB={};
finalReal.forEach(p=>{const k=Math.floor(p.a/2)*2;ageB[k]=(ageB[k]||0)+1;});
console.log('  年龄分布: ');
Object.keys(ageB).sort((a,b)=>+a-+b).forEach(k=>{
    if(+k>=18&&+k<=40)console.log('    '+k+'-'+(+k+1)+'岁: '+ageB[k]+'人');
});

// 7. 新秀数据
console.log('\n【7. 新秀 ROY 数据（真实NBA ROY约15-20分）】');
const rookieStats = allSeasonsData.map(d=>{
    const r = Object.values(d.playerSeasonAgg).filter(p=>p.age<=21 && p.gp>=30);
    r.sort((a,b)=>(b.pts/b.gp)-(a.pts/a.gp));
    return r[0] ? (r[0].pts/r[0].gp).toFixed(1) : 'N/A';
});
const validRookie = rookieStats.filter(r=>r!=='N/A').map(Number);
console.log('  ROY 场均: '+avg(validRookie).toFixed(1)+'分 (真实NBA约15-20分)');
console.log('  样本: '+validRookie.slice(0,5).join(', '));

// 8. 退役年龄
console.log('\n【8. 退役统计（真实NBA约5-8人/年退役）】');
const retiredCounts = allSeasonsData.map(d=>d.retiredCount);
// 修复 v10：S1 含初始老球员清理（97人），排除后计算稳态均值
const steadyStateRetired = retiredCounts.slice(1); // 排除 S1
console.log('  全30赛季平均(含S1异常): '+avg(retiredCounts).toFixed(1)+'人/年');
console.log('  稳态平均(排除S1): '+avg(steadyStateRetired).toFixed(1)+'人/年 (真实NBA约5-8人)');
console.log('  稳态范围: '+Math.min(...steadyStateRetired)+'~'+Math.max(...steadyStateRetired));

// 9. 30分俱乐部（30+得分场次）
console.log('\n【9. 高分场次对比（真实NBA约5-10%场次球队得分120+）】');
const allScores = allSeasonsData.flatMap(d=>d.seasonStats.teamScores);
const over120 = allScores.filter(s=>s>=120).length;
const over130 = allScores.filter(s=>s>=130).length;
console.log('  球队得分>=120: '+(over120/allScores.length*100).toFixed(1)+'% (真实约15-20%)');
console.log('  球队得分>=130: '+(over130/allScores.length*100).toFixed(1)+'% (真实约3-5%)');
console.log('  最高球队得分: '+Math.max(...allScores));

// 10. 三分球统计
console.log('\n【10. 三分球出手占比（真实NBA约35-40%）】');
const lastSeason = allSeasonsData[allSeasonsData.length-1];
const allPlayers = Object.values(lastSeason.playerSeasonAgg);
const totalFga = allPlayers.reduce((s,p)=>s+p.fga,0);
const totalTpa = allPlayers.reduce((s,p)=>s+p.tpa,0);
console.log('  三分出手占比: '+(totalTpa/totalFga*100).toFixed(1)+'% (真实NBA约35-40%)');
const totalFgm = allPlayers.reduce((s,p)=>s+p.fgm,0);
const totalTpm = allPlayers.reduce((s,p)=>s+p.tpm,0);
console.log('  三分命中率: '+(totalTpm/totalTpa*100).toFixed(1)+'% (真实NBA约36%)');
console.log('  整体命中率: '+(totalFgm/totalFga*100).toFixed(1)+'% (真实NBA约47%)');

console.log('\n========== 模拟完成 ==========');
