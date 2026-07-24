// 存档引擎 —— 自动存档 + 多槽位手动存档
//
// 设计:
//   1. 自动存档 (AUTO_KEY): 每次推进比赛/交易/选秀/签约后自动保存，无感续玩
//   2. 手动槽位 (SLOT_PREFIX + 1..3): 玩家可在存档管理界面手动存档/读档/删除
//   3. 序列化时移除可重建字段 (teamsPlayers/standings), 减小体积并避免引用不一致
//   4. 每个存档带 meta 元数据 (经理/球队/赛季/战绩/时间), 用于列表展示

const SaveEngine = (() => {

    const AUTO_KEY = "nba_mgr_autosave";
    const SLOT_PREFIX = "nba_mgr_slot_";
    const VERSION = 1;
    const SLOT_COUNT = 3;

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
    function serialize(state) {
        const lite = { ...state };
        delete lite.teamsPlayers;  // 从 players.t 重建
        delete lite.standings;     // 从 records 重算
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
        saveSlot, loadSlot, getSlotMeta, listSlots, deleteSlot,
        formatTime, phaseLabel, buildMeta,
        SLOT_COUNT,
    };
})();

window.SaveEngine = SaveEngine;
