// 游戏状态控制器 + UI 渲染
const App = (() => {

    let state = null;
    let currentView = "dashboard";
    let tradeState = { partner: null, myOut: [], theirOut: [] };
    let statsTab = "scoring"; // 数据看板当前榜单
    // 球员搜索视图的筛选/排序状态（持久化在模块内，切换视图不丢失）
    let playerSearchFilter = { q: "", team: "", sort: "o", pos: "" };
    // 球员对比工具的已选球员（最多 2 名）
    let playerCompareIds = [];
    // 快速模拟标志：fast-sim 期间不弹交易窗，结束后统一汇总
    let isFastSimming = false;
    // 快速模拟期间累积的重磅交易（结束后弹窗汇总）
    let pendingBlockbusters = [];

    // ============ 初始化 ============
    // startYear: 赛季起始年（2026 = 默认现役名单 2026-27；1996-2025 = 历史真实名单）
    function init(managerName, teamId, startYear) {
        const START_YEAR = startYear || 2026;
        const isHistoryMode = START_YEAR < 2026 && window.HistoryEngine && HistoryEngine.isAvailable();
        const teams = JSON.parse(JSON.stringify(window.TEAMS_DATA));
        let players;
        if (isHistoryMode) {
            // 历史队名覆盖（西雅图超音速 / 温哥华灰熊 / 新泽西篮网 / 华盛顿子弹…）
            teams.forEach(t => {
                const lbl = HistoryEngine.teamLabel(t.id, START_YEAR);
                if (lbl) { t.city = lbl.city; t.name = lbl.name; }
            });
            // 真实历史名单（历史缩写已映射到现役球队 ID）
            players = HistoryEngine.buildLeague(START_YEAR) || [];
        } else {
            // 深拷贝球员并赋 id
            // 修复：给年轻初始球员标记为新秀（模拟上赛季选秀进联盟），让第一赛季有 ROY 候选
            // 真实 NBA 2026-27 赛季的 ROY 是 2026 年选秀进联盟的球员；
            // PLAYERS_DATA 无 draftYear 字段，用年龄近似：age <= 20 视为新秀（约 20 人，含弗拉格/迪班萨等）
            players = window.PLAYERS_DATA.map((p, i) => {
                const isRookie = p.a <= 20;
                // 修复 v5：超巨数量锐减根因——初始 pot = ovr + 0~4，导致 ovr 85-89 的球星 pot 平均 87-89，
                //   永远无法突破 90。让 ovr>=83 的球员 pot 至少 90+，确保超巨池可持续补充
                //   真实 NBA 中 25 岁左右的 85+ 球星（如东契奇/亚历山大/文班）仍有成长空间到 90+
                let pot = p.o + randInt(0, 4);
                if (p.o >= 83 && p.a <= 27) pot = Math.max(pot, 90 + randInt(0, 4)); // 巅峰期球星可冲击 90+
                else if (p.o >= 80 && p.a <= 24) pot = Math.max(pot, 88 + randInt(0, 3)); // 年轻全明星有成长空间
                return {
                    ...p,
                    id: `p_${i}`,
                    pot,
                    isRookie,
                    draftYear: isRookie ? START_YEAR : null,
                    yrsInLeague: isRookie ? 0 : 5, // 新秀合同期第 1 年；老球员默认 5 年（已过新秀期）
                };
            });
        }

        // 按球队分组
        const teamsPlayers = {};
        teams.forEach(t => teamsPlayers[t.id] = []);
        players.forEach(p => { if (teamsPlayers[p.t]) teamsPlayers[p.t].push(p); });

        // 为每支球队补充替补球员至 14 人（保证交易系统可用）
        let fillerIdx = 0;
        teams.forEach(t => {
            while (teamsPlayers[t.id].length < 14) {
                const fp = generateBenchPlayer(t.id, fillerIdx++);
                players.push(fp);
                teamsPlayers[t.id].push(fp);
            }
        });

        const records = {};
        teams.forEach(t => records[t.id] = { win: 0, loss: 0, streak: 0, ptsFor: 0, ptsAgt: 0 });

        const schedule = SeasonEngine.generateSchedule(teams);

        state = {
            manager: { name: managerName, teamId },
            year: START_YEAR,
            phase: "regular",
            teams,
            players,
            teamsPlayers,
            records,
            schedule,
            currentDay: 0,
            userGameLog: [],
            standings: null,
            playoffs: null,
            freeAgents: [],
            rookieClass: [],
            draftOrder: null,
            draftPick: 0,
            statAccum: {}, // teamId -> { playerId -> seasonStats }
            history: [],
            champions: [],
            awardsHistory: [], // 历年奖项
            playerHistory: {}, // pid -> [{year, ovr, teamId, gp, pts, reb, ast}]
            // 玩家战术设置：pace 节奏 / defense 防守强度 / rotation 轮换深度
            tactics: { pace: 1, defense: 1, rotation: 1 },
            injuryLog: [], // 本季伤病记录（用于展示）
            tradeLog: [], // 本季 AI 交易记录（用于展示）
            // 成就系统：{ id: { year, day } }，AchievementEngine 管理
            achievements: {},
            tradeCount: 0, // 用户完成的交易笔数（主动提案 + 接受 AI 报价）
            // AI 主动交易报价收件箱：[{ id, from, give: [players], want: [players], day, expiresDay }]
            pendingOffers: [],
            // 训练系统：focus 专项 / gamesSinceSession 距上次训练的比赛场次
            training: { focus: "balanced", gamesSinceSession: 0 },
            rosterVersion: 2027, // 名单版本号，与 main.js 中 CURRENT_ROSTER_VERSION 对齐
            schemaVersion: 2, // 存档 schema 版本：2 = year 用结束年语义（避免旧存档迁移）
        };
        teams.forEach(t => state.statAccum[t.id] = {});
        updateStandings();
        renderAll();
        autoSave();
        if (isHistoryMode) {
            // 历史模式：预填真实生涯数据（MIP 评选 + 生涯轨迹展示）与真实冠军史
            const careers = HistoryEngine.allCareerHistories(START_YEAR);
            let seeded = 0;
            state.players.forEach(p => {
                if (p.histId != null && careers[p.histId]) {
                    state.playerHistory[p.id] = careers[p.histId];
                    seeded++;
                }
            });
            state.champions = HistoryEngine.championsBefore(START_YEAR);
            console.log(`[历史模式] ${START_YEAR}-${String(START_YEAR + 1).slice(2)} 赛季开局：` +
                `${state.players.filter(p => p.histId != null).length} 名真实球员，` +
                `${seeded} 人预填真实生涯数据，${state.champions.length} 季真实冠军史`);
        } else {
            // 后台异步加载 NBA 真实球员历史数据（不阻塞 UI，加载完自动刷新当前球员详情）
            NBAStats.ensureLoaded().then(ok => {
                if (!ok) return;
                // 用真实 NBA 上赛季数据预填 playerHistory，让第一赛季也能评选 MIP
                // （否则第一赛季所有球员无历史记录，MIP 必然空缺）
                seedInitialPlayerHistory();
                if (currentView === 'roster') renderAll();
            });
        }
        toast(`欢迎，${managerName}！你已执教 ${teamName(teamId)}`, "success");
        if (isHistoryMode) {
            setTimeout(() => toast(`📖 历史模式：${START_YEAR}-${START_YEAR + 1} 赛季真实名单已加载`, "gold", 5000), 600);
        }
    }

    // 读档：从存档恢复游戏状态
    function loadState(savedState) {
        state = savedState;
        // 重置模块级 UI 状态，避免残留上一局的选择（如交易槽里的旧球员引用）
        tradeState = { partner: null, myOut: [], theirOut: [] };
        currentView = "dashboard";
        // 兼容旧存档：补全新增字段
        if (!state.tactics) state.tactics = { pace: 1, defense: 1, rotation: 1 };
        if (!state.awardsHistory) state.awardsHistory = [];
        if (!state.playerHistory) state.playerHistory = {};
        // 兼容旧存档：playerHistory.year 旧语义为"赛季起始年"（2026=2026-27赛季），
        // 新语义为"赛季结束年"（2027=2026-27赛季）。迁移：所有 year += 1
        // 用 schemaVersion 标记避免重复迁移
        if (state.playerHistory && Object.keys(state.playerHistory).length > 0 && state.schemaVersion !== 2) {
            for (const pid in state.playerHistory) {
                state.playerHistory[pid].forEach(h => {
                    if (typeof h.year === 'number') h.year += 1;
                });
            }
            state.schemaVersion = 2;
            console.log('[迁移] playerHistory year 语义已从起始年迁移为结束年');
        }
        if (!state.injuryLog) state.injuryLog = [];
        if (!state.tradeLog) state.tradeLog = [];
        if (!state.rosterVersion) state.rosterVersion = 0;
        // 兼容旧存档：成就 / 交易计数 / AI 报价收件箱 / 训练系统
        if (!state.achievements) state.achievements = {};
        if (typeof state.tradeCount !== "number") state.tradeCount = 0;
        if (!Array.isArray(state.pendingOffers)) state.pendingOffers = [];
        if (!state.training || typeof state.training !== "object") state.training = { focus: "balanced", gamesSinceSession: 0 };
        if (!state.training.focus) state.training.focus = "balanced";
        if (typeof state.training.gamesSinceSession !== "number") state.training.gamesSinceSession = 0;
        // standings 已在读档时置空，这里重算
        updateStandings();
        renderAll();
        // 后台异步加载 NBA 真实球员历史数据
        NBAStats.ensureLoaded();
        toast(`已读取存档：${teamName(state.manager.teamId)} ${state.year}-${state.year+1}`, "success");
    }

    // 自动存档（内部用）
    // 修复 v11：存档失败（localStorage 配额满）时提示用户手动清理存档
    let _saveFailToasted = false;
    function autoSave() {
        if (!state) return;
        const ok = SaveEngine.autoSave(state);
        if (!ok && !_saveFailToasted) {
            _saveFailToasted = true;
            toast("⚠️ 自动存档失败（存储空间不足），请清理旧存档或导出当前进度", "error");
            setTimeout(() => { _saveFailToasted = false; }, 60000);
        }
    }

    function teamName(teamId) {
        const t = state.teams.find(x => x.id === teamId);
        return t ? `${t.city}${t.name}` : teamId;
    }

    // ============ 成就系统钩子 ============
    // 在关键节点调用，新解锁成就弹金色 toast
    function checkAchievements(event, ctx) {
        try {
            const newly = AchievementEngine.check(state, event, ctx);
            newly.forEach(a => {
                toast(`🏆 成就解锁：${a.icon} ${a.name}`, "success", 5000);
            });
            return newly;
        } catch (e) {
            console.error("[Achievements] 检查失败:", e);
            return [];
        }
    }

    function teamAbbr(teamId) { const t = state.teams.find(x => x.id === teamId); return t ? t.abbr : teamId; }
    function teamObj(teamId) { return state.teams.find(x => x.id === teamId); }

    // 球队 logo img，onerror 时隐藏 img 显示 abbr 圆作为 fallback（CDN 可能失效）
    function teamLogo(teamId, size) {
        const t = state.teams.find(x => x.id === teamId);
        if (!t || !t.logo) return '';
        const s = size || 24;
        return `<img src="${t.logo}" class="team-logo" width="${s}" height="${s}" alt="${t.abbr}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'"><span class="team-logo-fallback" style="display:none;width:${s}px;height:${s}px;background:${t.color};color:#fff;border-radius:50%;align-items:center;justify-content:center;font-size:${Math.max(10,s*0.4)}px;font-weight:700">${t.abbr}</span>`;
    }

    // 生成替补填充球员（用于补齐名单至 14 人）
    function generateBenchPlayer(teamId, idx) {
        const positions = ["PG","SG","SF","PF","C"];
        const pos = positions[idx % 5];
        const profile = window.ROOKIE_POS_PROFILES[pos];
        const ovr = randInt(62, 70);
        const v = () => randInt(-4, 4);
        // 替补球员用「名+姓」组合生成，避免与现役/新秀重名
        const proto = window.ROOKIE_PROTOTYPES;
        const fn = proto.firstNames[Math.floor(Math.random()*proto.firstNames.length)];
        const ln = proto.lastNames[Math.floor(Math.random()*proto.lastNames.length)];
        const name = `${fn}·${ln}`;
        return {
            id: `bench_${teamId}_${idx}`,
            n: name,
            t: teamId,
            p: pos,
            a: randInt(22, 32),
            o: ovr,
            pot: ovr + randInt(0, 2),
            sal: TradeEngine.salaryForOvr(ovr) * (0.6 + Math.random()*0.5),
            ins: clamp(profile.ins + v(), 40, 72),
            sh: clamp(profile.sh + v(), 40, 74),
            pa: clamp(profile.pa + v(), 35, 72),
            re: clamp(profile.re + v(), 35, 75),
            de: clamp(profile.de + v(), 40, 74),
            at: clamp(profile.at + v(), 50, 80),
            iq: clamp(profile.iq + v(), 50, 76),
            isRookie: false,
            isFiller: true,
        };
    }
    function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

    // 添加新秀前确保球队名单不超过 15 人：释放能力最低的球员（优先替补填充球员）
    // 释放的球员从球队名单和全局 players 数组中一并移除
    function makeRoomForRookie(teamId) {
        const roster = state.teamsPlayers[teamId];
        if (!roster) return;
        while (roster.length >= 15) {
            let toRelease = null;
            const fillers = roster.filter(p => p.isFiller);
            if (fillers.length > 0) {
                // 优先释放能力最低的替补填充球员
                fillers.sort((a, b) => a.o - b.o);
                toRelease = fillers[0];
            } else {
                // 无填充球员时，释放能力最低的边缘球员
                toRelease = [...roster].sort((a, b) => a.o - b.o)[0];
            }
            if (!toRelease) break;
            const idx = roster.findIndex(p => p.id === toRelease.id);
            if (idx >= 0) roster.splice(idx, 1);
            // filler 球员直接删除（凑数用，不是真实球员，不进自由市场）
            // 真实球员标记为自由球员保留在 state.players，等选秀结束时进入自由市场
            // 用户要求：自由球员应来自各球队裁员，而非纯随机生成
            if (toRelease.isFiller) {
                state.players = state.players.filter(p => p.id !== toRelease.id);
            } else {
                toRelease.isFreeAgent = true;
                toRelease.t = null;
                // 重新进入自由市场，滞留计时从 0 开始
                toRelease.yearsInFreeAgency = 0;
            }
        }
    }

    // AI 球队从自由市场签约补强：名单 < 14 的 AI 球队优先签约自由球员
    // 修复：自由球员池需要流动，否则无限膨胀；AI 球队名单不足时优先签约自由球员而非生成 filler
    // 增强：AI 球队若有低能力 filler(ovr<66)，且自由市场有更高能力球员，会签约替换（消耗自由市场）
    // 用户要求：自由球员应来自各球队裁员/新秀离队，且能被签约流动
    function aiSignFreeAgents(state) {
        let signed = 0;
        const myId = state.manager.teamId;
        // 收集所有可用自由球员（state.freeAgents + state.players 中 isFreeAgent=true 的）
        const availableFas = [...state.freeAgents];
        const existingIds = new Set(state.freeAgents.map(p => p.id));
        state.players.forEach(p => {
            if (p.isFreeAgent && !p.isRetired && p.t === null && !existingIds.has(p.id)) {
                availableFas.push(p);
                existingIds.add(p.id);
            }
        });
        if (availableFas.length === 0) return { signed: 0 };
        // 按能力降序排序（高能力先被签约）
        availableFas.sort((a, b) => b.o - a.o);
        const cap = window.SALARY_CAP;

        function trySign(teamId, roster, target) {
            const currentSal = roster.reduce((s, p) => s + (p.sal || 0), 0);
            const remainingSal = cap != null ? cap - currentSal : Infinity;
            // 薪资可负担 或 底薪特例(<=2M)
            if ((target.sal || 0) > remainingSal && (target.sal || 0) > 2) return false;
            // 签约
            target.t = teamId;
            target.isFreeAgent = false;
            // 重置自由市场滞留计时
            target.yearsInFreeAgency = 0;
            roster.push(target);
            // 从 state.freeAgents 移除（如果在）
            const faIdx = state.freeAgents.findIndex(p => p.id === target.id);
            if (faIdx >= 0) state.freeAgents.splice(faIdx, 1);
            signed++;
            return true;
        }

        state.teams.forEach(t => {
            if (t.id === myId) return; // 玩家球队由玩家自己签约
            const roster = state.teamsPlayers[t.id];
            // 1. 名单不足 14 人：签约补足
            // 修复 v10：原逻辑位置盲选（只看 ovr），SG ovr 略高于 SF 导致 SG 被优先签约，
            //   SF 滞留自由市场最终退役，位置分布失衡（SF 68 vs SG 107）
            //   新逻辑：优先补齐位置空缺（每位置 < 2 人时优先签该位置 FA）
            while (roster.length < 14) {
                // 统计各位置人数，找出最缺的位置
                const posCounts = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
                roster.forEach(p => { if (posCounts[p.p] !== undefined) posCounts[p.p]++; });
                const needyPos = Object.keys(posCounts).filter(pos => posCounts[pos] < 2).sort((a, b) => posCounts[a] - posCounts[b]);

                let target = null;
                // 优先签缺位位置的 FA
                for (const pos of needyPos) {
                    for (const fa of availableFas) {
                        if (fa.t !== null || fa.isRetired) continue;
                        if (fa.p !== pos) continue;
                        target = fa;
                        break;
                    }
                    if (target) break;
                }
                // 无缺位或缺位无合适 FA，签最高 ovr
                if (!target) {
                    for (const fa of availableFas) {
                        if (fa.t !== null || fa.isRetired) continue;
                        target = fa;
                        break;
                    }
                }
                if (!target) break;
                if (!trySign(t.id, roster, target)) break;
            }
            // 2. 替换低能力球员：filler 优先释放，其次低 ovr 真实球员（>28岁边缘轮换）
            //    修复：原逻辑仅替换 ovr<66 的 filler 且每队限 2 人，导致 AI 签约率过低
            //    （10 季仅签约 22 人），自由球员池从 10 膨胀到 373。
            //    新逻辑：每队最多替换 4 人，覆盖 filler 和 28+ 岁低 ovr 真实球员
            let replaced = 0;
            const MAX_REPLACE = 4;
            for (let i = 0; i < roster.length && replaced < MAX_REPLACE; i++) {
                const p = roster[i];
                // 候选释放对象：filler，或 28+ 岁 ovr<68 的真实球员（边缘老将）
                const isReplaceable = p.isFiller
                    || (!p.isFiller && p.a >= 28 && p.o < 68 && (p.yrsInLeague || 5) > 2);
                if (!isReplaceable) continue;
                if (p.o >= 70) continue; // 已达轮换水平不替换
                // 找一个明显更强的自由球员（ovr 至少高 2）
                let target = null;
                for (const fa of availableFas) {
                    if (fa.t !== null || fa.isRetired) continue;
                    if (fa.o > p.o + 2) { target = fa; break; }
                }
                if (!target) continue;
                // 释放候选：filler 直接删除，真实球员标记为自由球员
                roster.splice(i, 1);
                if (p.isFiller) {
                    state.players = state.players.filter(x => x.id !== p.id);
                } else {
                    p.isFreeAgent = true;
                    p.t = null;
                    p.yearsInFreeAgency = 0;
                    if (!state.freeAgents.find(x => x.id === p.id)) {
                        state.freeAgents.push(p);
                    }
                    if (!availableFas.find(x => x.id === p.id)) {
                        availableFas.push(p);
                    }
                }
                i--;
                if (!trySign(t.id, roster, target)) {
                    // 签约失败（薪资不足），把释放对象放回
                    roster.push(p);
                    if (p.isFiller) state.players.push(p);
                    else {
                        p.isFreeAgent = false;
                        p.t = t.id;
                    }
                    break;
                }
                replaced++;
            }
        });
        return { signed };
    }

    // ============ 顶部状态栏 ============
    function renderTopbar() {
        const t = teamObj(state.manager.teamId);
        document.getElementById("team-badge").innerHTML = `${teamLogo(state.manager.teamId, 24)}<span class="team-badge-text">${t.abbr} · ${state.manager.name}</span>`;
        document.getElementById("season-info").textContent = `${state.year}-${state.year + 1} 赛季`;
        document.getElementById("phase-info").textContent = phaseLabel();
        const r = state.records[state.manager.teamId];
        if (state.phase === "regular" || state.phase === "playoffs") {
            document.getElementById("record-info").textContent = `${r.win}胜 ${r.loss}负`;
        } else {
            document.getElementById("record-info").textContent = "";
        }
        document.getElementById("advance-btn").textContent = advanceBtnLabel();
        // advance 主按钮：轮到玩家选秀时禁用（强制玩家点新秀卡），其他时候可用
        const advBtn = document.getElementById("advance-btn");
        if (advBtn) advBtn.disabled = advanceBtnDisabled();
        // 快进按钮：仅常规赛/季后赛/总决赛可用
        const fastBtn = document.getElementById("fast-btn");
        if (fastBtn) {
            const show = state.phase === "regular" || state.phase === "playoffs" || state.phase === "finals";
            fastBtn.disabled = !show;
            fastBtn.textContent = fastBtnLabel();
        }
        // 手机端底部栏：选秀/自由市场阶段，"赛程"按钮临时换成"选秀"/"FA"入口
        updateBottombarForPhase();
    }

    // 根据当前阶段动态调整手机底部导航栏（让休赛期功能在手机端可见）
    function updateBottombarForPhase() {
        // 查找第4个底部按钮（原"赛程"位置），按位置定位避免 dataset 改变后找不到
        const allBottomBtns = document.querySelectorAll('.bottombar-item');
        const scheduleBtn = allBottomBtns[3]; // 索引3 = 赛程位
        if (!scheduleBtn) return;
        if (state.phase === "draft") {
            scheduleBtn.dataset.view = "draft";
            scheduleBtn.innerHTML = '<span class="icon">🎓</span>选秀';
            scheduleBtn.classList.toggle("active", currentView === "draft");
        } else if (state.phase === "freeAgency") {
            scheduleBtn.dataset.view = "freeagents";
            scheduleBtn.innerHTML = '<span class="icon">💰</span>FA';
            scheduleBtn.classList.toggle("active", currentView === "freeagents");
        } else {
            scheduleBtn.dataset.view = "schedule";
            scheduleBtn.innerHTML = '<span class="icon">📅</span>赛程';
            scheduleBtn.classList.toggle("active", currentView === "schedule");
        }
    }

    function fastBtnLabel() {
        switch (state.phase) {
            case "regular": return "⏩ 至季后赛";
            case "playoffs": case "finals": return "⏩ 模拟至结束";
            default: return "⏩";
        }
    }

    function phaseLabel() {
        switch (state.phase) {
            case "regular": return "常规赛";
            case "playoffs": return "季后赛";
            case "finals": return "总决赛";
            case "draft": return "选秀";
            case "freeAgency": return "自由市场";
            case "offseason": return "休赛期";
            default: return state.phase;
        }
    }

    function advanceBtnLabel() {
        switch (state.phase) {
            case "regular": return "下一场比赛 ▶";
            case "playoffs": case "finals": return "下一轮 ▶";
            case "draft":
                if (state.draftPick >= 60) return "进入自由市场 ▶";
                if (state.draftOrder && state.draftOrder[state.draftPick] === state.manager.teamId) return "请选择新秀 ⬇";
                return "继续选秀 ▶";
            case "freeAgency": return "开始新赛季 ▶";
            case "offseason": return "开始选秀 ▶";
            default: return "继续 ▶";
        }
    }

    // 判断当前 advance 按钮是否可点（轮到玩家选秀时应禁用，强制玩家点新秀卡）
    function advanceBtnDisabled() {
        if (state.phase === "draft" && state.draftPick < 60 &&
            state.draftOrder && state.draftOrder[state.draftPick] === state.manager.teamId) {
            return true;
        }
        return false;
    }

    // ============ 视图路由 ============
    function renderAll() {
        renderView(currentView);
    }

    function renderView(view) {
        currentView = view;
        // 刷新顶部状态栏（advance/fast 按钮状态、底部栏阶段切换都依赖这里）
        renderTopbar();
        // 同步桌面侧边栏与手机底部栏的选中状态
        document.querySelectorAll(".nav-item, .bottombar-item").forEach(b => {
            b.classList.toggle("active", b.dataset.view === view);
        });
        const main = document.getElementById("main-content");
        const renderers = {
            dashboard: renderDashboard,
            roster: renderRoster,
            trade: renderTrade,
            freeagents: renderFreeAgents,
            schedule: renderSchedule,
            standings: renderStandings,
            stats: renderStats,
            draft: renderDraft,
            league: renderLeague,
            playersearch: renderPlayerSearch,
            tradelog: renderTradeLog,
        };
        main.innerHTML = (renderers[view] || renderDashboard)();
        bindViewEvents();
        // 滚回顶部
        main.scrollTop = 0;
    }

    // 手机端"更多"菜单（容纳底部栏放不下的视图）
    function showMoreMenu() {
        const items = [
            { v: "freeagents", icon: "💰", name: "自由球员" },
            { v: "draft", icon: "🎓", name: "选秀" },
            { v: "league", icon: "🌐", name: "联盟" },
            { v: "tradelog", icon: "🔄", name: "交易动态" },
            { v: "playersearch", icon: "🔍", name: "球员搜索" },
            { v: "dashboard", icon: "📊", name: "仪表盘" },
        ];
        const html = `<div class="modal-title">更多功能</div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
                ${items.map(it => `<button class="btn" style="padding:18px 10px;font-size:14px;display:flex;flex-direction:column;gap:6px;align-items:center" data-moreview="${it.v}"><span style="font-size:24px">${it.icon}</span>${it.name}</button>`).join("")}
                <button class="btn" style="padding:18px 10px;font-size:14px;display:flex;flex-direction:column;gap:6px;align-items:center" id="more-tactics"><span style="font-size:24px">⚙️</span>战术设置</button>
                <button class="btn" style="padding:18px 10px;font-size:14px;display:flex;flex-direction:column;gap:6px;align-items:center" id="more-awards"><span style="font-size:24px">🏆</span>奖项历史</button>
                <button class="btn" style="padding:18px 10px;font-size:14px;display:flex;flex-direction:column;gap:6px;align-items:center" id="more-savemgr"><span style="font-size:24px">📁</span>存档管理</button>
            </div>
            <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">取消</button></div>`;
        showModal(html);
        // 绑定点击
        setTimeout(() => {
            document.querySelectorAll("[data-moreview]").forEach(el => {
                el.addEventListener("click", () => { closeModal(); renderView(el.dataset.moreview); });
            });
            const sm = document.getElementById("more-savemgr");
            if (sm) sm.addEventListener("click", () => { closeModal(); showSaveManager(); });
            const tac = document.getElementById("more-tactics");
            if (tac) tac.addEventListener("click", () => { closeModal(); showTacticsModal(); });
            const aw = document.getElementById("more-awards");
            if (aw) aw.addEventListener("click", () => { closeModal(); showAwardsHistory(); });
        }, 0);
    }

    // ============ 战术设置（Feature 5）============
    function showTacticsModal() {
        const tac = state.tactics;
        const opt = (cur, val, label, desc) => `
            <button class="tactic-opt ${cur===val?'active':''}" data-tackey data-val="${val}">
                <div class="tactic-opt-name">${label}</div><div class="tactic-opt-desc">${desc}</div>
            </button>`;
        const group = (title, key, opts) => `
            <div class="tactic-group">
                <div class="card-title">${title}</div>
                <div class="tactic-opts">${opts.map(o => opt(tac[key], o.val, o.label, o.desc)).join("")}</div>
            </div>`;
        showModal(`
            <div class="modal-title">⚙️ 战术设置</div>
            <div class="muted" style="font-size:12px;margin-bottom:12px">调整比赛风格，影响下一场起的比赛模拟。对手使用默认战术。</div>
            ${group('比赛节奏', 'pace', [
                { val: 0, label: '慢节奏', desc: '回合数-5，半场阵地战，降低比分' },
                { val: 1, label: '正常', desc: '标准 NBA 节奏' },
                { val: 2, label: '快节奏', desc: '回合数+5，更多攻防转换，提升比分' },
            ])}
            ${group('防守强度', 'defense', [
                { val: 0, label: '松懈', desc: '犯规-20%，对手命中率略升' },
                { val: 1, label: '正常', desc: '标准防守' },
                { val: 2, label: '紧逼', desc: '犯规+25%，压制对手命中率' },
            ])}
            ${group('轮换深度', 'rotation', [
                { val: 0, label: '短轮换', desc: '8人轮换，主力多打2分钟' },
                { val: 1, label: '正常', desc: '9人轮换' },
                { val: 2, label: '长轮换', desc: '10人轮换，主力休息、替补多打' },
            ])}
            <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">确定</button></div>
        `);
        setTimeout(() => {
            document.querySelectorAll("#modal-box [data-tackey]").forEach(el => {
                el.addEventListener("click", () => {
                    // 找到所属 group 的 key
                    const group = el.closest(".tactic-group");
                    const titleEl = group.querySelector(".card-title");
                    const keyMap = { '比赛节奏':'pace', '防守强度':'defense', '轮换深度':'rotation' };
                    const key = keyMap[titleEl.textContent] || 'pace';
                    state.tactics[key] = +el.dataset.val;
                    autoSave();
                    renderTacActive();
                });
            });
        }, 0);
        function renderTacActive() {
            // 重新高亮当前选项
            const groups = document.querySelectorAll("#modal-box .tactic-group");
            const keyMap = { '比赛节奏':'pace', '防守强度':'defense', '轮换深度':'rotation' };
            groups.forEach(g => {
                const key = keyMap[g.querySelector(".card-title").textContent];
                g.querySelectorAll("[data-tackey]").forEach(btn => {
                    btn.classList.toggle("active", +btn.dataset.val === state.tactics[key]);
                });
            });
        }
    }

    // ============ 奖项历史 ============
    // 重构 v11：按奖项聚合查看
    //   - 顶部 Tab 切换：「按赛季」「按奖项」两种视图
    //   - 按赛季：原表，每赛季一行，含 MVP/FMVP/DPOY/ROY/6MOY/MIP/冠军
    //   - 按奖项：选择某奖项（MVP/FMVP/DPOY/ROY/6MOY/MIP/总冠军/最佳阵容/防守阵容/新秀阵容）
    //            显示该奖项历年获奖者列表，含数据明细
    let awardsViewMode = 'season';   // 'season' | 'byAward'
    let awardsSelectedTab = 'MVP';   // byAward 模式下当前选中的奖项

    function showAwardsHistory() {
        const hist = state.awardsHistory || [];
        if (hist.length === 0) {
            showModal(`<div class="modal-title">🏆 奖项历史</div><div class="muted center" style="padding:30px">暂无奖项记录（常规赛结束后评选）</div><div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">关闭</button></div>`);
            return;
        }
        renderAwardsHistory();
    }

    function renderAwardsHistory() {
        const hist = state.awardsHistory || [];
        // 按奖项聚合的候选 Tab 列表（含个人奖项 + 集体荣誉 + 阵容）
        const awardTabs = [
            { key: 'MVP',      label: 'MVP',     icon: '🏆' },
            { key: 'FMVP',     label: 'FMVP',    icon: '🏆' },
            { key: '总冠军',   label: '总冠军',  icon: '💍' },
            { key: 'DPOY',     label: 'DPOY',    icon: '🛡️' },
            { key: 'ROY',      label: 'ROY',     icon: '🌟' },
            { key: '6MOY',     label: '6MOY',    icon: '🔥' },
            { key: 'MIP',      label: 'MIP',     icon: '📈' },
            { key: '一阵',     label: '最佳一阵', icon: '⭐' },
            { key: '二阵',     label: '最佳二阵', icon: '⭐' },
            { key: '三阵',     label: '最佳三阵', icon: '⭐' },
            { key: '防守一阵', label: '防守一阵', icon: '🛡️' },
            { key: '防守二阵', label: '防守二阵', icon: '🛡️' },
            { key: '新秀一阵', label: '新秀一阵', icon: '🌱' },
            { key: '新秀二阵', label: '新秀二阵', icon: '🌱' },
        ];

        const tabsBar = `
            <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
                <button class="btn ${awardsViewMode==='season'?'btn-primary':''}" style="padding:6px 12px;font-size:12px" onclick="App.setAwardsView('season')">按赛季</button>
                <button class="btn ${awardsViewMode==='byAward'?'btn-primary':''}" style="padding:6px 12px;font-size:12px" onclick="App.setAwardsView('byAward')">按奖项</button>
            </div>`;

        let body;
        if (awardsViewMode === 'season') {
            body = renderAwardsBySeason(hist);
        } else {
            // 按奖项模式：奖项 Tab + 当前奖项的历年列表
            const tabsRow = awardTabs.map(t => `
                <button class="btn ${awardsSelectedTab===t.key?'btn-primary':''}" style="padding:5px 10px;font-size:11px;margin:2px" onclick="App.setAwardsTab('${t.key}')">${t.icon} ${t.label}</button>
            `).join('');
            body = `<div style="margin-bottom:10px">${tabsRow}</div>` + renderAwardsByType(hist, awardsSelectedTab);
        }

        showModal(`
            <div class="modal-title">🏆 奖项历史</div>
            ${tabsBar}
            ${body}
            <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">关闭</button></div>
        `);
    }

    // 按赛季视图（原表）
    function renderAwardsBySeason(hist) {
        const rows = hist.slice().reverse().map(a => {
            const mvp = a.mvp ? `${a.mvp.player.n}<br><span class="muted" style="font-size:11px">${teamAbbr(a.mvp.teamId)} ${a.mvp.ppg.toFixed(1)}分</span>` : '-';
            const eMvp = a.eastMvp ? `${a.eastMvp.player.n}<br><span class="muted" style="font-size:11px">${teamAbbr(a.eastMvp.teamId)} ${a.eastMvp.ppg.toFixed(1)}分</span>` : '-';
            const wMvp = a.westMvp ? `${a.westMvp.player.n}<br><span class="muted" style="font-size:11px">${teamAbbr(a.westMvp.teamId)} ${a.westMvp.ppg.toFixed(1)}分</span>` : '-';
            const dpoy = a.dpoy ? `${a.dpoy.player.n}<br><span class="muted" style="font-size:11px">${teamAbbr(a.dpoy.teamId)}</span>` : '-';
            const roy = a.roy ? `${a.roy.player.n}<br><span class="muted" style="font-size:11px">${teamAbbr(a.roy.teamId)} ${a.roy.ppg.toFixed(1)}分</span>` : '-';
            const sixMan = a.sixMan ? `${a.sixMan.player.n}<br><span class="muted" style="font-size:11px">${teamAbbr(a.sixMan.teamId)} ${a.sixMan.ppg.toFixed(1)}分</span>` : '-';
            const mip = a.mip ? `${a.mip.player.n}<br><span class="muted" style="font-size:11px">${teamAbbr(a.mip.teamId)} +${a.mip.ppgDelta.toFixed(1)}分</span>` : '-';
            const champ = state.champions.find(c => c.year === a.year);
            const champStr = champ ? `${champ.name}<br><span class="muted" style="font-size:11px">${champ.finalsScore||'-'}</span>` : '-';
            const fmvpStr = (champ && champ.finalsMVP) ? `${champ.finalsMVP.n}<br><span class="muted" style="font-size:11px">${champ.finalsMVP.ppg.toFixed(1)}分 ${champ.finalsMVP.rpg.toFixed(1)}板 ${champ.finalsMVP.apg.toFixed(1)}助</span>` : '-';
            return `<tr>
                <td class="num"><b>${a.year}-${String(a.year+1).slice(-2)}</b></td>
                <td>${mvp}</td><td>${eMvp}</td><td>${wMvp}</td>
                <td>${fmvpStr}</td>
                <td>${dpoy}</td><td>${roy}</td><td>${sixMan}</td><td>${mip}</td>
                <td>${champStr}</td>
            </tr>`;
        }).join("");
        return `<div class="table-wrap"><table style="font-size:12px"><thead><tr>
            <th class="num">赛季</th><th>MVP</th><th>东部MVP</th><th>西部MVP</th><th>FMVP</th>
            <th>DPOY</th><th>ROY</th><th>6MOY</th><th>MIP</th><th>冠军</th>
        </tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    // 按奖项视图：返回该奖项历年获奖者表格
    function renderAwardsByType(hist, type) {
        const fmtYear = (y) => `${y}-${String(y+1).slice(2)}`;
        const playerLink = (pid, name) => `<a href="#" onclick="App.showPlayerDetail('${pid}');return false" style="color:var(--nba-blue);text-decoration:none;font-weight:600">${name}</a>`;
        const teamStr = (tid) => tid ? teamAbbr(tid) : '-';

        // 收集该奖项历年记录：[{year, name, pid, teamId, line}]
        let records = [];

        if (type === 'MVP') {
            records = hist.map(a => a.mvp ? { year: a.year, name: a.mvp.player.n, pid: a.mvp.player.id, teamId: a.mvp.teamId, line: `${a.mvp.ppg.toFixed(1)}分 ${a.mvp.rpg.toFixed(1)}板 ${a.mvp.apg.toFixed(1)}助` } : null).filter(Boolean);
        } else if (type === 'FMVP') {
            records = hist.map(a => {
                const champ = state.champions.find(c => c.year === a.year);
                if (!champ || !champ.finalsMVP) return null;
                return { year: a.year, name: champ.finalsMVP.n, pid: champ.finalsMVP.id, teamId: champ.team, line: `${champ.finalsMVP.ppg.toFixed(1)}分 ${champ.finalsMVP.rpg.toFixed(1)}板 ${champ.finalsMVP.apg.toFixed(1)}助 · ${champ.finalsScore||''}` };
            }).filter(Boolean);
        } else if (type === '总冠军') {
            // 总冠军：展示冠军队 + FMVP
            records = state.champions.map(c => ({
                year: c.year,
                name: c.name,
                pid: null,
                teamId: c.team,
                line: `FMVP: ${c.finalsMVP ? c.finalsMVP.n : '-'} · 比分 ${c.finalsScore||'-'}`,
            }));
        } else if (type === 'DPOY') {
            records = hist.map(a => a.dpoy ? { year: a.year, name: a.dpoy.player.n, pid: a.dpoy.player.id, teamId: a.dpoy.teamId, line: `${a.dpoy.ppg.toFixed(1)}分 ${a.dpoy.rpg.toFixed(1)}板 ${a.dpoy.bpg.toFixed(1)}帽 ${a.dpoy.spg.toFixed(1)}断` } : null).filter(Boolean);
        } else if (type === 'ROY') {
            records = hist.map(a => a.roy ? { year: a.year, name: a.roy.player.n, pid: a.roy.player.id, teamId: a.roy.teamId, line: `${a.roy.ppg.toFixed(1)}分 ${a.roy.rpg.toFixed(1)}板 ${a.roy.apg.toFixed(1)}助` } : null).filter(Boolean);
        } else if (type === '6MOY') {
            records = hist.map(a => a.sixMan ? { year: a.year, name: a.sixMan.player.n, pid: a.sixMan.player.id, teamId: a.sixMan.teamId, line: `${a.sixMan.ppg.toFixed(1)}分 ${a.sixMan.rpg.toFixed(1)}板 ${a.sixMan.apg.toFixed(1)}助` } : null).filter(Boolean);
        } else if (type === 'MIP') {
            records = hist.map(a => a.mip ? { year: a.year, name: a.mip.player.n, pid: a.mip.player.id, teamId: a.mip.teamId, line: `+${a.mip.ppgDelta.toFixed(1)}分 ${a.mip.ppg.toFixed(1)}分 ${a.mip.rpg.toFixed(1)}板 ${a.mip.apg.toFixed(1)}助` } : null).filter(Boolean);
        } else if (type === '一阵') {
            records = collectTeamAwards(hist, 'allNBAFirstDetail', 'allNBAFirst');
        } else if (type === '二阵') {
            records = collectTeamAwards(hist, 'allNBASecondDetail', 'allNBASecond');
        } else if (type === '三阵') {
            records = collectTeamAwards(hist, 'allNBAThirdDetail', 'allNBAThird');
        } else if (type === '防守一阵') {
            records = collectTeamAwards(hist, 'allDefFirstDetail', 'allDefFirst');
        } else if (type === '防守二阵') {
            records = collectTeamAwards(hist, 'allDefSecondDetail', 'allDefSecond');
        } else if (type === '新秀一阵') {
            records = collectTeamAwards(hist, 'allRookieFirstDetail', 'allRookieFirst');
        } else if (type === '新秀二阵') {
            records = collectTeamAwards(hist, 'allRookieSecondDetail', 'allRookieSecond');
        }

        if (records.length === 0) {
            return `<div class="muted center" style="padding:30px">暂无 ${type} 记录</div>`;
        }

        // 倒序：最近年份在最前
        records.sort((a, b) => b.year - a.year);

        const rows = records.map(r => {
            const nameHtml = r.pid ? playerLink(r.pid, r.name) : `<b>${r.name}</b>`;
            return `<tr>
                <td class="num"><b>${fmtYear(r.year)}</b></td>
                <td>${nameHtml}</td>
                <td class="num">${teamStr(r.teamId)}</td>
                <td class="muted" style="font-size:11px">${r.line || ''}</td>
            </tr>`;
        }).join('');

        return `<div class="table-wrap"><table style="font-size:12px"><thead><tr>
            <th class="num">赛季</th><th>${type === '总冠军' ? '球队' : '球员'}</th><th>球队</th><th>数据</th>
        </tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    // 阵容类奖项聚合：每赛季可能有多个球员入选，展开为多行
    function collectTeamAwards(hist, detailKey, idListKey) {
        const out = [];
        hist.forEach(a => {
            // 优先用 detail（含数据），降级用 id list
            const detail = a[detailKey];
            if (detail && Array.isArray(detail)) {
                detail.forEach(c => {
                    out.push({
                        year: a.year,
                        name: c.player.n,
                        pid: c.player.id,
                        teamId: c.teamId,
                        line: `${(c.ppg||0).toFixed(1)}分 ${(c.rpg||0).toFixed(1)}板 ${(c.apg||0).toFixed(1)}助`,
                    });
                });
            } else {
                const ids = a[idListKey] || [];
                ids.forEach(pid => {
                    const p = state.players.find(x => x.id === pid);
                    if (!p) return;
                    out.push({ year: a.year, name: p.n, pid: pid, teamId: p.t, line: '' });
                });
            }
        });
        return out;
    }

    // 切换奖项历史视图模式
    function setAwardsView(mode) {
        awardsViewMode = mode;
        renderAwardsHistory();
    }
    // 切换奖项 Tab（按奖项模式下）
    function setAwardsTab(tab) {
        awardsSelectedTab = tab;
        renderAwardsHistory();
    }

    // ============ 存档管理（游戏内）============
    function showSaveManager() {
        renderSaveManager();
    }

    function renderSaveManager() {
        const autoMeta = SaveEngine.getAutoMeta();
        const slots = SaveEngine.listSlots();

        const autoHtml = autoMeta ? `
            <div class="save-row">
                <div class="save-info">
                    <div class="save-title">自动存档 <span class="tag tag-rookie">最新</span></div>
                    <div class="save-sub">${autoMeta.teamAbbr} · ${autoMeta.managerName} | ${autoMeta.year}-${autoMeta.year+1} ${SaveEngine.phaseLabel(autoMeta.phase)} · ${autoMeta.win}胜${autoMeta.loss}负</div>
                    <div class="save-time">${SaveEngine.formatTime(autoMeta.savedAt)}</div>
                </div>
                <div class="save-actions"><span class="muted" style="font-size:11px">自动更新</span></div>
            </div>` : `<div class="muted center" style="padding:14px">无自动存档</div>`;

        const slotsHtml = slots.map(s => {
            if (!s.meta) {
                return `<div class="save-row empty">
                    <div class="save-info"><div class="save-title">存档 ${s.id}</div><div class="save-sub muted">- 空槽位 -</div></div>
                    <div class="save-actions"><button class="btn btn-sm btn-primary" data-saveslot="${s.id}">存档到此</button></div>
                </div>`;
            }
            return `<div class="save-row">
                <div class="save-info">
                    <div class="save-title">存档 ${s.id}</div>
                    <div class="save-sub">${s.meta.teamAbbr} · ${s.meta.managerName} | ${s.meta.year}-${s.meta.year+1} ${SaveEngine.phaseLabel(s.meta.phase)} · ${s.meta.win}胜${s.meta.loss}负</div>
                    <div class="save-time">${SaveEngine.formatTime(s.meta.savedAt)}</div>
                </div>
                <div class="save-actions">
                    <button class="btn btn-sm" data-loadslot="${s.id}">读取</button>
                    <button class="btn btn-sm btn-primary" data-saveslot="${s.id}">覆盖</button>
                    <button class="btn btn-sm" data-delslot="${s.id}">删除</button>
                </div>
            </div>`;
        }).join("");

        showModal(`
            <div class="modal-title">📁 存档管理</div>
            <div class="card-title">自动存档</div>
            ${autoHtml}
            <div class="card-title mt-20">手动存档槽 <span class="muted" style="font-size:11px;text-transform:none">读取会覆盖当前进度</span></div>
            ${slotsHtml}
            <div class="modal-actions">
                <button class="btn" id="clear-all-saves" style="margin-right:auto;color:var(--nba-red-light)">🗑️ 清除所有存档</button>
                <button class="btn" id="export-saves" title="导出全部存档为 JSON 文件备份">📤 导出备份</button>
                <button class="btn" id="import-saves" title="从 JSON 备份文件导入存档（覆盖现有同名存档）">📥 导入备份</button>
                <button class="btn btn-primary" onclick="App.closeModal()">关闭</button>
            </div>
        `);
        // 绑定
        setTimeout(() => {
            document.querySelectorAll("#modal-box [data-saveslot]").forEach(el => {
                el.addEventListener("click", () => {
                    const id = +el.dataset.saveslot;
                    const meta = SaveEngine.getSlotMeta(id);
                    const confirmMsg = meta ? `确定覆盖存档 ${id}？（${meta.teamAbbr} ${meta.year}-${meta.year+1}）` : `保存到存档 ${id}？`;
                    if (confirm(confirmMsg)) {
                        if (SaveEngine.saveSlot(id, state)) {
                            toast(`已保存到存档 ${id}`, "success");
                            renderSaveManager();
                        } else toast("存档失败（空间不足？）", "error");
                    }
                });
            });
            document.querySelectorAll("#modal-box [data-loadslot]").forEach(el => {
                el.addEventListener("click", () => {
                    const id = +el.dataset.loadslot;
                    if (!confirm("读取存档将覆盖当前进度，确定？")) return;
                    const loaded = SaveEngine.loadSlot(id);
                    if (!loaded) { toast("读取失败", "error"); return; }
                    closeModal();
                    loadState(loaded);
                });
            });
            document.querySelectorAll("#modal-box [data-delslot]").forEach(el => {
                el.addEventListener("click", () => {
                    const id = +el.dataset.delslot;
                    if (confirm(`确定删除存档 ${id}？`)) {
                        SaveEngine.deleteSlot(id);
                        renderSaveManager();
                    }
                });
            });
            const clearAllBtn = document.getElementById("clear-all-saves");
            if (clearAllBtn) clearAllBtn.addEventListener("click", () => {
                if (confirm("将清除全部存档（自动存档 + 所有手动槽位），且当前游戏进度也会丢失。确定继续？")) {
                    SaveEngine.clearAll();
                    toast("已清除所有存档", "success");
                    closeModal();
                    setTimeout(() => location.reload(), 600);
                }
            });
            // 导出备份：打包自动存档 + 全部手动槽位为 JSON 文件下载
            const exportBtn = document.getElementById("export-saves");
            if (exportBtn) exportBtn.addEventListener("click", () => {
                try {
                    const json = SaveEngine.exportAll();
                    const blob = new Blob([json], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    const d = new Date();
                    const pad = n => String(n).padStart(2, "0");
                    a.href = url;
                    a.download = `nba_gm_backup_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.json`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    toast("存档备份已导出，请妥善保存文件", "success");
                } catch (e) {
                    console.error("导出存档失败:", e);
                    toast("导出失败：" + e.message, "error");
                }
            });
            // 导入备份：读取 JSON 备份文件并覆盖写回 localStorage，刷新后生效
            const importBtn = document.getElementById("import-saves");
            if (importBtn) importBtn.addEventListener("click", () => {
                if (!confirm("导入将覆盖当前浏览器中的同名存档。确定继续？")) return;
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".json,application/json";
                input.onchange = () => {
                    const file = input.files && input.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                        try {
                            const n = SaveEngine.importAll(reader.result);
                            toast(`成功导入 ${n} 个存档，刷新页面后生效`, "success");
                            closeModal();
                            setTimeout(() => {
                                if (confirm("导入完成，是否立即刷新页面载入存档？")) location.reload();
                            }, 400);
                        } catch (e) {
                            console.error("导入存档失败:", e);
                            toast("导入失败：" + e.message, "error");
                        }
                    };
                    reader.onerror = () => toast("文件读取失败", "error");
                    reader.readAsText(file);
                };
                input.click();
            });
        }, 0);
    }

    // ============ 仪表盘 ============
    function renderDashboard() {
        const myId = state.manager.teamId;
        const myPlayers = state.teamsPlayers[myId];
        const r = state.records[myId];
        const rating = SimEngine.teamRating(myPlayers);
        const salary = TradeEngine.teamSalary(myPlayers);
        const cap = window.SALARY_CAP;

        // 下一场比赛
        let nextGame = "赛季进行中";
        const ng = findNextUserGame();
        if (ng) nextGame = `${teamLogo(ng.away, 32)} <span style="vertical-align:middle">${teamAbbr(ng.away)}</span> <span style="vertical-align:middle;color:var(--text-dim);margin:0 6px">@</span> ${teamLogo(ng.home, 32)} <span style="vertical-align:middle">${teamAbbr(ng.home)}</span>`;

        // 最近5场（含季后赛）
        const recent = state.userGameLog.slice(-5).reverse();
        const recentHtml = recent.length ? recent.map(g => {
            const opp = g.opp;
            const res = g.win ? "胜" : "负";
            const playTag = g.isPlayoff ? ` <span class="muted" style="font-size:10px">${g.round}</span>` : "";
            return `<tr><td>${teamLogo(opp, 16)} ${teamAbbr(opp)}${playTag}</td><td class="num">${g.myScore}-${g.oppScore}</td><td><span class="tag tag-${g.win?'rookie':'injured'}" style="background:${g.win?'rgba(46,204,113,0.2)':'rgba(231,76,60,0.2)'};color:${g.win?'#2ecc71':'#e8324a'}">${res}</span></td></tr>`;
        }).join("") : `<tr><td colspan="3" class="muted center">暂无比赛记录</td></tr>`;

        // 排名片段
        updateStandings();
        const st = state.standings;
        const myConf = st[teamObj(myId).conf === "East" ? "east" : "west"];
        const myRank = myConf.findIndex(e => e.teamId === myId) + 1;

        return `
        <h1 class="page-title">📊 仪表盘</h1>
        <div class="stat-grid">
            <div class="stat-box"><div class="value">${r.win}-${r.loss}</div><div class="label">战绩</div></div>
            <div class="stat-box"><div class="value">#${myRank}</div><div class="label">${teamObj(myId).conf==="East"?"东":"西"}部排名</div></div>
            <div class="stat-box"><div class="value">${Math.round(rating)}</div><div class="label">球队实力</div></div>
            <div class="stat-box"><div class="value" style="color:${salary>cap?'var(--nba-red-light)':'var(--success)'}">$${salary.toFixed(1)}M</div><div class="label">薪资 / 帽$${cap}M</div></div>
        </div>
        ${renderOfferInboxCard()}
        <div class="card">
            <div class="card-title">下场对阵</div>
            <div style="font-size:22px;font-weight:800;text-align:center;padding:18px 0;background:var(--bg-elevated);border-radius:var(--radius-sm);margin-bottom:8px">${nextGame}</div>
            <div class="center muted" style="font-size:12px">点击右上角 ▶ 模拟下一场（空格键）</div>
            <div class="dash-actions">
                <button class="btn" id="title-odds-btn">🎲 模拟夺冠概率</button>
                <button class="btn" id="ach-btn">🏆 成就 ${unlockedAchCount()}/${AchievementEngine.DEFS.length}</button>
                <button class="btn" id="training-btn">💪 ${trainingFocusLabel()}</button>
            </div>
        </div>
        ${renderInjuryCard(myPlayers)}
        <div class="card">
            <div class="card-title">最近 5 场</div>
            <div class="table-wrap"><table><thead><tr><th>对手</th><th class="num">比分</th><th>结果</th></tr></thead><tbody>${recentHtml}</tbody></table></div>
        </div>
        ${renderTradeFeedCard(8)}
        <div class="card">
            <div class="card-title">阵容核心 <span class="muted" style="font-size:11px;text-transform:none">按总评排序</span></div>
            <div class="table-wrap">${renderPlayerTable(myPlayers.slice().sort((a,b)=>b.o-a.o).slice(0,12), false)}</div>
            <div style="text-align:right;margin-top:6px"><a href="#" class="muted" style="font-size:12px" onclick="App.renderView('roster');return false">查看全部名单 →</a></div>
        </div>`;
    }

    // AI 报价收件箱卡片（有未处理报价时显示）
    function renderOfferInboxCard() {
        const offers = state.pendingOffers || [];
        if (offers.length === 0) return "";
        const rows = offers.map(o => `
            <tr>
                <td>${teamLogo(o.from, 18)} ${teamAbbr(o.from)}</td>
                <td style="font-size:12px">${o.give.map(p => `${p.n}(${p.o})`).join("、")}</td>
                <td style="font-size:12px">${o.want.map(p => `${p.n}(${p.o})`).join("、")}</td>
                <td class="num">${Math.max(0, o.expiresDay - state.currentDay)}天</td>
                <td><button class="btn btn-sm btn-primary" data-offerview="${o.id}">审阅</button></td>
            </tr>`).join("");
        return `<div class="card" style="border:1px solid rgba(212,175,55,0.35)">
            <div class="card-title">📩 交易报价 <span class="tag tag-rookie">${offers.length} 份待处理</span></div>
            <div class="table-wrap"><table><thead><tr><th>来自</th><th>他们送出</th><th>他们想要</th><th class="num">剩余</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        </div>`;
    }

    function unlockedAchCount() {
        return Object.keys(state.achievements || {}).length;
    }

    // 伤兵卡片（Feature 2）
    function renderInjuryCard(myPlayers) {
        const injured = myPlayers.filter(p => p.injured);
        if (injured.length === 0) return "";
        const rows = injured.map(p => `<tr><td><span class="pos-${p.p}">${p.p}</span> ${p.n}</td><td class="num"><span class="tag tag-injured">伤</span></td><td class="num">${p.injured}场</td></tr>`).join("");
        return `<div class="card">
            <div class="card-title">🚑 伤兵名单 <span class="muted" style="font-size:11px;text-transform:none">${injured.length}人缺阵</span></div>
            <div class="table-wrap"><table><thead><tr><th>球员</th><th class="num">状态</th><th class="num">预计缺阵</th></tr></thead><tbody>${rows}</tbody></table></div>
        </div>`;
    }

    // 交易动态卡片（仪表盘/交易日志视图共用）
    function renderTradeFeedCard(limit) {
        const log = (state.tradeLog || []).slice().reverse().slice(0, limit);
        if (log.length === 0) return "";
        const rows = log.map(tr => {
            const aSide = tr.outgoingA.map(p => `${p.n}(${p.o})`).join(", ");
            const bSide = tr.outgoingB.map(p => `${p.n}(${p.o})`).join(", ");
            const tag = tr.blockbuster ? '<span class="tag tag-rookie" style="margin-left:4px">重磅</span>' : '';
            return `<tr>
                <td>${teamLogo(tr.teamA,16)} ${teamAbbr(tr.teamA)}${tag}</td>
                <td class="muted" style="font-size:12px">${aSide} ⇄ ${bSide}</td>
                <td>${teamLogo(tr.teamB,16)} ${teamAbbr(tr.teamB)}</td>
            </tr>`;
        }).join("");
        return `<div class="card">
            <div class="card-title">🔄 联盟交易动态 <span class="muted" style="font-size:11px;text-transform:none">本季共 ${(state.tradeLog||[]).length} 笔</span></div>
            <div class="table-wrap"><table><thead><tr><th>球队A</th><th>交易</th><th>球队B</th></tr></thead><tbody>${rows}</tbody></table></div>
            <div style="text-align:right;margin-top:6px"><a href="#" class="muted" style="font-size:12px" onclick="App.renderView('tradelog');return false">查看全部交易 →</a></div>
        </div>`;
    }

    // 交易日志完整视图
    function renderTradeLog() {
        const log = (state.tradeLog || []).slice().reverse();
        if (log.length === 0) {
            return `<h1 class="page-title">🔄 联盟交易动态</h1>
            <div class="card"><div class="muted center" style="padding:24px">本赛季暂无 AI 球队间交易</div></div>`;
        }
        const rows = log.map(tr => {
            const aSide = tr.outgoingA.map(p => `<span class="pos-${p.p}">${p.p}</span> ${p.n} <span class="muted">(${p.o},${p.a}岁,$${p.sal}M)</span>`).join("<br>");
            const bSide = tr.outgoingB.map(p => `<span class="pos-${p.p}">${p.p}</span> ${p.n} <span class="muted">(${p.o},${p.a}岁,$${p.sal}M)</span>`).join("<br>");
            const tag = tr.blockbuster ? '<span class="tag tag-rookie">重磅</span>' : '<span class="tag" style="background:var(--bg-elevated);color:var(--text-dim)">常规</span>';
            return `<tr>
                <td class="num muted" style="font-size:12px">第${tr.day+1}天</td>
                <td>${teamLogo(tr.teamA,18)} ${teamAbbr(tr.teamA)}</td>
                <td style="font-size:12px">${aSide}</td>
                <td class="center muted">⇄</td>
                <td style="font-size:12px">${bSide}</td>
                <td>${teamLogo(tr.teamB,18)} ${teamAbbr(tr.teamB)}</td>
                <td>${tag}</td>
            </tr>`;
        }).join("");
        return `<h1 class="page-title">🔄 联盟交易动态</h1>
        <div class="card">
            <div class="card-title">本赛季交易记录 <span class="muted" style="font-size:11px;text-transform:none">共 ${log.length} 笔（含 ${log.filter(t=>t.blockbuster).length} 笔重磅交易）</span></div>
            <div class="table-wrap"><table><thead><tr><th class="num">日期</th><th>球队</th><th>送出</th><th></th><th>获得</th><th>球队</th><th>类型</th></tr></thead><tbody>${rows}</tbody></table></div>
        </div>`;
    }

    // ============ 阵容 ============
    function renderRoster() {
        const myPlayers = state.teamsPlayers[state.manager.teamId];
        const sorted = myPlayers.slice().sort((a,b) => {
            // 按位置再按能力
            const order = {PG:1,SG:2,SF:3,PF:4,C:5};
            if (order[a.p] !== order[b.p]) return order[a.p] - order[b.p];
            return b.o - a.o;
        });
        const salary = TradeEngine.teamSalary(myPlayers);
        return `
        <h1 class="page-title">👥 我的阵容</h1>
        <div class="card">
            <div class="card-title">薪资概况</div>
            <div class="stat-grid">
                <div class="stat-box"><div class="value">$${salary.toFixed(1)}M</div><div class="label">总薪资</div></div>
                <div class="stat-box"><div class="value" style="color:${salary>window.SALARY_CAP?'var(--nba-red-light)':'var(--success)'}">$${(window.SALARY_CAP-salary).toFixed(1)}M</div><div class="label">薪资空间</div></div>
                <div class="stat-box"><div class="value">${myPlayers.length}</div><div class="label">球员数</div></div>
                <div class="stat-box"><div class="value">${Math.round(SimEngine.teamRating(myPlayers))}</div><div class="label">实力评分</div></div>
            </div>
        </div>
        <div class="card">
            <div class="card-title">球员名单 <span class="muted" style="font-size:11px;text-transform:none">点击查看详情</span></div>
            <div class="table-wrap">${renderPlayerTable(sorted, true)}</div>
        </div>`;
    }

    function renderPlayerTable(players, withSeasonStats) {
        const myId = state.manager.teamId;
        const acc = state.statAccum[myId] || {};
        let head = `<tr><th>球员</th><th>位</th><th>年</th><th class="num">总评</th>`;
        if (withSeasonStats) head += `<th class="num">场均分</th><th class="num">板</th><th class="num">助</th><th class="num">命中率</th>`;
        head += `<th class="num">薪资</th></tr>`;
        const rows = players.map(p => {
            const ovrCls = ovrClass(p.o);
            const tags = [];
            if (p.isRookie) tags.push('<span class="tag tag-rookie">新秀</span>');
            if (p.o >= 90) tags.push('<span class="tag tag-star">球星</span>');
            if (p.injured) tags.push('<span class="tag tag-injured">伤</span>');
            const s = acc[p.id];
            let statCols = "";
            if (withSeasonStats && s && s.gp > 0) {
                statCols = `<td class="num">${(s.pts/s.gp).toFixed(1)}</td><td class="num">${(s.reb/s.gp).toFixed(1)}</td><td class="num">${(s.ast/s.gp).toFixed(1)}</td><td class="num">${s.fga>0?((s.fgm/s.fga)*100).toFixed(1):"-"}%</td>`;
            } else if (withSeasonStats) {
                statCols = `<td class="num muted">-</td><td class="num muted">-</td><td class="num muted">-</td><td class="num muted">-</td>`;
            }
            return `<tr data-pid="${p.id}">
                <td><div class="player-row"><div class="player-ovr ${ovrCls}">${p.o}</div><div><div class="player-name">${p.n}</div><div class="player-pos">${tags.join(" ")||'&nbsp;'}</div></div></div></td>
                <td class="pos-${p.p}">${p.p}</td>
                <td class="num">${p.a}</td>
                <td class="num"><b>${p.o}</b></td>
                ${statCols}
                <td class="num">$${p.sal.toFixed(1)}M</td>
            </tr>`;
        }).join("");
        return `<table class="player-table"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
    }

    function ovrClass(o) {
        if (o >= 90) return "ovr-elite";
        if (o >= 85) return "ovr-star";
        if (o >= 78) return "ovr-good";
        if (o >= 70) return "ovr-avg";
        return "ovr-low";
    }

    // ============ 交易 ============
    function renderTrade() {
        const myId = state.manager.teamId;
        const myPlayers = state.teamsPlayers[myId];
        const partner = tradeState.partner;
        let partnerPlayers = partner ? state.teamsPlayers[partner] : [];

        const teamOptions = state.teams.filter(t => t.id !== myId)
            .map(t => `<option value="${t.id}" ${partner===t.id?'selected':''}>${t.abbr} ${t.city}${t.name}</option>`).join("");

        // 我方送出
        const myOutHtml = tradeState.myOut.map(p => rosterChip(p, "myout")).join("") || `<div class="muted">未选择球员</div>`;
        const theirOutHtml = tradeState.theirOut.map(p => rosterChip(p, "theirout")).join("") || `<div class="muted">未选择球员</div>`;

        // 薪资计算
        const myOutSal = TradeEngine.outgoingSalary(tradeState.myOut);
        const theirOutSal = TradeEngine.outgoingSalary(tradeState.theirOut);
        const myCheck = partner ? TradeEngine.validateSalary(myPlayers, tradeState.myOut, tradeState.theirOut) : null;
        const theirCheck = partner ? TradeEngine.validateSalary(partnerPlayers, tradeState.theirOut, tradeState.myOut) : null;

        // 我方可用球员
        const myAvailHtml = myPlayers.filter(p => !tradeState.myOut.find(x=>x.id===p.id))
            .sort((a,b)=>b.o-a.o).map(p => `<div class="trade-chip" data-addmy="${p.id}"><b>${p.o}</b> ${p.n} <span class="muted">${p.p} $${p.sal.toFixed(1)}M</span></div>`).join("");
        const theirAvailHtml = partner ? partnerPlayers.filter(p => !tradeState.theirOut.find(x=>x.id===p.id))
            .sort((a,b)=>b.o-a.o).map(p => `<div class="trade-chip" data-addtheir="${p.id}"><b>${p.o}</b> ${p.n} <span class="muted">${p.p} $${p.sal.toFixed(1)}M</span></div>`).join("") : `<div class="muted">请选择交易伙伴</div>`;

        return `
        <h1 class="page-title">🔄 交易中心</h1>
        <div class="card">
            <div class="card-title">选择交易伙伴</div>
            <select id="trade-partner" class="text-input"><option value="">-- 选择球队 --</option>${teamOptions}</select>
        </div>
        <div class="trade-layout">
            <div class="trade-side">
                <h3>${teamLogo(myId, 24)} ${teamAbbr(myId)} 送出</h3>
                <div class="trade-slot">${myOutHtml}</div>
                <div class="salary-bar"><span>送出薪资</span><span>$${myOutSal.toFixed(1)}M</span></div>
                ${myCheck ? `<div class="salary-bar"><span>薪资匹配</span><span class="${myCheck.valid?'salary-valid':'salary-invalid'}">${myCheck.valid?'✔ 合规':'✘ '+myCheck.reason}</span></div>` : ''}
                <div class="mt-10"><div class="card-title">可选球员</div><div class="trade-pool">${myAvailHtml}</div></div>
            </div>
            <div class="trade-arrow">⇄</div>
            <div class="trade-side">
                <h3>${partner ? teamLogo(partner, 24) + ' ' + teamAbbr(partner) : '???' } 送出</h3>
                <div class="trade-slot">${theirOutHtml}</div>
                <div class="salary-bar"><span>送出薪资</span><span>$${theirOutSal.toFixed(1)}M</span></div>
                ${theirCheck ? `<div class="salary-bar"><span>对方薪资匹配</span><span class="${theirCheck.valid?'salary-valid':'salary-invalid'}">${theirCheck.valid?'✔ 合规':'✘ 不合规'}</span></div>` : ''}
                <div class="mt-10"><div class="card-title">可选球员</div><div class="trade-pool">${theirAvailHtml}</div></div>
            </div>
        </div>
        <div class="card mt-20 center">
            <button id="propose-trade" class="btn btn-accent btn-large" ${!partner?'disabled':''}>提交交易提案</button>
            <div class="muted mt-10">提示: 帽上球队须满足 125%+$100K 薪资匹配规则，交易后名单须 14-15 人</div>
        </div>`;
    }

    function rosterChip(p, slot) {
        return `<div class="trade-chip selected" data-remove="${slot}" data-pid="${p.id}"><b>${p.o}</b> ${p.n} <span class="muted">${p.p} $${p.sal.toFixed(1)}M</span> ✕</div>`;
    }

    // ============ 自由球员 ============
    function renderFreeAgents() {
        const fa = state.freeAgents;
        const myPlayers = state.teamsPlayers[state.manager.teamId];
        if (!fa.length) {
            // 市场未开放（常规赛/季后赛期间）：给出明确说明 + 阵容概况，帮助玩家提前规划休赛期
            const space = window.SALARY_CAP - TradeEngine.teamSalary(myPlayers);
            const injuredCount = myPlayers.filter(p => p.injured).length;
            return `
            <h1 class="page-title">💰 自由市场</h1>
            <div class="empty-state">
                <div style="font-size:15px;margin-bottom:6px">自由市场尚未开放</div>
                <div class="muted" style="font-size:12px">市场在休赛期（总决赛结束后）开放<br>届时各队裁员与落选新秀将进入市场，可自由签约补强</div>
            </div>
            <div class="card" style="margin-top:14px">
                <div class="card-title">提前规划 <span class="muted" style="font-size:11px;text-transform:none">为休赛期做准备</span></div>
                <div class="stat-grid">
                    <div class="stat-box"><div class="value">${myPlayers.length}/15</div><div class="label">名单人数</div></div>
                    <div class="stat-box"><div class="value" style="color:${space>=0?'var(--success)':'var(--nba-red-light)'}">$${space.toFixed(1)}M</div><div class="label">薪资空间</div></div>
                    <div class="stat-box"><div class="value" style="color:${injuredCount>0?'var(--nba-red-light)':'var(--text)'}">${injuredCount}</div><div class="label">伤病人数</div></div>
                </div>
                <div class="muted" style="font-size:11px;padding:8px 4px 2px">提示：空间不足时可通过「交易」或「阵容-释放球员」腾出薪金；名单满 15 人时无法签新球员</div>
            </div>`;
        }
        const rosterFull = myPlayers.length >= 15;
        const rows = fa.slice().sort((a,b)=>b.o-a.o).map(p => {
            return `<tr data-faid="${p.id}">
                <td><div class="player-row"><div class="player-ovr ${ovrClass(p.o)}">${p.o}</div><div><div class="player-name">${p.n}</div><div class="player-pos">自由球员</div></div></div></td>
                <td class="pos-${p.p}">${p.p}</td><td class="num">${p.a}</td><td class="num"><b>${p.o}</b></td>
                <td class="num">$${p.sal.toFixed(1)}M</td>
                <td><button class="btn btn-success btn-sm sign-fa" data-faid="${p.id}" ${rosterFull?'disabled':''}>${rosterFull?'名单满':'签约'}</button></td>
            </tr>`;
        }).join("");
        return `
        <h1 class="page-title">💰 自由市场</h1>
        <div class="card">
            <div class="card-title">可用球员 <span class="muted" style="font-size:11px;text-transform:none">名单 ${myPlayers.length}/15 · 空间 $${(window.SALARY_CAP-TradeEngine.teamSalary(myPlayers)).toFixed(1)}M</span></div>
            <div class="table-wrap"><table><thead><tr><th>球员</th><th>位</th><th class="num">年</th><th class="num">总评</th><th class="num">要价</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>
        </div>`;
    }

    // ============ 赛程 ============
    function renderSchedule() {
        const myId = state.manager.teamId;
        // 用户剩余比赛
        const remaining = [];
        for (let d = state.currentDay; d < state.schedule.length; d++) {
            const day = state.schedule[d];
            const g = day.find(x => x.home === myId || x.away === myId);
            if (g) remaining.push({ day: d, home: g.home, away: g.away });
        }
        const remHtml = remaining.slice(0, 15).map(g => `<tr><td class="num">第${g.day+1}天</td><td>${teamLogo(g.away, 16)} ${teamAbbr(g.away)} <span class="muted">@</span> ${teamLogo(g.home, 16)} ${teamAbbr(g.home)}</td><td>${g.home===myId||g.away===myId?'<span class="tag tag-rookie">我方</span>':''}</td></tr>`).join("");
        // 已完成用户比赛
        const done = state.userGameLog.slice(-15).reverse();
        const doneHtml = done.map(g => `<tr><td>${teamLogo(g.opp, 16)} ${teamAbbr(g.opp)}</td><td class="num">${g.myScore}-${g.oppScore}</td><td><span style="color:${g.win?'#2ecc71':'#e8324a'}">${g.win?'胜':'负'}</span></td></tr>`).join("") || `<tr><td colspan="3" class="muted center">暂无</td></tr>`;
        return `
        <h1 class="page-title">📅 赛程</h1>
        <div class="grid-2">
            <div class="card"><div class="card-title">接下来 ${Math.min(15,remaining.length)} 场</div><div class="table-wrap"><table><thead><tr><th class="num">日期</th><th>对阵</th><th></th></tr></thead><tbody>${remHtml||'<tr><td colspan="3" class="muted center">常规赛结束</td></tr>'}</tbody></table></div></div>
            <div class="card"><div class="card-title">近期战绩</div><div class="table-wrap"><table><thead><tr><th>对手</th><th class="num">比分</th><th>结果</th></tr></thead><tbody>${doneHtml}</tbody></table></div></div>
        </div>`;
    }

    // ============ 排名 ============
    function renderStandings() {
        updateStandings();
        const st = state.standings;
        return `
        <h1 class="page-title">🏆 联盟排名</h1>
        <div class="grid-2">
            <div class="card"><div class="card-title">东部联盟</div>${standingsTable(st.east, state.manager.teamId)}</div>
            <div class="card"><div class="card-title">西部联盟</div>${standingsTable(st.west, state.manager.teamId)}</div>
        </div>`;
    }

    function standingsTable(entries, myId) {
        const rows = entries.map((e, i) => {
            const isMe = e.teamId === myId;
            const playoffLine = i === 7 ? "playoff-line" : "";
            return `<tr class="${isMe?'me-row':''} ${playoffLine}" style="${isMe?'background:rgba(29,66,138,0.25);font-weight:700;':''}">
                <td class="num">${i+1}</td>
                <td><a class="team-link" data-teamid="${e.teamId}">${teamLogo(e.teamId, 20)}${e.abbr} ${e.name}</a></td>
                <td class="num">${e.win}-${e.loss}</td>
                <td class="num">${(e.winRate*100).toFixed(1)}%</td>
                <td class="num">${e.streak>0?`${e.streak}连胜`:e.streak<0?`${-e.streak}连败`:'-'}</td>
            </tr>`;
        }).join("");
        return `<div class="table-wrap"><table class="standings-table"><thead><tr><th class="num">#</th><th>球队</th><th class="num">战绩</th><th class="num">胜率</th><th class="num">连胜</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    // ============ 数据统计 ============
    // 榜单定义：key, 标签名, 取值函数(返回场均值), 格式化, 副标题
    const LEAGUE_LEADERS = [
        { key:"scoring", label:"得分", icon:"🏀", val:s=>s.pts/s.gp, fmt:v=>v.toFixed(1), head:"PPG" },
        { key:"assists", label:"助攻", icon:"🅰️", val:s=>s.ast/s.gp, fmt:v=>v.toFixed(1), head:"APG" },
        { key:"rebounds", label:"篮板", icon:"🎯", val:s=>s.reb/s.gp, fmt:v=>v.toFixed(1), head:"RPG" },
        { key:"steals", label:"抢断", icon:"✋", val:s=>s.stl/s.gp, fmt:v=>v.toFixed(1), head:"SPG" },
        { key:"blocks", label:"盖帽", icon:"🛡️", val:s=>s.blk/s.gp, fmt:v=>v.toFixed(1), head:"BPG" },
        { key:"tpm", label:"三分", icon:"🎯", val:s=>s.tpm/s.gp, fmt:v=>v.toFixed(1), head:"3PM" },
        { key:"fg", label:"命中率", icon:"🎯", val:s=>s.fga>0?s.fgm/s.fga:0, fmt:v=>(v*100).toFixed(1)+"%", head:"FG%" },
    ];

    function renderStats() {
        const myId = state.manager.teamId;
        const acc = state.statAccum[myId] || {};
        // 仅展示当前仍属于我队的球员（已被交易走的球员不显示在我的场均表里）
        const players = state.teamsPlayers[myId].filter(p => p.t === myId);
        const withStats = players.map(p => {
            const s = acc[p.id];
            if (!s || s.gp === 0) return null;
            return { p, s, ppg: s.pts/s.gp, rpg: s.reb/s.gp, apg: s.ast/s.gp, spg: s.stl/s.gp, bpg: s.blk/s.gp, fg: s.fga>0?s.fgm/s.fga:0, tp: s.tpa>0?s.tpm/s.tpa:0 };
        }).filter(Boolean).sort((a,b)=>b.ppg-a.ppg);

        const rows = withStats.map(x => `<tr data-pid="${x.p.id}">
            <td><div class="player-row"><div class="player-ovr ${ovrClass(x.p.o)}">${x.p.o}</div><div class="player-name">${x.p.n}</div></div></td>
            <td class="pos-${x.p.p}">${x.p.p}</td>
            <td class="num">${x.s.gp}</td>
            <td class="num"><b>${x.ppg.toFixed(1)}</b></td>
            <td class="num">${x.rpg.toFixed(1)}</td>
            <td class="num">${x.apg.toFixed(1)}</td>
            <td class="num">${x.spg.toFixed(1)}</td>
            <td class="num">${x.bpg.toFixed(1)}</td>
            <td class="num">${(x.fg*100).toFixed(1)}%</td>
            <td class="num">${(x.tp*100).toFixed(1)}%</td>
        </tr>`).join("") || `<tr><td colspan="10" class="muted center">尚无比赛数据</td></tr>`;

        // 联盟榜单：收集所有球员，按 pid 聚合（被交易的球员在老队和新队各有一条记录，需合并避免重复）
        const playerAgg = {}; // pid -> { p, s(合并), team(当前球队) }
        state.teams.forEach(t => {
            const a = state.statAccum[t.id] || {};
            Object.entries(a).forEach(([pid, s]) => {
                if (s.gp < 3) return;
                const p = state.players.find(x => x.id === pid);
                if (!p) return;
                if (!playerAgg[pid]) {
                    // 球队显示为球员当前所属球队（p.t），避免被交易后只显示老队
                    playerAgg[pid] = { p, s: { ...s }, team: state.teams.find(tt => tt.id === p.t) || t };
                } else {
                    // 合并：累加各项统计，gp 累加
                    const cur = playerAgg[pid].s;
                    cur.gp += s.gp; cur.pts += s.pts; cur.reb += s.reb; cur.ast += s.ast;
                    cur.stl += s.stl; cur.blk += s.blk; cur.tov += s.tov;
                    cur.fgm += s.fgm; cur.fga += s.fga; cur.tpm += s.tpm; cur.tpa += s.tpa;
                    // 球队显示为球员当前所属球队
                    playerAgg[pid].team = state.teams.find(tt => tt.id === p.t) || t;
                }
            });
        });
        const allPlayers = Object.values(playerAgg);

        const currentLeader = LEAGUE_LEADERS.find(l => l.key === statsTab) || LEAGUE_LEADERS[0];
        const sorted = allPlayers.map(x => ({
            ...x,
            val: currentLeader.val(x.s),
        })).sort((a, b) => b.val - a.val);
        const top20 = sorted.slice(0, 20);

        const leaderRows = top20.map((x, i) => {
            const isMine = x.team.id === myId;
            const rankCls = i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "";
            return `<tr data-pid="${x.p.id}" class="${isMine?'me-row':''} ${rankCls}">
                <td class="num"><b>${i+1}</b></td>
                <td><div class="player-row"><div class="player-ovr ${ovrClass(x.p.o)}" style="width:30px;height:30px;font-size:12px">${x.p.o}</div><div><div class="player-name">${x.p.n}</div><div class="player-pos">${x.team.abbr} · <span class="pos-${x.p.p}">${x.p.p}</span></div></div></div></td>
                <td class="num"><b>${currentLeader.fmt(x.val)}</b></td>
                <td class="num muted">${x.s.gp}场</td>
            </tr>`;
        }).join("") || `<tr><td colspan="4" class="muted center">尚无数据（至少需 3 场）</td></tr>`;

        // 榜单切换 tabs
        const tabsHtml = LEAGUE_LEADERS.map(l => `
            <button class="stats-tab ${l.key===statsTab?'active':''}" data-statstab="${l.key}">
                <span class="icon">${l.icon}</span><span>${l.label}</span>
            </button>`).join("");

        // 我的球员赛季场均表头
        return `
        <h1 class="page-title">📈 数据统计</h1>
        <div class="card">
            <div class="card-title">${teamName(myId)} 球员赛季场均</div>
            <div class="table-wrap"><table><thead><tr><th>球员</th><th>位</th><th class="num">场</th><th class="num">得分</th><th class="num">篮板</th><th class="num">助攻</th><th class="num">抢断</th><th class="num">盖帽</th><th class="num">命中率</th><th class="num">三分</th></tr></thead><tbody>${rows}</tbody></table></div>
        </div>
        <div class="card">
            <div class="card-title">联盟榜单 Top 20 <span class="muted" style="font-size:11px;text-transform:none">含所有球队模拟数据</span></div>
            <div class="stats-tabs">${tabsHtml}</div>
            <div class="table-wrap"><table><thead><tr><th class="num">#</th><th>球员</th><th class="num">${currentLeader.head}</th><th class="num">场次</th></tr></thead><tbody>${leaderRows}</tbody></table></div>
        </div>`;
    }

    // ============ 选秀 ============
    function renderDraft() {
        if (state.phase !== "draft") {
            return `<h1 class="page-title">🎓 选秀</h1><div class="empty-state">选秀将在休赛期进行。<br>当前阶段: ${phaseLabel()}</div>`;
        }
        const myId = state.manager.teamId;
        const available = state.rookieClass.filter(r => r.t === null);
        const order = state.draftOrder;
        const pickNum = state.draftPick; // 0-indexed
        const totalPicks = 60;
        const draftComplete = pickNum >= totalPicks;
        const currentOwner = (!draftComplete && order && order[pickNum]) ? order[pickNum] : null;
        const isMyPick = currentOwner === myId;
        const draftYear = state.year; // startDraft 已 year++

        // 当前顺位状态卡
        // 选秀已结束：显示完成状态，不再显示顺位越界数字（#61）与操作按钮
        const statusHtml = draftComplete ? `
            <div class="draft-status">
                <div class="ds-row">
                    <div>
                        <div class="ds-pick">✓ 全部 ${totalPicks} 顺位已完成</div>
                        <div class="ds-owner muted">点击右上角"进入自由市场"继续</div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-weight:800;color:var(--text-dim)">选秀结束</div>
                        <div class="muted" style="font-size:11px;margin-top:2px">${draftYear} 年 NBA 选秀</div>
                    </div>
                </div>
            </div>` : `
            <div class="draft-status ${isMyPick?'mine':''}">
                <div class="ds-row">
                    <div>
                        <div class="ds-pick">#${pickNum+1} <span style="font-size:13px;color:var(--text-dim);font-weight:400">/ ${totalPicks}</span></div>
                        <div class="ds-owner">${currentOwner ? `${teamLogo(currentOwner, 20)} ${teamAbbr(currentOwner)} · ${teamName(currentOwner)}` : '-'}</div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-weight:800;color:${isMyPick?'var(--gold)':'var(--text-dim)'}">${isMyPick?'你的顺位!':'AI 选择中'}</div>
                        <div class="muted" style="font-size:11px;margin-top:2px">${draftYear} 年 NBA 选秀</div>
                    </div>
                </div>
                ${(!isMyPick && pickNum < totalPicks) ? `<button class="btn btn-primary btn-sm" id="draft-auto-to-mine" style="margin-top:4px">⏩ 模拟到我的顺位</button>` : ''}
                ${pickNum < totalPicks ? `<button class="btn btn-sm" id="draft-skip-rest" style="margin-top:4px;${isMyPick?'margin-left:8px':''}">跳过剩余选秀 ▶</button>` : ''}
            </div>`;

        // 待选新秀卡片
        const topAvail = available.slice(0, 12);
        const tierLabel = (tier) => ({elite:'状元级',high:'乐透级',solid:'首轮级',role:'次轮级',deep:'末轮级'}[tier]||'');
        const rookieCards = topAvail.map((r, i) => {
            return `<div class="rookie-card" data-rid="${r.id}">
                <div class="rc-rank">${i+1}</div>
                <div class="player-ovr ${ovrClass(r.o)}" style="width:36px;height:36px">${r.o}</div>
                <div class="rc-info">
                    <div class="rc-name">${r.n}</div>
                    <div class="rc-meta">
                        <span class="pos-${r.p}">${r.p}</span>
                        <span>${r.a}岁</span>
                        <span>潜力 <b>${r.pot}</b></span>
                        <span class="tier-${r.tier}">${tierLabel(r.tier)}</span>
                    </div>
                </div>
                ${isMyPick ? `<button class="btn btn-primary btn-sm rc-pick-btn draft-pick" data-rid="${r.id}">选择</button>` : ''}
            </div>`;
        }).join("") || `<div class="muted center" style="padding:20px">新秀已全部被选中</div>`;

        // 近期选中（按选秀顺位倒序，取最近 8 个）
        const drafted = state.rookieClass.filter(r => r.t !== null)
            .sort((a, b) => (b.draftPick || 0) - (a.draftPick || 0)).slice(0, 8);
        const draftedHtml = drafted.map(r => `
            <div class="draft-recent-item">
                <div><span class="dri-pick">#${r.draftPick}</span> <span class="pos-${r.p}">${r.p}</span> <span class="dri-name">${r.n}</span></div>
                <div><span class="muted">${r.o}总评</span> ${teamLogo(r.t, 20)} <b style="color:var(--nba-blue)">${teamAbbr(r.t)}</b></div>
            </div>
        `).join("") || `<div class="muted center" style="padding:14px">尚未开始</div>`;

        return `
        <h1 class="page-title">🎓 NBA 选秀 — ${draftYear}</h1>
        <div class="card">
            <div class="card-title">选秀进度</div>
            ${statusHtml}
        </div>
        <div class="card">
            <div class="card-title">新秀前景榜 <span class="muted" style="font-size:11px;text-transform:none">${available.length} 人可选 ${isMyPick?'· 点击选择你的新秀':''}</span></div>
            <div class="rookie-grid">${rookieCards}</div>
        </div>
        <div class="card">
            <div class="card-title">近期选中</div>
            <div class="draft-recent">${draftedHtml}</div>
        </div>`;
    }

    // ============ 联盟总览 ============
    function renderLeague() {
        const myId = state.manager.teamId;
        const allTeams = state.teams.map(t => {
            const r = state.records[t.id];
            const players = state.teamsPlayers[t.id];
            return { ...t, rating: SimEngine.teamRating(players), win: r.win, loss: r.loss, salary: TradeEngine.teamSalary(players) };
        });
        const rows = allTeams.sort((a,b) => (b.win/(b.win+b.loss||1)) - (a.win/(a.win+a.loss||1))).map(t => {
            const isMe = t.id === myId;
            return `<tr style="${isMe?'background:rgba(29,66,138,0.25);font-weight:700;':''}">
                <td><a class="team-link" data-teamid="${t.id}">${teamLogo(t.id, 20)}${t.abbr}</a></td><td><a class="team-link" data-teamid="${t.id}">${t.city}${t.name}</a></td><td>${t.conf==="East"?"东":"西"}</td>
                <td class="num">${t.win}-${t.loss}</td><td class="num">${Math.round(t.rating)}</td>
                <td class="num">$${t.salary.toFixed(1)}M</td>
            </tr>`;
        }).join("");

        // 王朝荣誉墙：历年总冠军（最近的在前，最多展示 10 年）
        const champs = (state.champions || []).slice().reverse();
        const myTitles = champs.filter(c => c.team === myId).length;
        const champCard = champs.length === 0
            ? `<div class="card"><div class="card-title">💍 王朝荣誉墙</div><div class="muted center" style="padding:20px">暂无冠军记录（首个赛季总决赛结束后产生）</div></div>`
            : `<div class="card"><div class="card-title">💍 王朝荣誉墙
                <span class="muted" style="font-size:11px;text-transform:none">共 ${champs.length} 季${myTitles>0?` · 我队 ${myTitles} 冠 💍`:''}</span></div>
                <div class="table-wrap"><table><thead><tr><th class="num">赛季</th><th>总冠军</th><th class="num">总决赛比分</th><th>FMVP</th></tr></thead><tbody>
                ${champs.slice(0, 10).map(c => {
                    const isMe = c.team === myId;
                    return `<tr style="${isMe?'background:rgba(212,175,55,0.12);font-weight:700;':''}">
                        <td class="num">${c.year}-${String(c.year+1).slice(-2)}</td>
                        <td><a class="team-link" data-teamid="${c.team}">${teamLogo(c.team, 20)}${teamName(c.team)}${isMe?' 🏆':''}</a></td>
                        <td class="num">${c.finalsScore || '-'}</td>
                        <td>${c.finalsMVP ? `${c.finalsMVP.n} <span class="muted" style="font-size:11px">${c.finalsMVP.ppg.toFixed(1)}分</span>` : '-'}</td>
                    </tr>`;
                }).join("")}
                </tbody></table></div></div>`;
        return `
        <h1 class="page-title">🌐 联盟总览</h1>
        <div class="card">
            <div class="table-wrap"><table><thead><tr><th>缩写</th><th>球队</th><th>联盟</th><th class="num">战绩</th><th class="num">实力</th><th class="num">薪资</th></tr></thead><tbody>${rows}</tbody></table></div>
        </div>
        ${champCard}`;
    }

    // ============ 比赛模拟推进 ============
    function findNextUserGame() {
        const myId = state.manager.teamId;
        for (let d = state.currentDay; d < state.schedule.length; d++) {
            const day = state.schedule[d];
            const g = day.find(x => x.home === myId || x.away === myId);
            if (g) return { ...g, day: d };
        }
        return null;
    }

    // 模拟从当前到用户下一场比赛（含期间所有比赛），返回用户比赛结果
    function advanceToUserGame() {
        const myId = state.manager.teamId;
        while (state.currentDay < state.schedule.length) {
            const day = state.schedule[state.currentDay];
            const userGame = day.find(x => x.home === myId || x.away === myId);
            // 模拟当天所有比赛
            day.forEach(g => {
                if (g.home === myId || g.away === myId) return; // 用户比赛单独模拟
                simQuickGame(g);
            });
            // 每天推进：恢复所有受伤球员 1 天
            recoverInjuries();
            // 每天触发 AI 球队间交易（约 2 笔尝试，重磅交易弹窗）
            runDailyAiTrades();
            if (userGame) {
                const res = simUserGame(userGame);
                state.currentDay++;
                return res;
            }
            state.currentDay++;
        }
        return null; // 常规赛结束
    }

    // 恢复伤病：所有受伤球员天数-1，归零则痊愈
    function recoverInjuries() {
        state.players.forEach(p => {
            if (p.injured && p.injured > 0) p.injured = Math.max(0, p.injured - 1);
        });
    }

    function simQuickGame(g) {
        const homeP = state.teamsPlayers[g.home];
        const awayP = state.teamsPlayers[g.away];
        const res = SimEngine.simulateGame(homeP, awayP);
        applyResult(g, res);
        // 累积双方球员赛季统计（用于联盟数据看板）
        res.home.lines.forEach(line => accumulateStats(g.home, line));
        res.away.lines.forEach(line => accumulateStats(g.away, line));
        // 伤病判定（AI 球队也受影响，但只在玩家比赛日推进时触发）
        applyInjuries(g.home, res, false);
        applyInjuries(g.away, res, false);
    }

    function simUserGame(g) {
        const myId = state.manager.teamId;
        const isHome = g.home === myId;
        const myP = state.teamsPlayers[myId];
        const oppId = isHome ? g.away : g.home;
        const oppP = state.teamsPlayers[oppId];
        const homeP = isHome ? myP : oppP;
        const awayP = isHome ? oppP : myP;
        // 传入战术：玩家球队用 state.tactics，对手用默认
        const homeTac = isHome ? state.tactics : null;
        const awayTac = isHome ? null : state.tactics;
        const res = SimEngine.simulateGame(homeP, awayP, false, homeTac, awayTac);
        applyResult(g, res);
        // 累积双方球员赛季统计（我方 + 对方，统一进入联盟数据看板）
        res.home.lines.forEach(line => accumulateStats(g.home, line));
        res.away.lines.forEach(line => accumulateStats(g.away, line));
        // 伤病判定（玩家比赛显示通知）
        applyInjuries(g.home, res, g.home === myId);
        applyInjuries(g.away, res, g.away === myId);
        const myScore = isHome ? res.home.score : res.away.score;
        const oppScore = isHome ? res.away.score : res.home.score;
        const win = (res.winner === "home") === isHome;
        const log = { opp: oppId, myScore, oppScore, win, boxscore: res, isHome, day: state.currentDay };
        state.userGameLog.push(log);
        // ---- 新系统挂钩：训练 tick / AI 主动报价 / 成就检查 ----
        tickTraining();
        maybeGenerateAIOffer();
        expirePendingOffers();
        checkAchievements("userGame", { game: log });
        return log;
    }

    // 应用伤病判定：对轮换球员随机受伤，记录到 injuryLog
    function applyInjuries(teamId, res, isUserTeam) {
        const rotation = res.home.players[0]?.t === teamId ? res.home.lines : res.away.lines;
        const injuries = SimEngine.rollInjuries(rotation);
        injuries.forEach(inj => {
            const p = state.players.find(x => x.id === inj.playerId);
            if (p && !p.injured) {
                p.injured = inj.days;
                const rec = { player: p.n, playerId: p.id, teamId, days: inj.days, day: state.currentDay };
                state.injuryLog.push(rec);
                if (isUserTeam) {
                    toast(`⚠ ${p.n} 受伤，将缺阵约 ${inj.days} 场`, "warning");
                }
            }
        });
    }

    function applyResult(g, res) {
        const homeWin = res.winner === "home";
        const hr = state.records[g.home]; const ar = state.records[g.away];
        hr.ptsFor += res.home.score; hr.ptsAgt += res.away.score;
        ar.ptsFor += res.away.score; ar.ptsAgt += res.home.score;
        if (homeWin) {
            hr.win++; hr.streak = hr.streak >= 0 ? hr.streak + 1 : 1;
            ar.loss++; ar.streak = ar.streak <= 0 ? ar.streak - 1 : -1;
        } else {
            ar.win++; ar.streak = ar.streak >= 0 ? ar.streak + 1 : 1;
            hr.loss++; hr.streak = hr.streak <= 0 ? hr.streak - 1 : -1;
        }
    }

    function accumulateStats(teamId, line) {
        const acc = state.statAccum[teamId];
        if (!acc[line.player.id]) {
            acc[line.player.id] = { gp:0, min:0, pts:0, reb:0, ast:0, stl:0, blk:0, tov:0, pf:0, fgm:0, fga:0, tpm:0, tpa:0, ftm:0, fta:0, oreb:0 };
        }
        const s = acc[line.player.id];
        s.gp++; s.min += line.min;
        s.pts += line.pts; s.reb += line.reb; s.ast += line.ast; s.stl += line.stl; s.blk += line.blk; s.tov += line.tov; s.pf += line.pf;
        s.fgm += line.fgm; s.fga += line.fga; s.tpm += line.tpm; s.tpa += line.tpa; s.ftm += line.ftm; s.fta += line.fta; s.oreb += line.oreb || 0;
    }

    // ============ 训练系统 ============
    // 每 10 场比赛自动执行一轮训练：年轻且有潜力的球员按训练专项概率成长
    // focus: balanced 均衡 / shooting 投篮 / defense 防守 / playmaking 组织 / rebounding 篮板 / conditioning 体能
    const TRAINING_INTERVAL = 10;
    const TRAINING_FOCUS_DEFS = [
        { val: "balanced",    label: "均衡训练", desc: "各项技能小概率全面提升" },
        { val: "shooting",    label: "投篮特训", desc: "投篮+球商，培养得分手" },
        { val: "defense",     label: "防守特训", desc: "防守+运动，打造铁血防线" },
        { val: "playmaking",  label: "组织特训", desc: "传球+球商，培养发动机" },
        { val: "rebounding",  label: "篮板特训", desc: "篮板+内线，统治禁区" },
        { val: "conditioning", label: "体能康复", desc: "加速伤病恢复，不涨能力" },
    ];

    function tickTraining() {
        if (!state.training) state.training = { focus: "balanced", gamesSinceSession: 0 };
        state.training.gamesSinceSession++;
        if (state.training.gamesSinceSession < TRAINING_INTERVAL) return;
        state.training.gamesSinceSession = 0;
        const summary = applyTrainingSession();
        if (summary) toast(`💪 本轮训练（${trainingFocusLabel()}）：${summary}`, "", 4200);
    }

    function trainingFocusLabel() {
        const d = TRAINING_FOCUS_DEFS.find(x => x.val === (state.training && state.training.focus));
        return d ? d.label : "均衡训练";
    }

    // 执行一轮训练，返回汇总文案（如 "东契奇 投篮+1、文班亚马 防守+1"）
    function applyTrainingSession() {
        const myId = state.manager.teamId;
        const focus = state.training.focus;
        const ups = [];
        if (focus === "conditioning") {
            // 体能康复：受伤球员恢复天数 -2
            myId && state.teamsPlayers[myId].forEach(p => {
                if (p.injured && p.injured > 0) {
                    p.injured = Math.max(0, p.injured - 2);
                    if (p.injured === 0) ups.push(`${p.n} 伤愈复出`);
                }
            });
            return ups.length ? ups.join("、") : "";
        }

        // 技能成长映射：专项 → [技能, 技能]
        const skillMap = {
            balanced:   [["sh"],["ins"],["pa"],["de"],["re"],["iq"]],
            shooting:   [["sh"],["iq"]],
            defense:    [["de"],["at"]],
            playmaking: [["pa"],["iq"]],
            rebounding: [["re"],["ins"]],
        };
        const targets = skillMap[focus] || skillMap.balanced;
        const prob = focus === "balanced" ? 0.30 : 0.55; // 专项概率更高

        state.teamsPlayers[myId].forEach(p => {
            // 年轻且未达潜力上限才可能成长（29 岁以下）
            if (p.a > 29) return;
            if ((p.pot || p.o) <= p.o) return;
            targets.forEach(([skill]) => {
                if (Math.random() < prob && p[skill] < 99) {
                    p[skill] = Math.min(99, p[skill] + 1);
                    // 技能上涨有概率带动总评（年轻球员更高概率）
                    const ovrProb = p.a <= 23 ? 0.75 : (p.a <= 26 ? 0.55 : 0.35);
                    if (Math.random() < ovrProb && p.o < (p.pot || p.o)) {
                        p.o = Math.min(p.pot || 99, p.o + 1);
                    }
                    if (ups.length < 4) ups.push(`${p.n} ${skillLabelMap(skill)}+1`);
                }
            });
        });
        return ups.length ? ups.join("、") : "";
    }

    const SKILL_LABELS = { sh: "投篮", ins: "内线", pa: "传球", de: "防守", re: "篮板", at: "运动", iq: "球商" };
    function skillLabelMap(k) { return SKILL_LABELS[k] || k; }

    // 训练方向设置弹窗：点击仪表盘训练标签打开
    function showTrainingModal() {
        const cur = (state.training && state.training.focus) || "balanced";
        const cells = TRAINING_FOCUS_DEFS.map(d => `
            <div class="train-option ${d.val === cur ? 'active' : ''}" data-focus="${d.val}" style="${d.val === cur ? '' : 'cursor:pointer'}">
                <div class="train-label">${d.label}${d.val === cur ? ' <span class="tag tag-rookie">当前</span>' : ''}</div>
                <div class="muted" style="font-size:12px">${d.desc}</div>
                <div class="muted" style="font-size:11px;margin-top:4px">
                    ${d.val === "conditioning" ? "适合伤病潮期间" : `每 ${TRAINING_INTERVAL} 场训练一次`}
                </div>
            </div>
        `).join("");
        showModal(`
            <div class="modal-title">💪 球队训练</div>
            <div class="muted" style="font-size:12px;margin-bottom:12px">选择训练方向，每 ${TRAINING_INTERVAL} 场比赛自动执行一轮训练（29 岁以下球员可成长，专项成长率更高）</div>
            <div class="train-grid">${cells}</div>
        `);
        document.querySelectorAll(".train-option").forEach(el => {
            el.addEventListener("click", () => {
                state.training.focus = el.dataset.focus;
                closeModal();
                toast(`💪 训练方向已切换为「${trainingFocusLabel()}」`, "success");
                renderAll();
                autoSave();
            });
        });
    }

    // ============ AI 主动交易报价 ============
    // 每场用户比赛后概率触发：AI 球队按自身需求构造报价（对我方球员感兴趣），
    // 存入收件箱，仪表盘展示，10 天后过期
    const AI_OFFER_CHANCE = 0.07;   // 每场 ~7%，一赛季约 5-6 份报价
    const AI_OFFER_TTL = 10;        // 报价有效期（天）
    const AI_OFFER_MAX_PENDING = 3; // 收件箱上限

    function maybeGenerateAIOffer() {
        if (state.phase !== "regular") return;
        if (state.pendingOffers.length >= AI_OFFER_MAX_PENDING) return;
        if (Math.random() > AI_OFFER_CHANCE) return;

        const myId = state.manager.teamId;
        const myPlayers = state.teamsPlayers[myId];
        // 我方有交易价值球员才有报价意义（排除纯填充球员）
        const myAssets = myPlayers.filter(p => !p.isFiller && p.o >= 72);
        if (myAssets.length === 0) return;

        // 随机选一支 AI 球队
        const others = state.teams.filter(t => t.id !== myId);
        const aiTeam = others[randInt(0, others.length - 1)];
        const aiPlayers = state.teamsPlayers[aiTeam.id];
        // AI 送出的筹码：非填充、72+，最多 2 人
        const aiAssets = aiPlayers.filter(p => !p.isFiller && p.o >= 72);
        if (aiAssets.length === 0) return;

        // 选定我方被求购球员（AI 感兴趣的：价值最高的有更高概率被盯上）
        myAssets.sort((a, b) => TradeEngine.playerValue(b) - TradeEngine.playerValue(a));
        const target = myAssets[Math.min(myAssets.length - 1, randInt(0, 3))];
        const targetVal = TradeEngine.playerValue(target);

        // AI 组合筹码：找 1-2 名球员，总价值落在目标价值的 0.82 ~ 1.08（AI 略占便宜或对半）
        shuffleArrLocal(aiAssets);
        const give = [];
        let giveVal = 0;
        for (const cand of aiAssets) {
            if (give.length >= 2) break;
            const v = TradeEngine.playerValue(cand);
            if (giveVal + v <= targetVal * 1.08) { give.push(cand); giveVal += v; }
        }
        if (give.length === 0) return;
        // 筹码价值过低（< 0.75×）说明凑不出匹配包，放弃
        if (giveVal < targetVal * 0.75) return;

        // 薪资合规（AI 视角：送出 give 收到 target）
        const salCheck = TradeEngine.validateSalary(aiPlayers, give, [target]);
        if (!salCheck.valid) return;
        // AI 自身评估：必须觉得值得（score >= 0.5，比 AI 间交易阈值略高）
        const aiEval = TradeEngine.evaluateTradeForTeam(aiPlayers, give, [target], {
            record: { winRate: ((state.records[aiTeam.id] || {}).win || 0) / 82 },
        });
        if (!aiEval || aiEval.score < 0.5) return;
        // 名单人数检查：我方收 1 送 1 → 不变；AI 同理；AI give 2 收 1 → AI -1（>=14 ok）
        const aiAfter = aiPlayers.length - give.length + 1;
        if (aiAfter < 14) return;

        state.pendingOffers.push({
            id: `offer_${Date.now()}_${randInt(0, 9999)}`,
            from: aiTeam.id,
            give,               // AI 送出
            want: [target],     // AI 想要
            day: state.currentDay,
            expiresDay: state.currentDay + AI_OFFER_TTL,
        });
        toast(`📩 ${teamAbbr(aiTeam.id)} 向你发来交易报价（${give.map(p => p.n).join("、")} ⇄ ${target.n}）`, "warning", 5000);
    }

    // 过期报价清理（在每日推进时调用）
    function expirePendingOffers() {
        if (!state.pendingOffers.length) return;
        const before = state.pendingOffers.length;
        state.pendingOffers = state.pendingOffers.filter(o => o.expiresDay > state.currentDay);
        if (state.pendingOffers.length < before) {
            toast("⌛ 一份交易报价已过期", "", 2600);
        }
    }

    // 接受 AI 报价：执行交易（give → 我队，want → AI 队）
    function acceptAIOffer(offerId) {
        const offer = state.pendingOffers.find(o => o.id === offerId);
        if (!offer) { toast("报价不存在或已过期", "error"); return; }
        const myId = state.manager.teamId;
        const myPlayers = state.teamsPlayers[myId];
        const aiPlayers = state.teamsPlayers[offer.from];
        // 读档后 offer 内球员是序列化拷贝，须按 id 从当前名单重新解析引用
        const give = offer.give.map(p => aiPlayers.find(x => x.id === p.id)).filter(Boolean);
        const want = offer.want.map(p => myPlayers.find(x => x.id === p.id)).filter(Boolean);
        if (give.length !== offer.give.length || want.length !== offer.want.length) {
            toast("报价球员已变动，无法执行", "error"); removeOffer(offerId); renderAll(); return;
        }
        // 交易执行前二次校验名单人数与薪资（球员可能已因其他交易变动）
        if (myPlayers.length - want.length + give.length < 14) { toast("名单人数不足，无法接受", "error"); return; }
        const salRecheck = TradeEngine.validateSalary(myPlayers, want, give);
        if (!salRecheck.valid) { toast(`薪资不合规：${salRecheck.reason}`, "error"); return; }

        TradeEngine.executeTradeWithIds(myPlayers, aiPlayers, want.slice(), give.slice(), myId, offer.from, state.year);
        // 记入交易日志与计数
        state.tradeCount = (state.tradeCount || 0) + 1;
        state.tradeLog.push({
            day: offer.day, teamA: offer.from, teamB: myId,
            outgoingA: give, outgoingB: want, blockbuster: give.some(p => p.o >= 85) || want.some(p => p.o >= 85),
        });
        removeOffer(offerId);
        closeModal();
        toast(`✅ 已与 ${teamAbbr(offer.from)} 完成交易`, "success");
        checkAchievements("trade", { incoming: give });
        renderAll();
        autoSave();
    }

    function rejectAIOffer(offerId) {
        removeOffer(offerId);
        closeModal();
        toast("已拒绝报价");
        renderAll();
        autoSave();
    }

    function removeOffer(offerId) {
        state.pendingOffers = state.pendingOffers.filter(o => o.id !== offerId);
    }

    function shuffleArrLocal(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    // 报价审阅弹窗：双方筹码 + 实力/薪资变化预览
    function showAIOfferModal(offerId) {
        const offer = state.pendingOffers.find(o => o.id === offerId);
        if (!offer) { toast("报价不存在或已过期", "error"); return; }
        const myId = state.manager.teamId;
        const myPlayers = state.teamsPlayers[myId];
        const aiPlayers = state.teamsPlayers[offer.from];

        // 交易前后实力/薪资预览
        const ratingBefore = SimEngine.teamRating(myPlayers);
        const ratingAfter = SimEngine.teamRating([...myPlayers.filter(p => !offer.want.includes(p)), ...offer.give]);
        const salBefore = TradeEngine.teamSalary(myPlayers);
        const salAfter = salBefore - TradeEngine.outgoingSalary(offer.want) + TradeEngine.outgoingSalary(offer.give);
        const dR = ratingAfter - ratingBefore;
        const dS = salAfter - salBefore;

        const fmtPlayer = p => `<div class="offer-player">
            <div class="player-ovr ${ovrClass(p.o)}">${p.o}</div>
            <div style="min-width:0">
                <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.n}</div>
                <div class="muted" style="font-size:11px"><span class="pos-${p.p}">${p.p}</span> · ${p.a}岁 · $${p.sal.toFixed(1)}M</div>
            </div>
        </div>`;

        const daysLeft = Math.max(0, offer.expiresDay - state.currentDay);
        showModal(`
            <div class="modal-title">📩 交易报价 · ${teamLogo(offer.from, 20)} ${teamAbbr(offer.from)}</div>
            <div class="muted" style="font-size:12px;margin-bottom:12px">${daysLeft} 天后过期 · ${teamName(offer.from)} 提议以下交易</div>
            <div class="offer-box">
                <div class="offer-side">
                    <div class="offer-side-title">你将获得</div>
                    ${offer.give.map(fmtPlayer).join("")}
                </div>
                <div class="offer-arrow">⇄</div>
                <div class="offer-side">
                    <div class="offer-side-title">他们将带走</div>
                    ${offer.want.map(fmtPlayer).join("")}
                </div>
            </div>
            <div class="stat-grid" style="margin-top:12px">
                <div class="stat-box"><div class="value" style="color:${dR>=0?'var(--success)':'var(--nba-red-light)'}">${dR>=0?'+':''}${dR.toFixed(1)}</div><div class="label">球队实力变化</div></div>
                <div class="stat-box"><div class="value" style="color:${dS<=0?'var(--success)':'var(--nba-red-light)'}">${dS>=0?'+':''}$${dS.toFixed(1)}M</div><div class="label">薪资变化</div></div>
            </div>
            <div class="modal-actions">
                <button class="btn" style="margin-right:auto" onclick="App.rejectAIOffer('${offer.id}')">✕ 拒绝</button>
                <button class="btn btn-primary" onclick="App.acceptAIOffer('${offer.id}')">✔ 接受交易</button>
            </div>
        `);
    }

    // ============ 赛季模拟器（蒙特卡洛夺冠概率） ============
    // 用球队实力评分 + 主场优势的 logistic 胜率快速模拟剩余赛季 × N 次
    // （纯数学模拟，不含球员级统计，300 次 < 100ms）
    function runTitleOdds(sims) {
        sims = sims || 300;
        const myId = state.manager.teamId;
        const N_GAMES = 82;

        // 缓存各队实力与当前战绩
        const ratings = {}, wins = {}, losses = {};
        state.teams.forEach(t => {
            ratings[t.id] = SimEngine.teamRating(state.teamsPlayers[t.id]);
            const r = state.records[t.id];
            wins[t.id] = r.win; losses[t.id] = r.loss;
        });

        // 剩余赛程（从 currentDay 起，去重后每队剩余场次数已由 schedule 保证）
        const remaining = state.schedule.slice(state.currentDay);

        const confOf = {}; state.teams.forEach(t => confOf[t.id] = t.conf);
        const logistic = x => 1 / (1 + Math.exp(-x));
        const HOME_EDGE = 1.6; // 主场优势折算评分加成

        let titleCount = 0, playoffsCount = 0, winSum = 0;
        const titleTally = {}; // 各队夺冠次数
        const winTally = {};   // 各队预计胜场总和

        for (let s = 0; s < sims; s++) {
            // 每次模拟从当前战绩出发
            const w = { ...wins }, l = { ...losses };
            remaining.forEach(day => {
                day.forEach(g => {
                    const diff = (ratings[g.home] + HOME_EDGE) - ratings[g.away];
                    const pHome = logistic(diff / 7.0); // 评分差 7 分约 67% 胜率
                    if (Math.random() < pHome) { w[g.home]++; l[g.away]++; }
                    else { w[g.away]++; l[g.home]++; }
                });
            });

            // 按最终战绩排东西部前 8
            const seed = conf => state.teams.filter(t => t.conf === conf)
                .map(t => ({ id: t.id, wr: w[t.id] / (w[t.id] + l[t.id] || 1) }))
                .sort((a, b) => b.wr - a.wr).slice(0, 8);

            if (seed("East").some(e => e.id === myId) || seed("West").some(e => e.id === myId)) playoffsCount++;
            winSum += w[myId];

            // 季后赛：bo7，按种子 1v8 4v5 3v6 2v7
            const champ = simulateBracket(seed("East"), seed("West"), ratings, logistic);
            titleTally[champ] = (titleTally[champ] || 0) + 1;
            if (champ === myId) titleCount++;
        }

        // 汇总
        const myProjected = (winSum / sims).toFixed(1);
        const favorites = Object.entries(titleTally)
            .map(([id, n]) => ({ id, pct: n / sims }))
            .sort((a, b) => b.pct - a.pct).slice(0, 5);

        return {
            sims,
            titlePct: titleCount / sims,
            playoffsPct: playoffsCount / sims,
            projectedWins: myProjected,
            favorites,
        };
    }

    // 模拟一个季后赛 bracket（东西部各 8 队种子）
    function simulateBracket(east, west, ratings, logistic) {
        const seriesWin = (a, b) => {
            // bo7：每场胜率 logistic((ratingA - ratingB + 0.5) / 7)，0.5 微弱主场补偿取平均
            const pA = logistic((ratings[a.id] - ratings[b.id] + 0.3) / 7.0);
            let wa = 0;
            for (let g = 0; g < 7; g++) { if (Math.random() < pA) wa++; if (wa === 4 || g - wa + 1 === 4) break; }
            return wa === 4 ? a : b;
        };
        let eR = east.slice(), wR = west.slice();
        while (eR.length > 1) {
            const next = [];
            for (let i = 0; i < eR.length / 2; i++) next.push(seriesWin(eR[i], eR[eR.length - 1 - i]));
            eR = next;
        }
        while (wR.length > 1) {
            const next = [];
            for (let i = 0; i < wR.length / 2; i++) next.push(seriesWin(wR[i], wR[wR.length - 1 - i]));
            wR = next;
        }
        return seriesWin(eR[0], wR[0]).id;
    }

    // 模拟器结果弹窗
    function showTitleOddsModal() {
        const myId = state.manager.teamId;
        let result;
        try {
            result = runTitleOdds(300);
        } catch (e) {
            console.error("[TitleOdds] 模拟失败:", e);
            toast("模拟失败：" + e.message, "error");
            return;
        }
        const pct = v => (v * 100).toFixed(1) + "%";
        const favRows = result.favorites.map((f, i) => {
            const isMe = f.id === myId;
            return `<tr style="${isMe?'background:rgba(29,66,138,0.25);font-weight:700;':''}">
                <td class="num">${i + 1}</td>
                <td>${teamLogo(f.id, 18)} ${teamName(f.id)}${isMe?'（你）':''}</td>
                <td class="num"><b>${pct(f.pct)}</b></td>
                <td><div class="odds-bar"><div class="odds-fill ${i === 0 ? 'top' : ''}" style="width:${Math.max(2, f.pct * 100)}%"></div></div></td>
            </tr>`;
        }).join("");
        showModal(`
            <div class="modal-title">🎲 赛季模拟器</div>
            <div class="muted" style="font-size:12px;margin-bottom:12px">基于当前阵容实力与剩余赛程，蒙特卡洛模拟 ${result.sims} 次</div>
            <div class="stat-grid">
                <div class="stat-box"><div class="value" style="color:var(--gold)">${pct(result.titlePct)}</div><div class="label">夺冠概率</div></div>
                <div class="stat-box"><div class="value">${pct(result.playoffsPct)}</div><div class="label">进季后赛概率</div></div>
                <div class="stat-box"><div class="value">${result.projectedWins}<span class="muted" style="font-size:14px">胜</span></div><div class="label">预计常规赛战绩</div></div>
            </div>
            <div class="card-title mt-20">夺冠热门榜</div>
            <div class="table-wrap"><table><thead><tr><th class="num">#</th><th>球队</th><th class="num">概率</th><th style="width:38%"></th></tr></thead><tbody>${favRows}</tbody></table></div>
            <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">关闭</button></div>
        `);
    }

    // ============ 成就墙弹窗 ============
    function showAchievementsModal() {
        const list = AchievementEngine.overview(state);
        const unlocked = list.filter(a => a.unlocked);
        const cells = list.map(a => `
            <div class="ach-cell ${a.unlocked ? 'unlocked' : 'locked'}">
                <div class="ach-icon">${a.unlocked ? a.icon : '🔒'}</div>
                <div class="ach-name">${a.name}</div>
                <div class="ach-desc">${a.desc}</div>
                ${a.unlocked ? `<div class="ach-time">${a.unlockedAt.year}-${a.unlockedAt.year + 1} 赛季达成</div>` : ''}
            </div>
        `).join("");
        showModal(`
            <div class="modal-title">🏆 经理成就 <span class="muted" style="font-size:13px;font-weight:400">${unlocked.length}/${list.length}</span></div>
            <div class="ach-progress"><div class="ach-progress-fill" style="width:${(unlocked.length / list.length * 100).toFixed(0)}%"></div></div>
            <div class="ach-grid">${cells}</div>
            <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">关闭</button></div>
        `);
    }

    function updateStandings() {
        state.standings = SeasonEngine.computeStandings(state.teams, state.records);
    }

    // ============ 主推进按钮 ============
    function advance() {
        if (state.phase === "regular") {
            const res = advanceToUserGame();
            if (res) {
                showBoxScore(res);
                renderAll();
            } else {
                // 常规赛结束 → 评选奖项 → 季后赛
                presentSeasonAwards();
                startPlayoffs();
            }
        } else if (state.phase === "playoffs" || state.phase === "finals") {
            advancePlayoffs();
        } else if (state.phase === "offseason") {
            startDraft();
        } else if (state.phase === "draft") {
            advanceDraft();
        } else if (state.phase === "freeAgency") {
            startNewSeason();
        }
        autoSave();
    }

    // ============ 赛季奖项评选 ============
    function presentSeasonAwards() {
        updateStandings();
        const awards = SeasonEngine.computeAwards(state);
        state.awardsHistory.push(awards);
        // 把奖项标记同步到所有获奖球员对象上，便于球员详情展示
        // 修复 bug：原代码只给 MVP 球员追加 _awards，ROY/DPOY/MIP/6MOY 等奖项未记录
        const tagAward = (c, label) => {
            if (!c || !c.player) return;
            if (!c.player._awards) c.player._awards = [];
            c.player._awards.push({ year: awards.year, type: label });
        };
        tagAward(awards.mvp, 'MVP');
        // 东西部 MVP 改为在季后赛分区决赛结束后评选并打标记，此处不再处理
        tagAward(awards.dpoy, 'DPOY');
        tagAward(awards.roy, 'ROY');
        tagAward(awards.sixMan, '6MOY');
        tagAward(awards.mip, 'MIP');
        // 最佳阵容
        const tagTeamAward = (details, label) => {
            (details || []).forEach(c => tagAward(c, label));
        };
        tagTeamAward(awards.allNBAFirstDetail, '最佳阵容一阵');
        tagTeamAward(awards.allNBASecondDetail, '最佳阵容二阵');
        tagTeamAward(awards.allNBAThirdDetail, '最佳阵容三阵');
        tagTeamAward(awards.allDefFirstDetail, '最佳防守一阵');
        tagTeamAward(awards.allDefSecondDetail, '最佳防守二阵');
        tagTeamAward(awards.allRookieFirstDetail, '新秀一阵');
        tagTeamAward(awards.allRookieSecondDetail, '新秀二阵');
        checkAchievements("seasonAwards", { awards });
        showAwardsModal(awards);
    }

    function showAwardsModal(awards) {
        const myId = state.manager.teamId;
        const fmt = (c) => c ? `${c.player.n} <span class="muted" style="font-size:12px">(${teamAbbr(c.teamId)})</span> <span class="muted" style="font-size:11px">${c.ppg.toFixed(1)}分 ${c.rpg.toFixed(1)}板 ${c.apg.toFixed(1)}助</span>` : '<span class="muted">无</span>';
        // MIP 展示带提升数据：显示本季数据 + 较上赛季提升
        const fmtMip = (c) => c ? `${c.player.n} <span class="muted" style="font-size:12px">(${teamAbbr(c.teamId)})</span> <span class="muted" style="font-size:11px">${c.ppg.toFixed(1)}分 ${c.rpg.toFixed(1)}板 ${c.apg.toFixed(1)}助</span> <span style="font-size:11px;color:var(--success)">较上赛季 +${c.ppgDelta.toFixed(1)}分 +${c.rpgDelta.toFixed(1)}板 +${c.apgDelta.toFixed(1)}助 / ovr ${c.lastPpg!=null?c.ovrDelta+'+':''}</span>` : '<span class="muted">无</span>';
        const isMine = (c) => c && c.teamId === myId;
        const winnerRow = (label, c, pendingHint) => `
            <div class="award-row ${isMine(c) ? 'mine' : ''}">
                <div class="award-label">${label}</div>
                <div class="award-winner">${c ? fmt(c) : (pendingHint ? `<span class="muted" style="font-size:12px">⏳ ${pendingHint}</span>` : '<span class="muted">无</span>')}${isMine(c) ? ' <span class="tag tag-rookie">我的球员</span>' : ''}</div>
            </div>`;
        const winnerRowCustom = (label, c, fmtFn) => `
            <div class="award-row ${isMine(c) ? 'mine' : ''}">
                <div class="award-label">${label}</div>
                <div class="award-winner">${fmtFn(c)}${isMine(c) ? ' <span class="tag tag-rookie">我的球员</span>' : ''}</div>
            </div>`;
        const listRow = (c, i) => `
            <tr class="${isMine(c) ? 'me-row' : ''}">
                <td class="num">${i+1}</td>
                <td>${c.player.n} <span class="muted" style="font-size:11px">(${teamAbbr(c.teamId)})</span></td>
                <td class="num">${c.ppg.toFixed(1)}</td><td class="num">${c.rpg.toFixed(1)}</td><td class="num">${c.apg.toFixed(1)}</td>
            </tr>`;
        // 阵容展示：5人一行，标注位置
        const teamRow = (detail, label) => {
            if (!detail || detail.length === 0) return '';
            const players = detail.map(c => `
                <div class="allteam-cell ${isMine(c) ? 'mine' : ''}">
                    <div class="allteam-pos pos-${c.player.p}">${c.player.p}</div>
                    <div class="allteam-name">${c.player.n}</div>
                    <div class="allteam-team">${teamAbbr(c.teamId)}</div>
                </div>`).join('');
            return `<div class="allteam-block"><div class="allteam-label">${label}</div><div class="allteam-row">${players}</div></div>`;
        };
        showModal(`
            <div class="modal-title">🏆 ${awards.year}-${awards.year+1} 赛季奖项</div>
            <div class="card-title">个人奖项</div>
            ${winnerRow('最有价值球员 MVP', awards.mvp)}
            ${winnerRow('东部决赛 MVP', awards.eastMvp, '季后赛分区决赛结束后评选')}
            ${winnerRow('西部决赛 MVP', awards.westMvp, '季后赛分区决赛结束后评选')}
            ${winnerRow('总决赛最有价值球员 FMVP', awards.fmvp, '总决赛结束后评选')}
            ${winnerRow('最佳防守球员 DPOY', awards.dpoy)}
            ${winnerRow('最佳新秀 ROY', awards.roy)}
            ${winnerRow('最佳第六人 6MOY', awards.sixMan)}
            ${winnerRowCustom('进步最快球员 MIP', awards.mip, fmtMip)}
            <div class="card-title mt-20">最佳阵容</div>
            ${teamRow(awards.allNBAFirstDetail, '一阵')}
            ${teamRow(awards.allNBASecondDetail, '二阵')}
            ${teamRow(awards.allNBAThirdDetail, '三阵')}
            <div class="card-title mt-20">最佳防守阵容</div>
            ${teamRow(awards.allDefFirstDetail, '防守一阵')}
            ${teamRow(awards.allDefSecondDetail, '防守二阵')}
            <div class="card-title mt-20">最佳新秀阵容</div>
            ${teamRow(awards.allRookieFirstDetail, '新秀一阵')}
            ${teamRow(awards.allRookieSecondDetail, '新秀二阵')}
            <div class="card-title mt-20">MVP 投票前 5</div>
            <div class="table-wrap"><table><thead><tr><th class="num">#</th><th>球员</th><th class="num">分</th><th class="num">板</th><th class="num">助</th></tr></thead><tbody>
            ${awards.mvpTop5.map((c,i)=>listRow(c,i)).join('')}
            </tbody></table></div>
            <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">进入季后赛</button></div>
        `);
    }

    // ============ 季后赛 ============
    function startPlayoffs() {
        state.playoffs = {
            round: 1,
            east: SeasonEngine.setupPlayoffs(state.standings).east,
            west: SeasonEngine.setupPlayoffs(state.standings).west,
            eastResults: null, westResults: null,
            // 累积本联盟前 3 轮所有系列赛结果，供分区决赛结束后评选东西部 MVP
            eastAllRounds: [], westAllRounds: [],
            eastConfMVP: null, westConfMVP: null,
            finalsResult: null,
            // 记录每支季后赛球队的出局轮次（1=首轮, 2=半决赛, 3=分区决赛, 4=总决赛, 5=冠军）
            // 在 advancePlayoffs 中随每轮模拟累积写入，供 startDraft 确定选秀顺位使用
            exits: {},
        };
        state.phase = "playoffs";
        checkAchievements("playoffsStart", {});
        toast("常规赛结束！季后赛打响 🏆", "gold");
        renderAll();
    }

    // 把玩家参与的季后赛系列赛每场记录到 userGameLog
    // 修复 v11：原 advancePlayoffs 不记录季后赛，"最近5场"在季后赛期间冻结
    // series: { high:{teamId}, low:{teamId}, gameStats:[{home:{teamId},away:{teamId},homeWon,homeScore,awayScore}] }
    function pushPlayoffGamesToLog(series, myId, roundName) {
        if (!series || !series.gameStats) return;
        const isHome = series.high.teamId === myId;
        const oppId = isHome ? series.low.teamId : series.high.teamId;
        series.gameStats.forEach(g => {
            const myIsHome = g.home.teamId === myId;
            const myScore = myIsHome ? g.homeScore : g.awayScore;
            const oppScore = myIsHome ? g.awayScore : g.homeScore;
            const win = myIsHome ? g.homeWon : !g.homeWon;
            state.userGameLog.push({
                opp: oppId, myScore, oppScore, win,
                isPlayoff: true, round: roundName,
                day: state.currentDay,
            });
        });
    }

    function advancePlayoffs(fast = false) {
        const po = state.playoffs;
        const myId = state.manager.teamId;
        if (po.round <= 3) {
            // 模拟当轮东西部
            const pairings = po.round === 1 ? { east: po.east, west: po.west } : { east: po.eastNext, west: po.westNext };
            po.eastResults = SeasonEngine.simulatePlayoffRound(pairings.east, state.teamsPlayers);
            po.westResults = SeasonEngine.simulatePlayoffRound(pairings.west, state.teamsPlayers);
            const allRes = [...po.eastResults, ...po.westResults];
            // 累积本联盟前 3 轮所有系列赛结果，供分区决赛结束后评选东西部 MVP
            if (!po.eastAllRounds) po.eastAllRounds = [];
            if (!po.westAllRounds) po.westAllRounds = [];
            po.eastAllRounds.push(...po.eastResults);
            po.westAllRounds.push(...po.westResults);
            // 记录本轮出局球队：败者 exitRound = po.round（1=首轮, 2=半决赛, 3=分区决赛）
            allRes.forEach(r => {
                const loser = r.high.teamId === r.winner.teamId ? r.low : r.high;
                po.exits[loser.teamId] = po.round;
            });
            const roundName = ["","首轮","半决赛","分区决赛","总决赛"][po.round];
            const myRes = allRes.find(r => r.high.teamId === myId || r.low.teamId === myId);
            // 修复 v11：把玩家季后赛每场记录到 userGameLog，让"最近5场"包含季后赛
            if (myRes) pushPlayoffGamesToLog(myRes, myId, roundName);
            if (fast) {
                // 紧凑汇总：本轮所有系列一览（_playoffSilent 时跳过，避免循环模拟弹窗闪烁）
                if (!_playoffSilent) {
                    const myWon = myRes ? myRes.winner.teamId === myId : null;
                    showRoundSummaryModal(roundName, allRes, myWon);
                }
            } else if (myRes) {
                const myWon = myRes.winner.teamId === myId;
                showPlayoffSeriesModal(myRes, myWon, po.round);
            }
            // 生成下一轮对阵
            if (po.round < 3) {
                po.eastNext = SeasonEngine.nextRound(po.eastResults);
                po.westNext = SeasonEngine.nextRound(po.westResults);
                po.round++;
            } else {
                // 分区决赛结束 → 评选东西部 MVP（基于本联盟前 3 轮季后赛数据，从分区冠军中选）
                po.eastChamp = po.eastResults[0].winner;
                po.westChamp = po.westResults[0].winner;
                // 成就：打进分区决赛（最终四强）= 在本轮对阵中
                checkAchievements("playoffsRound", { isConfFinals: true });
                const eastTeamIds = po.east.map(p => [p.high.teamId, p.low.teamId]).flat();
                const westTeamIds = po.west.map(p => [p.high.teamId, p.low.teamId]).flat();
                po.eastConfMVP = SeasonEngine.computeConferenceMVP(po.eastAllRounds, eastTeamIds, po.eastChamp.teamId);
                po.westConfMVP = SeasonEngine.computeConferenceMVP(po.westAllRounds, westTeamIds, po.westChamp.teamId);
                // 同步到 awardsHistory 当前赛季奖项记录（覆盖原 null）
                const curAwards = state.awardsHistory[state.awardsHistory.length - 1];
                if (curAwards && curAwards.year === state.year) {
                    curAwards.eastMvp = po.eastConfMVP;
                    curAwards.westMvp = po.westConfMVP;
                    // 给获奖球员打标记
                    if (po.eastConfMVP && po.eastConfMVP.player) {
                        if (!po.eastConfMVP.player._awards) po.eastConfMVP.player._awards = [];
                        po.eastConfMVP.player._awards.push({ year: state.year, type: '东部MVP' });
                    }
                    if (po.westConfMVP && po.westConfMVP.player) {
                        if (!po.westConfMVP.player._awards) po.westConfMVP.player._awards = [];
                        po.westConfMVP.player._awards.push({ year: state.year, type: '西部MVP' });
                    }
                }
                // 弹窗展示东西部 MVP
                if (!fast && (po.eastConfMVP || po.westConfMVP)) {
                    showConferenceMvpModal(po.eastConfMVP, po.westConfMVP, roundName);
                }
                po.finalsPair = { high: po.eastChamp, low: po.westChamp }; // 主场优势按战绩，简化
                // 总决赛主场优势：战绩好的为 high
                const eR = state.records[po.eastChamp.teamId];
                const wR = state.records[po.westChamp.teamId];
                const eWinRate = eR.win/(eR.win+eR.loss);
                const wWinRate = wR.win/(wR.win+wR.loss);
                po.finalsPair = eWinRate >= wWinRate ? { high: po.eastChamp, low: po.westChamp } : { high: po.westChamp, low: po.eastChamp };
                state.phase = "finals";
                po.round = 4;
            }
        } else if (po.round === 4) {
            // 总决赛
            po.finalsResult = SeasonEngine.simulatePlayoffRound([po.finalsPair], state.teamsPlayers)[0];
            const champ = po.finalsResult.winner;
            const loser = po.finalsPair.high.teamId === champ.teamId ? po.finalsPair.low : po.finalsPair.high;
            // 修复 v11：总决赛每场也记录到 userGameLog
            pushPlayoffGamesToLog(po.finalsResult, myId, "总决赛");
            po.exits[loser.teamId] = 4; // 总决赛败者
            po.exits[champ.teamId] = 5; // 冠军
            // 评选总决赛 MVP（FMVP）：基于总决赛每场双方球员数据，冠军球队中综合评分最高者当选
            // 真实 NBA 规则：FMVP 几乎全部来自冠军球队（1969 Jerry West 是唯一败方 FMVP）
            const fmvp = SeasonEngine.computeFinalsMVP(
                po.finalsResult,
                po.finalsPair.high.teamId,
                po.finalsPair.low.teamId,
                champ.teamId
            );
            po.finalsMVP = fmvp;
            // 记录冠军和 FMVP 到历史
            state.champions.push({
                year: state.year, team: champ.teamId, name: champ.name,
                finalsMVP: fmvp ? { id: fmvp.player.id, n: fmvp.player.n, ppg: fmvp.ppg, rpg: fmvp.rpg, apg: fmvp.apg } : null,
                finalsScore: `${po.finalsResult.highWins}-${po.finalsResult.lowWins}`,
                loserTeamId: loser.teamId,
            });
            // 给 FMVP 球员追加奖项标记，便于球员详情展示
            if (fmvp && fmvp.player) {
                if (!fmvp.player._awards) fmvp.player._awards = [];
                fmvp.player._awards.push({ year: state.year, type: 'FMVP' });
            }
            const myWon = champ.teamId === myId;
            showFinalsModal(po.finalsResult, myWon, fmvp);
            checkAchievements("finalsEnd", { championTeamId: champ.teamId });
            state.phase = "offseason";
        }
        renderAll();
    }

    // 一键模拟本轮（季后赛/总决赛）：紧凑汇总，不逐系列弹窗
    function showRoundSummaryModal(roundName, allRes, myWon) {
        const myId = state.manager.teamId;
        const rows = allRes.map(r => {
            const isMine = r.high.teamId === myId || r.low.teamId === myId;
            const winnerAbbr = teamAbbr(r.winner.teamId);
            const highAbbr = teamAbbr(r.high.teamId);
            const lowAbbr = teamAbbr(r.low.teamId);
            return `<tr class="${isMine?'me-row':''}">
                <td>${highAbbr} vs ${lowAbbr}</td>
                <td class="num">${r.highWins}-${r.lowWins}</td>
                <td><b>${winnerAbbr}</b> 晋级</td>
            </tr>`;
        }).join("");
        let title = `${roundName} 战报`;
        if (myWon === true) title = `${roundName} · 你晋级了 ✔`;
        else if (myWon === false) title = `${roundName} · 你被淘汰 ✘`;
        showModal(`
            <div class="modal-title">${title}</div>
            <div class="table-wrap"><table><thead><tr><th>对阵</th><th class="num">比分</th><th>胜者</th></tr></thead><tbody>${rows}</tbody></table></div>
            <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">继续</button></div>
        `);
    }

    // 东西部决赛 MVP 弹窗：分区决赛结束后展示
    function showConferenceMvpModal(eastMvp, westMvp, roundName) {
        const myId = state.manager.teamId;
        const fmtConfMvp = (c, label) => {
            if (!c) return `<div class="award-row"><div class="award-label">${label}</div><div class="award-winner"><span class="muted">无</span></div></div>`;
            const mine = c.teamId === myId;
            return `<div class="award-row ${mine?'mine':''}">
                <div class="award-label">${label}</div>
                <div class="award-winner">
                    ${c.player.n} <span class="muted" style="font-size:12px">(${teamAbbr(c.teamId)} · ${c.player.p})</span>
                    ${mine ? ' <span class="tag tag-rookie">我的球员</span>' : ''}
                    <div class="muted" style="font-size:11px;margin-top:2px">
                        季后赛 ${c.gp} 场 · <b>${c.ppg}</b> 分 · <b>${c.rpg}</b> 板 · <b>${c.apg}</b> 助 ·
                        <b>${c.spg}</b> 断 · <b>${c.bpg}</b> 帽 · 命中率 <b>${(c.fgPct*100).toFixed(1)}%</b> · 均 ${c.min} 分钟
                    </div>
                </div>
            </div>`;
        };
        showModal(`
            <div class="modal-title">🏆 ${roundName}结束 · 东西部决赛 MVP</div>
            <div class="card-title">分区决赛最有价值球员</div>
            ${fmtConfMvp(eastMvp, '东部决赛 MVP')}
            ${fmtConfMvp(westMvp, '西部决赛 MVP')}
            <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">进入总决赛</button></div>
        `);
    }

    // ============ 一键快进 ============
    // 季后赛一键模拟至结束时，抑制中间轮弹窗，只在最后显示结果
    let _playoffSilent = false;
    function fastAdvance() {
        if (state.phase === "regular") {
            simToEndOfRegularSeason();
        } else if (state.phase === "playoffs" || state.phase === "finals") {
            // 修复 v11：fast 按钮在季后赛改为"模拟至赛季结束"，循环推进直到 offseason
            // （advance 按钮保持逐轮推进，两个按钮功能区分明确）
            _playoffSilent = true;
            const startPhase = state.phase;
            while (state.phase === "playoffs" || state.phase === "finals") {
                advancePlayoffs(true);
                if (state.phase === "offseason") break;
            }
            _playoffSilent = false;
            // 循环结束后，若是总决赛结束则 showFinalsModal 已在 advancePlayoffs 内弹出
            // 若玩家未进总决赛，弹一个赛季结束汇总
            if (state.phase === "offseason" && startPhase !== "offseason") {
                // advancePlayoffs 总决赛分支已弹 showFinalsModal；其他情况补弹提示
                const po = state.playoffs;
                if (!po.finalsResult || po.finalsResult.winner.teamId !== state.manager.teamId) {
                    const champName = po.finalsResult ? po.finalsResult.winner.name : '';
                    toast(`🏆 ${state.year}-${state.year+1} 赛季结束！冠军：${champName}`, "gold");
                }
            }
            autoSave();
        }
    }

    // 一键模拟剩余常规赛：跳过逐场比分，分块跑避免卡死 UI，结束进入季后赛
    function simToEndOfRegularSeason() {
        if (state.phase !== "regular") return;
        const totalDays = state.schedule.length;
        const startDay = state.currentDay;
        showSimProgress(0);
        const fastBtn = document.getElementById("fast-btn");
        const advBtn = document.getElementById("advance-btn");
        if (fastBtn) fastBtn.disabled = true;
        if (advBtn) advBtn.disabled = true;
        let lastPct = -1;
        isFastSimming = true;
        pendingBlockbusters = [];
        function tick() {
            const t0 = Date.now();
            // 每个时间片最多跑 50ms，避免阻塞 UI
            while (state.currentDay < state.schedule.length && Date.now() - t0 < 50) {
                advanceToUserGame();
                if (state.currentDay >= state.schedule.length) break;
            }
            const pct = Math.min(100, Math.floor(((state.currentDay - startDay) / Math.max(1, totalDays - startDay)) * 100));
            if (pct !== lastPct) { lastPct = pct; showSimProgress(pct); }
            if (state.currentDay < state.schedule.length) {
                setTimeout(tick, 0);
            } else {
                isFastSimming = false;
                // 完成：常规赛结束 → 关进度条 → 评选奖项（弹窗保留）→ 季后赛
                const r = state.records[state.manager.teamId];
                // 重新启用按钮（renderAll 会刷新标签，但显式重置 disabled 更稳妥）
                if (fastBtn) fastBtn.disabled = false;
                if (advBtn) advBtn.disabled = false;
                closeModal(); // 先关掉进度条弹窗
                // 若快速模拟期间有重磅交易，先弹窗汇总，再评奖项
                if (pendingBlockbusters.length > 0) {
                    const bb = pendingBlockbusters.slice();
                    pendingBlockbusters = [];
                    showTradeModal(bb);
                    // 延后奖项弹窗，避免被交易弹窗覆盖
                    setTimeout(() => {
                        closeModal();
                        presentSeasonAwards();
                        startPlayoffs();
                        autoSave();
                        renderAll();
                        toast(`常规赛结束：${r.win}胜${r.loss}负，进入季后赛 🏆`, "gold");
                    }, 100);
                } else {
                    presentSeasonAwards(); // 再开奖项弹窗（会被保留，玩家可查看）
                    startPlayoffs();
                    autoSave();
                    renderAll();
                    toast(`常规赛结束：${r.win}胜${r.loss}负，进入季后赛 🏆`, "gold");
                }
            }
        }
        // 首个时间片同步执行：剩余天数较少时可一次跑完，避免无谓的异步等待
        tick();
    }

    function showSimProgress(pct) {
        showModal(`
            <div class="modal-title">⏩ 快速模拟中</div>
            <div class="muted center" style="padding:16px 0 12px">正在模拟剩余常规赛...</div>
            <div class="progress-bar"><div style="width:${pct}%"></div></div>
            <div class="center muted" style="margin-top:10px;font-size:12px">${pct}%</div>
        `);
    }

    // ============ 选秀 ============
    // 构建选秀班级：历史年代优先用真实选秀班级（真实球员/真实顺位），
    // 不足 60 人用生成新秀补齐；数据范围外（1997 前 / 2025 后）回退生成班级
    function buildRookieClass(draftYear) {
        const real = (window.HistoryEngine && HistoryEngine.isAvailable())
            ? HistoryEngine.getDraftClass(draftYear) : null;
        if (!real) return DraftEngine.generateRookieClass(draftYear);
        const cls = real.drafted.slice();
        if (cls.length < 60) {
            const gen = DraftEngine.generateRookieClass(draftYear);
            while (cls.length < 60 && gen.length) cls.push(gen.shift());
        }
        // 落选/未参选的真实新秀追加到班级尾部：60 顺位选不完，自然流入自由市场
        cls.push(...real.undrafted.slice(0, 15));
        console.log(`[历史选秀] ${draftYear} 年选秀：${real.drafted.length} 名真实新秀（含 ${real.undrafted.length} 名落选）`);
        return cls;
    }

    function startDraft() {
        state.year++;
        state.rookieClass = buildRookieClass(state.year);
        // 计算选秀顺位：基于上赛季战绩
        // playoffExitRound 来自 advancePlayoffs 累积写入的 state.playoffs.exits：
        //   1=首轮, 2=半决赛, 3=分区决赛, 4=总决赛败者, 5=冠军
        const exits = (state.playoffs && state.playoffs.exits) ? state.playoffs.exits : {};
        const standingsData = state.teams.map(t => {
            const r = state.records[t.id];
            const madePlayoffs = state.standings[t.conf==="East"?"east":"west"].slice(0,8).some(e=>e.teamId===t.id);
            // 季后赛球队默认 exitRound=1（兜底，正常情况 exits 已记录）
            const playoffExitRound = madePlayoffs ? (exits[t.id] || 1) : 0;
            return { teamId: t.id, win: r.win, loss: r.loss, madePlayoffs, playoffExitRound };
        });
        const order = SeasonEngineDraftOrder(standingsData);
        state.draftOrder = order.firstRound.concat(order.secondRound).map(s => s.teamId);
        state.draftPick = 0;
        state.phase = "draft";
        // 检查玩家是否有顺位（异常情况兜底：若玩家无顺位，直接跳过选秀）
        const myId = state.manager.teamId;
        const hasMyPick = state.draftOrder.indexOf(myId) >= 0;
        if (!hasMyPick) {
            // 异常：玩家无顺位，AI 自动完成整个选秀
            while (state.draftPick < 60) {
                const owner = state.draftOrder[state.draftPick] || state.teams[0].id;
                const available = state.rookieClass.filter(r => r.t === null);
                const roster = state.teamsPlayers[owner] || [];
                const pick = DraftEngine.aiPick(available, roster);
                if (pick) {
                    if (state.teamsPlayers[owner]) makeRoomForRookie(owner);
                    DraftEngine.assignRookieToTeam(pick, owner, state.draftPick + 1);
                    if (state.teamsPlayers[owner]) state.teamsPlayers[owner].push(pick);
                    state.players.push(pick);
                }
                state.draftPick++;
            }
            toast(`${state.year} 年选秀已完成（自动模拟）`, "");
        } else {
            // 自动推进到玩家第一个顺位
            aiDraftUntilMyTurnOrEnd();
            toast(`${state.year} 年 NBA 选秀开始！轮到你第 #${state.draftPick+1} 顺位`, "gold");
        }
        renderView("draft");
        autoSave();
    }

    function SeasonEngineDraftOrder(standingsData) {
        return DraftEngine.determineDraftOrder(standingsData);
    }

    function advanceDraft() {
        const myId = state.manager.teamId;
        if (state.draftPick >= 60) {
            // 选秀结束
            state.phase = "freeAgency";
            // 修复：自由市场主来源 = 落选新秀 + 硬帽释放 + 名单裁减 + makeRoomForRookie 释放
            // 用户要求：自由球员应来自各球队裁员/新秀离队，而非纯随机生成
            // 这些球员已在 state.players 中标记 isFreeAgent=true，统一收集到 state.freeAgents
            const existingFaIds = new Set(state.freeAgents.map(p => p.id));
            const collected = [];
            // 1. 落选新秀（rookieClass 中 t===null 的，约 10 个）
            if (state.rookieClass) {
                state.rookieClass.forEach(r => {
                    if (r.t === null && !existingFaIds.has(r.id)) {
                        r.isFreeAgent = true;
                        r.t = null;
                        // 初次进入自由市场，滞留计时从 0 开始
                        r.yearsInFreeAgency = 0;
                        collected.push(r);
                        existingFaIds.add(r.id);
                        // 落选新秀也要加入 state.players 保持数据一致性
                        if (!state.players.find(p => p.id === r.id)) {
                            state.players.push(r);
                        }
                    }
                });
            }
            // 2. state.players 中标记 isFreeAgent=true 但未在 state.freeAgents 中的球员
            //    来源：enforceHardCap、offseason roster trim、makeRoomForRookie
            state.players.forEach(p => {
                if (p.isFreeAgent && !p.isRetired && p.t === null && !existingFaIds.has(p.id)) {
                    collected.push(p);
                    existingFaIds.add(p.id);
                }
            });
            state.freeAgents.push(...collected);
            // 3. 仅在数量严重不足时少量补充随机 FA（避免自由市场完全空荡）
            //    用户要求：自由球员应来自各球队裁员/新秀离队，而非纯随机生成
            //    因此仅在自由市场极度不足（<8人）时补充少量，正常情况下靠真实来源维持
            const MIN_FA = 8;
            if (state.freeAgents.length < MIN_FA) {
                const supplement = SeasonEngine.generateFreeAgents(MIN_FA - state.freeAgents.length);
                state.freeAgents.push(...supplement);
            }
            const undrafted = collected.filter(p => p.isRookie).length;
            const released = collected.length - undrafted;
            toast(`选秀结束，自由市场开放（${state.freeAgents.length} 人，新增落选 ${undrafted} + 被裁 ${released}）`, "success");
            renderAll();
            return;
        }
        // 轮到玩家：不推进，等待玩家点新秀卡（advance 按钮已禁用，这里只是兜底）
        if (state.draftOrder[state.draftPick] === myId) {
            toast("请在下方选择你的新秀", "gold");
            return;
        }
        // AI 连续选择，直到下一个玩家顺位或选秀结束（玩家不用点几十次）
        aiDraftUntilMyTurnOrEnd();
        renderAll();
        if (state.draftPick >= 60) {
            // 选秀全部结束，提示再点一次进入自由市场
            toast("选秀全部完成，点击右上角进入自由市场", "success");
        } else {
            toast(`轮到你第 #${state.draftPick+1} 顺位选择!`, "gold");
        }
    }

    // AI 连续选秀，直到轮到玩家或选秀结束
    function aiDraftUntilMyTurnOrEnd() {
        const myId = state.manager.teamId;
        let guard = 0;
        while (state.draftPick < 60 && state.draftOrder[state.draftPick] !== myId && guard < 70) {
            const owner = state.draftOrder[state.draftPick];
            const available = state.rookieClass.filter(r => r.t === null);
            const roster = state.teamsPlayers[owner];
            const pick = DraftEngine.aiPick(available, roster);
            if (pick) {
                makeRoomForRookie(owner);
                DraftEngine.assignRookieToTeam(pick, owner, state.draftPick + 1);
                roster.push(pick);
                state.players.push(pick);
                if (state.draftPick < 5) toast(`#${state.draftPick+1} ${teamAbbr(owner)} 选中 ${pick.n}`, "");
            }
            state.draftPick++;
            guard++;
        }
    }

    function userDraftPick(rookieId) {
        const myId = state.manager.teamId;
        const rookie = state.rookieClass.find(r => r.id === rookieId && r.t === null);
        if (!rookie) return;
        if (state.draftOrder[state.draftPick] !== myId) { toast("这不是你的顺位", "error"); return; }
        makeRoomForRookie(myId);
        DraftEngine.assignRookieToTeam(rookie, myId, state.draftPick + 1);
        state.teamsPlayers[myId].push(rookie);
        state.players.push(rookie);
        toast(`你用 #${state.draftPick+1} 顺位选中 ${rookie.n}!`, "success");
        checkAchievements("draft", { player: rookie, pick: state.draftPick + 1 });
        state.draftPick++;
        // 玩家选完后，AI 自动连续选到下一个玩家顺位或结束（同步执行，避免 setTimeout 竞态）
        aiDraftUntilMyTurnOrEnd();
        autoSave();
        renderAll();
        if (state.draftPick < 60 && state.draftOrder[state.draftPick] === myId) {
            toast(`轮到你第 #${state.draftPick+1} 顺位选择!`, "gold");
        } else if (state.draftPick >= 60) {
            toast("选秀全部完成，点击右上角进入自由市场", "success");
        }
    }

    function autoAdvanceDraft() {
        // 保留供"模拟到我的顺位"按钮调用
        const myId = state.manager.teamId;
        aiDraftUntilMyTurnOrEnd();
        renderAll();
        if (state.draftPick >= 60) {
            toast("选秀全部完成", "success");
        } else {
            toast(`轮到你第 #${state.draftPick+1} 顺位选择!`, "gold");
        }
    }

    // 跳过剩余选秀：AI 自动完成所有未选顺位，包括玩家的顺位
    function skipRemainingDraft() {
        while (state.draftPick < 60) {
            const owner = state.draftOrder[state.draftPick];
            const available = state.rookieClass.filter(r => r.t === null);
            const roster = state.teamsPlayers[owner];
            const pick = DraftEngine.aiPick(available, roster);
            if (pick) {
                makeRoomForRookie(owner);
                DraftEngine.assignRookieToTeam(pick, owner, state.draftPick + 1);
                roster.push(pick);
                state.players.push(pick);
            }
            state.draftPick++;
        }
        toast("选秀已跳过，进入自由市场", "success");
        renderAll();
        autoSave();
    }

    // ============ 自由市场后开始新赛季 ============
    function startNewSeason() {
        // 1. 先记录球员职业生涯历史快照（基于刚结束赛季、成长前的 ovr）
        //    修复 MIP bug：原代码在 offseasonProgression 之后调用 recordPlayerHistory，
        //    导致 playerHistory 记录的是成长后的 ovr，ovrDelta 永远为 0，MIP 无人获奖。
        recordPlayerHistory();
        // 1.5 老化现有自由球员池：年龄+1、能力衰退、高龄退役
        //     修复：自由球员不再每赛季全量重置，而是持续存在于市场中直到被签约或退役
        if (state.freeAgents && state.freeAgents.length > 0) {
            const faResult = SeasonEngine.ageFreeAgents(state);
            // 从 state.players 中移除退役的自由球员
            if (faResult.retired > 0 && state.players) {
                const retiredFaIds = new Set(state.freeAgents.filter(p => p.isRetired).map(p => p.id));
                state.players = state.players.filter(p => !retiredFaIds.has(p.id));
            }
        }
        // 2. 球员成长与老化（含退役评估）
        const progression = SeasonEngine.offseasonProgression(state.players);
        const changes = progression.changes;
        const retired = progression.retired;
        // 3. 清理退役球员：从各球队名单移除，并从 players 数组中删除
        if (retired.length > 0) {
            const retiredIds = new Set(retired.map(p => p.id));
            state.teams.forEach(t => {
                state.teamsPlayers[t.id] = state.teamsPlayers[t.id].filter(p => !retiredIds.has(p.id));
            });
            state.players = state.players.filter(p => !retiredIds.has(p.id));
        }
        // 3.5 清理被淘汰为自由球员的球员：offseasonProgression 第五阶段把低 ovr 年轻球员
        //     标记为 isFreeAgent=true, t=null，但它们仍留在 teamsPlayers 数组中，需要移除
        //     修复 v4：原逻辑未清理，导致球队名单包含 t=null 的球员，数据不一致
        state.teams.forEach(t => {
            state.teamsPlayers[t.id] = state.teamsPlayers[t.id].filter(p => !p.isFreeAgent);
        });
        // 4. 退役清理后，先修剪超额名单至 15 人，再补充替补填充球员至 14 人
        //    （历史存档可能存在名单 > 15 的脏数据，这里作为安全网统一收敛）
        //    修复：被裁球员不再从 state.players 删除，而是标记为自由球员保留在池中
        //    用户要求：自由球员应来自各球队裁员，而非纯随机生成
        const offseasonReleasedIds = new Set();
        state.teams.forEach(t => {
            const roster = state.teamsPlayers[t.id];
            while (roster.length > 15) {
                let toRelease = null;
                const fillers = roster.filter(p => p.isFiller);
                if (fillers.length > 0) {
                    fillers.sort((a, b) => a.o - b.o);
                    toRelease = fillers[0];
                } else {
                    toRelease = [...roster].sort((a, b) => a.o - b.o)[0];
                }
                if (!toRelease) break;
                const idx = roster.findIndex(p => p.id === toRelease.id);
                if (idx >= 0) roster.splice(idx, 1);
                // filler 直接删除，真实球员标记为自由球员保留
                if (toRelease.isFiller) {
                    offseasonReleasedIds.add(toRelease.id);
                } else {
                    toRelease.isFreeAgent = true;
                    toRelease.t = null;
                    // 重新进入自由市场，滞留计时从 0 开始
                    toRelease.yearsInFreeAgency = 0;
                }
            }
        });
        // 删除被释放的 filler 球员
        if (offseasonReleasedIds.size > 0) {
            state.players = state.players.filter(p => !offseasonReleasedIds.has(p.id));
        }
        // 真实释放球员保留在 state.players 中，等选秀结束时统一收集进 state.freeAgents
        // 4.5 强制执行硬帽：超帽球队释放最低性价比球员直至合规
        //     修复硬帽失效 bug：原 validateSalary 只在交易瞬间检查，但 offseasonProgression 中
        //     adjustSalaryByAge 会重算薪资（老将跨年折扣恢复），可能导致已合规球队再次超帽
        const hardCapReleased = SeasonEngine.enforceHardCap(state);
        if (hardCapReleased.length > 0) {
            // filler 球员直接从 state.players 删除，真实球员保留为自由球员
            const fillerReleasedIds = new Set(hardCapReleased.filter(p => p.isFiller).map(p => p.id));
            if (fillerReleasedIds.size > 0) {
                state.players = state.players.filter(p => !fillerReleasedIds.has(p.id));
            }
            const notable = hardCapReleased.filter(p => !p.isFiller && p.o >= 75).slice(0, 3);
            if (notable.length) {
                const names = notable.map(p => `${p.n}($${p.sal}M)`).join('、');
                setTimeout(() => toast(`💰 薪资瘦身: ${names} 等共 ${hardCapReleased.length} 人因硬帽被释放`, ""), 600);
            }
        }
        // 4.6 AI 球队从自由市场签约补强（在 filler 补足前）
        //     修复：自由球员池需要流动，否则无限膨胀；AI 球队名单不足时优先签约自由球员
        //     用户要求：自由球员应来自各球队裁员/新秀离队，且能被签约流动
        aiSignFreeAgents(state);
        // 4.7 仍然不足 14 人的球队，用 filler 补足
        state.teams.forEach(t => {
            while (state.teamsPlayers[t.id].length < 14) {
                const fp = generateBenchPlayer(t.id, Date.now() % 1000 + state.teamsPlayers[t.id].length);
                state.players.push(fp);
                state.teamsPlayers[t.id].push(fp);
            }
        });
        // 5. 清空伤病（休赛期全部康复）
        state.players.forEach(p => p.injured = 0);
        state.injuryLog = [];
        state.tradeLog = [];
        // 6. 重建统计
        state.teams.forEach(t => {
            state.records[t.id] = { win:0, loss:0, streak:0, ptsFor:0, ptsAgt:0 };
            state.statAccum[t.id] = {};
        });
        // 清除球员的赛季交易冷却标记（新赛季开始，所有球员可再次被交易）
        TradeEngine.resetTradeFlags(state);
        state.userGameLog = [];
        state.schedule = SeasonEngine.generateSchedule(state.teams);
        state.currentDay = 0;
        state.playoffs = null;
        state.phase = "regular";
        state.standings = null;
        updateStandings();
        // 显示重要成长
        if (changes.length) {
            const top = changes.filter(c => c.delta >= 3).slice(0,5);
            if (top.length) {
                setTimeout(() => showGrowthModal(changes), 300);
            }
        }
        // 退役通知
        if (retired.length > 0) {
            const notable = retired.filter(p => !p.isFiller && p.o >= 80).slice(0, 5);
            if (notable.length) {
                const names = notable.map(p => `${p.n}(${p.a}岁,${p.o})`).join('、');
                setTimeout(() => toast(`📅 退役公告: ${names} 等共 ${retired.length} 人退役`, ""), 800);
            }
        }
        toast(`${state.year}-${state.year+1} 新赛季开始！`, "success");
        renderAll();
    }

    // 记录球员职业生涯历史（每个赛季结束后调用）
    // 关键修复:
    //  1. 跳过刚选中的新秀（draftYear === state.year），避免写入选秀前一年的 phantom 零数据行
    //  2. 遍历所有球队的 statAccum 查找该球员数据，支持交易后按球队分别记录
    //  3. 扩展字段：min/stl/blk/tov/命中率等，完整展示生涯数据
    //  4. 新秀首赛季即使 gp=0（未进轮换）也记录一条零数据行，保证生涯时间线连续
    function recordPlayerHistory() {
        // 注意：startDraft 已把 state.year +1（进入新赛季），所以刚结束的赛季是 state.year - 1
        // year 语义统一为"赛季结束年"（与真实 NBA 数据一致）：
        //   游戏内 state.year=2026 表示 2026-27 赛季（起始年），对应结束年 = state.year + 1 = 2027
        //   真实数据 year=2026 表示 2025-26 赛季（结束年）
        //   两者不冲突，mergeSeasons 可正确按 year 去重
        // 此处 state.year 已被 startDraft +1，刚结束赛季的 state.year 原值 = state.year - 1（起始年），
        // 对应结束年 = (state.year - 1) + 1 = state.year
        const prevYear = state.year;
        state.players.forEach(p => {
            // 跳过刚选中的新秀（还没打任何比赛，避免 phantom 零数据行）
            // draftYear 用起始年语义，刚选中新秀 draftYear === state.year
            if (p.draftYear === state.year) return;
            if (!state.playerHistory[p.id]) state.playerHistory[p.id] = [];
            let hasRecord = false;
            // 遍历所有球队查找该球员的累积数据（支持赛季中交易：可能多队都有数据）
            state.teams.forEach(t => {
                const acc = state.statAccum[t.id] && state.statAccum[t.id][p.id];
                if (!acc || acc.gp === 0) return; // 该队无数据则跳过
                hasRecord = true;
                const gp = acc.gp;
                const div = (v) => +(v / Math.max(1, gp)).toFixed(1);
                state.playerHistory[p.id].push({
                    year: prevYear,
                    ovr: p.o,
                    teamId: t.id,
                    age: p.a,
                    gp: gp,
                    min: div(acc.min),
                    pts: div(acc.pts),
                    reb: div(acc.reb),
                    ast: div(acc.ast),
                    stl: div(acc.stl),
                    blk: div(acc.blk),
                    tov: div(acc.tov),
                    pf: div(acc.pf),
                    fgm: div(acc.fgm),
                    fga: div(acc.fga),
                    tpm: div(acc.tpm),
                    tpa: div(acc.tpa),
                    ftm: div(acc.ftm),
                    fta: div(acc.fta),
                    oreb: div(acc.oreb),
                    fg_pct: acc.fga > 0 ? +(acc.fgm / acc.fga).toFixed(3) : 0,
                    fg3_pct: acc.tpa > 0 ? +(acc.tpm / acc.tpa).toFixed(3) : 0,
                    ft_pct: acc.fta > 0 ? +(acc.ftm / acc.fta).toFixed(3) : 0,
                });
            });
            // 新秀首赛季未进轮换（gp=0）：记录一条零数据行保证生涯连续性
            // 避免新秀生涯数据"黑洞"（首年完全缺失）
            // draftYear 用起始年语义，刚结束赛季的起始年 = state.year - 1
            if (!hasRecord && p.draftYear === state.year - 1) {
                state.playerHistory[p.id].push({
                    year: prevYear,
                    ovr: p.o,
                    teamId: p.t,
                    age: p.a,
                    gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
                    fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0,
                    fg_pct: 0, fg3_pct: 0, ft_pct: 0,
                });
            }
        });
    }

    // 用真实 NBA 历史数据预填第一赛季的 playerHistory
    // 解决：游戏起始 state.year=2026，第一赛季评选 MIP 时所有球员 playerHistory 为空 → MIP 必空缺
    // 方案：取真实 NBA year=(state.year-1) 的赛季数据作为"上赛季"基准，让 MIP 可基于真实数据评选
    // ovr 字段无真实数据，用球员当前 ovr（ovrDelta=0，但 MIP 评分仍可通过 dataImprove 体现）
    function seedInitialPlayerHistory() {
        if (!state || state.playerHistory === undefined) return;
        // 仅在 playerHistory 完全空时预填（避免覆盖已有存档数据）
        if (Object.keys(state.playerHistory).length > 0) return;
        // year 语义：游戏内 state.year=2026 表示 2026-27 赛季（起始年），
        // 上赛季 = 2025-26 赛季，真实数据 year=2026（结束年语义）
        // 所以 prevYear = state.year（取真实数据的结束年）
        const prevYear = state.year;
        const nameMap = NBAStats.getNameMap();
        const stats = NBAStats.getStats();
        let seeded = 0;
        state.players.forEach(p => {
            const nbaId = nameMap[p.n];
            if (!nbaId) return;
            const nbaPlayer = stats[String(nbaId)];
            if (!nbaPlayer || !nbaPlayer.seasons || nbaPlayer.seasons.length === 0) return;
            // 优先取 year=prevYear 的赛季；若无则取最近一个 <= state.year 的赛季
            let season = nbaPlayer.seasons.find(s => s.year === prevYear);
            if (!season) {
                const past = nbaPlayer.seasons.filter(s => s.year <= state.year);
                if (past.length === 0) return;
                season = past[past.length - 1];
            }
            state.playerHistory[p.id] = [{
                year: prevYear,
                ovr: p.o, // 真实数据无 ovr，用当前 ovr（ovrDelta=0，MIP 靠 dataImprove 评分）
                teamId: p.t,
                // 修复：预填的是"上赛季"年龄，应比当前 p.a 小 1
                // PLAYERS_DATA.a 对应游戏第一赛季（2026-27）年龄，上赛季（2025-26）应为 p.a - 1
                // 原代码用 season.age || p.a，但 season.age 和 p.a 相同（都来自 2025-26 数据），
                // 导致预填 age = 第一赛季 age，"第一年不增加年龄"
                age: (p.a > 1 ? p.a - 1 : p.a),
                gp: season.gp || 0,
                min: season.min || 0,
                pts: season.pts || 0,
                reb: season.reb || 0,
                ast: season.ast || 0,
                stl: season.stl || 0,
                blk: season.blk || 0,
                tov: season.tov || 0,
                pf: season.pf || 0,
                fgm: season.fgm || 0,
                fga: season.fga || 0,
                tpm: season.fg3m || 0,
                tpa: season.fg3a || 0,
                ftm: season.ftm || 0,
                fta: season.fta || 0,
                oreb: season.oreb || 0,
                fg_pct: season.fg_pct || 0,
                fg3_pct: season.fg3_pct || 0,
                ft_pct: season.ft_pct || 0,
            }];
            seeded++;
        });
        if (seeded > 0) {
            autoSave();
            console.log(`[playerHistory] 已用真实 NBA 数据预填 ${seeded} 名球员的上赛季记录`);
        }
    }

    // ============ 模态框 ============
    function showModal(html) {
        const box = document.getElementById("modal-box");
        box.innerHTML = html;
        box.scrollTop = 0; // 重置滚动位置，避免长弹窗关闭后开新弹窗停留底部
        document.getElementById("modal-overlay").classList.add("active");
    }
    function closeModal() {
        document.getElementById("modal-overlay").classList.remove("active");
    }

    function showBoxScore(log) {
        const myId = state.manager.teamId;
        const isHome = log.isHome;
        const homeLines = log.boxscore.home.lines;
        const awayLines = log.boxscore.away.lines;
        const homeScore = log.boxscore.home.score;
        const awayScore = log.boxscore.away.score;
        const hq = log.boxscore.home.quarters;
        const aq = log.boxscore.away.quarters;
        const labels = ["Q1","Q2","Q3","Q4"];
        for (let i = 4; i < hq.length; i++) labels.push("OT" + (i-3));
        const qStr = hq.map((h,i)=>`${labels[i]} ${h}-${aq[i]}`).join("  ");

        const homeId = log.boxscore.home.players[0]?.t || (isHome?myId:log.opp);
        const awayId = log.boxscore.away.players[0]?.t || (isHome?log.opp:myId);
        const homeName = teamAbbr(homeId);
        const awayName = teamAbbr(awayId);

        const homeWon = log.boxscore.winner === "home";
        const resultText = log.win ? "胜利 🎉" : "惜败";
        const resultColor = log.win ? "var(--success)" : "var(--accent-light)";

        const lineTable = (lines, side) => {
            const sorted = lines.slice().sort((a,b)=>b.pts-a.pts);
            return `<div class="table-wrap"><table><thead><tr><th>球员</th><th class="num">分</th><th class="num">板</th><th class="num">助</th><th class="num">投</th><th class="num">三</th><th class="num">抢</th><th class="num">帽</th></tr></thead><tbody>
            ${sorted.map(l => `<tr><td>${l.player.n}</td><td class="num"><b>${l.pts}</b></td><td class="num">${l.reb}</td><td class="num">${l.ast}</td><td class="num">${l.fgm}-${l.fga}</td><td class="num">${l.tpm}-${l.tpa}</td><td class="num">${l.stl}</td><td class="num">${l.blk}</td></tr>`).join("")}
            </tbody></table></div>`;
        };

        showModal(`
            <div class="modal-title" style="color:${resultColor}">${resultText} — ${teamLogo(awayId, 32)} ${awayName} ${awayScore} : ${homeScore} ${teamLogo(homeId, 32)} ${homeName}</div>
            <div class="boxscore">
                <div class="team-score ${!homeWon?'winner':''}">${teamLogo(awayId, 56)}<div class="name">${awayName} (客)</div><div class="score">${awayScore}</div></div>
                <div class="team-score ${homeWon?'winner':''}">${teamLogo(homeId, 56)}<div class="name">${homeName} (主)</div><div class="score">${homeScore}</div></div>
            </div>
            <div class="quarters center muted mt-10">${qStr}${log.boxscore.ot?` (OT${log.boxscore.ot})`:''}</div>
            ${renderGameEvents(log.boxscore.events)}
            <div class="grid-2 mt-20">
                <div><div class="card-title">${awayName}</div>${lineTable(awayLines,"away")}</div>
                <div><div class="card-title">${homeName}</div>${lineTable(homeLines,"home")}</div>
            </div>
            <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">关闭</button></div>
        `);
    }

    // 渲染比赛关键事件（Feature 4）
    function renderGameEvents(events) {
        if (!events || events.length === 0) return "";
        const icon = { "50pt":"🔥","40pt":"🔥","tripleDouble":"🌟","doubleDouble":"⭐","bigReb":"📦","bigAst":"🎯","bigBlk":"🛡️","bigStl":"✋","overtime":"⏱️","buzzer":"💨" };
        const text = (e) => {
            switch (e.type) {
                case "50pt": return `${e.player} 砍下 ${e.pts} 分！`;
                case "40pt": return `${e.player} 贡献 ${e.pts} 分`;
                case "tripleDouble": return `${e.player} 三双 ${e.pts}/${e.reb}/${e.ast}`;
                case "doubleDouble": return `${e.player} 两双 ${e.pts}/${e.reb}`;
                case "bigReb": return `${e.player} 摘下 ${e.reb} 篮板`;
                case "bigAst": return `${e.player} 送出 ${e.ast} 助攻`;
                case "bigBlk": return `${e.player} ${e.blk} 次盖帽`;
                case "bigStl": return `${e.player} ${e.stl} 次抢断`;
                case "overtime": return `加时赛 OT${e.ot}`;
                case "buzzer": return `险胜！仅差 ${e.diff} 分`;
                default: return "";
            }
        };
        const items = events.map(e => `<div class="game-event"><span class="ge-icon">${icon[e.type]||"•"}</span><span>${text(e)}</span></div>`).join("");
        return `<div class="game-events">${items}</div>`;
    }

    function showPlayoffSeriesModal(res, myWon, round) {
        const myId = state.manager.teamId;
        const opp = res.high.teamId === myId ? res.low : res.high;
        const roundName = ["","首轮","半决赛","分区决赛","总决赛"][round];
        // 我方胜场在前，对方在后
        const myWins = res.high.teamId === myId ? res.highWins : res.lowWins;
        const oppWins = res.high.teamId === myId ? res.lowWins : res.highWins;
        showModal(`
            <div class="modal-title" style="color:${myWon?'var(--success)':'var(--accent-light)'}">${roundName} ${myWon?'晋级! ✔':'被淘汰 ✘'}</div>
            <div style="text-align:center;font-size:18px;padding:16px">
                ${teamLogo(myId, 56)} <b style="vertical-align:middle">${teamAbbr(myId)} <span style="font-size:24px">${myWins}-${oppWins}</span> ${teamAbbr(opp.teamId)}</b> ${teamLogo(opp.teamId, 56)}<br>
                <span class="muted">对手: ${teamName(opp.teamId)}</span>
            </div>
            <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">继续</button></div>
        `);
    }

    function showFinalsModal(res, myWon, fmvp) {
        const champ = res.winner;
        const myId = state.manager.teamId;
        const champId = champ.teamId;
        const loserId = res.high.teamId === champId ? res.low.teamId : res.high.teamId;
        const champWins = res.high.teamId === champId ? res.highWins : res.lowWins;
        const loserWins = res.high.teamId === champId ? res.lowWins : res.highWins;
        // FMVP 信息展示（含总决赛系列赛数据）
        const fmvpHtml = fmvp ? `
            <div style="margin-top:18px;padding:14px 16px;background:rgba(243,156,18,0.12);border:1px solid var(--gold);border-radius:10px">
                <div style="font-size:13px;color:var(--gold);font-weight:700;margin-bottom:6px">🏆 总决赛最有价值球员 FMVP</div>
                <div style="display:flex;align-items:center;gap:12px">
                    <div style="font-size:18px;font-weight:800">${fmvp.player.n}</div>
                    <span class="muted" style="font-size:13px">${teamAbbr(fmvp.teamId)} · ${fmvp.player.p}</span>
                    ${fmvp.teamId === myId ? '<span class="tag tag-rookie">我的球员</span>' : ''}
                </div>
                <div style="margin-top:6px;font-size:13px;color:var(--text)">
                    <b>${fmvp.ppg.toFixed(1)}</b> 分 ·
                    <b>${fmvp.rpg.toFixed(1)}</b> 板 ·
                    <b>${fmvp.apg.toFixed(1)}</b> 助 ·
                    <b>${fmvp.spg.toFixed(1)}</b> 断 ·
                    <b>${fmvp.bpg.toFixed(1)}</b> 帽 ·
                    命中率 <b>${(fmvp.fgPct*100).toFixed(1)}%</b> ·
                    ${fmvp.gp} 场 ·
                    均 <b>${fmvp.min.toFixed(1)}</b> 分钟
                </div>
            </div>` : '';
        showModal(`
            <div class="modal-title" style="color:${myWon?'var(--gold)':'var(--accent-light)'};font-size:24px;text-align:center">
                ${myWon?'🏆 你赢得了 NBA 总冠军!':'赛季结束'}</div>
            <div style="text-align:center;padding:20px">
                <div style="display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:12px">
                    <div style="text-align:center">
                        ${teamLogo(champId, 64)}
                        <div style="font-size:20px;font-weight:800;margin-top:4px">${teamAbbr(champId)}</div>
                        <div style="font-size:11px;color:var(--gold)">冠军</div>
                    </div>
                    <div style="font-size:32px;font-weight:800;color:var(--gold)">${champWins}-${loserWins}</div>
                    <div style="text-align:center;opacity:0.7">
                        ${teamLogo(loserId, 48)}
                        <div style="font-size:16px;font-weight:700;margin-top:4px">${teamAbbr(loserId)}</div>
                    </div>
                </div>
                <div style="font-size:20px">
                    ${myWon ? `恭喜 ${state.manager.name} 率领 ${teamName(myId)} 夺冠!` : `${champ.name} 夺得 ${state.year} 年总冠军`}
                </div>
            </div>
            ${fmvpHtml}
            <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">进入休赛期</button></div>
        `);
    }

    function showGrowthModal(changes) {
        const notable = changes.filter(c => Math.abs(c.delta) >= 2).slice(0, 12);
        const rows = notable.map(c => `<tr><td>${c.player.n}</td><td class="num">${c.before}</td><td class="num"><b style="color:${c.delta>0?'var(--success)':'var(--accent-light)'}">${c.player.o}</b></td><td class="num" style="color:${c.delta>0?'var(--success)':'var(--accent-light)'}">${c.delta>0?'+':''}${c.delta}</td></tr>`).join("");
        showModal(`
            <div class="modal-title">休赛期成长报告</div>
            <div class="muted">球员经过休赛期训练的成长/衰退</div>
            <table class="mt-20"><thead><tr><th>球员</th><th class="num">原总评</th><th class="num">现总评</th><th class="num">变化</th></tr></thead><tbody>${rows}</tbody></table>
            <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">开始新赛季</button></div>
        `);
    }

    // ============ AI 自动交易（每日触发）============
    // 每个比赛日尝试 1 笔 AI 交易，赛季约 50-60 笔（接近真实 NBA 频率）
    function runDailyAiTrades() {
        const executed = TradeEngine.runAiTrades(state, 1);
        if (executed.length === 0) return;
        const blockbusters = [];
        executed.forEach(tr => {
            // 记录交易快照（球员可能随后再被交易，故存名称/ovr 而非引用）
            const snapshot = {
                day: state.currentDay,
                year: state.year,
                teamA: tr.teamA,
                teamB: tr.teamB,
                outgoingA: tr.outgoingA.map(p => ({ n: p.n, o: p.o, p: p.p, a: p.a, sal: p.sal })),
                outgoingB: tr.outgoingB.map(p => ({ n: p.n, o: p.o, p: p.p, a: p.a, sal: p.sal })),
                blockbuster: tr.blockbuster,
            };
            state.tradeLog.push(snapshot);
            if (tr.blockbuster) blockbusters.push(snapshot);
        });
        // 重磅交易通知
        if (blockbusters.length > 0) {
            if (isFastSimming) {
                pendingBlockbusters.push(...blockbusters);
            } else {
                showTradeModal(blockbusters);
            }
        }
    }

    // 重磅交易弹窗
    function showTradeModal(trades) {
        const rows = trades.map(tr => {
            const aSide = tr.outgoingA.map(p => `${p.n}(${p.o})`).join(", ");
            const bSide = tr.outgoingB.map(p => `${p.n}(${p.o})`).join(", ");
            return `<tr>
                <td>${teamLogo(tr.teamA,20)} ${teamAbbr(tr.teamA)}</td>
                <td>${aSide}</td>
                <td style="text-align:center">⇄</td>
                <td>${teamLogo(tr.teamB,20)} ${teamAbbr(tr.teamB)}</td>
                <td>${bSide}</td>
            </tr>`;
        }).join("");
        showModal(`
            <div class="modal-title">💥 重磅交易达成！</div>
            <div class="muted">联盟震动 — 以下重磅交易已正式完成</div>
            <table class="mt-20" style="width:100%"><thead><tr><th>球队</th><th>送出</th><th></th><th>球队</th><th>获得</th></tr></thead><tbody>${rows}</tbody></table>
            <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">知道了</button></div>
        `);
    }

    // ============ 交易执行 ============
    function proposeTrade() {
        const myId = state.manager.teamId;
        const partner = tradeState.partner;
        if (!partner) { toast("请选择交易伙伴", "error"); return; }
        if (!tradeState.myOut.length || !tradeState.theirOut.length) { toast("双方需各送出至少一名球员", "error"); return; }
        const myPlayers = state.teamsPlayers[myId];
        const partnerPlayers = state.teamsPlayers[partner];
        // 薪资合规
        const myCheck = TradeEngine.validateSalary(myPlayers, tradeState.myOut, tradeState.theirOut);
        const theirCheck = TradeEngine.validateSalary(partnerPlayers, tradeState.theirOut, tradeState.myOut);
        if (!myCheck.valid) { toast("我方薪资不合规: " + myCheck.reason, "error"); return; }
        if (!theirCheck.valid) { toast("对方薪资不合规: " + theirCheck.reason, "error"); return; }
        // AI 评估（与 AI-vs-AI 交易使用同一套评估逻辑，玩家方阈值略宽: score >= 0 即可接受）
        const record = state.records[partner];
        const winRate = record.win + record.loss > 0 ? record.win/(record.win+record.loss) : 0.5;
        const evalRes = TradeEngine.evaluateTradeForTeam(partnerPlayers, tradeState.theirOut, tradeState.myOut, { record: { winRate } });
        if (evalRes.score < 0) {
            toast(`${teamAbbr(partner)} 拒绝了交易: ${evalRes.reason}`, "error");
            return;
        }
        // 执行（传入 state.year 用于跨季冷却标记）
        TradeEngine.executeTradeWithIds(myPlayers, partnerPlayers, tradeState.myOut.slice(), tradeState.theirOut.slice(), myId, partner, state.year);
        // 记入交易日志
        const snapshot = {
            day: state.currentDay, year: state.year, teamA: myId, teamB: partner,
            outgoingA: tradeState.myOut.map(p => ({ n: p.n, o: p.o, p: p.p, a: p.a, sal: p.sal })),
            outgoingB: tradeState.theirOut.map(p => ({ n: p.n, o: p.o, p: p.p, a: p.a, sal: p.sal })),
            blockbuster: [...tradeState.myOut, ...tradeState.theirOut].some(p => p.o >= 85),
            isPlayer: true,
        };
        state.tradeLog.push(snapshot);
        state.tradeCount = (state.tradeCount || 0) + 1;
        toast(`交易完成! 获得 ${tradeState.theirOut.map(p=>p.n).join(", ")}`, "success");
        checkAchievements("trade", { incoming: tradeState.theirOut.slice() });
        tradeState = { partner: null, myOut: [], theirOut: [] };
        renderAll();
        autoSave();
    }

    // ============ 自由球员签约 ============
    function signFreeAgent(faId) {
        const myId = state.manager.teamId;
        const myPlayers = state.teamsPlayers[myId];
        if (myPlayers.length >= 15) { toast("名单已满", "error"); return; }
        const idx = state.freeAgents.findIndex(p => p.id === faId);
        if (idx === -1) return;
        const player = state.freeAgents[idx];
        const res = SeasonEngine.signFreeAgent(myPlayers, player);
        if (res.ok) {
            player.t = myId;
            player.isFreeAgent = false;
            state.freeAgents.splice(idx, 1);
            // 修复：来自 releasePlayer/落选新秀/被裁球员已在 state.players 中，避免重复 push
            // 仅 generateFreeAgents 生成的纯随机 FA 不在 state.players，需要 push
            if (!state.players.find(p => p.id === player.id)) {
                state.players.push(player);
            }
            toast(`签约 ${player.n} (${player.o} OVR)`, "success");
            checkAchievements("signing", { player });
            renderAll();
            autoSave();
        } else {
            toast(res.reason, "error");
        }
    }

    // ============ 事件绑定 ============
    function bindViewEvents() {
        // 球员详情（跳过带 data-remove 的交易移除按钮，避免点击 ✕ 时同时弹出详情；
        //           跳过对比复选框，交给 .ps-cmp 处理）
        document.querySelectorAll("[data-pid]").forEach(el => {
            el.addEventListener("click", (e) => {
                if (el.dataset.remove) return; // 交易移除按钮，交给 data-remove 处理
                if (el.classList && el.classList.contains("ps-cmp")) return; // 对比复选框
                showPlayerDetail(el.dataset.pid);
            });
        });
        // 球队详情（排名表/联盟总览中点击球队名）
        document.querySelectorAll("[data-teamid]").forEach(el => {
            el.addEventListener("click", () => showTeamDetail(el.dataset.teamid));
        });
        // 交易
        const partnerSel = document.getElementById("trade-partner");
        if (partnerSel) partnerSel.addEventListener("change", e => { tradeState.partner = e.target.value || null; tradeState.theirOut = []; renderView("trade"); });
        document.querySelectorAll("[data-addmy]").forEach(el => el.addEventListener("click", () => {
            const p = state.teamsPlayers[state.manager.teamId].find(x => x.id === el.dataset.addmy);
            if (p) { tradeState.myOut.push(p); renderView("trade"); }
        }));
        document.querySelectorAll("[data-addtheir]").forEach(el => el.addEventListener("click", () => {
            const p = state.teamsPlayers[tradeState.partner].find(x => x.id === el.dataset.addtheir);
            if (p) { tradeState.theirOut.push(p); renderView("trade"); }
        }));
        document.querySelectorAll("[data-remove]").forEach(el => el.addEventListener("click", () => {
            const slot = el.dataset.remove; const pid = el.dataset.pid;
            if (slot === "myout") tradeState.myOut = tradeState.myOut.filter(p => p.id !== pid);
            else tradeState.theirOut = tradeState.theirOut.filter(p => p.id !== pid);
            renderView("trade");
        }));
        const proposeBtn = document.getElementById("propose-trade");
        if (proposeBtn) proposeBtn.addEventListener("click", proposeTrade);
        // 自由球员
        document.querySelectorAll(".sign-fa").forEach(el => el.addEventListener("click", () => signFreeAgent(el.dataset.faid)));
        // 选秀
        document.querySelectorAll(".draft-pick").forEach(el => el.addEventListener("click", () => userDraftPick(el.dataset.rid)));
        const autoToMine = document.getElementById("draft-auto-to-mine");
        if (autoToMine) autoToMine.addEventListener("click", () => autoAdvanceDraft());
        const skipRest = document.getElementById("draft-skip-rest");
        if (skipRest) skipRest.addEventListener("click", () => {
            if (confirm("跳过剩余选秀？AI 将自动完成所有未选顺位。")) skipRemainingDraft();
        });
        // 数据看板榜单切换
        document.querySelectorAll(".stats-tab").forEach(el => el.addEventListener("click", () => {
            statsTab = el.dataset.statstab;
            renderView("stats");
        }));
        // 球员搜索视图：搜索/筛选/排序 + 行点击
        const psQ = document.getElementById("ps-q");
        if (psQ) {
            let psTimer = null;
            psQ.addEventListener("input", e => {
                clearTimeout(psTimer);
                psTimer = setTimeout(() => {
                    playerSearchFilter.q = e.target.value.trim();
                    renderView("playersearch");
                    const inp = document.getElementById("ps-q");
                    if (inp) { inp.focus(); inp.value = playerSearchFilter.q; const len = inp.value.length; inp.setSelectionRange(len, len); }
                }, 250);
            });
        }
        const psTeamSel = document.getElementById("ps-team");
        if (psTeamSel) psTeamSel.addEventListener("change", e => { playerSearchFilter.team = e.target.value; renderView("playersearch"); });
        const psSortSel = document.getElementById("ps-sort");
        if (psSortSel) psSortSel.addEventListener("change", e => { playerSearchFilter.sort = e.target.value; renderView("playersearch"); });
        const psPosSel = document.getElementById("ps-pos");
        if (psPosSel) psPosSel.addEventListener("change", e => { playerSearchFilter.pos = e.target.value; renderView("playersearch"); });
        // 球员对比工具：勾选/取消复选框（阻止冒泡避免触发行点击详情），实时更新对比按钮状态
        // 注意：球员 id 是字符串（如 "p_5"），不可转为数字（NaN 会导致去重判断失效）
        document.querySelectorAll(".ps-cmp").forEach(el => {
            el.addEventListener("click", e => e.stopPropagation());
            el.addEventListener("change", e => {
                e.stopPropagation();
                const pid = el.dataset.pid;
                if (el.checked) {
                    if (playerCompareIds.length >= 2) {
                        el.checked = false;
                        toast("最多选择 2 名球员，请先取消其他勾选", "warning");
                        return;
                    }
                    if (!playerCompareIds.includes(pid)) playerCompareIds.push(pid);
                } else {
                    playerCompareIds = playerCompareIds.filter(id => id !== pid);
                }
                const btn = document.getElementById("ps-compare-btn");
                if (btn) {
                    btn.textContent = `⚖️ 对比 (${playerCompareIds.length}/2)`;
                    btn.disabled = playerCompareIds.length !== 2;
                }
            });
        });
        const psCmpBtn = document.getElementById("ps-compare-btn");
        if (psCmpBtn) psCmpBtn.addEventListener("click", () => {
            if (playerCompareIds.length === 2) showPlayerCompare(playerCompareIds[0], playerCompareIds[1]);
        });
        // 仪表盘：夺冠概率模拟器 / 成就墙
        const oddsBtn = document.getElementById("title-odds-btn");
        if (oddsBtn) oddsBtn.addEventListener("click", showTitleOddsModal);
        const achBtn = document.getElementById("ach-btn");
        if (achBtn) achBtn.addEventListener("click", showAchievementsModal);
        const trainBtn = document.getElementById("training-btn");
        if (trainBtn) trainBtn.addEventListener("click", showTrainingModal);
        // AI 报价收件箱：审阅按钮
        document.querySelectorAll("[data-offerview]").forEach(el => {
            el.addEventListener("click", () => showAIOfferModal(el.dataset.offerview));
        });
    }

    // ============ 球队详情弹窗（查看任意球队球员名单 + 赛季场均）============
    function showTeamDetail(teamId) {
        const t = teamObj(teamId);
        if (!t) return;
        const myId = state.manager.teamId;
        const isMine = teamId === myId;
        const players = state.teamsPlayers[teamId] || [];
        const r = state.records[teamId] || { win: 0, loss: 0 };
        const rating = SimEngine.teamRating(players);
        const salary = TradeEngine.teamSalary(players);
        const acc = state.statAccum[teamId] || {};

        // 按位置再按能力排序
        const order = { PG:1, SG:2, SF:3, PF:4, C:5 };
        const sorted = players.slice().sort((a, b) => {
            if (order[a.p] !== order[b.p]) return order[a.p] - order[b.p];
            return b.o - a.o;
        });

        const rows = sorted.map(p => {
            const s = acc[p.id];
            let statCols;
            if (s && s.gp > 0) {
                statCols = `<td class="num">${s.gp}</td><td class="num"><b>${(s.pts/s.gp).toFixed(1)}</b></td><td class="num">${(s.reb/s.gp).toFixed(1)}</td><td class="num">${(s.ast/s.gp).toFixed(1)}</td><td class="num">${s.fga>0?((s.fgm/s.fga)*100).toFixed(0):"-"}%</td><td class="num">${s.tpa>0?((s.tpm/s.tpa)*100).toFixed(0):"-"}%</td>`;
            } else {
                statCols = `<td class="num muted">-</td><td class="num muted">-</td><td class="num muted">-</td><td class="num muted">-</td><td class="num muted">-</td><td class="num muted">-</td>`;
            }
            const tags = [];
            if (p.isRookie) tags.push('<span class="tag tag-rookie">新秀</span>');
            if (p.o >= 90) tags.push('<span class="tag tag-star">球星</span>');
            return `<tr data-pid="${p.id}">
                <td><div class="player-row"><div class="player-ovr ${ovrClass(p.o)}">${p.o}</div><div><div class="player-name">${p.n}</div><div class="player-pos">${tags.join(" ")||'&nbsp;'}</div></div></div></td>
                <td class="pos-${p.p}">${p.p}</td>
                <td class="num">${p.a}</td>
                ${statCols}
                <td class="num">$${p.sal.toFixed(1)}M</td>
            </tr>`;
        }).join("");

        showModal(`
            <div class="modal-title">
                <div style="display:flex;align-items:center;gap:12px">
                    <div class="team-detail-logo">${teamLogo(teamId, 64)}</div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:18px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.city}${t.name} ${isMine?'<span class="tag tag-rookie" style="margin-left:4px">我的球队</span>':''}</div>
                        <div style="font-size:12px;color:var(--text-dim);font-weight:400">${t.abbr} · ${t.conf==="East"?"东部":"西部"} · ${t.div}赛区</div>
                    </div>
                </div>
            </div>
            <div class="stat-grid" style="margin-bottom:14px">
                <div class="stat-box"><div class="value">${r.win}-${r.loss}</div><div class="label">战绩</div></div>
                <div class="stat-box"><div class="value">${Math.round(rating)}</div><div class="label">实力</div></div>
                <div class="stat-box"><div class="value" style="font-size:18px">$${salary.toFixed(1)}M</div><div class="label">总薪资</div></div>
                <div class="stat-box"><div class="value">${players.length}</div><div class="label">球员数</div></div>
            </div>
            <div class="card-title">球员名单与赛季场均 <span class="muted" style="font-size:11px;text-transform:none">点击球员看详情</span></div>
            <div class="table-wrap"><table class="player-table"><thead><tr><th>球员</th><th>位</th><th class="num">年</th><th class="num">场</th><th class="num">分</th><th class="num">板</th><th class="num">助</th><th class="num">命中</th><th class="num">三分</th><th class="num">薪资</th></tr></thead><tbody>${rows}</tbody></table></div>
            <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">关闭</button></div>
        `);
        // modal 内球员行点击事件
        document.querySelectorAll("#modal-box [data-pid]").forEach(el => {
            el.addEventListener("click", () => showPlayerDetail(el.dataset.pid));
        });
    }

    function showPlayerDetail(pid) {
        const p = state.players.find(x => x.id === pid);
        if (!p) return;
        const myId = state.manager.teamId;
        const isMine = p.t === myId;
        const skills = [["内线",p.ins],["投篮",p.sh],["传球",p.pa],["篮板",p.re],["防守",p.de],["运动",p.at],["球商",p.iq]];
        const skillBars = skills.map(([k,v]) => `<div class="skill-bar-row"><div class="skill-bar-label"><span>${k}</span><span><b>${v}</b></span></div><div class="skill-bar-track"><div class="skill-bar-fill" style="width:${v}%"></div></div></div>`).join("");
        const teamStr = p.t ? teamName(p.t) : '自由球员';
        const ageColor = p.a <= 24 ? 'var(--success)' : p.a >= 33 ? 'var(--nba-red-light)' : 'var(--text)';
        // 伤病状态
        const injuryHtml = p.injured ? `<div style="margin-top:10px;padding:8px 12px;background:rgba(231,76,60,0.15);border-radius:8px;color:var(--nba-red-light);font-size:13px">🚑 受伤中，预计缺阵 ${p.injured} 场</div>` : '';
        // 获奖记录：按奖项类型分组，展示获奖年份（替代旧版"每赛季挤一个 badge"）
        // 兼容新旧字段：新字段 allNBAFirst/Second/Third 等，旧字段 allNBA/allDefensive/allRookie
        const awardGroups = {}; // {awardType: Set([year1, year2])}
        const addAward = (type, year) => {
            if (!awardGroups[type]) awardGroups[type] = new Set();
            awardGroups[type].add(year);
        };
        (state.awardsHistory || []).forEach(a => {
            if (a.mvp && a.mvp.player.id === pid) addAward('MVP', a.year);
            if (a.eastMvp && a.eastMvp.player.id === pid) addAward('东部决赛MVP', a.year);
            if (a.westMvp && a.westMvp.player.id === pid) addAward('西部决赛MVP', a.year);
            if (a.dpoy && a.dpoy.player.id === pid) addAward('DPOY', a.year);
            if (a.roy && a.roy.player.id === pid) addAward('ROY', a.year);
            if (a.sixMan && a.sixMan.player.id === pid) addAward('6MOY', a.year);
            if (a.mip && a.mip.player.id === pid) addAward('MIP', a.year);
            // 总决赛 MVP：从 champions 历史中查找
            const champ = state.champions.find(c => c.year === a.year && c.finalsMVP && c.finalsMVP.id === pid);
            if (champ) addAward('总决赛MVP', a.year);
            // 最佳阵容
            if ((a.allNBAFirst || []).includes(pid)) addAward('最佳阵容一阵', a.year);
            else if ((a.allNBASecond || []).includes(pid)) addAward('最佳阵容二阵', a.year);
            else if ((a.allNBAThird || []).includes(pid)) addAward('最佳阵容三阵', a.year);
            else if ((a.allNBA || []).includes(pid)) addAward('最佳阵容', a.year);
            // 防守阵
            if ((a.allDefFirst || []).includes(pid)) addAward('最佳防守一阵', a.year);
            else if ((a.allDefSecond || []).includes(pid)) addAward('最佳防守二阵', a.year);
            else if ((a.allDefensive || []).includes(pid)) addAward('最佳防守阵容', a.year);
            // 新秀阵
            if ((a.allRookieFirst || []).includes(pid)) addAward('新秀一阵', a.year);
            else if ((a.allRookieSecond || []).includes(pid)) addAward('新秀二阵', a.year);
            else if ((a.allRookie || []).includes(pid)) addAward('新秀阵容', a.year);
        });
        // 总冠军：球员当年所在球队 = 冠军球队
        // champions.year 是"赛季起始年"，playerHistory.year 是"赛季结束年"，需 +1 对齐
        // 判断依据：该年 playerHistory 记录中存在 teamId = 冠军队（支持赛季中交易，只要该年在冠军队打过即算）
        // 当前赛季总冠军刚产生（playerHistory 尚未记录）时，用 p.t === c.team 兜底
        (state.champions || []).forEach(c => {
            const endYear = c.year + 1;
            const inChampTeam = ((state.playerHistory || {})[pid] || []).some(h => h.year === endYear && h.teamId === c.team)
                || (p.t === c.team && state.year === c.year);
            if (inChampTeam) addAward('总冠军', c.year);
        });
        // 按奖项重要性排序展示
        const awardOrder = ['总冠军', 'MVP', '总决赛MVP', '东部决赛MVP', '西部决赛MVP', 'DPOY', 'ROY', '6MOY', 'MIP',
            '最佳阵容一阵', '最佳阵容二阵', '最佳阵容三阵', '最佳防守一阵', '最佳防守二阵', '新秀一阵', '新秀二阵'];
        const awardIcons = { 总冠军:'💍', MVP:'🏆', 总决赛MVP:'🏆', 东部决赛MVP:'🏆', 西部决赛MVP:'🏆', DPOY:'🛡️', ROY:'🌟', '6MOY':'🔥', MIP:'📈' };
        const fmtYear = (y) => `${y}-${String(y+1).slice(2)}`;
        const awardCards = awardOrder.filter(t => awardGroups[t]).map(t => {
            const years = [...awardGroups[t]].sort((a, b) => b - a);
            const icon = awardIcons[t] || '🏅';
            const count = years.length;
            const yearsStr = years.map(fmtYear).join('、');
            return `<div class="award-card">
                <span class="award-icon">${icon}</span>
                <span class="award-type">${t}</span>
                ${count > 1 ? `<span class="award-count">×${count}</span>` : ''}
                <span class="award-years">${yearsStr}</span>
            </div>`;
        }).join('');
        const awardHtml = awardCards ? `<div class="awards-list">${awardCards}</div>` : '';

        // ===== 合并生涯数据：真实NBA历史 + 游戏内赛季 =====
        // 1. 收集游戏内赛季数据：playerHistory（历史赛季）+ statAccum（当前赛季）
        //    支持交易后按球队分别显示：同一赛季可能有多条记录（每队一条）
        const gameSeasons = [];
        const hist = (state.playerHistory || {})[pid] || [];
        hist.forEach(h => {
            gameSeasons.push({
                year: h.year,
                age: h.age,
                ovr: h.ovr,
                teamId: h.teamId,
                gp: h.gp,
                min: h.min || 0,
                pts: h.pts,
                reb: h.reb,
                ast: h.ast,
                stl: h.stl || 0,
                blk: h.blk || 0,
                tov: h.tov || 0,
                fgm: h.fgm || 0,
                fga: h.fga || 0,
                tpm: h.tpm || 0,
                tpa: h.tpa || 0,
                ftm: h.ftm || 0,
                fta: h.fta || 0,
                fg_pct: h.fg_pct || 0,
                fg3_pct: h.fg3_pct || 0,
                ft_pct: h.ft_pct || 0,
            });
        });
        // 当前赛季数据追加：遍历所有球队查找该球员数据（支持赛季中交易，分别记录）
        state.teams.forEach(t => {
            const cur = state.statAccum[t.id] && state.statAccum[t.id][pid];
            if (!cur || cur.gp === 0) return;
            const gp = cur.gp;
            const div = (v) => +(v / Math.max(1, gp)).toFixed(1);
            // year 用"赛季结束年"语义（state.year+1），与真实数据/recordPlayerHistory 一致
            gameSeasons.push({
                year: state.year + 1,
                age: p.a,
                ovr: p.o,
                teamId: t.id,
                gp: gp,
                min: div(cur.min),
                pts: div(cur.pts),
                reb: div(cur.reb),
                ast: div(cur.ast),
                stl: div(cur.stl),
                blk: div(cur.blk),
                tov: div(cur.tov),
                fgm: div(cur.fgm),
                fga: div(cur.fga),
                tpm: div(cur.tpm),
                tpa: div(cur.tpa),
                ftm: div(cur.ftm),
                fta: div(cur.fta),
                fg_pct: cur.fga > 0 ? +(cur.fgm / cur.fga).toFixed(3) : 0,
                fg3_pct: cur.tpa > 0 ? +(cur.tpm / cur.tpa).toFixed(3) : 0,
                ft_pct: cur.fta > 0 ? +(cur.ftm / cur.fta).toFixed(3) : 0,
            });
        });
        // 2. 渲染统一的生涯数据区块
        const careerHtml = renderMergedCareerHtml(p, gameSeasons);

        showModal(`
            <div class="modal-title">
                <div style="display:flex;align-items:center;gap:12px">
                    <div class="player-ovr ${ovrClass(p.o)}" style="width:50px;height:50px;font-size:20px">${p.o}</div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:18px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.n} ${p.injured?'🚑':''}</div>
                        <div style="font-size:12px;color:var(--text-dim);font-weight:400"><span class="pos-${p.p}">${p.p}</span> · ${p.t ? teamLogo(p.t, 20) + ' ' : ''}${teamStr}</div>
                    </div>
                </div>
            </div>
            ${injuryHtml}
            ${awardHtml}
            <div class="stat-grid" style="margin-bottom:14px">
                <div class="stat-box"><div class="value" style="color:${ageColor};font-size:20px">${p.a}</div><div class="label">年龄</div></div>
                <div class="stat-box"><div class="value" style="font-size:18px">$${p.sal.toFixed(1)}M</div><div class="label">薪资</div></div>
                <div class="stat-box"><div class="value" style="color:var(--gold);font-size:20px">${p.pot||p.o}</div><div class="label">潜力上限</div></div>
                <div class="stat-box"><div class="value" style="font-size:18px;display:flex;align-items:center;justify-content:center;gap:6px">${p.t ? teamLogo(p.t, 20) + teamAbbr(p.t) : 'FA'}</div><div class="label">所属</div></div>
            </div>
            <div class="card-title">能力雷达</div>
            ${skillBars}
            ${careerHtml}
            ${isMine ? `<div class="modal-actions"><button class="btn" onclick="App.releasePlayer('${pid}')">释放球员</button><button class="btn btn-primary" onclick="App.closeModal()">关闭</button></div>` : `<div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">关闭</button></div>`}
        `);
    }

    // 渲染生涯数据区块（纯游戏内数据）
    // 修复 v11：移除 NBA 真实数据合并，仅展示游戏内模拟数据
    function renderMergedCareerHtml(p, gameSeasons) {
        if (gameSeasons.length === 0) {
            return `<div class="card-title mt-20">职业生涯数据</div>
                <div class="muted center" style="padding:14px;background:var(--bg-elevated);border-radius:8px;font-size:12px">暂无生涯数据（新赛季开始后才有）</div>`;
        }

        // 生涯汇总
        const gp = gameSeasons.reduce((s, x) => s + (x.gp || 0), 0);
        const seasons = gameSeasons.length;
        const wGp = gameSeasons.filter(x => x.gp > 0);
        const avg = (k) => wGp.length ? (wGp.reduce((s, x) => s + (x[k] || 0) * (x.gp || 0), 0) / Math.max(1, wGp.reduce((s, x) => s + (x.gp || 0), 0))).toFixed(1) : '0.0';
        const career = {
            gp, seasons,
            pts: avg('pts'), reb: avg('reb'), ast: avg('ast'),
            stl: avg('stl'), blk: avg('blk'),
            fg_pct: wGp.length ? (wGp.reduce((s,x)=>s+(x.fgm||0)*(x.gp||0),0)/Math.max(1,wGp.reduce((s,x)=>s+(x.fga||0)*(x.gp||0),0))) : 0,
            fg3_pct: wGp.length ? (wGp.reduce((s,x)=>s+(x.tpm||0)*(x.gp||0),0)/Math.max(1,wGp.reduce((s,x)=>s+(x.tpa||0)*(x.gp||0),0))) : 0,
            ft_pct: wGp.length ? (wGp.reduce((s,x)=>s+(x.ftm||0)*(x.gp||0),0)/Math.max(1,wGp.reduce((s,x)=>s+(x.fta||0)*(x.gp||0),0))) : 0,
        };

        // 球员基本信息（游戏内字段）
        let infoHtml = '';
        if (p.height || p.weight || p.country || p.college || p.draftYear) {
            const draftStr = p.draftYear
                ? (p.draft_round ? `${p.draftYear}年第${p.draft_round}轮 #${p.draft_number}` : `${p.draftYear}年选秀`)
                : '未选秀';
            infoHtml = `
                <div style="display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--text-dim);margin-bottom:10px">
                    ${p.height ? `<span>📏 ${p.height}</span>` : ''}
                    ${p.weight ? `<span>⚖️ ${p.weight}lb</span>` : ''}
                    ${p.college && p.college !== 'None' ? `<span>🎓 ${p.college}</span>` : ''}
                    ${p.country ? `<span>🌐 ${p.country}</span>` : ''}
                    <span>📋 ${draftStr}</span>
                </div>`;
        }

        const careerSummaryHtml = `
            <div class="stat-grid" style="margin-bottom:10px">
                <div class="stat-box"><div class="value" style="color:var(--gold);font-size:18px">${career.gp}</div><div class="label">总场次</div></div>
                <div class="stat-box"><div class="value" style="font-size:16px">${career.seasons}</div><div class="label">赛季数</div></div>
                <div class="stat-box"><div class="value" style="font-size:18px">${career.pts}</div><div class="label">生涯场均分</div></div>
                <div class="stat-box"><div class="value" style="font-size:16px">${career.reb}</div><div class="label">场均板</div></div>
                <div class="stat-box"><div class="value" style="font-size:16px">${career.ast}</div><div class="label">场均助</div></div>
                <div class="stat-box"><div class="value" style="font-size:14px">${career.stl}</div><div class="label">场均断</div></div>
                <div class="stat-box"><div class="value" style="font-size:14px">${career.blk}</div><div class="label">场均帽</div></div>
                <div class="stat-box"><div class="value" style="font-size:14px">${(career.fg_pct*100).toFixed(1)}%</div><div class="label">命中率</div></div>
                <div class="stat-box"><div class="value" style="font-size:14px">${(career.fg3_pct*100).toFixed(1)}%</div><div class="label">三分率</div></div>
                <div class="stat-box"><div class="value" style="font-size:14px">${(career.ft_pct*100).toFixed(1)}%</div><div class="label">罚球率</div></div>
            </div>`;

        // 历年赛季表（最新在上）
        const rows = gameSeasons.slice().reverse().map(s => {
            const teamStr = s.teamId ? teamAbbr(s.teamId) : '-';
            const fgPct = s.fg_pct ? (s.fg_pct*100).toFixed(1)+'%' : '-';
            const fg3Pct = s.fg3_pct ? (s.fg3_pct*100).toFixed(1)+'%' : '-';
            const ftPct = s.ft_pct ? (s.ft_pct*100).toFixed(1)+'%' : '-';
            const ovrCell = s.ovr != null
                ? `<td class="num"><b style="color:${s.ovr>=85?'var(--gold)':s.ovr>=75?'var(--success)':'var(--text)'}">${s.ovr}</b></td>`
                : '<td class="num muted">-</td>';
            return `<tr>
                <td class="num">${s.year-1}-${String(s.year).slice(-2)}</td>
                <td>${teamStr}</td>
                ${ovrCell}
                <td class="num">${s.age||'-'}</td>
                <td class="num">${s.gp||0}</td>
                <td class="num">${s.min? s.min.toFixed(1):'-'}</td>
                <td class="num"><b>${s.pts||0}</b></td>
                <td class="num">${s.reb||0}</td>
                <td class="num">${s.ast||0}</td>
                <td class="num">${s.stl||'-'}</td>
                <td class="num">${s.blk||'-'}</td>
                <td class="num">${fgPct}</td>
                <td class="num">${fg3Pct}</td>
                <td class="num">${ftPct}</td>
            </tr>`;
        }).join('');

        return `
            <div class="card-title mt-20">职业生涯数据 <span class="muted" style="font-size:11px;text-transform:none">🎮游戏内</span></div>
            ${infoHtml}
            ${careerSummaryHtml}
            <div class="table-wrap">
                <table class="stats-table">
                    <thead><tr>
                        <th>赛季</th><th>队</th><th class="num">OVR</th><th class="num">龄</th>
                        <th class="num">场</th><th class="num">分钟</th>
                        <th class="num">分</th><th class="num">板</th><th class="num">助</th>
                        <th class="num">断</th><th class="num">帽</th>
                        <th class="num">FG%</th><th class="num">3P%</th><th class="num">FT%</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    // 已废弃：保留函数避免外部引用报错
    function renderRealCareerHtml(p) {
        return renderMergedCareerHtml(p, []);
    }

    // ============ 球员搜索视图（全联盟在役球员检索，点击查看数据页面）============
    // ============ 球员对比工具 ============
    // 获取球员当前赛季场均数据（聚合所有球队数据，支持赛季中被交易的情况）
    function getPlayerSeasonStats(pid) {
        let gp = 0, pts = 0, reb = 0, ast = 0, fgm = 0, fga = 0;
        (state.teams || []).forEach(t => {
            const s = ((state.statAccum || {})[t.id] || {})[pid];
            if (s) { gp += s.gp || 0; pts += s.pts || 0; reb += s.reb || 0; ast += s.ast || 0; fgm += s.fgm || 0; fga += s.fga || 0; }
        });
        if (!gp) return null;
        return { gp, ppg: pts / gp, rpg: reb / gp, apg: ast / gp, fg: fga > 0 ? fgm / fga : 0 };
    }

    // 球员对比弹窗：基本信息 + 能力镜像条 + 当前赛季数据（优势项高亮）
    function showPlayerCompare(pidA, pidB) {
        const a = state.players.find(x => x.id === pidA);
        const b = state.players.find(x => x.id === pidB);
        if (!a || !b) { toast("球员不存在", "error"); return; }

        // 能力镜像条：左球员从中间向左填充，右球员从中间向右填充
        const skills = [["内线","ins"],["投篮","sh"],["传球","pa"],["篮板","re"],["防守","de"],["运动","at"],["球商","iq"]];
        const skillRows = skills.map(([label, key]) => {
            const va = a[key], vb = b[key];
            const aWin = va > vb, bWin = vb > va;
            return `<div class="cmp-skill-row">
                <div class="cmp-val ${aWin?'cmp-win':''}">${va}</div>
                <div class="cmp-track cmp-left"><div class="cmp-fill cmp-a" style="width:${va}%"></div></div>
                <div class="cmp-label">${label}</div>
                <div class="cmp-track cmp-right"><div class="cmp-fill cmp-b" style="width:${vb}%"></div></div>
                <div class="cmp-val ${bWin?'cmp-win':''}">${vb}</div>
            </div>`;
        }).join("");

        // 当前赛季数据对比（优势项高亮加粗）
        const sa = getPlayerSeasonStats(pidA);
        const sb = getPlayerSeasonStats(pidB);
        const statDefs = [
            ["出场", s => s.gp, v => v.toFixed(0), false],
            ["得分", s => s.ppg, v => v.toFixed(1), true],
            ["篮板", s => s.rpg, v => v.toFixed(1), true],
            ["助攻", s => s.apg, v => v.toFixed(1), true],
            ["命中率", s => s.fg, v => (v*100).toFixed(1)+"%", true],
        ];
        const statRows = statDefs.map(([label, get, fmt, higherBetter]) => {
            const va = sa ? get(sa) : null, vb = sb ? get(sb) : null;
            const aStr = va == null ? '<span class="muted">-</span>' : fmt(va);
            const bStr = vb == null ? '<span class="muted">-</span>' : fmt(vb);
            const aWin = higherBetter && va != null && vb != null && va > vb;
            const bWin = higherBetter && va != null && vb != null && vb > va;
            return `<tr>
                <td class="num ${aWin?'cmp-win-cell':''}">${aStr}</td>
                <td class="cmp-stat-label">${label}</td>
                <td class="num ${bWin?'cmp-win-cell':''}">${bStr}</td>
            </tr>`;
        }).join("");

        // 头部：两名球员并排
        const header = p => `<div style="flex:1;min-width:0;text-align:center">
            <div class="player-ovr ${ovrClass(p.o)}" style="width:46px;height:46px;font-size:18px;margin:0 auto 6px">${p.o}</div>
            <div style="font-weight:800;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.n} ${p.injured?'🚑':''}</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:2px"><span class="pos-${p.p}">${p.p}</span> · ${p.t ? teamLogo(p.t, 16) + teamAbbr(p.t) : '自由球员'}</div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:3px">${p.a}岁 · $${p.sal.toFixed(1)}M · 潜力${p.pot||p.o}</div>
        </div>`;

        showModal(`
            <div class="modal-title">⚖️ 球员对比</div>
            <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:14px;padding:12px;border-radius:10px;background:rgba(255,255,255,0.03)">
                ${header(a)}
                <div style="align-self:center;color:var(--text-dim);font-weight:700">VS</div>
                ${header(b)}
            </div>
            <div class="card-title">能力对比</div>
            ${skillRows}
            <div class="cmp-legend">
                <span><i class="cmp-dot cmp-a"></i>${a.n}</span>
                <span><i class="cmp-dot cmp-b"></i>${b.n}</span>
            </div>
            <div class="card-title mt-20">当前赛季数据</div>
            <div class="table-wrap"><table class="cmp-table"><tbody>${statRows}</tbody></table></div>
            <div class="modal-actions">
                <button class="btn" onclick="App.showPlayerDetail('${a.id}')">查看 ${a.n} 详情</button>
                <button class="btn" onclick="App.showPlayerDetail('${b.id}')">查看 ${b.n} 详情</button>
                <button class="btn btn-primary" onclick="App.closeModal()">关闭</button>
            </div>
        `);
    }

    function renderPlayerSearch() {
        const allTeams = state.teams;
        // 候选：所有在役球员（含自由球员 p.t==null）
        const candidates = (state.players || []).filter(p => !p.isRetired);

        // 球队下拉（含"自由球员"选项）
        const teamOptsHtml = `<option value="">全部球队</option>`
            + `<option value="__FA__" ${playerSearchFilter.team==='__FA__'?'selected':''}>自由球员</option>`
            + allTeams.map(t => `<option value="${t.id}" ${playerSearchFilter.team===t.id?'selected':''}>${t.abbr} ${t.city}${t.name}</option>`).join("");

        // 位置下拉
        const posOpts = ["PG", "SG", "SF", "PF", "C"];
        const posOptsHtml = `<option value="">全部位置</option>`
            + posOpts.map(p => `<option value="${p}" ${playerSearchFilter.pos===p?'selected':''}>${p}</option>`).join("");

        // 排序下拉
        const sortLabels = {
            o: "总评", name: "姓名", age: "年龄", sal: "薪资",
            ins: "内线", sh: "投篮", pa: "传球", re: "篮板", de: "防守", at: "运动", iq: "球商",
        };
        const sortOptsHtml = Object.entries(sortLabels).map(([k, label]) =>
            `<option value="${k}" ${playerSearchFilter.sort===k?'selected':''}>${label}</option>`).join("");

        // 筛选
        let filtered = candidates.filter(p => {
            if (playerSearchFilter.team === '__FA__') {
                if (p.t != null) return false;
            } else if (playerSearchFilter.team) {
                if (p.t !== playerSearchFilter.team) return false;
            }
            if (playerSearchFilter.pos && p.p !== playerSearchFilter.pos) return false;
            if (playerSearchFilter.q) {
                const q = playerSearchFilter.q.toLowerCase();
                if (!p.n.toLowerCase().includes(q)) return false;
            }
            return true;
        });

        // 排序
        const sk = playerSearchFilter.sort;
        filtered.sort((a, b) => {
            if (sk === 'name') return a.n.localeCompare(b.n, 'zh');
            if (sk === 'age') return a.a - b.a;
            return (b[sk] || 0) - (a[sk] || 0);
        });

        // 限制渲染行数（性能 + 体验）
        const MAX_ROWS = 300;
        const shown = filtered.slice(0, MAX_ROWS);
        const rows = shown.map(p => {
            const teamCell = p.t ? teamAbbr(p.t) : 'FA';
            const tags = [];
            if (p.isRookie) tags.push('<span class="tag tag-rookie">新秀</span>');
            if (p.o >= 90) tags.push('<span class="tag tag-star">球星</span>');
            if (p.injured) tags.push('<span class="tag tag-injured">伤</span>');
            // 当前赛季场均（聚合全联盟数据，支持被交易球员）
            const s = getPlayerSeasonStats(p.id);
            const statCells = s
                ? `<td class="num"><b>${s.ppg.toFixed(1)}</b></td><td class="num">${s.rpg.toFixed(1)}</td><td class="num">${s.apg.toFixed(1)}</td>`
                : `<td class="num muted">-</td><td class="num muted">-</td><td class="num muted">-</td>`;
            const checked = playerCompareIds.includes(p.id) ? 'checked' : '';
            return `<tr data-pid="${p.id}">
                <td style="text-align:center"><input type="checkbox" class="ps-cmp" data-pid="${p.id}" ${checked} title="选择对比"></td>
                <td><div class="player-row"><div class="player-ovr ${ovrClass(p.o)}">${p.o}</div><div><div class="player-name">${p.n}</div><div class="player-pos">${tags.join(' ')||'&nbsp;'}</div></div></div></td>
                <td class="pos-${p.p}">${p.p}</td>
                <td>${teamCell}</td>
                <td class="num">${p.a}</td>
                <td class="num">$${p.sal.toFixed(1)}M</td>
                ${statCells}
            </tr>`;
        }).join('');

        const resultHint = filtered.length > MAX_ROWS
            ? `<span class="muted" style="font-size:11px">（仅显示前 ${MAX_ROWS} 条，共 ${filtered.length} 条，请用搜索缩小范围）</span>`
            : `<span class="muted" style="font-size:11px">共 ${filtered.length} 名球员</span>`;

        return `
        <h1 class="page-title">🔍 球员搜索 <span class="muted" style="font-size:12px;font-weight:400">全联盟在役球员</span></h1>
        <div class="card">
            <div class="filter-bar" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center">
                <input type="text" id="ps-q" class="text-input" placeholder="搜索球员姓名" value="${playerSearchFilter.q}" style="flex:1;min-width:160px">
                <select id="ps-team" class="text-input" style="min-width:150px">${teamOptsHtml}</select>
                <select id="ps-pos" class="text-input" style="min-width:100px">${posOptsHtml}</select>
                <select id="ps-sort" class="text-input" style="min-width:120px">${sortOptsHtml}</select>
                <button id="ps-compare-btn" class="btn btn-primary" style="min-width:130px" ${playerCompareIds.length===2?'':'disabled'}>⚖️ 对比 (${playerCompareIds.length}/2)</button>
            </div>
            <div class="card-title" style="margin-top:6px">在役球员名单 <span class="muted" style="font-size:11px;text-transform:none">点击球员查看完整数据 · 勾选两名球员可对比</span> ${resultHint}</div>
            <div class="table-wrap"><table class="player-table"><thead><tr>
                <th>比</th><th>球员</th><th>位</th><th>队</th><th class="num">年</th><th class="num">薪资</th><th class="num">得分</th><th class="num">篮板</th><th class="num">助攻</th>
            </tr></thead><tbody>${rows || `<tr><td colspan="9" class="muted center">无匹配球员</td></tr>`}</tbody></table></div>
        </div>`;
    }

    function releasePlayer(pid) {
        const myId = state.manager.teamId;
        const res = SeasonEngine.releasePlayer(state.teamsPlayers[myId], pid);
        if (res.ok) {
            // 加入自由市场
            state.freeAgents.push(res.player);
            toast(`已释放 ${res.player.n}`, "warning");
            closeModal();
            renderAll();
            autoSave();
        } else {
            toast(res.reason, "error");
        }
    }

    // ============ 通知 ============
    function toast(msg, type = "", duration = 3200) {
        const c = document.getElementById("toast-container");
        const el = document.createElement("div");
        el.className = "toast " + type;
        el.textContent = msg;
        c.appendChild(el);
        setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity 0.4s"; setTimeout(() => el.remove(), 400); }, duration);
    }

    function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    return {
        init, renderView, advance, fastAdvance, closeModal, releasePlayer, showMoreMenu,
        loadState, showSaveManager, showTacticsModal, showAwardsHistory,
        setAwardsView, setAwardsTab, showPlayerDetail, showPlayerCompare,
        acceptAIOffer, rejectAIOffer, showTrainingModal,
        userDraftPick, skipRemainingDraft,
        get state() { return state; },
    };
})();

window.App = App;
