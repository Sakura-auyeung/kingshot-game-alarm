// ==========================================
// 1. Firebase 雲端即時資料庫設定
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyDjQS9NNkUwZ8bTeNb75WFp3at2jjKzWac",
    authDomain: "kingshot-game-alarm.firebaseapp.com",
    databaseURL: "https://kingshot-game-alarm-default-rtdb.firebaseio.com",
    projectId: "kingshot-game-alarm",
    storageBucket: "kingshot-game-alarm.firebasestorage.app",
    messagingSenderId: "935740408911",
    appId: "1:935740408911:web:ca2acd5a82822be227d63a"
};

let db = null;
let dbRef = null;
let profileDbRef = null;
let hasFirebase = false;
try {
    if (typeof firebase !== 'undefined' && firebase.initializeApp) {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        dbRef = db.ref("alarm_state_v1");
        profileDbRef = db.ref("account_profiles_v1");
        hasFirebase = true;
    }
} catch (e) {
    console.warn("Firebase 初始化略過，改用本地儲存模式", e);
}

// ==========================================
// 2. 系統狀態與資料結構
// ==========================================
const STORAGE_KEY = 'game_multi_timer_v13';
const PROFILE_STORAGE_KEY = 'game_multi_profiles_v1';
const NOTIF_HISTORY_KEY = 'game_multi_notif_history_v5';
const ORIGINAL_TITLE = '多帳戶鬧鐘與職位助手';

let splashStartTime = Date.now();
let splashHasHidden = false;
let splashDataReady = false;
let splashMinTimerDone = false;

function startSplashLoader() {
    splashStartTime = Date.now();
    splashHasHidden = false;
    splashDataReady = false;
    splashMinTimerDone = false;

    setTimeout(() => {
        splashMinTimerDone = true;
        tryFinishSplash();
    }, 950);

    setTimeout(() => {
        hideSplashScreen();
    }, 2200);
}

function notifyDataReadyForSplash() {
    splashDataReady = true;
    tryFinishSplash();
}

function tryFinishSplash() {
    if (splashMinTimerDone && splashDataReady) {
        hideSplashScreen();
    }
}

function hideSplashScreen() {
    if (splashHasHidden) return;
    splashHasHidden = true;
    const splash = document.getElementById('loadingSplash');
    if (!splash) return;
    splash.classList.add('shaki');
    setTimeout(() => {
        splash.classList.add('hidden');
    }, 260);
}

let serverTimeOffsetMs = 0;

function getAccurateNow() {
    return new Date(Date.now() + serverTimeOffsetMs);
}

async function syncInternetTime() {
    const endpoints = [
        'https://worldtimeapi.org/api/timezone/Etc/UTC',
        'https://timeapi.io/api/Time/current/zone?timeZone=UTC'
    ];
    for (const url of endpoints) {
        try {
            const t0 = Date.now();
            const res = await fetch(url, { cache: 'no-store' });
            const t1 = Date.now();
            if (!res.ok) continue;
            const data = await res.json();
            const serverIso = data.utc_datetime || data.dateTime;
            if (serverIso) {
                const serverMs = new Date(serverIso.endsWith('Z') ? serverIso : serverIso + 'Z').getTime();
                if (!isNaN(serverMs)) {
                    const rttHalf = Math.round((t1 - t0) / 2);
                    serverTimeOffsetMs = (serverMs + rttHalf) - t1;
                    return;
                }
            }
        } catch (e) {}
    }
}

function setupAutoTimeSync() {
    if (hasFirebase && typeof firebase !== 'undefined') {
        try {
            firebase.database().ref('.info/serverTimeOffset').on('value', (snap) => {
                const val = snap.val();
                if (typeof val === 'number') {
                    serverTimeOffsetMs = val;
                }
            });
        } catch (e) {}
    }
    syncInternetTime();
    setInterval(syncInternetTime, 5 * 60 * 1000);
}

const accounts = [
    { id: 'h', faceFile: 'chara_face_2-1.png', isMain: false },
    { id: 'z', faceFile: 'chara_face_1-1.png', isMain: true },
    { id: 'p', faceFile: 'chara_face_4-1.png', isMain: false }
];

function getBearFaceFile(accId) {
    const found = accounts.find(a => a.id === accId);
    return found ? `./assets/${found.faceFile}` : './assets/chara_face_1-1.png';
}

let profiles = {
    h: {
        queryName: 'Howard',
        queryAlliance: '777',
        name: 'Howard',
        alliance: '777',
        levelLabel: 'TG6',
        power: 279000000,
        powerRank: null,
        avatar: '',
        lastFetched: null
    },
    z: {
        queryName: 'Zoey',
        queryAlliance: 'TER',
        name: 'Zoey',
        alliance: 'TER',
        levelLabel: 'TG8',
        power: 430453250,
        powerRank: 44,
        avatar: 'https://got-global-avatar.akamaized.net/avatar/2026/11/07/v9JxWg_1794050377.png',
        lastFetched: null
    },
    p: {
        queryName: 'Patrick',
        queryAlliance: '777',
        name: 'Patrick',
        alliance: '777',
        levelLabel: 'TG5-3',
        power: 264500000,
        powerRank: null,
        avatar: '',
        lastFetched: null
    }
};

let store = {
    h: {
        soldiers: [{ id: 1, d: 0, h: 0, m: 0, endTime: null }],
        tech: [{ id: 2, d: 0, h: 0, m: 0, endTime: null }],
        master: [{ id: 3, d: 0, h: 0, m: 10, endTime: null }],
        sunlight: [{ id: 4, d: 0, h: 8, m: 0, endTime: null }],
        soldierJobTime: '', soldierJobDate: null, soldierJobConfirmed: false, soldierJobManual: false,
        techJobTime: '', techJobDate: null, techJobConfirmed: false, techJobManual: false
    },
    z: {
        soldiers: [{ id: 5, d: 0, h: 0, m: 0, endTime: null }],
        tech: [{ id: 6, d: 0, h: 0, m: 0, endTime: null }],
        master: [{ id: 7, d: 0, h: 0, m: 10, endTime: null }],
        sunlight: [{ id: 8, d: 0, h: 8, m: 0, endTime: null }],
        soldierJobTime: '', soldierJobDate: null, soldierJobConfirmed: false, soldierJobManual: false,
        techJobTime: '', techJobDate: null, techJobConfirmed: false, techJobManual: false
    },
    p: {
        soldiers: [{ id: 9, d: 0, h: 0, m: 0, endTime: null }],
        tech: [{ id: 10, d: 0, h: 0, m: 0, endTime: null }],
        master: [{ id: 11, d: 0, h: 0, m: 10, endTime: null }],
        sunlight: [{ id: 12, d: 0, h: 8, m: 0, endTime: null }],
        soldierJobTime: '', soldierJobDate: null, soldierJobConfirmed: false, soldierJobManual: false,
        techJobTime: '', techJobDate: null, techJobConfirmed: false, techJobManual: false
    }
};

let nextId = 100;
let showSunlightEvent = true;
let showAllTimelineDays = false;
let triggeredEventKeys = new Set();
let notifHistory = [];
let audioCtx = null;
let ringInterval = null;
let activeSystemNotifications = [];
let isInitialLoadDone = false;
let latestStateUpdatedAt = 0;

function hideAllMainViews() {
    const grid = document.getElementById('gridView');
    const timeline = document.getElementById('timelineView');
    const resView = document.getElementById('resourcesView');
    if (grid) grid.style.display = 'none';
    if (timeline) timeline.style.display = 'none';
    if (resView) resView.style.display = 'none';
}

function toggleResourcesView() {
    const grid = document.getElementById('gridView');
    const timeline = document.getElementById('timelineView');
    const resView = document.getElementById('resourcesView');
    const btn = document.getElementById('toggleBtn');
    const resBtn = document.getElementById('resToggleBtn');

    if (resView && resView.style.display === 'block') {
        hideAllMainViews();
        if (grid) grid.style.display = 'grid';
        if (btn) btn.innerHTML = '<img class="btn-icon-svg" src="./assets/btn_change.svg" alt=""> 切換時間線';
        if (resBtn) resBtn.innerText = '🌾 資源採集';
    } else {
        hideAllMainViews();
        if (resView) resView.style.display = 'block';
        if (btn) btn.innerHTML = '<img class="btn-icon-svg" src="./assets/btn_change.svg" alt=""> 切換時間線';
        if (resBtn) resBtn.innerText = '⏰ 返回計時器';
        if (typeof renderResourcesGrid === 'function') renderResourcesGrid();
    }
}

function isJobInCooldown(accId, type, now = getAccurateNow()) {
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const jobDate = store[accId][dateKey];
    if (!jobDate) return false;
    const diffMs = now.getTime() - jobDate.getTime();
    return diffMs > 0 && diffMs <= 10 * 60 * 1000;
}

function normalizeAllJobsConsistency() {
    accounts.forEach(acc => {
        ['soldier', 'tech'].forEach(type => {
            const timeKey = type === 'soldier' ? 'soldierJobTime' : 'techJobTime';
            const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
            const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';
            const manualKey = type === 'soldier' ? 'soldierJobManual' : 'techJobManual';

            const d = store[acc.id][dateKey];
            const t = store[acc.id][timeKey];

            if (d instanceof Date && !isNaN(d.getTime())) {
                if (!t) store[acc.id][timeKey] = formatTimeHM(d);
            } else if (t && /^\d{2}:\d{2}$/.test(t)) {
                const [hh, mm] = t.split(':').map(Number);
                const rebuilt = getAccurateNow();
                rebuilt.setHours(hh, mm, 0, 0);
                if (rebuilt < getAccurateNow()) rebuilt.setDate(rebuilt.getDate() + 1);
                store[acc.id][dateKey] = rebuilt;
            } else {
                store[acc.id][timeKey] = '';
                store[acc.id][dateKey] = null;
                store[acc.id][confKey] = false;
                store[acc.id][manualKey] = false;
            }
        });
    });
}

function loadNotifHistory() {
    try {
        const raw = localStorage.getItem(NOTIF_HISTORY_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                notifHistory = parsed;
            }
        }
    } catch (e) {}
    renderBellUI();
}

function saveNotifHistory() {
    try {
        notifHistory = notifHistory.slice(0, 60);
        localStorage.setItem(NOTIF_HISTORY_KEY, JSON.stringify(notifHistory));
    } catch (e) {}
}

function formatRelativeAgo(targetTs) {
    if (!targetTs) return '';
    const diffSec = Math.floor((getAccurateNow().getTime() - targetTs) / 1000);
    if (diffSec < 60) return '剛剛';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} 分鐘前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} 小時前`;
    const d = new Date(targetTs);
    return `${d.getMonth() + 1}/${d.getDate()} ${formatPad(d.getHours())}:${formatPad(d.getMinutes())}`;
}

function getBigCategoryEmoji(message, category) {
    if (category === 'soldiers' || message.includes('士兵訓練')) return '⚔️';
    if (category === 'tech' || message.includes('科技研究')) return '🔬';
    if (category === 'master' || message.includes('大師技能')) return '📖';
    if (category === 'sunlight' || message.includes('沐光之旅')) return '☀️';
    if (category === 'job_soldier' || category === 'job_tech' || category === 'cooldown_soldier' || category === 'cooldown_tech' || message.includes('職位')) return '🏛️';
    return '🔔';
}

function stripCategoryEmojiFromText(msg) {
    return String(msg || '')
        .replace(/[⚔️🔬📖☀️🏛️🔔]/gu, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function inferAccIdFromMessage(msg) {
    const m = /\[([^\]]+)\]/.exec(String(msg || ''));
    if (m) {
        const label = m[1].trim();
        for (const acc of accounts) {
            if (getDisplayAccountName(acc.id) === label || acc.id === label) return acc.id;
        }
    }
    return 'z';
}

function getDefaultDurationForCategory(accId, category, itemId) {
    if (category === 'sunlight') return { d: 0, h: 8, m: 0 };
    if (category === 'master') return { d: 0, h: 0, m: 10 };
    if (store[accId] && store[accId][category]) {
        const found = store[accId][category].find(i => i.id === itemId);
        if (found) return { d: found.d || 0, h: found.h || 0, m: found.m || 0 };
    }
    return { d: 0, h: 0, m: 0 };
}

function buildTodoRenewHtml(item, idx) {
    const accId = item.accId || inferAccIdFromMessage(item.message);
    const cat = item.category;
    const itemId = item.itemId || '';

    if (cat === 'soldiers' || cat === 'tech' || cat === 'master' || cat === 'sunlight') {
        const def = getDefaultDurationForCategory(accId, cat, itemId);
        let presetBtns = '';
        if (cat === 'master') {
            presetBtns = `
                <div class="todo-presets">
                    <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${item.id}', '${accId}', 'master', '${itemId}', 0, 0, 10)">10分</button>
                    <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${item.id}', '${accId}', 'master', '${itemId}', 0, 2, 0)">2時</button>
                    <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${item.id}', '${accId}', 'master', '${itemId}', 0, 10, 0)">10時</button>
                    <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${item.id}', '${accId}', 'master', '${itemId}', 0, 23, 0)">23時</button>
                    <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${item.id}', '${accId}', 'master', '${itemId}', 3, 0, 0)">3天</button>
                    <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${item.id}', '${accId}', 'master', '${itemId}', 5, 0, 0)">5天</button>
                </div>
            `;
        } else if (cat === 'sunlight') {
            presetBtns = `
                <div class="todo-presets">
                    <button class="btn-todo-preset" onclick="startNewRoundFromTodo('${item.id}', '${accId}', 'sunlight', '${itemId}', 0, 8, 0)">▶ 8小時整</button>
                </div>
            `;
        }

        return `
            <div class="todo-renew-box" id="todo_box_${idx}">
                <div class="todo-renew-row">
                    <span>🔄 下一輪：</span>
                    <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" class="todo-mini-input" id="todo_d_${idx}" value="${def.d}"
                        onfocus="this.select()"
                        onkeydown="handleTodoArrowNav(event, null, 'todo_h_${idx}', ${idx}, '${item.id}', '${accId}', '${cat}', '${itemId}')"
                        onkeyup="autoJumpTodoInput(event, this, 'todo_h_${idx}')">天
                    <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" class="todo-mini-input" id="todo_h_${idx}" value="${formatPad(def.h)}"
                        onfocus="this.select()"
                        onkeydown="handleTodoArrowNav(event, 'todo_d_${idx}', 'todo_m_${idx}', ${idx}, '${item.id}', '${accId}', '${cat}', '${itemId}')"
                        onkeyup="autoJumpTodoInput(event, this, 'todo_m_${idx}')">時
                    <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" class="todo-mini-input" id="todo_m_${idx}" value="${formatPad(def.m)}"
                        onfocus="this.select()"
                        onkeydown="handleTodoArrowNav(event, 'todo_h_${idx}', null, ${idx}, '${item.id}', '${accId}', '${cat}', '${itemId}')">分
                    <button class="btn-todo-start" onclick="submitTodoCustomRound(${idx}, '${item.id}', '${accId}', '${cat}', '${itemId}')">▶ 開始</button>
                </div>
                ${presetBtns}
            </div>
        `;
    }

    if (cat === 'cooldown_soldier' || cat === 'cooldown_tech') {
        const jType = cat === 'cooldown_soldier' ? 'soldier' : 'tech';
        const timeKey = jType === 'soldier' ? 'soldierJobTime' : 'techJobTime';
        const currentRec = store[accId][timeKey] || item.recommendedTime || '';
        return `
            <div class="todo-renew-box">
                <div class="todo-renew-row">
                    <span>🏛️ 預約下一輪：</span>
                    <select class="todo-time-select" id="todo_job_sel_${idx}">
                        ${generateJobOptions(currentRec, '--選擇時段--')}
                    </select>
                    <button class="btn-todo-confirm" onclick="submitTodoJobConfirm(${idx}, '${item.id}', '${accId}', '${jType}')">✅ 確認預約</button>
                </div>
            </div>
        `;
    }

    return '';
}

function renderBellUI() {
    const bellBtn = document.getElementById('bellBtn');
    const badge = document.getElementById('bellCountBadge');
    const listEl = document.getElementById('notifDropdownList');

    const pendingCount = notifHistory.filter(n => n.unread).length;
    if (badge) {
        if (pendingCount > 0) {
            badge.style.display = 'inline-flex';
            badge.innerText = pendingCount > 99 ? '99+' : pendingCount;
        } else {
            badge.style.display = 'none';
        }
    }
    if (bellBtn) {
        if (pendingCount > 0) bellBtn.classList.add('ringing');
        else bellBtn.classList.remove('ringing');
    }

    if (listEl) {
        if (notifHistory.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; color:#A38E7D; padding:22px 10px; font-size:13px;">目前沒有待辦或提醒紀錄 ✨</div>`;
        } else {
            listEl.innerHTML = notifHistory.map((item, idx) => {
                const safeId = String(item.id).replace(/'/g, "\\'");
                const accId = item.accId || inferAccIdFromMessage(item.message);
                const bigEmoji = getBigCategoryEmoji(item.message, item.category);
                const cleanMessage = stripCategoryEmojiFromText(item.message);
                const renewControlHtml = item.unread ? buildTodoRenewHtml(item, idx) : '';
                const cardStateClass = item.unread ? `pending acc-${accId}` : 'done';

                return `
                    <div class="todo-item ${cardStateClass}">
                        <div class="todo-top-row">
                            <div class="todo-big-emoji">${bigEmoji}</div>
                            <div class="todo-msg-wrap">
                                <div class="todo-item-msg">${cleanMessage}</div>
                                <div class="todo-item-meta">
                                    <span>🕒 ${formatRelativeAgo(item.targetTimestamp)}</span>
                                    <span>${item.unread ? '待處理' : '已完成'}</span>
                                </div>
                            </div>
                            <button class="todo-checkbox" title="${item.unread ? '點擊標記為已完成' : '標記為未完成'}" onclick="toggleTodoDone('${safeId}')">
                                ${item.unread ? '' : '✓'}
                            </button>
                        </div>
                        ${renewControlHtml}
                    </div>
                `;
            }).join('');
        }
    }
}
// ==========================================
// 3. 待辦清單快捷操作與鈴聲控制
// ==========================================
function handleTodoArrowNav(event, prevFieldId, nextFieldId, idx, notifId, accId, category, itemId) {
    const parentBox = document.getElementById(`todo_box_${idx}`);
    if (event.key === 'Enter') {
        event.preventDefault();
        submitTodoCustomRound(idx, notifId, accId, category, itemId);
        return;
    }
    if (event.key === 'ArrowLeft' && prevFieldId && parentBox) {
        event.preventDefault();
        const prevInput = parentBox.querySelector('#' + prevFieldId);
        if (prevInput) { prevInput.focus(); prevInput.select(); }
    }
    if (event.key === 'ArrowRight' && nextFieldId && parentBox) {
        event.preventDefault();
        const nextInput = parentBox.querySelector('#' + nextFieldId);
        if (nextInput) { nextInput.focus(); nextInput.select(); }
    }
}

function autoJumpTodoInput(event, currentInput, nextFieldId) {
    const isNumberKey = (event.key >= '0' && event.key <= '9');
    if (isNumberKey && currentInput.value.length >= 2 && nextFieldId) {
        const parentBox = currentInput.closest('.todo-renew-box');
        if (parentBox) {
            const nextInput = parentBox.querySelector('#' + nextFieldId);
            if (nextInput) { nextInput.focus(); nextInput.select(); }
        }
    }
}

function submitTodoCustomRound(idx, notifId, accId, category, itemId) {
    const dEl = document.getElementById(`todo_d_${idx}`);
    const hEl = document.getElementById(`todo_h_${idx}`);
    const mEl = document.getElementById(`todo_m_${idx}`);
    const d = Math.max(0, dEl ? (parseInt(dEl.value, 10) || 0) : 0);
    const h = Math.max(0, hEl ? (parseInt(hEl.value, 10) || 0) : 0);
    const m = Math.max(0, mEl ? (parseInt(mEl.value, 10) || 0) : 0);
    startNewRoundFromTodo(notifId, accId, category, itemId, d, h, m);
}

function startNewRoundFromTodo(notifId, accId, category, itemId, d, h, m) {
    initAudioContext();
    requestDesktopNotificationPermission();

    if (!store[accId] || !store[accId][category]) return;
    const numericId = itemId ? Number(itemId) : null;
    let targetItem = numericId ? store[accId][category].find(i => i.id === numericId) : null;
    if (!targetItem && (category === 'tech' || category === 'master') && store[accId][category].length > 0) {
        targetItem = store[accId][category][0];
    }

    const now = getAccurateNow();
    const totalSeconds = (d * 86400) + (h * 3600) + (m * 60);
    const newEnd = new Date(now.getTime() + totalSeconds * 1000);

    if (targetItem) {
        targetItem.d = d;
        targetItem.h = h;
        targetItem.m = m;
        targetItem.endTime = newEnd;
    } else {
        store[accId][category].push({
            id: ++nextId,
            d, h, m,
            endTime: newEnd
        });
    }

    const todo = notifHistory.find(n => n.id === notifId);
    if (todo) todo.unread = false;
    saveNotifHistory();

    stopRingingEffects();

    recalculateJobs(accId, category, true);
    renderGrid();
    updateTimeline(true);
    saveState();
    renderBellUI();
}

function submitTodoJobConfirm(idx, notifId, accId, jType) {
    const sel = document.getElementById(`todo_job_sel_${idx}`);
    const val = sel ? sel.value : '';
    confirmJobFromTodo(notifId, accId, jType, val);
}

function confirmJobFromTodo(notifId, accId, jType, selectedTimeStr) {
    const timeKey = jType === 'soldier' ? 'soldierJobTime' : 'techJobTime';
    const dateKey = jType === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const confKey = jType === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';
    const manualKey = jType === 'soldier' ? 'soldierJobManual' : 'techJobManual';

    const finalTimeStr = selectedTimeStr || store[accId][timeKey];
    if (!finalTimeStr) {
        alert("請先選擇預約時段！");
        return;
    }

    const [h, m] = finalTimeStr.split(':').map(Number);
    let d = getAccurateNow();
    d.setHours(h, m, 0, 0);
    if (d < getAccurateNow()) d.setDate(d.getDate() + 1);

    store[accId][dateKey] = d;
    store[accId][timeKey] = formatTimeHM(d);
    store[accId][confKey] = true;
    store[accId][manualKey] = true;

    const todo = notifHistory.find(n => n.id === notifId);
    if (todo) todo.unread = false;
    saveNotifHistory();

    stopRingingEffects();
    renderGrid();
    updateTimeline(true);
    saveState();
    renderBellUI();
}

function toggleTodoDone(id) {
    const target = notifHistory.find(n => n.id === id);
    if (target) {
        target.unread = !target.unread;
        saveNotifHistory();
        renderBellUI();
    }
    if (notifHistory.every(n => !n.unread)) {
        stopRingingEffects();
    }
}

function toggleBellDropdown(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('notifDropdown');
    if (!dropdown) return;
    const willOpen = !dropdown.classList.contains('open');
    dropdown.classList.toggle('open');
    if (willOpen) {
        renderBellUI();
        stopRingingEffects();
    }
}

document.addEventListener('click', () => {
    const dropdown = document.getElementById('notifDropdown');
    if (dropdown) dropdown.classList.remove('open');
});

function markAllNotifsRead() {
    notifHistory.forEach(n => n.unread = false);
    saveNotifHistory();
    renderBellUI();
    stopRingingEffects();
}

function clearAllNotifs() {
    notifHistory = notifHistory.filter(n => n.unread);
    saveNotifHistory();
    renderBellUI();
    if (notifHistory.every(n => !n.unread)) {
        stopRingingEffects();
    }
}

function stopRingingEffects() {
    activeSystemNotifications.forEach(n => {
        try { n.close(); } catch (e) {}
    });
    activeSystemNotifications = [];
    if (ringInterval) {
        clearInterval(ringInterval);
        ringInterval = null;
    }
    document.title = ORIGINAL_TITLE;
}

function updateNotifBadgeUI() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    if (!("Notification" in window)) {
        badge.style.display = 'none';
        return;
    }
    if (Notification.permission === 'granted') {
        badge.innerText = '🖥️ 右下角系統彈窗：已開啟';
        badge.classList.add('granted');
    } else if (Notification.permission === 'denied') {
        badge.innerText = '⚠️ 右下角通知被封鎖（請在網址列鎖頭開啟）';
        badge.classList.remove('granted');
    } else {
        badge.innerText = '🔔 點擊開啟右下角桌面彈窗';
        badge.classList.remove('granted');
    }
}

function requestDesktopNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(() => {
            updateNotifBadgeUI();
        });
    } else {
        updateNotifBadgeUI();
    }
}

function sendSystemCornerNotification(message, accId = 'z') {
    if (!("Notification" in window)) return;
    if (Notification.permission === 'granted') {
        try {
            const bearIcon = getBearFaceFile(accId);
            const notif = new Notification("⏰ 多帳戶鬧鐘時間到了！", {
                body: message,
                icon: bearIcon,
                badge: bearIcon,
                requireInteraction: true
            });
            notif.onclick = function () {
                try { window.focus(); } catch (e) {}
                stopRingingEffects();
                const dropdown = document.getElementById('notifDropdown');
                if (dropdown) {
                    renderBellUI();
                    dropdown.classList.add('open');
                }
                notif.close();
            };
            activeSystemNotifications.push(notif);
        } catch (e) {}
    }
}

// ==========================================
// 4. 時間格式化 & 遊戲角色資料同步
// ==========================================
function getDayDiffFromToday(dateObj) {
    if (!dateObj) return null;
    const now = getAccurateNow();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const targetStart = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()).getTime();
    return Math.round((targetStart - todayStart) / 86400000);
}

function getDueBorderClass(dateObj) {
    const diffDays = getDayDiffFromToday(dateObj);
    if (diffDays === 0) return 'due-today';
    if (diffDays === 1) return 'due-tomorrow';
    return '';
}

function getDayHlHtml(dateObj) {
    const diffDays = getDayDiffFromToday(dateObj);
    if (diffDays === null) return '';
    if (diffDays === 0) return `<span class="day-hl today">今天</span>`;
    if (diffDays === 1) return `<span class="day-hl tomorrow">明天</span>`;
    return `${dateObj.getMonth() + 1}/${dateObj.getDate()} `;
}

function getDateGroupKey(dateObj) {
    if (!dateObj) return '';
    return `${dateObj.getFullYear()}-${dateObj.getMonth() + 1}-${dateObj.getDate()}`;
}

function formatPad(num) { return String(num).padStart(2, '0'); }
function formatTimeHM(date) { return !date ? '--:--' : `${formatPad(date.getHours())}:${formatPad(date.getMinutes())}`; }
function formatDateTimeHlHtml(date) {
    if (!date) return '--:--';
    return `${getDayHlHtml(date)}${formatTimeHM(date)}`;
}

function formatDurationShort(ms) {
    if (ms <= 0) return '已到時';
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0) return `還有 ${h}時 ${m}分`;
    return `還有 ${m}分`;
}

function formatPower(num) {
    if (!num && num !== 0) return '--';
    if (num >= 1000000000) return (num / 1000000000).toFixed(2) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return String(num);
}

function getDisplayAccountName(accId) {
    return (profiles[accId] && profiles[accId].name) ? profiles[accId].name : accId;
}

async function fetchSingleProfile(accId) {
    const p = profiles[accId];
    if (!p || !p.queryName) return false;

    const targetUrl = `https://kingdom-1177.vercel.app/api/governor-profile?name=${encodeURIComponent(p.queryName)}&alliance=${encodeURIComponent(p.queryAlliance || '')}`;
    try {
        const res = await fetch(targetUrl, { cache: 'no-store' });
        if (!res.ok) return false;
        const data = await res.json();
        if (data && data.ok && data.governor) {
            const gov = data.governor;
            profiles[accId] = {
                ...profiles[accId],
                name: gov.name || p.queryName,
                alliance: gov.alliance || p.queryAlliance,
                levelLabel: gov.levelLabel || (gov.tg ? `TG${gov.tg}` : `Lv.${gov.townCenter || ''}`),
                power: gov.power || 0,
                powerRank: gov.powerRank || null,
                avatar: gov.avatar || profiles[accId].avatar,
                lastFetched: new Date().toISOString()
            };
            return true;
        }
    } catch (e) {}
    return false;
}

async function refreshAllProfiles() {
    try {
        const results = await Promise.all([
            fetchSingleProfile('h'),
            fetchSingleProfile('z'),
            fetchSingleProfile('p')
        ]);

        if (results.some(ok => ok)) {
            saveProfiles();
            renderGrid();
            updateTimeline(true);
            if (typeof renderResourcesGrid === 'function') renderResourcesGrid();
        }
    } catch (e) {}
}

function editAccountQuery(accId) {
    const cur = profiles[accId];
    const newName = prompt(`修改 [${accId.toUpperCase()}] 的遊戲角色名稱（需與遊戲內完全一致）：`, cur.queryName);
    if (newName === null) return;
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    const newAlliance = prompt(`修改 [${trimmedName}] 的聯盟標籤（例如 TER 或 777）：`, cur.queryAlliance || '');
    if (newAlliance === null) return;

    profiles[accId].queryName = trimmedName;
    profiles[accId].queryAlliance = newAlliance.trim();
    profiles[accId].name = trimmedName;
    profiles[accId].alliance = newAlliance.trim();
    saveProfiles();
    renderGrid();
    updateTimeline(true);
    if (typeof renderResourcesGrid === 'function') renderResourcesGrid();
    refreshAllProfiles();
}

function saveProfiles() {
    try {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
    } catch (e) {}
    if (hasFirebase && profileDbRef) {
        profileDbRef.set(profiles).catch(err => console.error("Profile Sync Error:", err));
    }
}

function loadLocalProfiles() {
    try {
        const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            accounts.forEach(acc => {
                if (parsed[acc.id]) {
                    profiles[acc.id] = { ...profiles[acc.id], ...parsed[acc.id] };
                }
            });
        }
    } catch (e) {}
}

function setupProfileListener() {
    if (!hasFirebase || !profileDbRef) return;
    try {
        profileDbRef.on("value", (snapshot) => {
            const cloudProfiles = snapshot.val();
            if (cloudProfiles) {
                accounts.forEach(acc => {
                    if (cloudProfiles[acc.id]) {
                        profiles[acc.id] = { ...profiles[acc.id], ...cloudProfiles[acc.id] };
                    }
                });
                localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
                renderGrid();
                updateTimeline(true);
                if (typeof renderResourcesGrid === 'function') renderResourcesGrid();
            }
        });
    } catch (e) {}
}

// ==========================================
// 5. 初始化、背景計時與 Firebase 狀態同步
// ==========================================
function startBackgroundWorker() {
    try {
        const workerCode = `setInterval(function() { postMessage('tick'); }, 1000);`;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));
        worker.onmessage = function () { updateTimers(); };
    } catch (e) {
        setInterval(updateTimers, 1000);
    }
}

function pruneUnstartedDraftsOnly() {
    accounts.forEach(acc => {
        ['soldiers', 'sunlight'].forEach(type => {
            const list = store[acc.id][type] || [];
            const running = list.filter(i => i.endTime !== null);
            const unstarted = list.filter(i => i.endTime === null);

            if (unstarted.length > 1) {
                const firstDraft = unstarted[0];
                if (type === 'soldiers') {
                    firstDraft.d = 0;
                    firstDraft.h = 0;
                    firstDraft.m = 0;
                }
                store[acc.id][type] = [...running, firstDraft];
            } else if (unstarted.length === 0 && running.length === 0) {
                let defD = 0, defH = 0, defM = 0;
                if (type === 'sunlight') defH = 8;
                store[acc.id][type] = [{ id: ++nextId, d: defD, h: defH, m: defM, endTime: null }];
            }
        });
    });
}

function init() {
    startSplashLoader();
    try {
        setupAutoTimeSync();
        updateNotifBadgeUI();
        loadNotifHistory();
        loadLocalBackup();
        normalizeAllJobsConsistency();
        pruneUnstartedDraftsOnly();
        loadLocalProfiles();
        updateSunlightBtnUI();
        renderGrid();
        if (typeof renderResourcesGrid === 'function') renderResourcesGrid();
        setupFirebaseRealtimeListener();
        setupProfileListener();
        startBackgroundWorker();
        refreshAllProfiles();
    } catch (err) {
        console.error("Init error:", err);
        hideSplashScreen();
    }
}

function setupFirebaseRealtimeListener() {
    const badge = document.getElementById('syncBadge');
    if (!hasFirebase || !dbRef) {
        if (badge) {
            badge.innerText = "🟡 本地離線模式";
            badge.className = "sync-badge";
        }
        isInitialLoadDone = true;
        notifyDataReadyForSplash();
        return;
    }

    dbRef.on("value", (snapshot) => {
        const cloudData = snapshot.val();
        if (badge) {
            badge.innerText = "🟢 雲端已同步";
            badge.className = "sync-badge connected";
        }

        if (cloudData && cloudData.store) {
            const incomingUpdatedAt = Number(cloudData.updatedAt) || 0;
            if (!isInitialLoadDone || incomingUpdatedAt >= latestStateUpdatedAt) {
                applySerializedState(cloudData);
                normalizeAllJobsConsistency();
                pruneUnstartedDraftsOnly();
                saveLocalBackup();
                updateSunlightBtnUI();
                renderGrid();
                updateTimeline(true);
                if (typeof renderResourcesGrid === 'function') renderResourcesGrid();
            }
        }
        isInitialLoadDone = true;
        notifyDataReadyForSplash();
    }, (error) => {
        if (badge) {
            badge.innerText = "🔴 雲端連線異常";
            badge.className = "sync-badge error";
        }
        notifyDataReadyForSplash();
        console.error("Firebase Error:", error);
    });
}

function serializeState(timestampMs = Date.now()) {
    normalizeAllJobsConsistency();
    const serializedStore = {};
    accounts.forEach(acc => {
        const accData = store[acc.id];
        serializedStore[acc.id] = {
            soldiers: (accData.soldiers || []).map(i => ({ ...i, endTime: i.endTime ? i.endTime.toISOString() : null })),
            tech: (accData.tech || []).map(i => ({ ...i, endTime: i.endTime ? i.endTime.toISOString() : null })),
            master: (accData.master || []).map(i => ({ ...i, endTime: i.endTime ? i.endTime.toISOString() : null })),
            sunlight: (accData.sunlight || []).map(i => ({ ...i, endTime: i.endTime ? i.endTime.toISOString() : null })),
            soldierJobTime: accData.soldierJobTime || '',
            soldierJobDate: accData.soldierJobDate ? accData.soldierJobDate.toISOString() : null,
            soldierJobConfirmed: Boolean(accData.soldierJobConfirmed),
            soldierJobManual: Boolean(accData.soldierJobManual),
            techJobTime: accData.techJobTime || '',
            techJobDate: accData.techJobDate ? accData.techJobDate.toISOString() : null,
            techJobConfirmed: Boolean(accData.techJobConfirmed),
            techJobManual: Boolean(accData.techJobManual)
        };
    });

    return {
        store: serializedStore,
        resourcesStore: typeof resourcesStore !== 'undefined' ? resourcesStore : {},
        nextId: nextId,
        showSunlightEvent: showSunlightEvent,
        triggered: Array.from(triggeredEventKeys),
        updatedAt: timestampMs
    };
}

function applySerializedState(parsed) {
    if (!parsed || !parsed.store) return;
    accounts.forEach(acc => {
        const incoming = parsed.store[acc.id] || {};
        ['soldiers', 'tech', 'master', 'sunlight'].forEach(type => {
            const list = incoming[type] ? Object.values(incoming[type]) : [];
            store[acc.id][type] = list.map(item => ({
                ...item,
                endTime: item.endTime ? new Date(item.endTime) : null
            }));
        });
        store[acc.id].soldierJobTime = incoming.soldierJobTime || '';
        store[acc.id].soldierJobDate = incoming.soldierJobDate ? new Date(incoming.soldierJobDate) : null;
        store[acc.id].soldierJobConfirmed = Boolean(incoming.soldierJobConfirmed);
        store[acc.id].soldierJobManual = Boolean(incoming.soldierJobManual || incoming.soldierJobLocked || incoming.soldierJobConfirmed);

        store[acc.id].techJobTime = incoming.techJobTime || '';
        store[acc.id].techJobDate = incoming.techJobDate ? new Date(incoming.techJobDate) : null;
        store[acc.id].techJobConfirmed = Boolean(incoming.techJobConfirmed);
        store[acc.id].techJobManual = Boolean(incoming.techJobManual || incoming.techJobLocked || incoming.techJobConfirmed);
    });

    if (parsed.resourcesStore && typeof resourcesStore !== 'undefined') {
        accounts.forEach(acc => {
            if (parsed.resourcesStore[acc.id]) {
                resourcesStore[acc.id] = {
                    ...resourcesStore[acc.id],
                    ...parsed.resourcesStore[acc.id]
                };
            }
        });
    }

    if (parsed.nextId) nextId = parsed.nextId;
    if (typeof parsed.showSunlightEvent === 'boolean') showSunlightEvent = parsed.showSunlightEvent;
    if (parsed.triggered) triggeredEventKeys = new Set(Object.values(parsed.triggered));
    if (parsed.updatedAt) latestStateUpdatedAt = Math.max(latestStateUpdatedAt, Number(parsed.updatedAt) || 0);
    normalizeAllJobsConsistency();
}

function saveState() {
    const nowStamp = Date.now();
    latestStateUpdatedAt = nowStamp;
    const payload = serializeState(nowStamp);
    saveLocalBackup(payload);

    if (!hasFirebase || !dbRef) return;

    const badge = document.getElementById('syncBadge');
    if (badge) badge.innerText = "🔄 同步中...";
    dbRef.set(payload)
        .then(() => {
            if (badge) {
                badge.innerText = "🟢 雲端已同步";
                badge.className = "sync-badge connected";
            }
        })
        .catch(() => {
            if (badge) {
                badge.innerText = "🔴 寫入失敗";
                badge.className = "sync-badge error";
            }
        });
}

function saveLocalBackup(payloadObj) {
    try {
        const dataToSave = payloadObj || serializeState(latestStateUpdatedAt || Date.now());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (e) {}
}

function loadLocalBackup() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            applySerializedState(JSON.parse(raw));
        }
    } catch (e) {}
}

function toggleSunlightEvent() {
    showSunlightEvent = !showSunlightEvent;
    updateSunlightBtnUI();
    renderGrid();
    updateTimeline(true);
    saveState();
}

function updateSunlightBtnUI() {
    const btn = document.getElementById('sunlightToggleBtn');
    if (!btn) return;
    if (showSunlightEvent) {
        btn.innerText = "☀️ 沐光：顯示";
        btn.classList.add('active');
    } else {
        btn.innerText = "☀️ 沐光：隱藏";
        btn.classList.remove('active');
    }
}

// ==========================================
// 6. 鈴聲提示 & 卡片渲染
// ==========================================
function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playBeepOnce() {
    try {
        initAudioContext();
        const now = audioCtx.currentTime;

        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        gain1.gain.setValueAtTime(0.35, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(now);
        osc1.stop(now + 0.25);

        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1174.66, now + 0.18);
        gain2.gain.setValueAtTime(0.35, now + 0.18);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(now + 0.18);
        osc2.stop(now + 0.55);
    } catch (e) {}
}

function triggerAlarmAlert(eventKey, message, targetTimestampMs, meta = {}) {
    if (triggeredEventKeys.has(eventKey)) return;
    triggeredEventKeys.add(eventKey);
    saveLocalBackup();

    const nowMs = getAccurateNow().getTime();
    const actualTargetMs = targetTimestampMs || nowMs;
    const isMissedOffline = (nowMs - actualTargetMs) > 90 * 1000;
    const targetAccId = meta.accId || inferAccIdFromMessage(message);

    notifHistory.unshift({
        id: eventKey,
        accId: targetAccId,
        category: meta.category || null,
        itemId: meta.itemId || null,
        recommendedTime: meta.recommendedTime || null,
        message: message,
        targetTimestamp: actualTargetMs,
        unread: true
    });
    saveNotifHistory();
    renderBellUI();

    if (!isMissedOffline) {
        sendSystemCornerNotification(message, targetAccId);
        playBeepOnce();
        if (!ringInterval) {
            ringInterval = setInterval(playBeepOnce, 2000);
        }
    }
}

function testAlarm() {
    initAudioContext();
    requestDesktopNotificationPermission();
    const nowMs = getAccurateNow().getTime();
    const testKey = "test_" + nowMs;
    const zSoldiers = store['z'].soldiers || [];
    const sampleId = zSoldiers.length > 0 ? zSoldiers[0].id : null;
    triggerAlarmAlert(testKey, `【測試】[${getDisplayAccountName('z')}] ⚔️ 士兵訓練 已完成！`, nowMs, {
        accId: 'z',
        category: 'soldiers',
        itemId: sampleId
    });
}

function applyPreset(accId, type, id, d, h, m, autoStart = false) {
    const item = store[accId][type].find(i => i.id === id);
    if (!item) return;

    item.d = d;
    item.h = h;
    item.m = m;

    if (autoStart) {
        initAudioContext();
        requestDesktopNotificationPermission();
        const now = getAccurateNow();
        const totalSeconds = (d * 86400) + (h * 3600) + (m * 60);
        item.endTime = new Date(now.getTime() + totalSeconds * 1000);
        recalculateJobs(accId, type, true);
    }

    renderGrid();
    updateTimeline(true);
    saveState();
}

function renderProfileHeader(acc) {
    const accId = acc.id;
    const p = profiles[accId] || {};
    const fallbackAvatar = `./assets/${acc.faceFile}`;
    const avatarSrc = p.avatar ? p.avatar : fallbackAvatar;

    return `
        <div class="profile-card">
            <div class="profile-avatar-wrap">
                <img class="profile-avatar" src="${avatarSrc}" alt="${p.name || accId}" onerror="this.src='${fallbackAvatar}'">
                <img class="avatar-chara-badge" src="./assets/${acc.faceFile}" alt="">
            </div>
            <div class="profile-details">
                <div class="profile-name-row">
                    <span class="profile-name">${p.name || accId}</span>
                    ${acc.isMain ? `<span class="main-crown-badge">👑 主號</span>` : ''}
                    ${p.alliance ? `<span class="profile-alliance">[${p.alliance}]</span>` : ''}
                </div>
                <div class="profile-stats-row">
                    <span class="stat-pill tg">${p.levelLabel || '--'}</span>
                    <span class="stat-pill power">⚔️ ${formatPower(p.power)}</span>
                </div>
            </div>
            <button class="btn-edit-profile" title="修改角色名或聯盟標籤" onclick="editAccountQuery('${accId}')">✏️</button>
        </div>
    `;
}

function getJobStatusMeta(accId, type) {
    const now = getAccurateNow();
    const jobDate = type === 'soldier' ? store[accId].soldierJobDate : store[accId].techJobDate;
    const jobTime = type === 'soldier' ? store[accId].soldierJobTime : store[accId].techJobTime;
    const isConfirmed = type === 'soldier' ? store[accId].soldierJobConfirmed : store[accId].techJobConfirmed;

    if (!jobDate || !jobTime) {
        return { hasJob: false, dueBorderClass: '', statusHtml: `<span class="status-pill none">無預約</span>`, distText: '--', dateHtml: '--' };
    }

    const diffMs = jobDate.getTime() - now.getTime();
    const dateHtml = `${getDayHlHtml(jobDate)}${jobTime}`;
    const dueBorderClass = getDueBorderClass(jobDate);

    if (diffMs <= 0 && diffMs >= -10 * 60 * 1000) {
        const remainCoolMin = Math.max(1, Math.ceil((10 * 60 * 1000 + diffMs) / 60000));
        return {
            hasJob: true,
            dueBorderClass,
            statusHtml: `<span class="status-pill cooldown">⚠️ 10分冷卻剩 ${remainCoolMin}分</span>`,
            distText: '進行中',
            dateHtml
        };
    }

    const statusHtml = isConfirmed
        ? `<span class="status-pill confirmed">✅ 已確認</span>`
        : `<span class="status-pill pending">⏳ 待確認</span>`;

    return {
        hasJob: true,
        dueBorderClass,
        statusHtml,
        distText: formatDurationShort(diffMs),
        dateHtml
    };
}

function renderSectionCards(accId, type, list) {
    let activeSeq = 0;
    const showSeq = (type === 'soldiers' || type === 'sunlight');
    return (list || []).map(item => {
        const seqNum = (showSeq && item.endTime !== null) ? ++activeSeq : null;
        return renderTimerCard(accId, type, item, seqNum);
    }).join('');
}

function renderGrid() {
    const grid = document.getElementById('gridView');
    if (!grid) return;
    grid.innerHTML = accounts.map(acc => {
        const data = store[acc.id];
        const sMeta = getJobStatusMeta(acc.id, 'soldier');
        const tMeta = getJobStatusMeta(acc.id, 'tech');

        return `
        <div class="account-column ${acc.id}">
            ${renderProfileHeader(acc)}
            
            <div class="section-block">
                <div class="section-header">
                    <span>⚔️ 士兵訓練</span>
                    <button class="btn-add" onclick="addItem('${acc.id}', 'soldiers')">+</button>
                </div>
                <div>
                    ${renderSectionCards(acc.id, 'soldiers', data.soldiers)}
                </div>
            </div>

            <div class="section-block">
                <div class="section-header">
                    <span>🔬 科技研究</span>
                </div>
                <div>
                    ${renderSectionCards(acc.id, 'tech', data.tech)}
                </div>
            </div>

            <div class="section-block">
                <div class="section-header">
                    <span>📖 大師技能</span>
                </div>
                <div>
                    ${renderSectionCards(acc.id, 'master', data.master)}
                </div>
            </div>

            ${showSunlightEvent ? `
            <div class="section-block">
                <div class="section-header">
                    <span>☀️ 沐光之旅</span>
                    <button class="btn-add" onclick="addItem('${acc.id}', 'sunlight')">+</button>
                </div>
                <div>
                    ${renderSectionCards(acc.id, 'sunlight', data.sunlight)}
                </div>
            </div>
            ` : ''}

            <div class="job-section">
                <div class="job-section-header">
                    <span class="job-section-title">🏛️ 職位預約看板</span>
                    <button class="btn-goto-timeline" onclick="openTimelineView()">去時間線設定 ➔</button>
                </div>
                
                <div class="job-status-card ${sMeta.dueBorderClass}" id="home_job_s_${acc.id}">
                    <div class="job-status-top">
                        <span>🏛️ 士兵：${sMeta.dateHtml}</span>
                        <span id="home_status_s_${acc.id}">${sMeta.statusHtml}</span>
                    </div>
                    <div class="job-status-bottom">
                        <span>距離職位時間</span>
                        <span class="dist-text" id="home_dist_s_${acc.id}">${sMeta.distText}</span>
                    </div>
                </div>

                <div class="job-status-card ${tMeta.dueBorderClass}" id="home_job_t_${acc.id}">
                    <div class="job-status-top">
                        <span>🏛️ 科技：${tMeta.dateHtml}</span>
                        <span id="home_status_t_${acc.id}">${tMeta.statusHtml}</span>
                    </div>
                    <div class="job-status-bottom">
                        <span>距離職位時間</span>
                        <span class="dist-text" id="home_dist_t_${acc.id}">${tMeta.distText}</span>
                    </div>
                </div>
            </div>
        </div>
    `}).join('');
}

function renderTimerCard(accId, type, item, seqNum) {
    const isRunning = item.endTime !== null;
    let extraCardClass = '';
    let presetsHtml = '';
    const isSingleSlotType = (type === 'tech' || type === 'master');

    const dueBorderClass = (isRunning && item.endTime) ? getDueBorderClass(item.endTime) : '';

    if (type === 'master') {
        extraCardClass = 'master-card';
        if (!isRunning) {
            presetsHtml = `
                <div class="preset-row">
                    <span style="font-size:11px; opacity:0.9; margin-right:2px;">快捷:</span>
                    <button class="btn-preset" onclick="applyPreset('${accId}', 'master', ${item.id}, 0, 0, 10, true)">10分</button>
                    <button class="btn-preset" onclick="applyPreset('${accId}', 'master', ${item.id}, 0, 2, 0, true)">2時</button>
                    <button class="btn-preset" onclick="applyPreset('${accId}', 'master', ${item.id}, 0, 10, 0, true)">10時</button>
                    <button class="btn-preset" onclick="applyPreset('${accId}', 'master', ${item.id}, 0, 23, 0, true)">23時</button>
                    <button class="btn-preset" onclick="applyPreset('${accId}', 'master', ${item.id}, 3, 0, 0, true)">3天</button>
                    <button class="btn-preset" onclick="applyPreset('${accId}', 'master', ${item.id}, 5, 0, 0, true)">5天</button>
                </div>
            `;
        }
    } else if (type === 'sunlight') {
        extraCardClass = 'sunlight-card';
        if (!isRunning) {
            presetsHtml = `
                <div class="preset-row">
                    <span style="font-size:11px; opacity:0.92; margin-right:2px;">周期:</span>
                    <button class="btn-preset" onclick="applyPreset('${accId}', 'sunlight', ${item.id}, 0, 8, 0, true)">▶ 8小時整</button>
                </div>
            `;
        }
    }

    return `
    <div class="timer-item-row">
        <div class="left-slot-box">
            ${seqNum !== null ? `<span class="flower-seq-badge">${seqNum}</span>` : ''}
        </div>
        <div class="timer-card ${extraCardClass} ${dueBorderClass}" id="card_${item.id}">
            <div class="timer-main-row">
                <div class="timer-info">
                    <div class="timer-display" id="disp_${item.id}">
                        ${isRunning ? '--:--' : `${item.d}天 ${formatPad(item.h)}:${formatPad(item.m)}`}
                    </div>
                    <span class="timer-sub" id="sub_${item.id}">
                        ${isRunning ? '完結: ' + formatDateTimeHlHtml(item.endTime) : '設定時間後按開始'}
                    </span>
                </div>

                <div class="timer-actions">
                    ${!isRunning ? `
                        <div class="timer-inputs">
                            <input type="text" inputmode="numeric" pattern="[0-9]*" class="time-input input-d" id="in_d_${item.id}" value="${item.d}" 
                                maxlength="2" 
                                onfocus="this.select()"
                                onkeydown="handleArrowNav(event, null, 'in_h_${item.id}', '${accId}', '${type}', ${item.id})"
                                onkeyup="autoJumpOnNumber(event, this, 'in_h_${item.id}')">天
                            <input type="text" inputmode="numeric" pattern="[0-9]*" class="time-input input-h" id="in_h_${item.id}" value="${formatPad(item.h)}" 
                                maxlength="2" 
                                onfocus="this.select()"
                                onkeydown="handleArrowNav(event, 'in_d_${item.id}', 'in_m_${item.id}', '${accId}', '${type}', ${item.id})"
                                onkeyup="autoJumpOnNumber(event, this, 'in_m_${item.id}')">時
                            <input type="text" inputmode="numeric" pattern="[0-9]*" class="time-input input-m" id="in_m_${item.id}" value="${formatPad(item.m)}" 
                                maxlength="2" 
                                onfocus="this.select()"
                                onkeydown="handleArrowNav(event, 'in_h_${item.id}', null, '${accId}', '${type}', ${item.id})">分
                        </div>
                        <button class="btn-action" onclick="startTimer('${accId}', '${type}', ${item.id})">▶ 開始</button>
                    ` : `
                        <button class="btn-action" onclick="editRunningTimer('${accId}', '${type}', ${item.id})">✏️ 修改</button>
                    `}
                    ${!isSingleSlotType ? `<button class="btn-del" title="刪除此項" onclick="deleteItem('${accId}', '${type}', ${item.id})">✕</button>` : ''}
                </div>
            </div>
            ${presetsHtml}
        </div>
    </div>
    `;
}

function handleArrowNav(event, prevFieldId, nextFieldId, accId, type, id) {
    const parentCard = event.target.closest('.timer-card');
    if (event.key === 'Enter') {
        event.preventDefault();
        startTimer(accId, type, id);
        return;
    }
    if (event.key === 'ArrowLeft' && prevFieldId && parentCard) {
        event.preventDefault();
        const prevInput = parentCard.querySelector('#' + prevFieldId);
        if (prevInput) { prevInput.focus(); prevInput.select(); }
    }
    if (event.key === 'ArrowRight' && nextFieldId && parentCard) {
        event.preventDefault();
        const nextInput = parentCard.querySelector('#' + nextFieldId);
        if (nextInput) { nextInput.focus(); nextInput.select(); }
    }
}

function autoJumpOnNumber(event, currentInput, nextFieldId) {
    const isNumberKey = (event.key >= '0' && event.key <= '9');
    if (isNumberKey && currentInput.value.length >= 2 && nextFieldId) {
        const parentCard = currentInput.closest('.timer-card');
        if (parentCard) {
            const nextInput = parentCard.querySelector('#' + nextFieldId);
            if (nextInput) { nextInput.focus(); nextInput.select(); }
        }
    }
}

function addItem(accId, type) {
    if (type === 'tech' || type === 'master') return;

    let defD = 0, defH = 0, defM = 0;
    if (type === 'sunlight') { defH = 8; }

    store[accId][type].push({ id: ++nextId, d: defD, h: defH, m: defM, endTime: null });
    renderGrid();
}

function deleteItem(accId, type, id) {
    if (type === 'tech' || type === 'master') {
        const item = store[accId][type][0];
        if (item) {
            item.d = 0;
            item.h = 0;
            item.m = type === 'master' ? 10 : 0;
            item.endTime = null;
        }
    } else {
        store[accId][type] = store[accId][type].filter(item => item.id !== id);
    }
    recalculateJobs(accId, type);
    renderGrid();
    saveState();
}

function startTimer(accId, type, id) {
    initAudioContext();
    requestDesktopNotificationPermission();
    const cardEl = document.getElementById(`card_${id}`);
    const item = store[accId][type].find(i => i.id === id);

    if (cardEl && item) {
        const inputD = cardEl.querySelector('.input-d');
        const inputH = cardEl.querySelector('.input-h');
        const inputM = cardEl.querySelector('.input-m');

        item.d = Math.max(0, inputD ? (parseInt(inputD.value, 10) || 0) : 0);
        item.h = Math.max(0, inputH ? (parseInt(inputH.value, 10) || 0) : 0);
        item.m = Math.max(0, inputM ? (parseInt(inputM.value, 10) || 0) : 0);

        const now = getAccurateNow();
        const totalSeconds = (item.d * 86400) + (item.h * 3600) + (item.m * 60);
        item.endTime = new Date(now.getTime() + totalSeconds * 1000);

        recalculateJobs(accId, type, true);
        renderGrid();
        saveState();
    }
}

function editRunningTimer(accId, type, id) {
    const item = store[accId][type].find(i => i.id === id);
    if (item) {
        if (item.endTime) {
            const diffSec = Math.max(0, Math.ceil((item.endTime - getAccurateNow()) / 1000));
            item.d = Math.floor(diffSec / 86400);
            item.h = Math.floor((diffSec % 86400) / 3600);
            item.m = Math.floor((diffSec % 3600) / 60);
        }
        item.endTime = null;
        recalculateJobs(accId, type);
        renderGrid();
        saveState();
    }
}

// ==========================================
// 7. 每秒倒數更新 & 職位預約計算 & 時間線渲染
// ==========================================
function updateTimers() {
    const now = getAccurateNow();
    const typeNames = {
        soldiers: '⚔️ 士兵訓練',
        tech: '🔬 科技研究',
        master: '📖 大師技能',
        sunlight: '☀️ 沐光之旅'
    };

    accounts.forEach(acc => {
        const displayName = getDisplayAccountName(acc.id);
        ['soldiers', 'tech', 'master', 'sunlight'].forEach(type => {
            if (type === 'sunlight' && !showSunlightEvent) return;

            const typeName = typeNames[type];
            const showNum = (type === 'soldiers' || type === 'sunlight');
            (store[acc.id][type] || []).forEach((item, idx) => {
                if (item.endTime) {
                    const diff = Math.floor((item.endTime - now) / 1000);
                    const disp = document.getElementById(`disp_${item.id}`);

                    if (diff <= 0) {
                        if (disp) disp.innerText = "00:00 (完結)";
                        const eventKey = `task_${item.id}_${item.endTime.getTime()}`;
                        const numSuffix = showNum ? ` #${idx + 1}` : '';
                        triggerAlarmAlert(
                            eventKey,
                            `[${displayName}] ${typeName}${numSuffix} 已經完成！`,
                            item.endTime.getTime(),
                            { accId: acc.id, category: type, itemId: item.id }
                        );
                    } else if (disp) {
                        const d = Math.floor(diff / 86400);
                        const h = Math.floor((diff % 86400) / 3600);
                        const m = Math.floor((diff % 3600) / 60);
                        const s = diff % 60;
                        disp.innerText = (d > 0 ? `${d}天 ` : '') + `${formatPad(h)}:${formatPad(m)}:${formatPad(s)}`;
                    }
                }
            });
        });

        if (store[acc.id].soldierJobConfirmed && store[acc.id].soldierJobDate && now >= store[acc.id].soldierJobDate) {
            const jobKey = `job_s_${acc.id}_${store[acc.id].soldierJobDate.getTime()}`;
            triggerAlarmAlert(
                jobKey,
                `[${displayName}] 🏛️ 士兵職位預約時間 (${store[acc.id].soldierJobTime}) 到了！`,
                store[acc.id].soldierJobDate.getTime(),
                { accId: acc.id, category: 'job_soldier', itemId: null }
            );
        }

        if (store[acc.id].techJobConfirmed && store[acc.id].techJobDate && now >= store[acc.id].techJobDate) {
            const jobKey = `job_t_${acc.id}_${store[acc.id].techJobDate.getTime()}`;
            triggerAlarmAlert(
                jobKey,
                `[${displayName}] 🏛️ 科技職位預約時間 (${store[acc.id].techJobTime}) 到了！`,
                store[acc.id].techJobDate.getTime(),
                { accId: acc.id, category: 'job_tech', itemId: null }
            );
        }

        const sMeta = getJobStatusMeta(acc.id, 'soldier');
        const sStatusEl = document.getElementById(`home_status_s_${acc.id}`);
        if (sStatusEl && sStatusEl.innerHTML !== sMeta.statusHtml) {
            sStatusEl.innerHTML = sMeta.statusHtml;
        }
        const sDistEl = document.getElementById(`home_dist_s_${acc.id}`);
        if (sDistEl) sDistEl.innerText = sMeta.distText;

        const tMeta = getJobStatusMeta(acc.id, 'tech');
        const tStatusEl = document.getElementById(`home_status_t_${acc.id}`);
        if (tStatusEl && tStatusEl.innerHTML !== tMeta.statusHtml) {
            tStatusEl.innerHTML = tMeta.statusHtml;
        }
        const tDistEl = document.getElementById(`home_dist_t_${acc.id}`);
        if (tDistEl) tDistEl.innerText = tMeta.distText;
    });

    checkExpiredJobsQuietly();

    const tlView = document.getElementById('timelineView');
    if (tlView && tlView.style.display === 'block') {
        updateTimelineDynamicTextsOnly();
    }
}

function checkExpiredJobsQuietly() {
    const now = getAccurateNow();
    let changed = false;

    accounts.forEach(acc => {
        ['soldierJobDate', 'techJobDate'].forEach(dateKey => {
            const expiredJobDate = store[acc.id][dateKey];
            if (expiredJobDate && (now - expiredJobDate > 10 * 60 * 1000)) {
                const isSoldier = dateKey === 'soldierJobDate';
                const timeKey = isSoldier ? 'soldierJobTime' : 'techJobTime';
                const confKey = isSoldier ? 'soldierJobConfirmed' : 'techJobConfirmed';
                const manualKey = isSoldier ? 'soldierJobManual' : 'techJobManual';
                const wasConfirmed = Boolean(store[acc.id][confKey]);
                const coolEndMs = expiredJobDate.getTime() + 10 * 60 * 1000;

                store[acc.id][timeKey] = '';
                store[acc.id][dateKey] = null;
                store[acc.id][confKey] = false;
                store[acc.id][manualKey] = false;

                const cat = isSoldier ? 'soldiers' : 'tech';
                recalculateJobs(acc.id, cat, true);

                if (wasConfirmed) {
                    const displayName = getDisplayAccountName(acc.id);
                    const nextSlotTime = store[acc.id][timeKey];
                    const jobLabel = isSoldier ? '士兵職位' : '科技職位';
                    const coolKey = `cool_done_${isSoldier ? 's' : 't'}_${acc.id}_${expiredJobDate.getTime()}`;
                    const msg = nextSlotTime
                        ? `[${displayName}] 🏛️ ${jobLabel} 10分冷卻已結束！建議預約下一輪：${nextSlotTime}`
                        : `[${displayName}] 🏛️ ${jobLabel} 10分冷卻已結束！可預約下一輪`;

                    triggerAlarmAlert(coolKey, msg, coolEndMs, {
                        accId: acc.id,
                        category: isSoldier ? 'cooldown_soldier' : 'cooldown_tech',
                        recommendedTime: nextSlotTime || ''
                    });
                }

                changed = true;
            }
        });
    });

    if (changed) {
        renderGrid();
        updateTimeline(true);
        saveState();
    }
}

function recalculateJobs(targetAccId = null, targetCategory = null, forceUnlock = false) {
    const now = getAccurateNow();

    accounts.forEach(acc => {
        if (targetAccId && acc.id !== targetAccId) return;

        if (!targetCategory || targetCategory === 'soldiers') {
            if (!isJobInCooldown(acc.id, 'soldier', now)) {
                if (forceUnlock || (store[acc.id].soldierJobDate && store[acc.id].soldierJobDate <= now)) {
                    store[acc.id].soldierJobConfirmed = false;
                    store[acc.id].soldierJobManual = false;
                }
                const isSoldierLocked = Boolean(store[acc.id].soldierJobConfirmed || store[acc.id].soldierJobManual);
                if (!isSoldierLocked) {
                    let futureSoldierEnds = (store[acc.id].soldiers || []).filter(i => i.endTime && i.endTime > now).map(i => i.endTime);
                    if (futureSoldierEnds.length > 0) {
                        futureSoldierEnds.sort((a, b) => a - b);
                        const slotObj = calcRecommendedSlot(futureSoldierEnds[0]);
                        store[acc.id].soldierJobTime = slotObj.timeStr;
                        store[acc.id].soldierJobDate = slotObj.dateObj;
                        store[acc.id].soldierJobConfirmed = false;
                        store[acc.id].soldierJobManual = false;
                    } else {
                        store[acc.id].soldierJobTime = '';
                        store[acc.id].soldierJobDate = null;
                        store[acc.id].soldierJobConfirmed = false;
                        store[acc.id].soldierJobManual = false;
                    }
                }
            }
        }

        if (!targetCategory || targetCategory === 'tech') {
            if (!isJobInCooldown(acc.id, 'tech', now)) {
                if (forceUnlock || (store[acc.id].techJobDate && store[acc.id].techJobDate <= now)) {
                    store[acc.id].techJobConfirmed = false;
                    store[acc.id].techJobManual = false;
                }
                const isTechLocked = Boolean(store[acc.id].techJobConfirmed || store[acc.id].techJobManual);
                if (!isTechLocked) {
                    let futureTechEnds = (store[acc.id].tech || []).filter(i => i.endTime && i.endTime > now).map(i => i.endTime);
                    if (futureTechEnds.length > 0) {
                        futureTechEnds.sort((a, b) => a - b);
                        const slotObj = calcRecommendedSlot(futureTechEnds[0]);
                        store[acc.id].techJobTime = slotObj.timeStr;
                        store[acc.id].techJobDate = slotObj.dateObj;
                        store[acc.id].techJobConfirmed = false;
                        store[acc.id].techJobManual = false;
                    } else {
                        store[acc.id].techJobTime = '';
                        store[acc.id].techJobDate = null;
                        store[acc.id].techJobConfirmed = false;
                        store[acc.id].techJobManual = false;
                    }
                }
            }
        }
    });

    normalizeAllJobsConsistency();
    renderGrid();
    updateTimeline(true);
}

function calcRecommendedSlot(endTime) {
    const now = getAccurateNow();
    let slotDate = new Date(endTime);
    let h = slotDate.getHours();
    let m = slotDate.getMinutes();
    let slotH = h;
    let slotM = 0;

    if (m >= 50) {
        slotH = (h + 1) % 24;
        slotM = 0;
        if (slotH === 0) slotDate.setDate(slotDate.getDate() + 1);
    } else if (m >= 20) {
        slotM = 30;
    } else {
        slotM = 0;
    }

    slotDate.setHours(slotH, slotM, 0, 0);

    while (slotDate <= now) {
        slotDate = new Date(slotDate.getTime() + 30 * 60 * 1000);
    }

    const finalH = slotDate.getHours();
    const finalM = slotDate.getMinutes();

    return { timeStr: `${formatPad(finalH)}:${formatPad(finalM)}`, dateObj: slotDate };
}

function shiftJobTime(accId, type) {
    const timeKey = type === 'soldier' ? 'soldierJobTime' : 'techJobTime';
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';
    const manualKey = type === 'soldier' ? 'soldierJobManual' : 'techJobManual';

    let curDate = store[accId][dateKey] || getAccurateNow();
    let newDate = new Date(curDate.getTime() + 30 * 60 * 1000);

    store[accId][dateKey] = newDate;
    store[accId][timeKey] = formatTimeHM(newDate);
    store[accId][confKey] = false;
    store[accId][manualKey] = true;

    renderGrid();
    updateTimeline(true);
    saveState();
}

function manualJobChange(accId, type, val) {
    const timeKey = type === 'soldier' ? 'soldierJobTime' : 'techJobTime';
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';
    const manualKey = type === 'soldier' ? 'soldierJobManual' : 'techJobManual';

    store[accId][timeKey] = val;
    store[accId][confKey] = false;

    if (val) {
        const [h, m] = val.split(':').map(Number);
        let d = getAccurateNow();
        d.setHours(h, m, 0, 0);
        if (d < getAccurateNow()) d.setDate(d.getDate() + 1);
        store[accId][dateKey] = d;
        store[accId][timeKey] = formatTimeHM(d);
        store[accId][manualKey] = true;
    } else {
        store[accId][dateKey] = null;
        store[accId][manualKey] = false;
    }

    renderGrid();
    updateTimeline(true);
    saveState();
}

function toggleJobConfirmed(accId, type) {
    const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';
    const manualKey = type === 'soldier' ? 'soldierJobManual' : 'techJobManual';
    const nextState = !Boolean(store[accId][confKey]);
    store[accId][confKey] = nextState;
    store[accId][manualKey] = true;
    normalizeAllJobsConsistency();
    renderGrid();
    updateTimeline(true);
    saveState();
}

function generateJobOptions(selectedVal, emptyLabel = '--無預約--') {
    let html = `<option value="">${emptyLabel}</option>`;
    for (let h = 0; h < 24; h++) {
        for (let m of [0, 30]) {
            const timeStr = `${formatPad(h)}:${formatPad(m)}`;
            const isSel = timeStr === selectedVal ? 'selected' : '';
            html += `<option value="${timeStr}" ${isSel}>${timeStr}</option>`;
        }
    }
    return html;
}

function toggleMoreTimelineDays() {
    showAllTimelineDays = !showAllTimelineDays;
    updateTimeline(true);
}

function updateTimelineDynamicTextsOnly() {
    const now = getAccurateNow();
    accounts.forEach(acc => {
        ['soldier', 'tech'].forEach(type => {
            const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
            const curDate = store[acc.id][dateKey];
            const distEl = document.getElementById(`tl_dist_${type}_${acc.id}`);
            if (distEl) {
                distEl.innerText = curDate ? formatDurationShort(curDate.getTime() - now.getTime()) : '尚未設定時間';
            }
        });
    });
}

function updateTimeline(forceRedraw = false) {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'SELECT' && activeEl.closest('#timelineView')) {
        updateTimelineDynamicTextsOnly();
        return;
    }

    normalizeAllJobsConsistency();

    const tasksContainer = document.getElementById('timeline_tasks');
    const soldierJobsContainer = document.getElementById('timeline_soldier_jobs');
    const techJobsContainer = document.getElementById('timeline_tech_jobs');

    let tasksList = [];

    accounts.forEach(acc => {
        const displayName = getDisplayAccountName(acc.id);
        const bearFace = getBearFaceFile(acc.id);

        (store[acc.id].soldiers || []).forEach((item, idx) => {
            if (item.endTime) {
                tasksList.push({ acc: displayName, accId: acc.id, bearFace, time: item.endTime, label: `士兵 #${idx + 1}`, tagClass: 'tag-soldier' });
            }
        });
        (store[acc.id].tech || []).forEach((item) => {
            if (item.endTime) {
                tasksList.push({ acc: displayName, accId: acc.id, bearFace, time: item.endTime, label: `科技研究`, tagClass: 'tag-tech' });
            }
        });
        (store[acc.id].master || []).forEach((item) => {
            if (item.endTime) {
                tasksList.push({ acc: displayName, accId: acc.id, bearFace, time: item.endTime, label: `📖 大師技能`, tagClass: 'tag-master' });
            }
        });
        if (showSunlightEvent) {
            (store[acc.id].sunlight || []).forEach((item, idx) => {
                if (item.endTime) {
                    tasksList.push({ acc: displayName, accId: acc.id, bearFace, time: item.endTime, label: `☀️ 沐光之旅 #${idx + 1}`, tagClass: 'tag-sunlight' });
                }
            });
        }
    });

    tasksList.sort((a, b) => a.time - b.time);

    if (tasksContainer) {
        if (tasksList.length === 0) {
            tasksContainer.innerHTML = `<div style="text-align:center; color:#A38E7D; padding:18px; font-size:13px;">無進行中計時</div>`;
        } else {
            const todayTomorrowTasks = tasksList.filter(t => {
                const diff = getDayDiffFromToday(t.time);
                return diff === null || diff <= 1;
            });
            const laterTasksCount = tasksList.length - todayTomorrowTasks.length;
            const visibleTasks = showAllTimelineDays ? tasksList : todayTomorrowTasks;

            let html = '';
            let prevDateKey = null;

            if (visibleTasks.length === 0 && laterTasksCount > 0) {
                html += `<div style="text-align:center; color:#A38E7D; padding:10px; font-size:12.5px;">今天與明天無排程</div>`;
            }

            visibleTasks.forEach(item => {
                const curDateKey = getDateGroupKey(item.time);
                if (prevDateKey !== null && curDateKey !== prevDateKey) {
                    html += `
                        <div class="date-dot-divider" title="跨日分隔">
                            <div class="date-dot-line"></div>
                        </div>
                    `;
                }
                prevDateKey = curDateKey;

                html += `
                    <div class="timeline-item ${item.accId}">
                        <img class="tl-bear-sticker" src="${item.bearFace}" alt="">
                        <div class="tl-left-group">
                            <span class="tl-acc-name">[${item.acc}]</span>
                            <span class="tag ${item.tagClass}">${item.label}</span>
                        </div>
                        <div style="white-space:nowrap;">${formatDateTimeHlHtml(item.time)}</div>
                    </div>
                `;
            });

            if (laterTasksCount > 0) {
                html += `
                    <button class="btn-more-tasks" onclick="toggleMoreTimelineDays()">
                        ${showAllTimelineDays ? '🔼 收合後天以後的排程' : `🔽 顯示更多（還有 ${laterTasksCount} 項）`}
                    </button>
                `;
            }

            tasksContainer.innerHTML = html;
        }
    }

    renderJobManagementColumn(soldierJobsContainer, 'soldier');
    renderJobManagementColumn(techJobsContainer, 'tech');
}

function renderJobManagementColumn(container, type) {
    if (!container) return;
    const now = getAccurateNow();
    const timeKey = type === 'soldier' ? 'soldierJobTime' : 'techJobTime';
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';

    const activeEntries = accounts
        .filter(acc => store[acc.id][dateKey] && store[acc.id][timeKey])
        .map(acc => ({
            accId: acc.id,
            name: getDisplayAccountName(acc.id),
            date: store[acc.id][dateKey]
        }));

    container.innerHTML = accounts.map(acc => {
        const displayName = getDisplayAccountName(acc.id);
        const bearFace = getBearFaceFile(acc.id);
        const curDate = store[acc.id][dateKey];
        const curTimeStr = store[acc.id][timeKey] || (curDate ? formatTimeHM(curDate) : '');
        const isConfirmed = Boolean(store[acc.id][confKey]);
        const inCooldown = isJobInCooldown(acc.id, type, now);
        const hasValidSlot = Boolean(curTimeStr || curDate);

        let warnings = [];
        if (curDate) {
            activeEntries.forEach(other => {
                if (other.accId !== acc.id) {
                    const diffMin = Math.abs(curDate.getTime() - other.date.getTime()) / 60000;
                    if (diffMin === 0) {
                        warnings.push(`⚠️ 與 [${other.name}] 預約時間完全相撞！`);
                    } else if (diffMin < 10) {
                        warnings.push(`⚠️ 與 [${other.name}] 間隔僅 ${Math.round(diffMin)} 分鐘（注意 10 分鐘冷卻）`);
                    }
                }
            });
        }

        const distStr = curDate ? formatDurationShort(curDate.getTime() - now.getTime()) : '尚未設定時間';
        const dateBadgeHtml = curDate ? formatDateTimeHlHtml(curDate) : '--';
        let statusDesc = '';
        if (inCooldown) {
            const remainCoolMin = Math.max(1, Math.ceil((10 * 60 * 1000 - (now.getTime() - curDate.getTime())) / 60000));
            statusDesc = `狀態：⚠️ 冷卻剩 ${remainCoolMin} 分`;
        } else if (isConfirmed) {
            statusDesc = '狀態：已鎖定';
        } else if (hasValidSlot) {
            statusDesc = '狀態：待確認';
        }

        return `
            <div class="job-manage-card ${acc.id}">
                <img class="job-bear-sticker" src="${bearFace}" alt="">
                <div class="job-manage-top">
                    <span>[${displayName}]</span>
                    <span>${dateBadgeHtml}</span>
                </div>

                <div class="job-manage-controls">
                    <select onchange="manualJobChange('${acc.id}', '${type}', this.value)">
                        ${generateJobOptions(curTimeStr)}
                    </select>
                    <button class="btn-shift" onclick="shiftJobTime('${acc.id}', '${type}')">+30分</button>
                    ${hasValidSlot ? `
                        <button class="btn-confirm-job ${isConfirmed ? 'confirmed' : ''}" onclick="toggleJobConfirmed('${acc.id}', '${type}')">
                            ${isConfirmed ? '✅ 已確認預約' : '⬜ 確認已預約'}
                        </button>
                    ` : ''}
                </div>

                <div class="job-manage-meta">
                    <span>距離職位：<strong id="tl_dist_${type}_${acc.id}">${distStr}</strong></span>
                    <span>${statusDesc}</span>
                </div>

                ${warnings.length > 0 ? `<div class="job-warning-box">${warnings.join('<br>')}</div>` : ''}
            </div>
        `;
    }).join('');
}

function openTimelineView() {
    const timeline = document.getElementById('timelineView');
    const btn = document.getElementById('toggleBtn');
    const resBtn = document.getElementById('resToggleBtn');
    hideAllMainViews();
    timeline.style.display = 'block';
    btn.innerHTML = '<img class="btn-icon-svg" src="./assets/btn_change.svg" alt=""> 切換 3 欄視圖';
    if (resBtn) resBtn.innerText = '🌾 資源採集';
    updateTimeline(true);
}

function toggleView() {
    const grid = document.getElementById('gridView');
    const timeline = document.getElementById('timelineView');
    const btn = document.getElementById('toggleBtn');
    const resBtn = document.getElementById('resToggleBtn');

    if (timeline.style.display === 'block') {
        hideAllMainViews();
        grid.style.display = 'grid';
        btn.innerHTML = '<img class="btn-icon-svg" src="./assets/btn_change.svg" alt=""> 切換時間線';
        if (resBtn) resBtn.innerText = '🌾 資源採集';
    } else {
        openTimelineView();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
