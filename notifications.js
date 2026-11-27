// ==========================================
// NOTIFICATIONS.JS：鈴聲提示、靜音桌面通知與鈴鐺待辦清單（支援 Firebase 跨電腦雲端同步）
// ==========================================
let lastNotifCloudJson = '';

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
                requireInteraction: true,
                silent: true
            });
            activeSystemNotifications.push(n);
            n.onclose = () => {
                const idx = activeSystemNotifications.indexOf(n);
                if (idx !== -1) activeSystemNotifications.splice(idx, 1);
            };
            n.onclick = () => {
                window.focus();
                stopRinging();
                const navDrop = document.getElementById('navDropdown');
                if (navDrop) navDrop.classList.remove('open');
                const bellDrop = document.getElementById('notifDropdown');
                if (bellDrop) {
                    bellDrop.classList.add('open');
                    renderBellUI(true);
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
    pushNotificationEvent(evObj, false);
    const drop = document.getElementById('notifDropdown');
    if (drop) drop.classList.add('open');
}

// 待辦清單 & 提醒紀錄系統（本機 + Firebase 雲端即時雙向同步）
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
    renderBellUI(true);
}

function saveNotifHistory(skipCloudSync = false) {
    notifHistory = notifHistory.slice(0, 40);
    try {
        localStorage.setItem(NOTIF_HISTORY_KEY, JSON.stringify(notifHistory));
    } catch (e) {}

    if (!skipCloudSync && typeof dbRef !== 'undefined' && dbRef) {
        const json = JSON.stringify(notifHistory);
        if (json !== lastNotifCloudJson) {
            lastNotifCloudJson = json;
            dbRef.child('notifHistory').set(notifHistory).catch(err => {
                console.warn('待辦雲端同步失敗:', err);
            });
        }
    }
}

function initNotifCloudSync() {
    if (typeof dbRef === 'undefined' || !dbRef) return;
    dbRef.child('notifHistory').on('value', (snap) => {
        const val = snap.val();
        if (val === null || val === undefined) {
            if (notifHistory.length > 0) {
                saveNotifHistory(false);
            }
            return;
        }
        const arr = (Array.isArray(val) ? val : Object.values(val)).filter(Boolean);
        const json = JSON.stringify(arr);
        if (json === lastNotifCloudJson) return;
        lastNotifCloudJson = json;
        notifHistory = arr;
        notifHistory.forEach(n => {
            if (n && n.id) triggeredEventKeys.add(n.id);
        });
        try {
            localStorage.setItem(NOTIF_HISTORY_KEY, json);
        } catch (e) {}
        renderBellUI(false);
        if (notifHistory.filter(n => n.unread).length === 0) {
            stopRinging();
        }
    });
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

    saveNotifHistory(false);
    renderBellUI(false);

    if (shouldAlert) {
        startRinging();
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
        if (drop.classList.contains('open')) {
            stopRinging();
            renderBellUI(true);
        }
    }
}

function toggleTodoDone(notifId) {
    const item = notifHistory.find(n => n.id === notifId);
    if (!item) return;
    item.unread = !item.unread;
    saveNotifHistory(false);
    renderBellUI(true);
    if (notifHistory.filter(n => n.unread).length === 0) stopRinging();
}

function markAllNotifsRead() {
    notifHistory.forEach(n => { n.unread = false; });
    saveNotifHistory(false);
    renderBellUI(true);
    stopRinging();
}

function clearAllNotifs() {
    notifHistory = notifHistory.filter(n => n.unread);
    saveNotifHistory(false);
    renderBellUI(true);
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

function parseTodoNumber(rawVal) {
    if (rawVal === null || rawVal === undefined) return 0;
    const halfWidth = String(rawVal).replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    const digits = halfWidth.replace(/\D/g, '');
    return Math.max(0, parseInt(digits, 10) || 0);
}

function handleTodoNumberInput(event, inputEl, field, nextIdStr) {
    const halfWidth = String(inputEl.value).replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    let clean = halfWidth.replace(/\D/g, '').slice(0, 2);
    if (field === 'h' && Number(clean) > 23) clean = '23';
    if (field === 'm' && Number(clean) > 59) clean = '59';
    if (inputEl.value !== clean) {
        inputEl.value = clean;
    }

    if (!nextIdStr) return;
    if (event && ['Tab', 'Shift', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete', 'Enter'].includes(event.key)) return;
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
    ensureAudioContextUnlocked();
    const safeD = Math.max(0, parseInt(d, 10) || 0);
    const safeH = Math.min(23, Math.max(0, parseInt(h, 10) || 0));
    const safeM = Math.min(59, Math.max(0, parseInt(m, 10) || 0));

    const totalMs = ((safeD * 24 + safeH) * 60 + safeM) * 60 * 1000;
    if (totalMs <= 0) {
        alert('請先輸入新一輪的倒數時間！');
        return;
    }

    if (store[accId] && store[accId][category]) {
        if (!Array.isArray(store[accId][category])) {
            store[accId][category] = Object.values(store[accId][category]).filter(Boolean);
        }
        const list = store[accId][category];
        const nowMs = getAccurateNow().getTime();

        // 1. 優先找原本那格；2. 找不到則找第一個空閒（未在倒數）的列隊；3. 再不然抓第 1 格
        let target = (itemId !== null && itemId !== undefined && itemId !== '')
            ? list.find(it => String(it.id) === String(itemId))
            : null;
        if (!target) {
            target = list.find(it => !it.endTime || it.endTime.getTime() <= nowMs) || list[0];
        }

        if (target) {
            target.d = safeD;
            target.h = safeH;
            target.m = safeM;

            if (typeof startTimer === 'function') {
                startTimer(accId, category, target.id);
            } else {
                const endDate = new Date(nowMs + totalMs);
                target.endTime = endDate;
                if (category === 'soldiers' && typeof autoSyncJobFromTimer === 'function') {
                    autoSyncJobFromTimer(accId, 'soldier', endDate);
                }
                if (category === 'tech' && typeof autoSyncJobFromTimer === 'function') {
                    autoSyncJobFromTimer(accId, 'tech', endDate);
                }
                if (typeof renderGrid === 'function') renderGrid();
                if (typeof updateTimeline === 'function') updateTimeline(true);
                saveState();
            }
        }
    }

    const notifItem = notifHistory.find(n => n.id === notifId);
    if (notifItem) notifItem.unread = false;

    saveNotifHistory(false);
    renderBellUI(true);
    if (notifHistory.filter(n => n.unread).length === 0) stopRinging();
}

function submitTodoCustomRound(idx, notifId, accId, category, itemId) {
    const d = parseTodoNumber(document.getElementById(`todo_d_${idx}`)?.value);
    const h = parseTodoNumber(document.getElementById(`todo_h_${idx}`)?.value);
    const m = parseTodoNumber(document.getElementById(`todo_m_${idx}`)?.value);
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

    saveNotifHistory(false);
    renderBellUI(true);
    if (notifHistory.filter(n => n.unread).length === 0) stopRinging();
}

function submitTodoJobConfirm(idx, notifId, accId, jType) {
    const sel = document.getElementById(`todo_job_sel_${idx}`);
    confirmJobFromTodo(notifId, accId, jType, sel ? sel.value : '');
}

function renderBellUI(forceRebuild = false) {
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

    // 若使用者正在鈴鐺輸入框打字或選時段，非強制重繪時不覆蓋 DOM，避免輸入到一半被洗掉
    const activeEl = document.activeElement;
    if (!forceRebuild && activeEl && listEl.contains(activeEl) && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT')) {
        return;
    }

    if (notifHistory.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; color:#A38E7D; padding:24px 10px; font-size:14px;">待辦清單已全部完成 🎉</div>`;
        return;
    }

    listEl.innerHTML = notifHistory.map((item, idx) => {
        const safeId = escapeAttr(item.id);
        const accId = item.accId || inferAccIdFromMessage(item.message);
        const itemIdArg = (item.itemId !== null && item.itemId !== undefined && item.itemId !== '')
            ? `'${escapeAttr(String(item.itemId))}'`
            : 'null';
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
                        <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${safeId}', '${accId}', 'master', ${itemIdArg}, 0, 0, 10)">10分</button>
                        <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${safeId}', '${accId}', 'master', ${itemIdArg}, 0, 2, 0)">2時</button>
                        <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${safeId}', '${accId}', 'master', ${itemIdArg}, 0, 10, 0)">10時</button>
                        <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${safeId}', '${accId}', 'master', ${itemIdArg}, 0, 23, 0)">23時</button>
                        <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${safeId}', '${accId}', 'master', ${itemIdArg}, 3, 0, 0)">3天</button>
                        <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${safeId}', '${accId}', 'master', ${itemIdArg}, 5, 0, 0)">5天</button>
                    </div>
                `;
            } else if (item.category === 'sunlight') {
                presetBtns = `
                    <div class="todo-presets">
                        <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${safeId}', '${accId}', 'sunlight', ${itemIdArg}, 0, 8, 0)">▶ 8小時整</button>
                    </div>
                `;
            }

            renewControlHtml = `
                <div class="todo-renew-box" id="todo_box_${idx}">
                    <div class="todo-renew-row">
                        <span style="font-weight:700;">🔄 下一輪：</span>
                        <input type="text" inputmode="numeric" pattern="[0-9]*" class="todo-mini-input" id="todo_d_${idx}" value="${defD}" maxlength="2"
                            onfocus="this.select()"
                            onkeydown="handleTodoArrowNav(event, null, 'todo_h_${idx}', ${idx}, '${safeId}', '${accId}', '${item.category}', ${itemIdArg})"
                            oninput="handleTodoNumberInput(event, this, 'd', 'todo_h_${idx}')">天
                        <input type="text" inputmode="numeric" pattern="[0-9]*" class="todo-mini-input" id="todo_h_${idx}" value="${formatPad(defH)}" maxlength="2"
                            onfocus="this.select()"
                            onkeydown="handleTodoArrowNav(event, 'todo_d_${idx}', 'todo_m_${idx}', ${idx}, '${safeId}', '${accId}', '${item.category}', ${itemIdArg})"
                            oninput="handleTodoNumberInput(event, this, 'h', 'todo_m_${idx}')">時
                        <input type="text" inputmode="numeric" pattern="[0-9]*" class="todo-mini-input" id="todo_m_${idx}" value="${formatPad(defM)}" maxlength="2"
                            onfocus="this.select()"
                            onkeydown="handleTodoArrowNav(event, 'todo_h_${idx}', null, ${idx}, '${safeId}', '${accId}', '${item.category}', ${itemIdArg})"
                            oninput="handleTodoNumberInput(event, this, 'm', null)">分
                        <button class="btn-todo-start" onclick="submitTodoCustomRound(${idx}, '${safeId}', '${accId}', '${item.category}', ${itemIdArg})">▶ 開始</button>
                    </div>
                    ${presetBtns}
                </div>
            `;
        } else if (item.unread && accId && (item.category === 'cooldown_soldier' || item.category === 'cooldown_tech')) {
            const jType = item.category === 'cooldown_soldier' ? 'soldier' : 'tech';
            const cat = jType === 'soldier' ? 'soldiers' : 'tech';
            const timeKey = jType === 'soldier' ? 'soldierJobTime' : 'techJobTime';

            let liveRecTime = '';
            if (typeof getLatestActiveCategoryEndDate === 'function' && typeof getRecommendedJobSlotFromDate === 'function') {
                const latestEnd = getLatestActiveCategoryEndDate(accId, cat);
                const latestSlot = latestEnd ? getRecommendedJobSlotFromDate(latestEnd) : null;
                if (latestSlot) liveRecTime = formatTimeHM(latestSlot);
            }

            const selectedTime = liveRecTime || (store[accId] ? store[accId][timeKey] : '') || item.recommendedTime || '';
            const optionsHtml = typeof generateJobOptions === 'function'
                ? generateJobOptions(selectedTime, '選擇時段', accId, jType)
                : `<option value="">選擇時段</option>`;
            renewControlHtml = `
                <div class="todo-renew-box" id="todo_box_${idx}">
                    <div class="todo-renew-row">
                        <span style="font-weight:700;">預約時段：</span>
                        <select class="todo-time-select" id="todo_job_sel_${idx}">
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
