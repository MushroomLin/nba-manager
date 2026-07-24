// 主入口：启动界面逻辑 + 全局事件绑定
(function() {
    let selectedTeam = null;

    // 渲染球队选择网格
    function renderTeamSelect(conf) {
        const grid = document.getElementById("team-select-grid");
        const teams = window.TEAMS_DATA.filter(t => t.conf === conf);
        grid.innerHTML = teams.map(t => `
            <div class="team-select-card" data-team="${t.id}">
                <div class="abbr" style="color:${t.color}">${t.abbr}</div>
                <div class="name">${t.city}${t.name}</div>
            </div>
        `).join("");
        grid.querySelectorAll(".team-select-card").forEach(card => {
            card.addEventListener("click", () => {
                grid.querySelectorAll(".team-select-card").forEach(c => c.classList.remove("selected"));
                card.classList.add("selected");
                selectedTeam = card.dataset.team;
                document.getElementById("start-game-btn").disabled = false;
            });
        });
    }

    // 启动界面事件
    document.querySelectorAll(".conf-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".conf-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            renderTeamSelect(tab.dataset.conf);
        });
    });

    // ============ 存档：启动时检测自动存档 ============
    function refreshContinueBox() {
        const meta = SaveEngine.getAutoMeta();
        const box = document.getElementById("continue-box");
        const info = document.getElementById("continue-info");
        if (meta) {
            box.style.display = "block";
            info.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg-elevated);border-radius:8px">
                    <div style="font-size:22px">🏀</div>
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:700">${meta.teamAbbr} · ${meta.managerName}</div>
                        <div style="font-size:12px;color:var(--text-dim)">${meta.year}-${meta.year+1} ${SaveEngine.phaseLabel(meta.phase)} · ${meta.win}胜${meta.loss}负</div>
                    </div>
                    <div style="font-size:11px;color:var(--text-dim);text-align:right">${SaveEngine.formatTime(meta.savedAt)}</div>
                </div>`;
        } else {
            box.style.display = "none";
        }
    }

    document.getElementById("continue-btn").addEventListener("click", () => {
        const state = SaveEngine.loadAuto();
        if (!state) { alert("自动存档已损坏或不存在"); return; }
        document.getElementById("startup-screen").classList.remove("active");
        document.getElementById("game-screen").classList.add("active");
        App.loadState(state);
    });

    document.getElementById("open-savemgr-btn").addEventListener("click", () => {
        SaveEngineModal.show();
    });

    // 存档管理弹窗（启动界面可用）
    const SaveEngineModal = (() => {
        function render() {
            const autoMeta = SaveEngine.getAutoMeta();
            const slots = SaveEngine.listSlots();

            const autoHtml = autoMeta ? `
                <div class="save-row">
                    <div class="save-info">
                        <div class="save-title">自动存档</div>
                        <div class="save-sub">${autoMeta.teamAbbr} · ${autoMeta.managerName} | ${autoMeta.year}-${autoMeta.year+1} ${SaveEngine.phaseLabel(autoMeta.phase)} · ${autoMeta.win}胜${autoMeta.loss}负</div>
                        <div class="save-time">${SaveEngine.formatTime(autoMeta.savedAt)}</div>
                    </div>
                    <div class="save-actions">
                        <button class="btn btn-sm" data-loadauto>读取</button>
                        <button class="btn btn-sm" data-delauto>删除</button>
                    </div>
                </div>` : `<div class="muted center" style="padding:20px">无自动存档</div>`;

            const slotsHtml = slots.map(s => {
                if (!s.meta) {
                    return `<div class="save-row empty">
                        <div class="save-info"><div class="save-title">存档 ${s.id}</div><div class="save-sub muted">- 空槽位 -</div></div>
                        <div class="save-actions"><span class="muted" style="font-size:12px">空</span></div>
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
                        <button class="btn btn-sm" data-delslot="${s.id}">删除</button>
                    </div>
                </div>`;
            }).join("");

            return `
            <div class="modal-title">📁 存档管理</div>
            <div class="card-title">自动存档</div>
            ${autoHtml}
            <div class="card-title mt-20">手动存档槽</div>
            ${slotsHtml}
            <div class="modal-actions"><button class="btn btn-primary" onclick="App.closeModal()">关闭</button></div>`;
        }

        function bind() {
            const autoLoad = document.querySelector("#modal-box [data-loadauto]");
            if (autoLoad) autoLoad.addEventListener("click", () => {
                const state = SaveEngine.loadAuto();
                if (!state) { alert("读取失败"); return; }
                App.closeModal();
                document.getElementById("startup-screen").classList.remove("active");
                document.getElementById("game-screen").classList.add("active");
                App.loadState(state);
            });
            const autoDel = document.querySelector("#modal-box [data-delauto]");
            if (autoDel) autoDel.addEventListener("click", () => {
                if (confirm("确定删除自动存档？")) { SaveEngine.deleteAuto(); show(); refreshContinueBox(); }
            });
            document.querySelectorAll("#modal-box [data-loadslot]").forEach(el => {
                el.addEventListener("click", () => {
                    const id = +el.dataset.loadslot;
                    const state = SaveEngine.loadSlot(id);
                    if (!state) { alert("读取失败"); return; }
                    App.closeModal();
                    document.getElementById("startup-screen").classList.remove("active");
                    document.getElementById("game-screen").classList.add("active");
                    App.loadState(state);
                });
            });
            document.querySelectorAll("#modal-box [data-delslot]").forEach(el => {
                el.addEventListener("click", () => {
                    const id = +el.dataset.delslot;
                    if (confirm(`确定删除存档 ${id}？`)) { SaveEngine.deleteSlot(id); show(); }
                });
            });
        }

        function show() {
            const box = document.getElementById("modal-box");
            box.innerHTML = render();
            document.getElementById("modal-overlay").classList.add("active");
            setTimeout(bind, 0);
        }
        return { show };
    })();

    document.getElementById("start-game-btn").addEventListener("click", () => {
        if (!selectedTeam) return;
        const name = document.getElementById("manager-name").value.trim() || "GM";
        document.getElementById("startup-screen").classList.remove("active");
        document.getElementById("game-screen").classList.add("active");
        App.init(name, selectedTeam);
    });

    // 侧边导航（桌面）+ 底部导航（手机）
    document.querySelectorAll(".nav-item, .bottombar-item").forEach(btn => {
        btn.addEventListener("click", () => {
            const view = btn.dataset.view;
            if (view === "more") { App.showMoreMenu(); return; }
            App.renderView(view);
        });
    });

    // 推进按钮
    document.getElementById("advance-btn").addEventListener("click", () => App.advance());

    // 模态框点击外部关闭
    document.getElementById("modal-overlay").addEventListener("click", e => {
        if (e.target.id === "modal-overlay") App.closeModal();
    });

    // 初始化默认显示东部
    renderTeamSelect("East");
    refreshContinueBox();
})();
