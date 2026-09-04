// 历史模式长周期压力测试：1996-97 公牛开局，连续模拟 8 个完整赛季
// 验证：历届真实选秀（1997邓肯/1998诺维茨基/2002姚明/2003勒布朗）、
//       球员老化退役、名单一致性、冠军史累计、无崩溃
const fs = require('fs'), path = require('path'), vm = require('vm');

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
    document: doc, localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() },
};
sandbox.window = sandbox; sandbox.global = sandbox;
vm.createContext(sandbox);
const load = rel => vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', rel), 'utf8'), sandbox, { filename: rel });
load('data/teams.js'); load('data/players.js'); load('data/rookies.js'); load('data/nba_stats.js');
load('data/history/history_seasons.js'); load('engine/history.js');
load('engine/simulation.js'); load('engine/trade.js'); load('engine/season.js'); load('engine/draft.js');
load('engine/save.js'); load('engine/achievements.js'); load('ui/app.js');
const { App } = sandbox;

let passCount = 0, failCount = 0, failures = [];
const assert = (c, m) => { if (c) { passCount++; } else { failCount++; failures.push(m); console.log(`  ✗ ${m}`); } };
const log = m => console.log(m);

// 每届选秀的必检球星（数据源覆盖范围内）
const DRAFT_CHECKS = {
    1997: ['邓肯'],
    1998: ['诺维茨基', '皮尔斯'],
    1999: ['吉诺比利'],
    2000: ['肯扬·马丁'],
    2001: ['加索尔', '帕克'],
    2002: ['姚明', '斯塔德迈尔'],
    2003: ['勒布朗', '安东尼', '韦德', '波什'],
};

App.init('压力测试', 'CHI', 1996);
let st = App.state;
log(`\n==== 1996-97 公牛开局：${st.players.filter(p => p.histId != null).length} 名真实球员 ====`);

const t0 = Date.now();
let championsLog = [];
for (let season = 1996; season <= 2003; season++) {
    const phase0 = st.phase;
    // ---- 常规赛 ----
    App.fastAdvance();
    // ---- 季后赛 ----
    let guard = 0;
    while ((st.phase === 'playoffs' || st.phase === 'finals') && guard++ < 10) App.fastAdvance();
    if (st.phase !== 'offseason') { assert(false, `${season} 赛季后应进入 offseason (实际 ${st.phase})`); break; }

    // ---- 冠军记录 ----
    const champ = st.champions[st.champions.length - 1];
    assert(champ && champ.year === season && champ.name, `${season}-${String(season+1).slice(2)} 冠军: ${champ.name} (${champ.finalsScore})`);
    championsLog.push(`${season + 1} ${champ.name}`);

    // ---- 奖项完整性 ----
    const aw = st.awardsHistory[st.awardsHistory.length - 1];
    assert(aw && aw.year === season && aw.mvp && aw.roy, `${season} 奖项: MVP=${aw.mvp ? aw.mvp.player.n : '?'} ROY=${aw.roy ? aw.roy.player.n : '?'}`);

    // ---- 选秀 ----
    App.advance(); // → draft
    if (st.phase !== 'draft') { assert(false, `${season} 后选秀未开始 (${st.phase})`); break; }
    const draftYear = st.year;
    const realRookies = st.rookieClass.filter(p => p.histId != null);
    if (DRAFT_CHECKS[draftYear]) {
        DRAFT_CHECKS[draftYear].forEach(name => {
            const found = realRookies.find(p => p.n.includes(name));
            assert(!!found, `${draftYear} 选秀含 ${name}${found ? '' : '（缺失）'}`);
        });
    }
    // 完整选秀 + 自由市场 + 新赛季
    let g2 = 0;
    while (st.phase !== 'regular' && g2++ < 400) {
        if (st.phase === 'draft') {
            if (st.draftPick >= 60) { App.advance(); }
            else if (st.draftOrder[st.draftPick] === 'CHI') {
                const avail = st.rookieClass.filter(r => r.t === null);
                avail.sort((a, b) => (b.o + b.pot) - (a.o + a.pot));
                if (avail.length) App.userDraftPick(avail[0].id); else App.advance();
            } else App.advance();
        } else if (st.phase === 'freeAgency' || st.phase === 'offseason') {
            App.advance();
        } else break;
    }
    st = App.state;

    // ---- 新赛季完整性 ----
    assert(st.phase === 'regular' && st.year === season + 1, `进入 ${season + 1}-${String(season + 2).slice(2)} 赛季`);
    const rosterOk = st.teams.every(t => st.teamsPlayers[t.id].length >= 13 && st.teamsPlayers[t.id].length <= 15);
    assert(rosterOk, `${season + 1} 各队名单 13-15 人`);
    // 球员对象完整性
    const badPlayers = st.players.filter(p => !p.n || p.o == null || p.o < 40 || p.o > 99).length;
    assert(badPlayers === 0, `${season + 1} 无异常球员对象 (${badPlayers} 个)`);
    // 每季存档体积监控
    const size = JSON.stringify(st).length / 1024;
    if (size > 3500) assert(false, `${season + 1} 存档体积过大: ${size.toFixed(0)}KB`);

    log(`  ${season}-${String(season+1).slice(2)} 完成 ✓  联盟 ${st.players.length} 人, 存档 ${size.toFixed(0)}KB`);
}

// ---- 8 季后联盟健康度 ----
log('\n==== 2004-05 赛季初联盟健康度 ====');
st = App.state;
// 乔丹 1996 开局时应已退役（2003 年真实退役，游戏中按年龄老化退役）
// 注意按全名精确匹配：includes('乔丹') 会误伤雷吉·乔丹等同姓球员
const jordan = st.players.find(p => p.n === '迈克尔·乔丹');
assert(!jordan, jordan ? `乔丹仍滞留联盟（${jordan.a} 岁）` : '乔丹已按年龄退役');
// 邓肯应从 1997 选秀进入并存活
const duncan = st.players.find(p => p.n.includes('邓肯'));
assert(!!duncan && duncan.a >= 27 && duncan.a <= 29, `邓肯 ${duncan ? duncan.a + '岁 ovr=' + duncan.o : '失踪'}`);
// 勒布朗 2003 选秀进入，2004-05 应为二年级 20 岁
const lbj = st.players.find(p => p.n.includes('勒布朗'));
assert(!!lbj && lbj.a === 20, `勒布朗二年级 (${lbj ? lbj.a + '岁 ovr=' + lbj.o : '失踪'})`);
// 冠军史 = 50 (预填) + 8 (模拟) = 58
assert(st.champions.length === 58, `冠军史 ${st.champions.length} 季 (期望58)`);
// 能力分布健康（无全联盟能力崩塌/膨胀）
const ovrs = st.players.filter(p => !p.isFiller).map(p => p.o);
const elite = ovrs.filter(o => o >= 90).length;
const avg = (ovrs.reduce((a, b) => a + b, 0) / ovrs.length).toFixed(1);
assert(elite >= 3 && elite <= 40, `90+ 球员 ${elite} 名（健康区间 3-40）`);
log(`  联盟平均 ovr=${avg}, 90+=${elite}, 总人数=${st.players.length}`);
log(`  冠军时间线: ${championsLog.join(' → ')}`);

log(`\n耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
log(`\n==== 压测结果: ${passCount} 通过, ${failCount} 失败 ====`);
if (failures.length) { console.log('失败项:'); failures.forEach(f => console.log('  - ' + f)); }
process.exit(failCount > 0 ? 1 : 0);
