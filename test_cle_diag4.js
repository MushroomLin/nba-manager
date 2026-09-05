// 深度诊断：循环场景 B 直到出现低胜场（<40），抓取该 run 全部细节
const fs = require('fs'), path = require('path'), vm = require('vm');

function makeEl(id, extra = {}) {
    const el = {
        id, _innerHTML: '',
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) { this._innerHTML = String(v); },
        textContent: '', value: '', scrollTop: 0, disabled: false,
        dataset: {}, style: {}, title: '', className: '', tagName: 'DIV',
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        _listeners: {},
        addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
        appendChild() {}, remove() {},
    };
    return Object.assign(el, extra);
}
const elements = {};
const doc = {
    getElementById: id => (elements[id] || (elements[id] = makeEl(id))),
    querySelectorAll: () => [], querySelector: () => null,
    createElement: tag => makeEl(tag), body: makeEl('body'), head: makeEl('head'),
    addEventListener() {},
};
const store = new Map();
const sandbox = {
    console, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean, Promise,
    parseInt, parseFloat, isNaN, isFinite,
    setTimeout: fn => { try { fn(); } catch (e) {} }, clearTimeout: () => {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    Blob: class {}, FileReader: class { readAsText() {} },
    location: { reload: () => {} }, confirm: () => true, alert: () => {},
    fetch: () => Promise.reject(new Error('no fetch')),
    document: doc, localStorage: {
        getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k), clear: () => store.clear()
    },
};
sandbox.window = sandbox; sandbox.global = sandbox;
vm.createContext(sandbox);
const load = rel => vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', rel), 'utf8'), sandbox, { filename: rel });
load('data/teams.js'); load('data/players.js'); load('data/rookies.js'); load('data/nba_stats.js');
load('data/history/history_seasons.js'); load('engine/history.js');
load('engine/simulation.js'); load('engine/trade.js'); load('engine/season.js'); load('engine/draft.js');
load('engine/save.js'); load('engine/achievements.js'); load('ui/app.js');
const { App } = sandbox;

function advanceOneStep(st) {
    if (st.phase === 'regular' || st.phase === 'playoffs' || st.phase === 'finals') {
        App.fastAdvance(); return true;
    }
    if (st.phase === 'offseason' || st.phase === 'draft' || st.phase === 'freeAgency') {
        App.advance();
        if (st.phase === 'draft' && st.draftOrder && st.draftOrder[st.draftPick] === st.manager.teamId) {
            const available = st.rookieClass.filter(r => r.t === null);
            if (available.length) App.userDraftPick(available[0].id);
        }
        return true;
    }
    return false;
}

function runFullSeason(st, teamId) {
    const y0 = st.year;
    const result = { win: 0, loss: 0, rank: 0, made: false, line8: -1 };
    let guard = 0;
    while (guard++ < 3000) {
        const prevPhase = st.phase;
        advanceOneStep(st);
        if (prevPhase === 'regular' && st.phase !== 'regular') {
            const rec = st.records[teamId];
            result.win = rec.win; result.loss = rec.loss;
            const conf = st.teams.find(t => t.id === teamId).conf;
            const confRecs = st.teams.map(t => ({ tid: t.id, r: st.records[t.id] }))
                .filter(x => st.teams.find(t => t.id === x.tid).conf === conf)
                .sort((a, b) => b.r.win - a.r.win || a.r.loss - b.r.loss);
            result.rank = confRecs.findIndex(x => x.tid === teamId) + 1;
            result.made = result.rank <= 8;
            result.line8 = confRecs[7] ? confRecs[7].r.win : -1;
        }
        if (st.year !== y0) break;
    }
    return result;
}

const THRESHOLD = 40;
let found = false;
for (let attempt = 1; attempt <= 40 && !found; attempt++) {
    App.init(`深诊${attempt}`, 'CLE', 2003);
    const st = App.state;
    for (let s = 1; s <= 2; s++) runFullSeason(st, 'CLE');

    const roster = st.teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o);
    const ratings = [99, 95, 91];
    const starIds = [];
    for (let i = 0; i < 3; i++) {
        const p = roster[i];
        const delta = ratings[i] - p.o;
        p.o = ratings[i];
        ['ins', 'sh', 'pa'].forEach(k => { p[k] = Math.max(40, Math.min(99, p[k] + delta)); });
        p.de = Math.max(40, Math.min(99, p.de + delta));
        p.iq = Math.max(40, Math.min(99, p.iq + delta));
        p.re = Math.max(40, Math.min(99, p.re + Math.round(delta / 2)));
        p.at = Math.max(40, Math.min(99, p.at + Math.round(delta / 2)));
        p.injured = 0;
        starIds.push(p.id);
    }
    const injBefore = (st.injuryLog || []).length;

    const r = runFullSeason(st, 'CLE');
    if (r.win >= THRESHOLD) {
        console.log(`attempt${attempt}: ${r.win}-${r.loss} (正常，继续找)`);
        continue;
    }
    found = true;
    console.log(`\n======== 捕获异常 run (attempt${attempt}): ${r.win}-${r.loss} 东部第${r.rank} ========`);

    // 1) 第3季阵容 + GP + 场均数据
    console.log('\n--- CLE 第3季阵容（含出场数）---');
    const acc = st.statAccum['CLE'] || {};
    st.teamsPlayers['CLE'].slice().sort((a, b) => b.o - a.o).forEach(p => {
        const s = acc[p.id];
        if (!s) { console.log(`   ${p.n} ${p.p} ${p.a}岁 ovr=${p.o} sal=${p.sal} —— 0场(未出场) inj=${p.injured}`); return; }
        console.log(`   ${p.n} ${p.p} ${p.a}岁 ovr=${p.o} GP=${s.gp} ${(s.pts / s.gp).toFixed(1)}分 ${(s.reb / s.gp).toFixed(1)}板 ${(s.ast / s.gp).toFixed(1)}助 min=${(s.min / s.gp).toFixed(1)} inj=${p.injured}`);
    });

    // 2) 用户比赛日志：得分模式
    const logs = st.userGameLog.filter(g => g.day != null);
    const myAvg = logs.reduce((a, g) => a + g.myScore, 0) / logs.length;
    const oppAvg = logs.reduce((a, g) => a + g.oppScore, 0) / logs.length;
    console.log(`\n--- 用户比赛 ${logs.length} 场: 我方场均 ${myAvg.toFixed(1)} / 对手场均 ${oppAvg.toFixed(1)} ---`);
    // 分段展示（每 20 场）
    for (let i = 0; i < logs.length; i += 20) {
        const seg = logs.slice(i, i + 20);
        const w = seg.filter(g => g.win).length;
        const myS = (seg.reduce((a, g) => a + g.myScore, 0) / seg.length).toFixed(1);
        const opS = (seg.reduce((a, g) => a + g.oppScore, 0) / seg.length).toFixed(1);
        console.log(`   第${i + 1}-${Math.min(i + 20, logs.length)}场: ${w}胜${seg.length - w}负 我方${myS} 对手${opS}`);
    }

    // 3) 东西部排名
    console.log('\n--- 东部前10 ---');
    const east = st.teams.filter(t => t.conf === 'East')
        .map(t => ({ tid: t.id, r: st.records[t.id] })).sort((a, b) => b.r.win - a.r.win);
    east.slice(0, 10).forEach((x, i) => console.log(`   ${i + 1}. ${x.tid} ${x.r.win}-${x.r.loss} 净胜${(x.r.ptsFor - x.r.ptsAgt).toFixed(0)}`));

    // 3.5) 联盟最强队阵容 + 全联盟 90+ 球员分布
    const allTeams = st.teams.map(t => ({ tid: t.id, r: st.records[t.id] })).sort((a, b) => b.r.win - a.r.win);
    const topTeam = allTeams[0];
    console.log(`\n--- 联盟第1 ${topTeam.tid} (${topTeam.r.win}-${topTeam.r.loss}) 阵容 ---`);
    st.teamsPlayers[topTeam.tid].slice().sort((a, b) => b.o - a.o).slice(0, 10)
        .forEach(p => console.log(`   ${p.n} ${p.p} ${p.a}岁 ovr=${p.o} sal=${p.sal}`));
    console.log(`   队内 90+: ${st.teamsPlayers[topTeam.tid].filter(p => p.o >= 90).length}, 85+: ${st.teamsPlayers[topTeam.tid].filter(p => p.o >= 85).length}, 总薪资=${st.teamsPlayers[topTeam.tid].reduce((s, p) => s + (p.sal || 0), 0).toFixed(1)}`);

    // 全联盟 90+ 分布
    console.log('\n--- 全联盟 90+ 球员分布 ---');
    st.teams.forEach(t => {
        const stars = st.teamsPlayers[t.id].filter(p => p.o >= 90);
        if (stars.length > 0) console.log(`   ${t.id} (${st.records[t.id].win}胜): ${stars.map(p => `${p.n.split('·').pop()}${p.o}`).join(', ')}`);
    });

    // 3.6) 三季全部交易中的球星流动（ovr>=85）
    console.log('\n--- 三季交易记录（含 ovr>=85 球员的）---');
    (st.tradeLog || []).forEach(tr => {
        if (!tr.outgoingA && !tr.outgoingB) return;
        const players = [...(tr.outgoingA || []), ...(tr.outgoingB || [])];
        if (players.some(p => p && p.o >= 85)) {
            const names = [];
            if (tr.outgoingA) names.push(`${tr.teamA}送出[${tr.outgoingA.map(p => `${p.n.split('·').pop()}${p.o}`).join(',')}]`);
            if (tr.outgoingB) names.push(`${tr.teamB}送出[${tr.outgoingB.map(p => `${p.n.split('·').pop()}${p.o}`).join(',')}]`);
            console.log(`   ${names.join(' ⇄ ')}`);
        }
    });
    console.log(`   (交易总数: ${(st.tradeLog || []).length})`);

    // 7) 引擎视角：全部球队的攻防评级 + CLE 直接对打胜率
    console.log('\n--- 引擎评级（off=星光进攻, def=时间加权防守, rating=teamRating）---');
    const S = sandbox.SimEngine;
    const allRatings = st.teams.map(t => {
        const rot = S.buildRotation(st.teamsPlayers[t.id], null);
        const offOf = p => (p.ins + p.sh + p.pa) / 3;
        let os = 0, ow = 0; rot.forEach(r => { os += offOf(r.player) * r.min; ow += r.min; });
        const avg = os / ow;
        const sorted = rot.slice().sort((a, b) => offOf(b.player) - offOf(a.player));
        const top3 = sorted.slice(0, 3);
        let ts = 0, tw = 0; top3.forEach(r => { ts += offOf(r.player) * r.min; tw += r.min; });
        const off = avg + ((ts / tw) - avg) * 0.25;
        let ds = 0; rot.forEach(r => { ds += r.player.de * r.min; });
        const def = ds / ow;
        return { tid: t.id, off, def, rating: S.teamRating(st.teamsPlayers[t.id]), wins: st.records[t.id].win };
    }).sort((a, b) => b.off - a.off);
    allRatings.forEach(r => console.log(`   ${r.tid} ${r.wins}胜: off=${r.off.toFixed(1)} def=${r.def.toFixed(1)} rating=${r.rating.toFixed(1)}`));

    // 7.5) CLE 轮换的 offOf/de 明细
    console.log('\n--- CLE 轮换明细（offOf=(ins+sh+pa)/3, de）---');
    const cleRot = S.buildRotation(st.teamsPlayers['CLE'], null);
    cleRot.forEach(r => {
        const p = r.player;
        console.log(`   ${p.n} ovr=${p.o} min=${r.min} offOf=${((p.ins + p.sh + p.pa) / 3).toFixed(1)} de=${p.de} (ins=${p.ins} sh=${p.sh} pa=${p.pa} re=${p.re})`);
    });

    // CLE vs 各对手直接模拟 60 场
    console.log('\n--- CLE 直接模拟（60场/对手，与赛季实际对比）---');
    const cleP = st.teamsPlayers['CLE'];
    ['ATL', 'CHI', 'DEN', 'IND', 'BOS', 'WAS', 'SAS', 'MIL'].forEach(opp => {
        const oppP = st.teamsPlayers[opp];
        if (!oppP) return;
        let w = 0, N = 60;
        for (let i = 0; i < N; i++) {
            const home = i % 2 === 0;
            const res = home ? S.simulateGame(cleP, oppP) : S.simulateGame(oppP, cleP);
            const won = home ? res.winner === 'home' : res.winner === 'away';
            if (won) w++;
        }
        const oppRec = st.records[opp];
        console.log(`   vs ${opp}(${oppRec.win}胜): 直接模拟胜率 ${(w / N * 100).toFixed(0)}%`);
    });

    // 5) 球星伤病记录（第3季全部）
    const inj3 = (st.injuryLog || []).slice(injBefore).filter(x => x.teamId === 'CLE');
    console.log(`--- CLE 第3季伤病 ${inj3.length} 条 ---`);
    inj3.slice(0, 20).forEach(i => console.log(`   ${i.player} ${i.days}场 (day${i.day})`));

    // 6) 对强队/弱队胜率
    console.log('\n--- 按对手胜率 ---');
    const oppGroups = {};
    logs.forEach(g => {
        const k = g.opp; (oppGroups[k] = oppGroups[k] || []).push(g.win);
    });
    Object.entries(oppGroups).forEach(([k, v]) => {
        const wr = (v.filter(Boolean).length / v.length * 100).toFixed(0);
        const oppRec = st.records[k];
        console.log(`   vs ${k}(${oppRec.win}胜): ${v.filter(Boolean).length}/${v.length} (${wr}%)`);
    });
}

if (!found) console.log('\n40 次尝试未捕获异常 run');
