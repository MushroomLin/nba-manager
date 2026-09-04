// 历史赛季功能综合测试
// 覆盖：HistoryEngine 单元测试 + App 完整游戏流程（2003-04 马刺）+ 存档回环 + 多赛季开局
const fs = require('fs'), path = require('path'), vm = require('vm');

// ============================================================
// 1. 构建 vm 沙箱（事件感知 DOM mock）
// ============================================================
function makeEl(id, extra = {}) {
    const el = {
        id, _innerHTML: '',
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) { this._innerHTML = String(v); },
        textContent: '', value: '', scrollTop: 0, disabled: false,
        dataset: {}, style: {}, title: '', className: '', tagName: 'DIV',
        classList: {
            add(...cs) { el.className += ' ' + cs.join(' '); },
            remove(c) { el.className = el.className.split(/\s+/).filter(x => x !== c).join(' '); },
            toggle() {}, contains(c) { return el.className.split(/\s+/).includes(c); },
        },
        _listeners: {},
        addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
        appendChild() {}, remove() {},
    };
    return Object.assign(el, extra);
}

const elements = {};
const doc = {
    getElementById: id => (elements[id] || (elements[id] = makeEl(id))),
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: tag => makeEl(tag),
    body: makeEl('body'), head: makeEl('head'),
    addEventListener() {},
};

const store = new Map();
const localStorageMock = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k), clear: () => store.clear(),
};

const sandbox = {
    console, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean, Promise,
    parseInt, parseFloat, isNaN, isFinite,
    setTimeout: fn => { try { fn(); } catch (e) { console.error('[setTimeout]', e.message); } },
    clearTimeout: () => {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    Blob: class {}, FileReader: class { readAsText() {} },
    location: { reload: () => {} },
    confirm: () => true, alert: () => {},
    fetch: () => Promise.reject(new Error('no fetch in test')),
    document: doc, localStorage: localStorageMock,
};
sandbox.window = sandbox; sandbox.global = sandbox;
vm.createContext(sandbox);

const baseDir = path.join(__dirname, 'js');
const load = rel => vm.runInContext(fs.readFileSync(path.join(baseDir, rel), 'utf8'), sandbox, { filename: rel });

load('data/teams.js');
load('data/players.js');
load('data/rookies.js');
load('data/nba_stats.js');
load('data/history/history_seasons.js');
load('engine/history.js');
load('engine/simulation.js');
load('engine/trade.js');
load('engine/season.js');
load('engine/draft.js');
load('engine/save.js');
load('engine/achievements.js');
load('ui/app.js');

const { App, HistoryEngine, SaveEngine } = sandbox;
let passCount = 0, failCount = 0, failures = [];
const assert = (c, m) => {
    if (c) { passCount++; console.log(`  ✓ ${m}`); }
    else { failCount++; failures.push(m); console.log(`  ✗ ${m}`); }
};
const section = t => console.log(`\n${'='.repeat(60)}\n${t}\n${'='.repeat(60)}`);

// ============================================================
// 2. HistoryEngine 单元测试
// ============================================================
section('Part 1: HistoryEngine 单元测试');

assert(HistoryEngine.isAvailable() === true, '历史数据可用 isAvailable()');
const yrs = HistoryEngine.availableYears();
assert(yrs && yrs.first === 1996 && yrs.last === 2025, `数据范围 1996-2025 (实际 ${yrs.first}-${yrs.last})`);

// 球队可用性
const t1996 = HistoryEngine.teamsAvailable(1996);
assert(t1996.has('OKC'), '1996 西雅图超音速(→OKC) 有名单');
assert(t1996.has('MEM'), '1996 温哥华灰熊(→MEM) 有名单');
assert(t1996.has('CHA'), '1996 老夏洛特黄蜂(→CHA) 有名单');
assert(t1996.has('BKN'), '1996 新泽西篮网(→BKN) 有名单');
assert(!t1996.has('NOP'), '1996 无新奥尔良球队(2002年才迁入)');
assert(!t1996.has('CHA') === false && t1996.size >= 27, `1996 可选球队数 ${t1996.size} >= 27`);

const t2005 = HistoryEngine.teamsAvailable(2005);
assert(t2005.has('NOP'), '2005 新奥尔良黄蜂(→NOP) 有名单');
assert(t2005.has('CHA'), '2005 夏洛特山猫(→CHA) 有名单');

// 队名覆盖
assert(JSON.stringify(HistoryEngine.teamLabel('OKC', 1996)) === JSON.stringify({city:'西雅图',name:'超音速'}), 'teamLabel OKC@1996 = 西雅图超音速');
assert(HistoryEngine.teamLabel('OKC', 2008) === null, 'teamLabel OKC@2008 = null(已迁至俄城)');
assert(JSON.stringify(HistoryEngine.teamLabel('MEM', 1996)) === JSON.stringify({city:'温哥华',name:'灰熊'}), 'teamLabel MEM@1996 = 温哥华灰熊');
assert(JSON.stringify(HistoryEngine.teamLabel('BKN', 2010)) === JSON.stringify({city:'新泽西',name:'篮网'}), 'teamLabel BKN@2010 = 新泽西篮网');
assert(JSON.stringify(HistoryEngine.teamLabel('WAS', 1996)) === JSON.stringify({city:'华盛顿',name:'子弹'}), 'teamLabel WAS@1996 = 华盛顿子弹');
assert(HistoryEngine.teamLabel('WAS', 1997) === null, 'teamLabel WAS@1997 = null(已改名奇才)');
assert(JSON.stringify(HistoryEngine.teamLabel('NOP', 2005)) === JSON.stringify({city:'新奥尔良',name:'黄蜂'}), 'teamLabel NOP@2005 = 新奥尔良黄蜂');
assert(JSON.stringify(HistoryEngine.teamLabel('CHA', 2010)) === JSON.stringify({city:'夏洛特',name:'山猫'}), 'teamLabel CHA@2010 = 夏洛特山猫');
assert(HistoryEngine.teamLabel('CHA', 2003) === null, 'teamLabel CHA@2003 = null(该年夏洛特无球队)');

// buildLeague 明星球员验证
const lg2003 = HistoryEngine.buildLeague(2003);
assert(Array.isArray(lg2003) && lg2003.length >= 400, `2003-04 名单 ${lg2003.length} 人 (>=400)`);
const td = lg2003.find(p => p.n === '蒂姆·邓肯');
assert(!!td && td.t === 'SAS' && td.o >= 92, `邓肯在 SAS, ovr=${td ? td.o : '?'} (>=92)`);
const lbj = lg2003.find(p => p.n.includes('勒布朗'));
assert(!!lbj && lbj.t === 'CLE' && lbj.isRookie && lbj.draftYear === 2003, `勒布朗新秀在 CLE (draftYear=2003, ovr=${lbj ? lbj.o : '?'})`);
const kg = lg2003.find(p => p.n.includes('加内特'));
assert(!!kg && kg.t === 'MIN', '加内特在 MIN');

const lg1996 = HistoryEngine.buildLeague(1996);
const jordan = lg1996.find(p => p.n.includes('乔丹'));
assert(!!jordan && jordan.t === 'CHI' && jordan.o >= 93, `乔丹 1996-97 在 CHI, ovr=${jordan ? jordan.o : '?'} (>=93)`);
const shaq = lg1996.find(p => p.n.includes('奥尼尔') && p.t === 'LAL');
assert(!!shaq, '奥尼尔 1996-97 在 LAL');

// 真实选秀班级
const dc2003 = HistoryEngine.getDraftClass(2003);
assert(!!dc2003 && dc2003.drafted.length >= 40, `2003 选秀班级 ${dc2003 ? dc2003.drafted.length : 0} 名真实新秀 (>=40)`);
const top5 = dc2003.drafted.slice(0, 5).map(p => `${p.draft_round}-${p.draft_number} ${p.n}`);
console.log('    2003 前5顺位:', top5.join(' | '));
assert(dc2003.drafted[0].n.includes('勒布朗'), '2003 状元 = 勒布朗·詹姆斯');
assert(dc2003.drafted[2].n.includes('安东尼'), '2003 探花 = 卡梅罗·安东尼');
assert(dc2003.drafted[4].n.includes('韦德'), '2003 第5顺位 = 德维恩·韦德');

const dc1997 = HistoryEngine.getDraftClass(1997);
assert(!!dc1997 && dc1997.drafted[0].n.includes('邓肯'), `1997 状元 = 蒂姆·邓肯 (实际 ${dc1997 ? dc1997.drafted[0].n : '无'})`);
assert(HistoryEngine.getDraftClass(1996) === null, '1996 选秀（数据范围外）返回 null');
assert(HistoryEngine.getDraftClass(2026) === null, '2026 选秀（数据范围外）返回 null');

// 生涯历史预填
const careers = HistoryEngine.allCareerHistories(2003);
const tdHist = careers[td.histId];
assert(!!tdHist && tdHist.length === 6, `邓肯至2003有 ${tdHist ? tdHist.length : 0} 季历史 (期望6: 1997-98~2002-03)`);
if (tdHist) {
    const last = tdHist[tdHist.length - 1];
    assert(last.year === 2003 && last.teamId === 'SAS' && last.pts > 18, `邓肯 2002-03 快照: year=${last.year} pts=${last.pts}`);
}
// 乔丹 2003 前历史：96-97, 97-98, 01-02, 02-03 = 4 季
const jordanHist = Object.keys(careers).length > 0 ? null : null;
const jordanPid = lg1996.find(p => p.n.includes('乔丹')).histId;
const jh = HistoryEngine.allCareerHistories(2003)[jordanPid];
assert(!!jh && jh.length === 4, `乔丹至2003有 ${jh ? jh.length : 0} 季历史 (期望4)`);
const gp0 = Object.entries(careers).filter(([pid, h]) => h.some(s => !s.gp)).length;
assert(gp0 === 0, `生涯历史 gp 字段完整 (异常 ${gp0} 条)`);

// 冠军史
const champs = HistoryEngine.championsBefore(2003);
assert(champs.length === 57, `2003 前真实冠军 ${champs.length} 季 (期望57)`);
assert(champs[champs.length-1].year === 2002 && champs[champs.length-1].team === 'SAS', '最近冠军 2002 SAS(2002-03赛季)');
const champs96 = HistoryEngine.championsBefore(1996);
assert(champs96[champs96.length-1].year === 1995 && champs96[champs96.length-1].team === 'CHI', '1996 开局前最近冠军 1995 公牛');

// ============================================================
// 3. App 完整流程：2003-04 马刺
// ============================================================
section('Part 2: App 完整流程（2003-04 圣安东尼奥马刺）');

App.init('测试GM', 'SAS', 2003);
let st = App.state;
assert(st.year === 2003 && st.phase === 'regular', `开局 2003-04 赛季 (year=${st.year}, phase=${st.phase})`);

// 历史队名生效
const teamOf = id => st.teams.find(t => t.id === id);
assert(teamOf('OKC').city === '西雅图' && teamOf('OKC').name === '超音速', '联盟中西雅图超音速队名生效');
assert(teamOf('MEM').city === '孟菲斯', '2003 灰熊已在孟菲斯（2001年迁离温哥华）');
assert(teamOf('BKN').city === '新泽西', '联盟中新泽西篮网队名生效');
assert(teamOf('NOP').city === '新奥尔良' && teamOf('NOP').name === '黄蜂', '联盟中新奥尔良黄蜂队名生效');

// 名单
const duncan = st.players.find(p => p.n === '蒂姆·邓肯');
assert(!!duncan && st.teamsPlayers.SAS.includes(duncan), '邓肯在玩家(SAS)名单中');
assert(duncan.o >= 92, `邓肯 ovr=${duncan.o}`);
const realCount = st.players.filter(p => p.histId != null).length;
assert(realCount >= 400, `真实历史球员 ${realCount} 名 (>=400)`);
assert(st.players.filter(p => p.histId != null && p.t === 'SAS').length >= 10, `SAS 真实球员 >= 10`);

// 每队名单完整性（历史名单含赛季中交易球员，上限放宽到 19；下限 14）
const rosterOk = st.teams.every(t => st.teamsPlayers[t.id].length >= 14 && st.teamsPlayers[t.id].length <= 19);
assert(rosterOk, '30 队名单均 14-19 人');

// playerHistory 预填
const seeded = Object.keys(st.playerHistory).length;
assert(seeded >= 300, `预填生涯数据 ${seeded} 人 (>=300)`);
const dh = st.playerHistory[duncan.id];
assert(!!dh && dh.length === 6, `邓肯 playerHistory 6 季 (实际 ${dh ? dh.length : 0})`);

// 冠军史预填
assert(st.champions.length === 57 && st.champions[56].team === 'SAS', '真实冠军史 57 季预填');

// ---- 常规赛快进 ----
console.log('\n---- 快进 2003-04 常规赛 ----');
App.fastAdvance();
st = App.state;
assert(st.phase === 'playoffs' || st.phase === 'finals', `常规赛结束进入季后赛 (phase=${st.phase})`);
const myRec = st.records.SAS;
assert(myRec.win + myRec.loss >= 78 && myRec.win >= 35, `马刺战绩 ${myRec.win}胜${myRec.loss}负 (卫冕冠军应 >=35 胜)`);
assert(!!st.standings, '排名已生成');

// ---- 奖项（常规赛结束时已评） ----
const aw = st.awardsHistory[0];
assert(!!aw, '赛季奖项已评选');
assert(!!aw.mvp && !!aw.mvp.player, `MVP: ${aw.mvp ? aw.mvp.player.n : '空'}`);
assert(!!aw.roy && !!aw.roy.player, `ROY: ${aw.roy ? aw.roy.player.n : '空'}`);
if (aw.roy && aw.roy.player && aw.roy.player.draftYear != null) {
    assert(aw.roy.player.draftYear === 2003, `ROY 来自 2003 选秀 (实际 ${aw.roy.player.draftYear})`);
}
console.log(`    MVP=${aw.mvp && aw.mvp.player.n}, ROY=${aw.roy && aw.roy.player.n}, DPOY=${aw.dpoy && aw.dpoy.player.n}, MIP=${aw.mip && aw.mip.player.n}`);

// ---- 季后赛快进 ----
console.log('---- 快进季后赛 ----');
let guard = 0;
while ((st.phase === 'playoffs' || st.phase === 'finals') && guard++ < 10) App.fastAdvance();
st = App.state;
assert(st.phase === 'offseason', `季后赛结束进入休赛期 (phase=${st.phase})`);
const newChamp = st.champions[st.champions.length - 1];
assert(st.champions.length === 58, `冠军史 58 季 (+1)`);
// 冠军年份用起始年语义（2003 = 2003-04 赛季），与预填真实冠军史一致
assert(newChamp.year === 2003, `2003-04 冠军已记录 (year=${newChamp.year}, ${newChamp.name})`);

// ---- 选秀（2004 真实班级） ----
console.log('---- 2004 选秀 ----');
App.advance(); // offseason → draft
st = App.state;
assert(st.phase === 'draft' && st.year === 2004, `选秀开始 (year=${st.year}, phase=${st.phase})`);
const hasHoward = st.rookieClass.some(p => p.n.includes('霍华德') && p.draft_number === 1);
const howard = st.rookieClass.find(p => p.n.includes('霍华德'));
assert(!!howard, `2004 选秀班级含德怀特·霍华德 (ovr=${howard ? howard.o : '?'})`);
const realRookies = st.rookieClass.filter(p => p.histId != null).length;
assert(realRookies >= 40, `真实新秀 ${realRookies} 名 (>=40)`);
console.log(`    霍华德: ovr=${howard.o}, pot=${howard.pot}, 顺位 ${howard.draft_round}-${howard.draft_number}`);

// 模拟完整选秀（轮到玩家时自动选最优）
let draftGuard = 0;
while (st.phase === 'draft' && draftGuard++ < 200) {
    if (st.draftPick >= 60) { App.advance(); break; }
    if (st.draftOrder[st.draftPick] === 'SAS') {
        const avail = st.rookieClass.filter(r => r.t === null);
        avail.sort((a, b) => (b.o + b.pot) - (a.o + a.pot));
        App.userDraftPick(avail[0].id);
    } else {
        App.advance();
    }
    st = App.state;
}
assert(st.phase === 'freeAgency', `选秀完成进入自由市场 (phase=${st.phase})`);
const howardDrafted = st.players.find(p => p.n.includes('霍华德') && p.histId != null && p.t != null);
assert(!!howardDrafted, `霍华德已被选中 (${howardDrafted ? howardDrafted.t : '?'})`);
assert(st.freeAgents.length >= 5, `自由市场 ${st.freeAgents.length} 人 (>=5)`);

// ---- 新赛季 ----
console.log('---- 进入 2004-05 赛季 ----');
App.advance(); // freeAgency → startNewSeason
st = App.state;
assert(st.phase === 'regular' && st.year === 2004, `新赛季开始 (year=${st.year}, phase=${st.phase})`);
assert(st.records.SAS.win === 0 && st.records.SAS.loss === 0, '战绩已重置');
const rosterOk2 = st.teams.every(t => st.teamsPlayers[t.id].length >= 13);
assert(rosterOk2, '新赛季各队名单完整');
// 2004-05 邓肯仍在（28→29岁，未退役）
const td2 = st.players.find(p => p.n === '蒂姆·邓肯');
assert(!!td2 && td2.t === 'SAS', '邓肯 2004-05 仍在马刺');
// 勒布朗应仍在联盟（19→20岁）
const lbj2 = st.players.find(p => p.n.includes('勒布朗'));
assert(!!lbj2, '勒布朗仍在联盟');

// ---- 2004-05 完整赛季再跑一遍（含 2005 选秀：保罗）----
console.log('---- 快进 2004-05 赛季 + 2005 选秀 ----');
App.fastAdvance();
guard = 0;
while ((st.phase === 'playoffs' || st.phase === 'finals') && guard++ < 10) App.fastAdvance();
st = App.state;
assert(st.phase === 'offseason', '2004-05 赛季结束');
App.advance();
st = App.state;
assert(st.phase === 'draft' && st.year === 2005, `2005 选秀 (year=${st.year})`);
const cp3 = st.rookieClass.find(p => p.n.includes('保罗'));
assert(!!cp3, `2005 选秀含克里斯·保罗 (ovr=${cp3 ? cp3.o : '?'})`);

// 模拟完整选秀 + 进入 2005-06
draftGuard = 0;
while (st.phase !== 'regular' && draftGuard++ < 300) {
    if (st.phase === 'draft') {
        if (st.draftPick >= 60) { App.advance(); }
        else if (st.draftOrder[st.draftPick] === 'SAS') {
            const avail = st.rookieClass.filter(r => r.t === null);
            avail.sort((a, b) => (b.o + b.pot) - (a.o + a.pot));
            if (avail.length) App.userDraftPick(avail[0].id); else App.advance();
        } else App.advance();
    } else if (st.phase === 'freeAgency' || st.phase === 'offseason') {
        App.advance();
    } else break;
    st = App.state;
}
assert(st.phase === 'regular' && st.year === 2005, `2005-06 赛季开始 (year=${st.year}, phase=${st.phase})`);

// ============================================================
// 4. 存档回环测试
// ============================================================
section('Part 3: 存档回环（历史赛季）');
SaveEngine.autoSave(st);
const loadedRaw = SaveEngine.loadAuto();
assert(!!loadedRaw, '自动存档可读取');
App.loadState(loadedRaw);
st = App.state;
assert(st.year === 2005 && st.phase === 'regular', `读档恢复 2005-06 (year=${st.year})`);
const td3 = st.players.find(p => p.n === '蒂姆·邓肯');
assert(!!td3 && st.teamsPlayers.SAS.includes(td3), '读档后邓肯仍在马刺名单');
const jsonOk = (() => { try { JSON.stringify(st); return true; } catch (e) { return false; } })();
assert(jsonOk, 'state 可 JSON 序列化（无循环引用）');
const jsonOk2 = (() => { try { JSON.parse(JSON.stringify(st)); return true; } catch (e) { return false; } })();
assert(jsonOk2, 'state 可 JSON 反序列化（存档体积回环）');
const teamsOk = st.teams.every(t => Array.isArray(st.teamsPlayers[t.id]));
assert(teamsOk, '读档后 teamsPlayers 重建完整');

// ============================================================
// 5. 多赛季开局冒烟测试
// ============================================================
section('Part 4: 多赛季开局冒烟测试');

function smokeInit(year, teamId, checks, label) {
    App.init('冒烟', teamId, year);
    const s = App.state;
    let ok = s.year === year && s.phase === 'regular';
    const details = [];
    checks.forEach(c => {
        const r = c(s);
        if (!r.ok) ok = false;
        details.push(`${r.name}: ${r.ok ? '✓' : '✗ ' + (r.info || '')}`);
    });
    console.log(`  [${label}] year=${s.year} | ${details.join(' | ')}`);
    return ok;
}

assert(smokeInit(1996, 'CHI', [
    s => ({ name: '乔丹在CHI', ok: !!s.players.find(p => p.n.includes('乔丹') && p.t === 'CHI') }),
    s => ({ name: '超音速队名', ok: s.teams.find(t => t.id === 'OKC').city === '西雅图' }),
    s => ({ name: '冠军史50季', ok: s.champions.length === 50, info: s.champions.length }),
    s => ({ name: '名单完整', ok: s.teams.every(t => s.teamsPlayers[t.id].length >= 14) }),
], '1996-97 公牛'), '1996-97 公牛开局');

assert(smokeInit(2015, 'GSW', [
    s => ({ name: '库里在GSW', ok: !!s.players.find(p => p.n.includes('库里') && p.t === 'GSW') }),
    s => ({ name: '73胜阵容', ok: !!s.players.find(p => p.n.includes('格林') && p.t === 'GSW') }),
    s => ({ name: '冠军史69季', ok: s.champions.length === 69, info: s.champions.length }),
], '2015-16 勇士'), '2015-16 勇士开局');

assert(smokeInit(2025, 'OKC', [
    s => ({ name: 'SGA在OKC', ok: !!s.players.find(p => p.n.includes('亚历山大') && p.t === 'OKC') }),
    s => ({ name: '文班在SAS', ok: !!s.players.find(p => p.n.includes('文班') && p.t === 'SAS') }),
    s => ({ name: '冠军史79季', ok: s.champions.length === 79, info: s.champions.length }), // 2024-25 雷霆夺冠已包含
], '2025-26 雷霆'), '2025-26 雷霆开局');

// 默认模式不受影响
App.init('现役', 'LAL', 2026);
st = App.state;
assert(st.year === 2026 && st.players.some(p => p.n.includes('詹姆斯') || p.n.includes('东契奇')), '默认 2026-27 现役名单正常');

// ============================================================
// 结果汇总
// ============================================================
console.log(`\n${'='.repeat(60)}\n测试结果: ${passCount} 通过, ${failCount} 失败\n${'='.repeat(60)}`);
if (failures.length) { console.log('失败项:'); failures.forEach(f => console.log('  - ' + f)); }
process.exit(failCount > 0 ? 1 : 0);
