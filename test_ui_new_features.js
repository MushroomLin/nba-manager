// UI 渲染级测试：在 Node 沙箱中加载完整 app.js，验证 5 项新功能的渲染输出
// 覆盖：球员搜索数据列/对比复选框、球员对比弹窗、自由市场空状态、冠军荣誉墙、存档管理导出导入按钮
const fs = require('fs'), path = require('path'), vm = require('vm');

// ---- DOM mock ----
function makeEl(id) {
    return {
        id,
        _innerHTML: '',
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) { this._innerHTML = String(v); },
        textContent: '',
        value: '',
        scrollTop: 0,
        disabled: false,
        checked: false,
        dataset: {},
        style: {},
        title: '',
        className: '',
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        addEventListener() {},
        appendChild() {}, remove() {}, click() {},
        querySelectorAll: () => [],
        querySelector: () => null,
        setSelectionRange() {}, focus() {},
    };
}
const elements = {};
const doc = {
    getElementById: id => (elements[id] || (elements[id] = makeEl(id))),
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: tag => makeEl(tag),
    body: makeEl('body'),
    head: makeEl('head'),
};

const store = new Map();
const localStorageMock = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
};

const sandbox = {
    console, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean, Promise,
    parseInt, parseFloat, isNaN, setTimeout: fn => { try { fn(); } catch (e) {} }, clearTimeout: () => {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    location: { reload: () => {} },
    confirm: () => true, alert: () => {},
    document: doc,
    localStorage: localStorageMock,
};
sandbox.window = sandbox; sandbox.global = sandbox;
vm.createContext(sandbox);

const baseDir = path.join(__dirname, 'js');
const load = rel => vm.runInContext(fs.readFileSync(path.join(baseDir, rel), 'utf8'), sandbox, { filename: rel });
load('data/teams.js'); load('data/players.js'); load('data/rookies.js'); load('data/nba_stats.js');
load('engine/simulation.js'); load('engine/trade.js'); load('engine/season.js'); load('engine/draft.js'); load('engine/save.js');
load('ui/app.js');

const { App } = sandbox;

let passCount = 0, failCount = 0;
const assert = (c, m) => { if (c) { passCount++; console.log(`  ✓ ${m}`); } else { failCount++; console.log(`  ✗ ${m}`); } };
const mainHtml = () => doc.getElementById('main-content').innerHTML;
const modalHtml = () => doc.getElementById('modal-box').innerHTML;

// ---- 初始化游戏 ----
App.init('测试经理', sandbox.TEAMS_DATA[0].id);
console.log('==== [U1] 球员搜索视图：数据列 + 对比复选框 ====');
{
    App.renderView('playersearch');
    const html = mainHtml();
    assert(html.includes('得分') && html.includes('篮板') && html.includes('助攻'), '表头含 得分/篮板/助攻 三列');
    assert(html.includes('ps-cmp'), '渲染对比复选框（.ps-cmp）');
    assert(html.includes('ps-compare-btn'), '渲染对比按钮（#ps-compare-btn）');
    assert(html.includes('对比 (0/2)'), '初始对比按钮显示 0/2 且禁用');
    assert((html.match(/class="ps-cmp"/g) || []).length > 100, `全联盟球员均带复选框（${(html.match(/class="ps-cmp"/g) || []).length} 个）`);
    assert(!html.includes('>undefined<') && !html.includes('NaN'), '无 undefined/NaN 渲染异常');
}

console.log('==== [U2] 球员对比弹窗 ====');
{
    // 选两名球员（本队最猛的两名）
    const myId = App.state.manager.teamId;
    const players = App.state.teamsPlayers[myId].slice().sort((a, b) => b.o - a.o);
    const [pA, pB] = players;
    App.showPlayerCompare(pA.id, pB.id);
    const html = modalHtml();
    assert(html.includes('⚖️ 球员对比'), '弹窗标题正确');
    assert(html.includes(pA.n) && html.includes(pB.n), '双方球员姓名显示');
    assert(html.includes('VS'), 'VS 分隔符显示');
    // 7 项能力镜像条
    const skillCount = (html.match(/cmp-skill-row/g) || []).length;
    assert(skillCount === 7, `7 项能力镜像条（实际 ${skillCount}）`);
    assert(html.includes('cmp-fill cmp-a') && html.includes('cmp-fill cmp-b'), '左右两侧填充条渲染');
    // 能力值出现（胜方金色高亮）
    assert(html.includes('cmp-win'), '优势项高亮（cmp-win）');
    assert(html.includes('当前赛季数据'), '当前赛季数据区块');
    assert(html.includes('出场') && html.includes('命中率'), '数据行含出场/命中率');
    // 无数据球员（赛季初）显示 '-' 而非 NaN
    assert(!html.includes('NaN'), '无 NaN');
    assert(html.includes(`App.showPlayerDetail('${pA.id}')`), '「查看详情」按钮指向正确球员');
    App.closeModal();
}

console.log('==== [U3] 自由市场空状态（常规赛期间）====');
{
    App.renderView('freeagents');
    const html = mainHtml();
    assert(html.includes('自由市场尚未开放'), '空状态说明文案');
    assert(html.includes('提前规划'), '提前规划卡片');
    assert(html.includes('名单人数') && html.includes('薪资空间') && html.includes('伤病人数'), '3 个规划指标框');
    assert(!html.includes('NaN'), '无 NaN');
}

console.log('==== [U4] 联盟视图：王朝荣誉墙 ====');
{
    // 空状态
    App.renderView('league');
    let html = mainHtml();
    assert(html.includes('王朝荣誉墙'), '荣誉墙卡片渲染');
    assert(html.includes('暂无冠军记录'), '赛季初显示空状态');

    // 注入冠军数据后重新渲染（注意：选一支非我队作为对手冠军，TEAMS_DATA[0]=BOS 是我队）
    const myId = App.state.manager.teamId;
    const rivalId = App.state.teams.find(t => t.id !== myId).id;
    const star = App.state.teamsPlayers[myId][0];
    App.state.champions.push({
        year: 2025, team: myId, name: '我队',
        finalsMVP: { id: star.id, n: star.n, ppg: 28.5, rpg: 6.2, apg: 5.1 },
        finalsScore: '4-2', loserTeamId: rivalId,
    });
    App.state.champions.push({ year: 2024, team: rivalId, name: '对手队', finalsMVP: null, finalsScore: '4-1', loserTeamId: myId });
    App.renderView('league');
    html = mainHtml();
    assert(html.includes('2025-26'), '冠军年份 2025-26 显示');
    assert(html.includes('4-2'), '总决赛比分显示');
    assert(html.includes(star.n) && html.includes('28.5'), 'FMVP 姓名与场均分显示');
    assert(html.includes('我队 1 冠 💍'), '我队冠军计数显示');
    assert(html.includes('共 2 季'), '总季数统计显示');
    assert(html.includes('2024-25'), '多条冠军记录按倒序显示');
    assert(!html.includes('NaN'), '无 NaN');
}

console.log('==== [U5] 存档管理：导出/导入按钮 ====');
{
    App.showSaveManager();
    const html = modalHtml();
    assert(html.includes('export-saves'), '导出备份按钮（#export-saves）');
    assert(html.includes('import-saves'), '导入备份按钮（#import-saves）');
    assert(html.includes('📤 导出备份') && html.includes('📥 导入备份'), '按钮文案正确');
    App.closeModal();
}

console.log('==== [U6] 全视图回归（渲染无异常）====');
{
    const views = ['dashboard', 'roster', 'trade', 'freeagents', 'schedule', 'standings', 'stats', 'draft', 'league', 'playersearch', 'tradelog'];
    let allOk = true;
    const details = [];
    views.forEach(v => {
        try {
            App.renderView(v);
            const html = mainHtml();
            // draft/tradelog 等视图在常规赛期间显示空状态提示（属正常设计），其余视图应内容充实
            const isEmptyStateView = v === 'draft'; // 选秀休赛期提示文案较短
            const bad = html.includes('>undefined<') || html.includes('NaN') || (html.length < 100 && !isEmptyStateView);
            if (bad) { allOk = false; details.push(`${v}: len=${html.length}, bad=${bad}`); }
        } catch (e) {
            allOk = false; details.push(`${v}: 异常 ${e.message}`);
        }
    });
    assert(allOk, `全部 ${views.length} 个视图渲染正常${details.length ? '（' + details.join('; ') + '）' : ''}`);
    // draft 视图在常规赛显示休赛期提示（预期行为）
    App.renderView('draft');
    assert(mainHtml().includes('选秀将在休赛期进行'), 'draft 视图常规赛显示休赛期提示（预期）');
}

console.log('==== [U7] 有赛季数据后的球员搜索数据列 ====');
{
    // 模拟一场比赛累积数据后，验证数据列显示数字
    const myId = App.state.manager.teamId;
    const myPlayers = App.state.teamsPlayers[myId];
    const res = sandbox.SimEngine.simulateGame(myPlayers, App.state.teamsPlayers['BOS'] || App.state.teams[1] ? App.state.teamsPlayers[App.state.teams.find(t => t.id !== myId).id] : myPlayers);
    res.home.lines.forEach(line => {
        const acc = App.state.statAccum[myId];
        if (!acc[line.player.id]) acc[line.player.id] = { gp: 0, pts: 0, reb: 0, ast: 0, fgm: 0, fga: 0 };
        const s = acc[line.player.id];
        s.gp++; s.pts += line.pts; s.reb += line.reb; s.ast += line.ast; s.fgm += line.fgm; s.fga += line.fga;
    });
    App.renderView('playersearch');
    const html = mainHtml();
    // 有数据的球员应显示数字（如 xx.x）
    assert(/\d+\.\d<\/td>/.test(html), '得分列显示场均数字');
    assert(!html.includes('NaN'), '无 NaN');
}

console.log('========== 测试总结 ==========');
console.log(`通过: ${passCount}, 失败: ${failCount}`);
process.exit(failCount > 0 ? 1 : 0);
