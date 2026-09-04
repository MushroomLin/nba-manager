// 存档引擎 —— 自动存档 + 多槽位手动存档
//
// 设计:
//   1. 自动存档 (AUTO_KEY): 每次推进比赛/交易/选秀/签约后自动保存，无感续玩
//   2. 手动槽位 (SLOT_PREFIX + 1..5): 玩家可在存档管理界面手动存档/读档/删除
//   3. 序列化时移除可重建字段 (teamsPlayers/standings), 减小体积并避免引用不一致
//   4. 每个存档带 meta 元数据 (经理/球队/赛季/战绩/时间), 用于列表展示

const SaveEngine = (() => {

    const AUTO_KEY = "nba_mgr_autosave";
    const SLOT_PREFIX = "nba_mgr_slot_";
    const VERSION = 1;
    const SLOT_COUNT = 5;

    // 构建存档元数据（用于列表展示，无需解析整个 state）
    function buildMeta(state) {
        const t = (state.teams || []).find(x => x.id === state.manager.teamId);
        const r = (state.records || {})[state.manager.teamId] || { win: 0, loss: 0 };
        return {
            version: VERSION,
            managerName: state.manager.name,
            teamId: state.manager.teamId,
            teamAbbr: t ? t.abbr : "?",
            teamName: t ? `${t.city}${t.name}` : "?",
            year: state.year,
            phase: state.phase,
            win: r.win || 0,
            loss: r.loss || 0,
            savedAt: Date.now(),
        };
    }

    // 序列化：移除可重建字段，减小体积并保证 players 与 teamsPlayers 引用一致
    // 修复 v11：用户反馈"玩了几年后不再自动存档"——根因 localStorage 配额（5-10MB）被撑满
    //   静默失败。优化：序列化时移除大体积冗余字段：
    //   1. awardsHistory 中的 *Detail 字段（每阵5球员完整 candidate 对象，含 player 引用+评分，
    //      30赛季×7阵×5人≈1050 对象，体积巨大；保留 id list 供按奖项查看降级使用）
    //   2. 球员 _awards 运行时标记（可从 awardsHistory 重建）
    //   3. isFiller 且 ovr<60 的纯填充球员（无历史价值）
    function serialize(state) {
        const lite = { ...state };
        delete lite.teamsPlayers;  // 从 players.t 重建
        delete lite.standings;     // 从 records 重算
        // 移除 awardsHistory 中的 *Detail 大字段（保留 id list）
        if (Array.isArray(lite.awardsHistory)) {
            lite.awardsHistory = lite.awardsHistory.map(a => {
                if (!a) return a;
                const slim = { ...a };
                ['allNBAFirstDetail','allNBASecondDetail','allNBAThirdDetail',
                 'allDefFirstDetail','allDefSecondDetail',
                 'allRookieFirstDetail','allRookieSecondDetail',
                 'mvpTop5','eastMvpTop5','westMvpTop5','dpoyTop5','royTop5','sixManTop5','mipTop5'
                ].forEach(k => { delete slim[k]; });
                return slim;
            });
        }
        // 移除球员运行时 _awards 标记 + 低价值 filler 球员
        if (Array.isArray(lite.players)) {
            lite.players = lite.players.filter(p => {
                if (p && p.isFiller && (p.o || 0) < 60) return false; // 丢弃低能力填充球员
                return true;
            }).map(p => {
                if (!p) return p;
                const cp = { ...p };
                delete cp._awards; // 运行时标记，可从 awardsHistory 重建
                return cp;
            });
        }
        return { meta: buildMeta(state), state: lite };
    }

    // 反序列化：重建 teamsPlayers，standings 留空由 updateStandings 重算
    function deserialize(data) {
        const state = data.state;
        // 重建 teamsPlayers（按球员的 t 字段分组）
        const teamsPlayers = {};
        state.teams.forEach(t => teamsPlayers[t.id] = []);
        state.players.forEach(p => {
            if (teamsPlayers[p.t]) teamsPlayers[p.t].push(p);
            else if (p.t == null) { /* 自由球员，跳过 */ }
            else {
                // 球队已不存在（理论上不会发生），创建占位
                teamsPlayers[p.t] = [p];
            }
        });
        state.teamsPlayers = teamsPlayers;
        state.standings = null;
        return state;
    }

    // ---- 自动存档 ----
    function autoSave(state) {
        try {
            const data = serialize(state);
            localStorage.setItem(AUTO_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error("[SaveEngine] 自动存档失败:", e);
            return false;
        }
    }

    function loadAuto() {
        try {
            const raw = localStorage.getItem(AUTO_KEY);
            if (!raw) return null;
            return deserialize(JSON.parse(raw));
        } catch (e) {
            console.error("[SaveEngine] 读取自动存档失败:", e);
            return null;
        }
    }

    function getAutoMeta() {
        try {
            const raw = localStorage.getItem(AUTO_KEY);
            if (!raw) return null;
            return JSON.parse(raw).meta;
        } catch (e) { return null; }
    }

    function deleteAuto() {
        localStorage.removeItem(AUTO_KEY);
    }

    // ---- 手动槽位 ----
    function saveSlot(slotId, state) {
        try {
            const data = serialize(state);
            data.meta.slotName = `存档 ${slotId}`;
            localStorage.setItem(SLOT_PREFIX + slotId, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error("[SaveEngine] 存档失败:", e);
            return false;
        }
    }

    function loadSlot(slotId) {
        try {
            const raw = localStorage.getItem(SLOT_PREFIX + slotId);
            if (!raw) return null;
            return deserialize(JSON.parse(raw));
        } catch (e) {
            console.error("[SaveEngine] 读档失败:", e);
            return null;
        }
    }

    function getSlotMeta(slotId) {
        try {
            const raw = localStorage.getItem(SLOT_PREFIX + slotId);
            if (!raw) return null;
            return JSON.parse(raw).meta;
        } catch (e) { return null; }
    }

    function listSlots() {
        const slots = [];
        for (let i = 1; i <= SLOT_COUNT; i++) {
            slots.push({ id: i, meta: getSlotMeta(i) });
        }
        return slots;
    }

    function deleteSlot(slotId) {
        localStorage.removeItem(SLOT_PREFIX + slotId);
    }

    // 清除所有存档（自动存档 + 全部手动槽位）
    function clearAll() {
        localStorage.removeItem(AUTO_KEY);
        for (let i = 1; i <= SLOT_COUNT; i++) {
            localStorage.removeItem(SLOT_PREFIX + i);
        }
    }

    // ---- 导出 / 导入（JSON 文件备份，防 localStorage 丢失 / 跨设备迁移）----
    // 导出：打包自动存档 + 全部手动槽位为 JSON 字符串
    function exportAll() {
        const payload = {
            app: "nba-manager-simulator",
            exportVersion: VERSION,
            exportedAt: Date.now(),
            auto: JSON.parse(localStorage.getItem(AUTO_KEY) || "null"),
            slots: {},
        };
        for (let i = 1; i <= SLOT_COUNT; i++) {
            const raw = localStorage.getItem(SLOT_PREFIX + i);
            if (raw) payload.slots[i] = JSON.parse(raw);
        }
        return JSON.stringify(payload);
    }

    // 导入：校验并写回 localStorage，返回导入的存档数量（0 个则抛错）
    function importAll(jsonText) {
        const data = JSON.parse(jsonText);
        if (!data || typeof data !== "object" || data.app !== "nba-manager-simulator"
            || (!data.auto && !data.slots)) {
            throw new Error("不是有效的游戏存档备份文件");
        }
        let count = 0;
        if (data.auto && data.auto.state) {
            localStorage.setItem(AUTO_KEY, JSON.stringify(data.auto));
            count++;
        }
        if (data.slots) {
            for (let i = 1; i <= SLOT_COUNT; i++) {
                if (data.slots[i] && data.slots[i].state) {
                    localStorage.setItem(SLOT_PREFIX + i, JSON.stringify(data.slots[i]));
                    count++;
                }
            }
        }
        if (count === 0) throw new Error("备份文件中没有可用的存档数据");
        return count;
    }

    function formatTime(ts) {
        if (!ts) return "-";
        const d = new Date(ts);
        const pad = n => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function phaseLabel(phase) {
        const m = { regular: "常规赛", playoffs: "季后赛", finals: "总决赛", draft: "选秀", freeAgency: "自由市场", offseason: "休赛期" };
        return m[phase] || phase;
    }

    return {
        autoSave, loadAuto, getAutoMeta, deleteAuto,
        saveSlot, loadSlot, getSlotMeta, listSlots, deleteSlot, clearAll,
        exportAll, importAll,
        formatTime, phaseLabel, buildMeta,
        SLOT_COUNT,
    };
})();

window.SaveEngine = SaveEngine;
