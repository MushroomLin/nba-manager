// 成就引擎 —— 经理生涯里程碑系统
//
// 设计:
//   1. 15 枚成就覆盖完整游戏循环: 比赛胜利/连胜、交易、签约、选秀、赛季战绩、季后赛、总冠军
//   2. 幂等解锁: state.achievements = { id: { year, day } }, 已解锁不再重复触发
//   3. 事件驱动: check(state, event) 由 app.js 在关键节点调用, 返回本次新解锁的成就数组
//   4. 纯函数: 不直接操作 DOM, UI 反馈(toast/弹窗)由调用方处理

const AchievementEngine = (() => {

    // ============ 成就定义 ============
    // desc: 解锁条件描述（成就墙展示）; icon: 展示图标
    const DEFS = [
        { id: "first_win",     icon: "🥉", name: "初试啼声",   desc: "赢下执教生涯的第一场胜利" },
        { id: "streak_5",      icon: "🔥", name: "势不可挡",   desc: "取得 5 连胜" },
        { id: "streak_10",     icon: "⚡", name: "王者之师",   desc: "取得 10 连胜" },
        { id: "star_trade",    icon: "💎", name: "球星收割机", desc: "通过交易获得一名总评 85+ 的球星" },
        { id: "sign_star",     icon: "💰", name: "精打细算",   desc: "从自由市场签下一名总评 85+ 的球星" },
        { id: "draft_gem",     icon: "🔍", name: "选秀大盗",   desc: "用第 20 顺位之后选中即战力新秀（总评 78+）" },
        { id: "sixty_wins",    icon: "💪", name: "60 胜赛季",  desc: "常规赛取得 60 胜" },
        { id: "seventy_wins",  icon: "👑", name: "历史级统治", desc: "常规赛取得 70 胜（比肩 96 公牛/16 勇士）" },
        { id: "make_playoffs", icon: "🎯", name: "进军季后赛", desc: "带队打进季后赛" },
        { id: "conf_finals",   icon: "🏛️", name: "分区霸主",   desc: "打进分区决赛（最终四强）" },
        { id: "champion",      icon: "🏆", name: "总冠军",     desc: "赢得 NBA 总冠军" },
        { id: "dynasty",       icon: "💍", name: "王朝",       desc: "完成总冠军 3 连冠" },
        { id: "mvp_coach",     icon: "🎖️", name: "MVP 之师",   desc: "麾下球员当选常规赛 MVP" },
        { id: "mip_coach",     icon: "📈", name: "点石成金",   desc: "麾下球员当选进步最快球员(MIP)" },
        { id: "big_three",     icon: "⭐", name: "三巨头",     desc: "同时拥有 3 名总评 85+ 球员" },
    ];
    const DEF_MAP = Object.fromEntries(DEFS.map(d => [d.id, d]));

    // ============ 内部工具 ============
    function ensureContainer(state) {
        if (!state.achievements || typeof state.achievements !== "object") {
            state.achievements = {};
        }
    }

    function isUnlocked(state, id) {
        return !!(state.achievements && state.achievements[id]);
    }

    // 解锁单个成就（幂等）。返回 true 表示本次新解锁
    function unlock(state, id) {
        const def = DEF_MAP[id];
        if (!def) return false;
        ensureContainer(state);
        if (state.achievements[id]) return false;
        state.achievements[id] = { year: state.year || 0, day: state.currentDay || 0 };
        return true;
    }

    function myPlayers(state) {
        return (state.teamsPlayers || {})[state.manager.teamId] || [];
    }

    // 连胜检查：records.streak 正数表示连胜场数
    function checkStreaks(state, newly) {
        const r = (state.records || {})[state.manager.teamId];
        if (!r) return;
        if (r.streak >= 5) { if (unlock(state, "streak_5")) newly.push("streak_5"); }
        if (r.streak >= 10) { if (unlock(state, "streak_10")) newly.push("streak_10"); }
    }

    // 三巨头：阵容中 85+ 球员数
    function checkBigThree(state, newly) {
        const stars = myPlayers(state).filter(p => (p.o || 0) >= 85);
        if (stars.length >= 3) { if (unlock(state, "big_three")) newly.push("big_three"); }
    }

    // 王朝：champions 末尾 3 条连续为我队
    function checkDynasty(state, newly) {
        const champs = state.champions || [];
        if (champs.length < 3) return;
        const last3 = champs.slice(-3);
        // 连续性由数组顺序保证（每年 push 一条），只需 3 条均是我队
        if (last3.every(c => c && c.team === state.manager.teamId)) {
            if (unlock(state, "dynasty")) newly.push("dynasty");
        }
    }

    // ============ 事件检查入口 ============
    // event ∈ {
    //   'userGame'      —— 用户比赛结束后（含季后赛，ctx.game = log）
    //   'seasonAwards'  —— 常规赛奖项评选后
    //   'playoffsStart' —— 季后赛开始
    //   'playoffsRound' —— 季后赛每轮结束后
    //   'finalsEnd'     —— 总决赛结束（ctx.championTeamId）
    //   'trade'         —— 用户完成交易（ctx.incoming = 收到的球员）
    //   'signing'       —— 用户签约自由球员（ctx.player）
    //   'draft'         —— 用户选秀选中（ctx.player, ctx.pick）
    //   'rosterChange'  —— 阵容变动（通用检查）
    // }
    function check(state, event, ctx) {
        ensureContainer(state);
        const newly = [];
        const myId = state.manager.teamId;
        ctx = ctx || {};

        switch (event) {
            case "userGame": {
                const r = (state.records || {})[myId];
                // 首胜：常规赛首场胜利（或任意阶段首胜，简化为总胜场>=1）
                if (r && r.win >= 1) { if (unlock(state, "first_win")) newly.push("first_win"); }
                checkStreaks(state, newly);
                break;
            }
            case "seasonAwards": {
                const awards = ctx.awards || {};
                // MVP / MIP 归属我队
                if (awards.mvp && awards.mvp.teamId === myId) { if (unlock(state, "mvp_coach")) newly.push("mvp_coach"); }
                if (awards.mip && awards.mip.teamId === myId) { if (unlock(state, "mip_coach")) newly.push("mip_coach"); }
                // 60 / 70 胜
                const r = (state.records || {})[myId];
                if (r && r.win >= 60) { if (unlock(state, "sixty_wins")) newly.push("sixty_wins"); }
                if (r && r.win >= 70) { if (unlock(state, "seventy_wins")) newly.push("seventy_wins"); }
                break;
            }
            case "playoffsStart": {
                // 我队出现在东西部任一对阵中即进季后赛
                const po = state.playoffs;
                if (po) {
                    const inIt = [...(po.east || []), ...(po.west || [])]
                        .some(m => m && m.high && m.low && (m.high.teamId === myId || m.low.teamId === myId));
                    if (inIt) { if (unlock(state, "make_playoffs")) newly.push("make_playoffs"); }
                }
                break;
            }
            case "playoffsRound": {
                // 分区决赛（最终四强）：我队要么赢得分区冠军，要么在分区决赛出局（exits=3）
                const po = state.playoffs;
                if (po && ctx.isConfFinals) {
                    const wonConf =
                        (po.eastChamp && po.eastChamp.teamId === myId) ||
                        (po.westChamp && po.westChamp.teamId === myId);
                    const lostConf = po.exits && po.exits[myId] === 3;
                    if (wonConf || lostConf) { if (unlock(state, "conf_finals")) newly.push("conf_finals"); }
                }
                break;
            }
            case "finalsEnd": {
                if (ctx.championTeamId === myId) { if (unlock(state, "champion")) newly.push("champion"); }
                checkDynasty(state, newly);
                break;
            }
            case "trade": {
                // 交易获得 85+ 球星
                const incoming = ctx.incoming || [];
                if (incoming.some(p => (p.o || 0) >= 85)) { if (unlock(state, "star_trade")) newly.push("star_trade"); }
                checkBigThree(state, newly);
                break;
            }
            case "signing": {
                const p = ctx.player;
                if (p && (p.o || 0) >= 85) { if (unlock(state, "sign_star")) newly.push("sign_star"); }
                checkBigThree(state, newly);
                break;
            }
            case "draft": {
                const p = ctx.player;
                // 20 顺位后选中即战力（o>=78）
                if (p && ctx.pick >= 20 && (p.o || 0) >= 78) { if (unlock(state, "draft_gem")) newly.push("draft_gem"); }
                break;
            }
            case "rosterChange": {
                checkBigThree(state, newly);
                checkDynasty(state, newly);
                break;
            }
        }

        // 返回新解锁成就的完整定义（供 UI toast/展示）
        return newly.map(id => ({ ...DEF_MAP[id], unlockedAt: state.achievements[id] }));
    }

    // 成就墙数据：全部定义 + 解锁状态
    function overview(state) {
        ensureContainer(state);
        return DEFS.map(d => ({
            ...d,
            unlocked: !!state.achievements[d.id],
            unlockedAt: state.achievements[d.id] || null,
        }));
    }

    return { DEFS, check, overview, unlock };
})();
