// ==========================================
// NOTIFICATIONS.JS：鈴聲提示、頂端浮動橫幅、桌面通知與鈴鐺待辦清單
// ==========================================

function injectGlobalToastStyles() {
    if (document.getElementById('globalAlarmToastStyle')) return;
    const style = document.createElement('style');
    style.id = 'globalAlarmToastStyle';
    style.textContent = `
        .global-alarm-toast-container {
            position: fixed;
            top: 16px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 99998;
            display: flex;
            flex-direction: column;
            gap: 10px;
            width: 440px;
            max-width: calc(100vw - 24px);
            pointer-events: none;
        }
        .global-alarm-toast {
            pointer-events: auto;
            background: linear-gradient(135deg, #FF7EA5 0%, #EB5A87 100%);
            color: #FFFFFF;
            border: 2.5px solid #FFFFFF;
            border-radius: 18px;
            padding: 11px 14px;
            box-shadow: 0 10px 26px rgba(92, 61, 46, 0.32);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            animation: globalToastSlideDown 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .global-alarm-toast.acc-z {
            background: linear-gradient(135deg, #F7B733 0%, #E69A15 100%);
        }
        .global-alarm-toast.acc-p {
            background: linear-gradient(135deg, #58C984 0%, #38A866 100%);
        }
        .global-alarm-toast-left {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
            flex: 1;
        }
        .global-alarm-toast-emoji {
            font-size: 26px;
            line-height: 1;
            flex-shrink: 0;
            background: rgba(255, 255, 255, 0.25);
            width: 38px;
            height: 38px;
            border-radius: 12px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .global-alarm-toast-text {
            font-size: 14.5px;
            font-weight: 800;
            line-height: 1.3;
            text-shadow: 0 1px 2px rgba(92, 61, 46, 0.25);
        }
        .global-alarm-toast-actions {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
        }
        .btn-toast-open {
            background: #FFFFFF;
            color: #5C3D2E;
            border: none;
            border-radius: 999px;
            padding: 5px 11px;
            font-size: 12.5px;
            font-weight: 800;
            cursor: pointer;
            white-space: nowrap;
            box-shadow: 0 2px 5px rgba(92, 61, 46, 0.16);
        }
        .btn-toast-open:hover {
            transform: scale(1.04);
        }
        .btn-toast-close {
            background: rgba(255, 255, 255, 0.25);
            color: #FFFFFF;
            border: 1.5px solid rgba(255, 255, 255, 0.75);
            border-radius: 50%;
            width: 26px;
            height: 26px;
            font-size: 13px;
            font-weight: 800;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        @keyframes globalToastSlideDown {
            from { opacity: 0; transform: translateY(-18px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
    `;
    document.head.appendChild(style);
}

function showGlobalAlarmBanner(eventObj) {
    injectGlobalToastStyles();
    let container = document.getElementById('globalAlarmToastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'globalAlarmToastContainer';
        container.className = 'global-alarm-toast-container';
        document.body.appendChild(container);
    }

    const toastId = `toast_${eventObj.id}`;
    if (document.getElementById(toastId)) return;

    const accId = eventObj.accId || 'z';
    const emoji = getCategoryEmoji(eventObj.category, eventObj.message);
    const cleanMsg = String(eventObj.message).replace(/\s*(⚔️|🔬|📖|☀️|🏛️)\s*/g, ' ').replace(/\s+/g, ' ').trim();

    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `global-alarm-toast acc-${accId}`;
    toast.innerHTML = `
        <div class="global-alarm-toast-left">
            <span class="global-alarm-toast-emoji">${emoji}</span>
            <div class="global-alarm-toast-text">${cleanMsg}</div>
        </div>
        <div class="global-alarm-toast-actions">
            <button type="button" class="btn-toast-open">查看待辦</button>
            <button type="button" class="btn-toast-close" title="關閉提示">✕</button>
        </div>
    `;

    const openBtn = toast.querySelector('.btn-toast-open');
    const closeBtn = toast.querySelector('.btn-toast-close');

    if (openBtn) {
        openBtn.onclick = () => {
            toast.remove();
            const navDrop = document.getElementById('navDropdown');
            if (navDrop) navDrop.classList.remove('open');
            const bellDrop = document.getElementById('notifDropdown');
            if (bellDrop) {
                bellDrop.classList.add('open');
                renderBellUI();
            }
        };
    }
    if (closeBtn) {
        closeBtn.onclick = () => toast.remove();
    }

    container.prepend(toast);
    while (container.children.length > 3) {
        container.lastElementChild.remove();
    }
}

async function ensureAudioContextUnlocked() {
    try {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) audioCtx = new AudioContext();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }
    } catch (e) {}
}

function setupGlobalAudioUnlock() {
    const unlockHandler = () => {
        ensureAudioContextUnlocked();
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(evtName => {
        document.addEventListener(evtName, unlockHandler, { passive: true });
    });
}

async function playSingleChime() {
    try {
        await ensureAudioContextUnlocked();
        if (!audioCtx || audioCtx.state !== 'running') return;
        const notes = [523.25, 659.25, 783.99, 1046.50];
        const now = audioCtx.currentTime;
        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.12);
            gain.gain.setValueAtTime(0.001, now + idx * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.22, now + idx * 0.12 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.45);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + idx * 0.12);
            osc.stop(now + idx * 0.12 + 0.5);
        });
    } catch (e) {}
}

function startRinging() {
    playSingleChime();
    if (ringInterval) return;
    ringInterval = setInterval(() => {
        const unreadCount = notifHistory.filter(n => n.unread).length;
        if (unreadCount > 0) {
            playSingleChime();
        } else {
            stopRinging();
        }
    }, 8000);
}

function stopRinging() {
    if (ringInterval) {
        clearInterval(ringInterval);
        ringInterval = null;
    }
}

function updateNotifBadgeUI() {
    const badge = document.getElementById('notifBadge');
    if (!badge || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        badge.classList.add('granted');
        badge.innerText = '🔔 桌面彈窗已開啟';
    } else if (Notification.permission === 'denied') {
        badge.innerText = '🔕 桌面通知已封鎖';
    } else {
        badge.innerText = '🔔 點擊開啟右下角桌面彈窗';
    }
}

function requestDesktopNotificationPermission() {
    ensureAudioContextUnlocked();
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(() => updateNotifBadgeUI());
    }
}

function sendDesktopNotification(title, body, tagId = '') {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        try {
            const n = new Notification(title, {
                body: body,
                icon: './assets/chara_face_1-1.png',
                tag: tagId || `alarm_${Date.now()}`,
                renotify: true,
                requireInteraction: true
            });
            activeSystemNotifications.push(n);
            n.onclick = () => {
                window.focus();
                const navDrop = document.getElementById('navDropdown');
                if (navDrop) navDrop.classList.remove('open');
                const bellDrop = document.getElementById('notifDropdown');
                if (bellDrop) {
                    bellDrop.classList.add('open');
                    renderBellUI();
                }
                n.close();
            };
        } catch (e) {}
    } else if (Notification.permission === 'default') {
        Notification.requestPermission().then((perm) => {
            updateNotifBadgeUI();
            if (perm === 'granted') {
                sendDesktopNotification(title, body, tagId);
            }
        });
    }
}

function testAlarm() {
    ensureAudioContextUnlocked();
    playSingleChime();
    const nowMs = getAccurateNow().getTime();
    const msg = `【測試】 [${getDisplayAccountName('z')}] 士兵訓練 已完成！`;
    const evObj = {
        id: `test_${nowMs}`,
        accId: 'z',
        category: 'soldiers',
        itemId: null,
        message: msg,
        timestamp: nowMs,
        unread: true
    };
    sendDesktopNotification('⏰ 遊戲鬧鐘測試提醒', msg, evObj.id);
    showGlobalAlarmBanner(evObj);
    pushNotificationEvent(evObj, false);
    const drop = document.getElementById('notifDropdown');
    if (drop) drop.classList.add('open');
}

// 待辦清單 & 提醒紀錄系統
function loadNotifHistory() {
    try {
        const raw = localStorage.getItem(NOTIF_HISTORY_KEY);
        if (raw) notifHistory = JSON.parse(raw) || [];
    } catch (e) {
        notifHistory = [];
    }
    notifHistory.forEach(n => {
        if (n && n.id) triggeredEventKeys.add(n.id);
    });
    renderBellUI();
}

function saveNotifHistory() {
    try {
        localStorage.setItem(NOTIF_HISTORY_KEY, JSON.stringify(notifHistory.slice(0, 40)));
    } catch (e) {}
}

function pushNotificationEvent(eventObj, shouldAlert = true) {
    if (!eventObj || !eventObj.id) return;
    if (notifHistory.some(n => n.id === eventObj.id)) return;

    notifHistory.unshift({
        id: eventObj.id,
        accId: eventObj.accId || 'z',
        category: eventObj.category || 'soldiers',
        itemId: eventObj.itemId ?? null,
        recommendedTime: eventObj.recommendedTime || '',
        message: eventObj.message,
        timestamp: eventObj.timestamp || getAccurateNow().getTime(),
        unread: true
    });

    saveNotifHistory();
    renderBellUI();

    if (shouldAlert) {
        startRinging();
        showGlobalAlarmBanner(eventObj);
        sendDesktopNotification('⏰ 遊戲鬧鐘提醒', eventObj.message, eventObj.id);
    }
}

function toggleBellDropdown(event) {
    if (event) event.stopPropagation();
    ensureAudioContextUnlocked();
    const navDrop = document.getElementById('navDropdown');
    if (navDrop) navDrop.classList.remove('open');

    const drop = document.getElementById('notifDropdown');
    if (drop) {
        drop.classList.toggle('open');
        if (drop.classList.contains('open')) renderBellUI();
    }
}

function toggleTodoDone(notifId) {
    const item = notifHistory.find(n => n.id === notifId);
    if (!item) return;
    item.unread = !item.unread;
    const toastEl = document.getElementById(`toast_${notifId}`);
    if (toastEl && !item.unread) toastEl.remove();
    saveNotifHistory();
    renderBellUI();
    if (notifHistory.filter(n => n.unread).length === 0) stopRinging();
}

function markAllNotifsRead() {
    notifHistory.forEach(n => { n.unread = false; });
    const container = document.getElementById('globalAlarmToastContainer');
    if (container) container.innerHTML = '';
    saveNotifHistory();
    renderBellUI();
    stopRinging();
}

function clearAllNotifs() {
    notifHistory = notifHistory.filter(n => n.unread);
    saveNotifHistory();
    renderBellUI();
}

function formatRelativeAgo(timestampMs) {
    const diffSec = Math.max(0, Math.floor((getAccurateNow().getTime() - timestampMs) / 1000));
    if (diffSec < 60) return "剛剛";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} 分鐘前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} 小時 ${diffMin % 60} 分前`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay} 天前`;
}

function getCategoryEmoji(category, message = '') {
    if (category === 'job_soldier' || category === 'job_tech' || category === 'cooldown_soldier' || category === 'cooldown_tech' || message.includes('職位')) return '🏛️';
    if (category === 'soldiers') return '⚔️';
    if (category === 'tech') return '🔬';
    if (category === 'master') return '📖';
    if (category === 'sunlight') return '☀️';
    if (message.includes('科技')) return '🔬';
    if (message.includes('大師')) return '📖';
    if (message.includes('沐光')) return '☀️';
    return '⚔️';
}

function inferAccIdFromMessage(msg) {
    if (!msg) return 'z';
    if (msg.includes(getDisplayAccountName('h')) || msg.includes('[h]')) return 'h';
    if (msg.includes(getDisplayAccountName('p')) || msg.includes('[p]')) return 'p';
    return 'z';
}

function getDefaultDurationForCategory(accId, category, itemId) {
    if (category === 'master') return { d: 0, h: 0, m: 10 };
    if (category === 'sunlight') return { d: 0, h: 8, m: 0 };
    return { d: 0, h: 0, m: 0 };
}

function autoJumpTodoInput(event, inputEl, nextIdStr) {
    if (!nextIdStr) return;
    if (event && ['Tab', 'Shift', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete', 'Enter'].includes(event.key)) return;
    const clean = inputEl.value.replace(/\D/g, '');
    if (clean.length >= 2) {
        const nextEl = document.getElementById(nextIdStr);
        if (nextEl) {
            nextEl.focus();
            nextEl.select();
        }
    }
}

function handleTodoArrowNav(event, prevIdStr, nextIdStr, idx, notifId, accId, category, itemId) {
    if (event.key === 'ArrowLeft' && prevIdStr) {
        event.preventDefault();
        const prevEl = document.getElementById(prevIdStr);
        if (prevEl) { prevEl.focus(); prevEl.select(); }
    } else if (event.key === 'ArrowRight' && nextIdStr) {
        event.preventDefault();
        const nextEl = document.getElementById(nextIdStr);
        if (nextEl) { nextEl.focus(); nextEl.select(); }
    } else if (event.key === 'Enter') {
        event.preventDefault();
        submitTodoCustomRound(idx, notifId, accId, category, itemId);
    }
}

function startNewRoundFromTodo(notifId, accId, category, itemId, d, h, m) {
    const totalMs = ((d * 24 + h) * 60 + m) * 60 * 1000;
    if (totalMs <= 0) {
        alert('請先輸入新一輪的倒數時間！');
        return;
    }

    if (store[accId] && Array.isArray(store[accId][category])) {
        let target = itemId ? store[accId][category].find(it => it.id === itemId) : null;
        if (!target) target = store[accId][category][0];
        if (target) {
            target.d = d;
            target.h = h;
            target.m = m;
            const endDate = new Date(getAccurateNow().getTime() + totalMs);
            target.endTime = endDate;
            if (category === 'soldiers' && typeof autoSyncJobFromTimer === 'function') {
                autoSyncJobFromTimer(accId, 'soldier', endDate);
            }
            if (category === 'tech' && typeof autoSyncJobFromTimer === 'function') {
                autoSyncJobFromTimer(accId, 'tech', endDate);
            }
        }
    }

    const notifItem = notifHistory.find(n => n.id === notifId);
    if (notifItem) notifItem.unread = false;
    const toastEl = document.getElementById(`toast_${notifId}`);
    if (toastEl) toastEl.remove();

    saveNotifHistory();
    renderBellUI();
    if (notifHistory.filter(n => n.unread).length === 0) stopRinging();

    if (typeof renderGrid === 'function') renderGrid();
    if (typeof updateTimeline === 'function') updateTimeline(true);
    saveState();
}

function submitTodoCustomRound(idx, notifId, accId, category, itemId) {
    const d = parseInt(document.getElementById(`todo_d_${idx}`)?.value, 10) || 0;
    const h = parseInt(document.getElementById(`todo_h_${idx}`)?.value, 10) || 0;
    const m = parseInt(document.getElementById(`todo_m_${idx}`)?.value, 10) || 0;
    startNewRoundFromTodo(notifId, accId, category, itemId, d, h, m);
}

function confirmJobFromTodo(notifId, accId, jType, timeStr) {
    if (!timeStr) {
        alert('請先選擇預約時段！');
        return;
    }
    if (typeof setJobTime === 'function') {
        setJobTime(accId, jType, timeStr, true);
    }
    const notifItem = notifHistory.find(n => n.id === notifId);
    if (notifItem) notifItem.unread = false;
    const toastEl = document.getElementById(`toast_${notifId}`);
    if (toastEl) toastEl.remove();

    saveNotifHistory();
    renderBellUI();
    if (notifHistory.filter(n => n.unread).length === 0) stopRinging();
}

function submitTodoJobConfirm(idx, notifId, accId, jType) {
    const sel = document.getElementById(`todo_job_sel_${idx}`);
    confirmJobFromTodo(notifId, accId, jType, sel ? sel.value : '');
}

function renderBellUI() {
    const unreadCount = notifHistory.filter(n => n.unread).length;
    const badge = document.getElementById('bellCountBadge');
    const bellBtn = document.getElementById('bellBtn');
    const listEl = document.getElementById('notifDropdownList');

    document.title = unreadCount > 0 ? `(${unreadCount}) 🔔 ${ORIGINAL_TITLE}` : ORIGINAL_TITLE;

    if (badge) {
        if (unreadCount > 0) {
            badge.style.display = 'inline-flex';
            badge.innerText = unreadCount > 99 ? '99+' : unreadCount;
        } else {
            badge.style.display = 'none';
        }
    }

    if (bellBtn) {
        if (unreadCount > 0) bellBtn.classList.add('ringing');
        else bellBtn.classList.remove('ringing');
    }

    if (!listEl) return;

    if (notifHistory.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; color:#A38E7D; padding:24px 10px; font-size:14px;">待辦清單已全部完成 🎉</div>`;
        return;
    }

    listEl.innerHTML = notifHistory.map((item, idx) => {
        const safeId = escapeAttr(item.id);
        const accId = item.accId || inferAccIdFromMessage(item.message);
        const bigEmoji = getCategoryEmoji(item.category, item.message);
        const cleanMessage = String(item.message).replace(/\s*(⚔️|🔬|📖|☀️|🏛️)\s*/g, ' ').replace(/\s+/g, ' ').trim();
        let renewControlHtml = '';

        if (item.unread && accId && ['soldiers', 'tech', 'master', 'sunlight'].includes(item.category)) {
            const defDur = getDefaultDurationForCategory(accId, item.category, item.itemId);
            const defD = defDur.d;
            const defH = defDur.h;
            const defM = defDur.m;

            let presetBtns = '';
            if (item.category === 'master') {
                presetBtns = `
                    <div class="todo-presets">
                        <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${safeId}', '${accId}', 'master', ${item.itemId || 'null'}, 0, 0, 10)">10分</button>
                        <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${safeId}', '${accId}', 'master', ${item.itemId || 'null'}, 0, 2, 0)">2時</button>
                        <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${safeId}', '${accId}', 'master', ${item.itemId || 'null'}, 0, 10, 0)">10時</button>
                        <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${safeId}', '${accId}', 'master', ${item.itemId || 'null'}, 0, 23, 0)">23時</button>
                        <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${safeId}', '${accId}', 'master', ${item.itemId || 'null'}, 3, 0, 0)">3天</button>
                        <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${safeId}', '${accId}', 'master', ${item.itemId || 'null'}, 5, 0, 0)">5天</button>
                    </div>
                `;
            } else if (item.category === 'sunlight') {
                presetBtns = `
                    <div class="todo-presets">
                        <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${safeId}', '${accId}', 'sunlight', ${item.itemId || 'null'}, 0, 8, 0)">▶ 8小時整</button>
                    </div>
                `;
            }

            renewControlHtml = `
                <div class="todo-renew-box" id="todo_box_${idx}">
                    <div class="todo-renew-row">
                        <span style="font-weight:700;">🔄 下一輪：</span>
                        <input type="text" inputmode="numeric" pattern="[0-9]*" class="todo-mini-input" id="todo_d_${idx}" value="${defD}" maxlength="2"
                            onfocus="this.select()"
                            onkeydown="handleTodoArrowNav(event, null, 'todo_h_${idx}', ${idx}, '${safeId}', '${accId}', '${item.category}', ${item.itemId || 'null'})"
                            oninput="autoJumpTodoInput(event, this, 'todo_h_${idx}')">天
                        <input type="text" inputmode="numeric" pattern="[0-9]*" class="todo-mini-input" id="todo_h_${idx}" value="${formatPad(defH)}" maxlength="2"
                            onfocus="this.select()"
                            onkeydown="handleTodoArrowNav(event, 'todo_d_${idx}', 'todo_m_${idx}', ${idx}, '${safeId}', '${accId}', '${item.category}', ${item.itemId || 'null'})"
                            oninput="autoJumpTodoInput(event, this, 'todo_m_${idx}')">時
                        <input type="text" inputmode="numeric" pattern="[0-9]*" class="todo-mini-input" id="todo_m_${idx}" value="${formatPad(defM)}" maxlength="2"
                            onfocus="this.select()"
                            onkeydown="handleTodoArrowNav(event, 'todo_h_${idx}', null, ${idx}, '${safeId}', '${accId}', '${item.category}', ${item.itemId || 'null'})">分
                        <button class="btn-todo-start" onclick="submitTodoCustomRound(${idx}, '${safeId}', '${accId}', '${item.category}', ${item.itemId || 'null'})">▶ 開始</button>
                    </div>
                    ${presetBtns}
                </div>
            `;
        } else if (item.unread && accId && (item.category === 'cooldown_soldier' || item.category === 'cooldown_tech')) {
            const jType = item.category === 'cooldown_soldier' ? 'soldier' : 'tech';
            const timeKey = jType === 'soldier' ? 'soldierJobTime' : 'techJobTime';
            const selectedTime = item.recommendedTime || (store[accId] ? store[accId][timeKey] : '') || '';
            const optionsHtml = typeof generateJobOptions === 'function'
                ? generateJobOptions(selectedTime, '選擇時段')
                : `<option value="">選擇時段</option>`;
            renewControlHtml = `
                <div class="todo-renew-box" id="todo_box_${idx}">
                    <div class="todo-renew-row">
                        <span style="font-weight:700;">預約時段：</span>
                        <select class="todo-time-select" id="todo_job_sel_${idx}" onchange="confirmJobFromTodo('${safeId}', '${accId}', '${jType}', this.value)">
                            ${optionsHtml}
                        </select>
                        <button class="btn-todo-confirm" onclick="submitTodoJobConfirm(${idx}, '${safeId}', '${accId}', '${jType}')">✔ 確認</button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="todo-item ${item.unread ? 'pending' : 'done'} acc-${accId}">
                <div class="todo-top-row">
                    <span class="todo-big-emoji">${bigEmoji}</span>
                    <div class="todo-msg-wrap">
                        <div class="todo-item-msg">${cleanMessage}</div>
                        <div class="todo-item-meta">
                            <span>🕒 ${formatRelativeAgo(item.timestamp)}</span>
                            <span>${item.unread ? '待處理' : '已完成'}</span>
                        </div>
                    </div>
                    <button type="button" class="todo-checkbox" title="${item.unread ? '標記為已完成' : '恢復待處理'}" onclick="toggleTodoDone('${safeId}')">
                        ${item.unread ? '' : '✔'}
                    </button>
                </div>
                ${renewControlHtml}
            </div>
        `;
    }).join('');
}
