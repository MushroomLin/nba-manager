// 新功能验证测试：SaveEngine 导出/导入往返 + 序列化完整性（champions/tradeLog/awardsHistory）
const fs = require('fs'), path = require('path'), vm = require('vm');

// ---- mock localStorage（Map 实现，模拟浏览器行为）----
const store = new Map();
const localStorageMock = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
};

const sandbox = {
    console, Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean,
    parseInt, parseFloat, isNaN, setTimeout: () => {}, clearTimeout: () => {},
    document: { getElementById: () => ({ innerHTML: '', classList: { add: () => {}, remove: () => {}, toggle: () => {} }, addEventListener: () => {}, scrollTop: 0 }), querySelectorAll: () => [] },
    localStorage: localStorageMock,
};
sandbox.window = sandbox; sandbox.global = sandbox;
vm.createContext(sandbox);

const baseDir = path.join(__dirname, 'js');
const load = rel => vm.runInContext(fs.readFileSync(path.join(baseDir, rel), 'utf8'), sandbox, { filename: rel });
load('data/teams.js'); load('data/players.js'); load('data/rookies.js'); load('data/nba_stats.js');
load('engine/simulation.js'); load('engine/trade.js'); load('engine/season.js'); load('engine/draft.js');
load('engine/save.js');

const { SaveEngine, TEAMS_DATA, PLAYERS_DATA } = sandbox;

let passCount = 0, failCount = 0;
const assert = (c, m) => { if (c) { passCount++; console.log(`  ✓ ${m}`); } else { failCount++; console.log(`  ✗ ${m}`); } };

// ---- 构造带历史数据的 state ----
function buildState() {
    const teams = TEAMS_DATA;
    const players = PLAYERS_DATA.map((p, i) => ({ ...p, id: p.id || ('p' + i) }));
    const teamsPlayers = {};
    teams.forEach(t => { teamsPlayers[t.id] = players.filter(p => p.t === t.id); });
    const myTeam = teams[0].id;
    return {
        teams,
        players,
        teamsPlayers,
        records: Object.fromEntries(teams.map(t => [t.id, { win: 30, loss: 10, streak: 2, ptsFor: 100, ptsAgt: 95 }])),
        standings: null,
        manager: { name: '测试经理', teamId: myTeam },
        year: 2028,
        phase: 'regular',
        currentDay: 40,
        schedule: [],
        userGameLog: [],
        freeAgents: [],
        statAccum: {},
        playerHistory: {},
        champions: [
            { year: 2026, team: myTeam, name: '测试队', finalsMVP: { id: players[0].id, n: players[0].n, ppg: 28.5, rpg: 6.2, apg: 5.1 }, finalsScore: '4-2', loserTeamId: teams[1].id },
            { year: 2027, team: teams[1].id, name: '对手队', finalsMVP: null, finalsScore: '4-3', loserTeamId: myTeam },
        ],
        awardsHistory: [{ year: 2026, mvp: { player: { id: players[0].id, n: players[0].n }, teamId: myTeam, ppg: 30.1 }, allNBAFirst: [players[0].id] }],
        tradeLog: [{ day: 10, from: teams[0].id, to: teams[1].id, players: [] }],
        tactics: { pace: 'fast', defense: 'tight' },
    };
}

console.log('==== [T1] SaveEngine 导出/导入往返 ====');
{
    const st = buildState();
    // 自动存档 + 两个手动槽位
    assert(SaveEngine.autoSave(st) === true, '自动存档成功');
    assert(SaveEngine.saveSlot(1, st) === true, '手动存档槽 1 成功');
    assert(SaveEngine.saveSlot(2, st) === true, '手动存档槽 2 成功');

    // 导出
    let exported = null;
    try { exported = SaveEngine.exportAll(); } catch (e) { console.log('    导出异常:', e.message); }
    assert(typeof exported === 'string' && exported.length > 100, `导出 JSON 字符串（${exported ? (exported.length / 1024).toFixed(1) + 'KB' : 'null'}）`);
    const parsed = JSON.parse(exported);
    assert(parsed.app === 'nba-manager-simulator', '导出文件带 app 标识');
    assert(!!parsed.auto && !!parsed.slots['1'] && !!parsed.slots['2'], '导出包含自动存档 + 2 个槽位');

    // 清空 localStorage 模拟数据丢失，再导入恢复
    store.clear();
    assert(SaveEngine.getAutoMeta() === null, '清空后自动存档丢失');
    let importCount = -1;
    try { importCount = SaveEngine.importAll(exported); } catch (e) { console.log('    导入异常:', e.message); }
    assert(importCount === 3, `导入恢复 3 个存档（实际 ${importCount}）`);

    // 导入后数据完整可用
    const meta = SaveEngine.getAutoMeta();
    assert(!!meta && meta.teamId === st.manager.teamId && meta.year === 2028, '导入后自动存档 meta 正确');
    const loaded = SaveEngine.loadAuto();
    assert(!!loaded && loaded.teamsPlayers && loaded.champions.length === 2, '导入后可正常反序列化（teamsPlayers 重建 + champions 保留）');
    assert(loaded.tradeLog.length === 1 && loaded.year === 2028 && loaded.phase === 'regular', '导入后游戏状态字段完整');

    // 槽位导入验证
    const s1meta = SaveEngine.getSlotMeta(1);
    assert(!!s1meta && s1meta.slotName === '存档 1', '导入后槽位 1 meta 正确');
}

console.log('==== [T2] 导入校验（非法文件拒绝）====');
{
    const badCases = [
        ['{"app":"other-game"}', '拒绝非本游戏文件'],
        ['{"app":"nba-manager-simulator","auto":null,"slots":{}}', '拒绝空备份'],
        ['not-json{{{', '拒绝非法 JSON'],
    ];
    for (const [text, msg] of badCases) {
        let threw = false;
        try { SaveEngine.importAll(text); } catch (e) { threw = true; }
        assert(threw, msg);
    }
}

console.log('==== [T3] 序列化完整性（新功能依赖的数据不丢失）====');
{
    store.clear();
    const st = buildState();
    SaveEngine.saveSlot(3, st);
    const loaded = SaveEngine.loadSlot(3);
    assert(loaded.champions.length === 2 && loaded.champions[0].finalsMVP.ppg === 28.5, 'champions 完整保存（含 FMVP）');
    assert(loaded.tradeLog.length === 1, 'tradeLog 完整保存');
    assert(loaded.awardsHistory.length === 1 && loaded.awardsHistory[0].mvp.player.n === players0Name(), 'awardsHistory 完整保存');
    assert(loaded.tactics && loaded.tactics.pace === 'fast', 'tactics 完整保存');
    function players0Name() { return PLAYERS_DATA.map((p, i) => ({ ...p, id: p.id || ('p' + i) }))[0].n; }
}

console.log('==== [T4] 冠军荣誉墙数据可用性（renderLeague 依赖的字段）====');
{
    const st = buildState();
    const champs = (st.champions || []).slice().reverse();
    assert(champs.length === 2, 'champions 倒序可获取');
    const myTitles = champs.filter(c => c.team === st.manager.teamId).length;
    assert(myTitles === 1, '我队冠军数统计正确');
    assert(champs.every(c => typeof c.year === 'number' && typeof c.team === 'string' && ('finalsScore' in c)), '每条冠军记录字段齐全');
    assert(champs[0].finalsMVP === null || typeof champs[0].finalsMVP.n === 'string', 'FMVP 字段可空或有效');
}

console.log('========== 测试总结 ==========');
console.log(`通过: ${passCount}, 失败: ${failCount}`);
process.exit(failCount > 0 ? 1 : 0);
