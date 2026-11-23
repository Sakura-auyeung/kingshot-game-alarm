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
// 2. 全域常數與狀態變數
// ==========================================
const STORAGE_KEY = "multi_account_alarm_local_backup";
const PROFILE_STORAGE_KEY = "multi_account_profiles_backup";
const NOTIF_HISTORY_KEY = "multi_account_notif_history_v2";
const ORIGINAL_TITLE = "多帳戶鬧鐘與職位助手";

const accounts = [
    { id: 'h', name: 'h', isMain: false, faceFile: 'chara_face_2-1.png' },
    { id: 'z', name: 'z', isMain: true, faceFile: 'chara_face_1-1.png' },
    { id: 'p', name: 'p', isMain: false, faceFile: 'chara_face_4-1.png' }
];

function getBearFaceFile(accId) {
    const acc = accounts.find(a => a.id === accId);
    return acc ? `./assets/${acc.faceFile}` : './assets/chara_face_1-1.png';
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

let showSunlightEvent = true;
let showAllTimelineDays = false;
let latestStateUpdatedAt = 0;

let store = {
    h: {
        soldiers: [{ id: 1, d: 0, h: 0, m: 0, endTime: null }],
        tech: [{ id: 2, d: 0, h: 0, m: 0, endTime: null }],
        master: [{ id: 101, d: 0, h: 0, m: 10, endTime: null }],
        sunlight: [{ id: 201, d: 0, h: 8, m: 0, endTime: null }],
        soldierJobTime: '', soldierJobDate: null, soldierJobConfirmed: false, soldierJobManual: false,
        techJobTime: '', techJobDate: null, techJobConfirmed: false, techJobManual: false
    },
    z: {
        soldiers: [{ id: 3, d: 0, h: 0, m: 0, endTime: null }],
        tech: [{ id: 4, d: 0, h: 0, m: 0, endTime: null }],
        master: [{ id: 102, d: 0, h: 0, m: 10, endTime: null }],
        sunlight: [{ id: 202, d: 0, h: 8, m: 0, endTime: null }],
        soldierJobTime: '', soldierJobDate: null, soldierJobConfirmed: false, soldierJobManual: false,
        techJobTime: '', techJobDate: null, techJobConfirmed: false, techJobManual: false
    },
    p: {
        soldiers: [{ id: 5, d: 0, h: 0, m: 0, endTime: null }],
        tech: [{ id: 6, d: 0, h: 0, m: 0, endTime: null }],
        master: [{ id: 103, d: 0, h: 0, m: 10, endTime: null }],
        sunlight: [{ id: 203, d: 0, h: 8, m: 0, endTime: null }],
        soldierJobTime: '', soldierJobDate: null, soldierJobConfirmed: false, soldierJobManual: false,
        techJobTime: '', techJobDate: null, techJobConfirmed: false, techJobManual: false
    }
};

let notifHistory = [];
let triggeredEventKeys = new Set();
let nextId = 300;
let audioCtx = null;
let ringInterval = null;
let activeSystemNotifications = [];
let isInitialLoadDone = false;
let serverTimeOffsetMs = 0;

let splashStartTime = 0;
let isFirebaseFirstLoaded = false;
let isSplashHidden = false;

// ==========================================
// 3. 載入動畫 & 伺服器時間校準
// ==========================================
function startSplashLoader() {
    const splash = document.getElementById('loadingSplash');
    if (!splash) return;
    splashStartTime = Date.now();
    splash.classList.remove('hidden', 'shaki');

    setTimeout(() => {
        if (!isSplashHidden) splash.classList.add('shaki');
    }, 300);

    setTimeout(() => {
        hideSplashScreen();
    }, 1100);
}

function notifyDataReadyForSplash() {
    if (isFirebaseFirstLoaded) return;
    isFirebaseFirstLoaded = true;
    const elapsed = Date.now() - splashStartTime;
    const remain = Math.max(0, 350 - elapsed);
    setTimeout(hideSplashScreen, remain);
}

function hideSplashScreen() {
    if (isSplashHidden) return;
    isSplashHidden = true;
    const splash = document.getElementById('loadingSplash');
    if (splash) {
        splash.classList.add('shaki');
        splash.classList.add('hidden');
    }
}

function getAccurateNow() {
    return new Date(Date.now() + serverTimeOffsetMs);
}

function setupAutoTimeSync() {
    if (!hasFirebase || !db) return;
    try {
        db.ref(".info/serverTimeOffset").on("value", (snap) => {
            const offset = snap.val();
            if (typeof offset === "number" && Math.abs(offset) < 12 * 3600 * 1000) {
                serverTimeOffsetMs = offset;
                renderGrid();
                updateTimeline(true);
            }
        });
    } catch (e) {
        serverTimeOffsetMs = 0;
    }
}

// ==========================================
// 4. 格式化工具函式
// ==========================================
function formatPad(n) {
    return String(Math.max(0, parseInt(n, 10) || 0)).padStart(2, '0');
}

function formatTimeHM(date) {
    if (!date || isNaN(date.getTime())) return '';
    return `${formatPad(date.getHours())}:${formatPad(date.getMinutes())}`;
}

function formatFullDateTime(date) {
    if (!date || isNaN(date.getTime())) return '';
    const m = formatPad(date.getMonth() + 1);
    const d = formatPad(date.getDate());
    const hm = formatTimeHM(date);
    return `${m}/${d} ${hm}`;
}

function formatCountdown(ms) {
    if (ms <= 0) return "00:00:00";
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (d > 0) return `${d}天 ${formatPad(h)}:${formatPad(m)}:${formatPad(s)}`;
    return `${formatPad(h)}:${formatPad(m)}:${formatPad(s)}`;
}

function formatPower(num) {
    if (!num || isNaN(num)) return '0';
    const n = Number(num);
    if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 億';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 萬';
    return n.toLocaleString();
}

function getDayTagHtml(targetDate) {
    if (!targetDate || isNaN(targetDate.getTime())) return '';
    const now = getAccurateNow();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const diffDays = Math.round((startTarget - startToday) / 86400000);

    if (diffDays === 0) return `<span class="day-hl today">今日</span>`;
    if (diffDays === 1) return `<span class="day-hl tomorrow">明日</span>`;
    return '';
}

function getDueBorderClass(targetDate) {
    if (!targetDate || isNaN(targetDate.getTime())) return '';
    const now = getAccurateNow();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const diffDays = Math.round((startTarget - startToday) / 86400000);

    if (diffDays === 0) return 'due-today';
    if (diffDays === 1) return 'due-tomorrow';
    return '';
}

function getDisplayAccountName(accId) {
    const p = profiles[accId];
    if (p && p.name) return p.name;
    return accId.toUpperCase();
}

function escapeAttr(str) {
    return String(str).replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

// ==========================================
// 5. 外部角色戰力與頭像 API 同步 & 雙欄位編輯彈窗
// ==========================================
async function fetchSingleProfile(accId) {
    const p = profiles[accId];
    if (!p || !p.queryName) return false;

    const rawUrl = `https://kingdom-1177.vercel.app/api/governor-profile?name=${encodeURIComponent(p.queryName)}&alliance=${encodeURIComponent(p.queryAlliance || '')}`;
    const candidateUrls = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(rawUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rawUrl)}`
    ];

    for (const targetUrl of candidateUrls) {
        try {
            const res = await fetch(targetUrl, { cache: 'no-store' });
            if (!res.ok) continue;
            const text = await res.text();
            const data = JSON.parse(text);
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
    }
    return false;
}

async function fetchAllProfiles() {
    let anyUpdated = false;
    for (const acc of accounts) {
        const ok = await fetchSingleProfile(acc.id);
        if (ok) anyUpdated = true;
    }
    if (anyUpdated) {
        saveProfiles();
        renderGrid();
        if (typeof renderResourcesGrid === 'function') renderResourcesGrid();
        updateTimeline(true);
    }
}

let editingProfileAccId = null;

function editAccountQuery(accId) {
    const current = profiles[accId];
    if (!current) return;
    editingProfileAccId = accId;

    const nameInput = document.getElementById('modalProfileName');
    const allianceInput = document.getElementById('modalProfileAlliance');
    const modal = document.getElementById('profileEditModal');

    if (nameInput) nameInput.value = current.queryName || current.name || '';
    if (allianceInput) allianceInput.value = current.queryAlliance || current.alliance || '';
    if (modal) modal.classList.add('open');
    if (nameInput) setTimeout(() => nameInput.focus(), 50);
}

function closeProfileEditModal() {
    editingProfileAccId = null;
    const modal = document.getElementById('profileEditModal');
    if (modal) modal.classList.remove('open');
}

async function saveProfileEditModal() {
    if (!editingProfileAccId) return;
    const accId = editingProfileAccId;
    const current = profiles[accId];
    const nameInput = document.getElementById('modalProfileName');
    const allianceInput = document.getElementById('modalProfileAlliance');

    const newName = (nameInput ? nameInput.value : '').trim();
    const newAlliance = (allianceInput ? allianceInput.value : '').trim().toUpperCase();

    if (!newName) {
        alert('請輸入遊戲角色名稱！');
        return;
    }

    current.queryName = newName;
    current.name = newName;
    current.queryAlliance = newAlliance;
    current.alliance = newAlliance;

    closeProfileEditModal();
    saveProfiles();
    renderGrid();
    if (typeof renderResourcesGrid === 'function') renderResourcesGrid();
    updateTimeline(true);

    const ok = await fetchSingleProfile(accId);
    if (ok) {
        saveProfiles();
        renderGrid();
        if (typeof renderResourcesGrid === 'function') renderResourcesGrid();
        updateTimeline(true);
    }
}

// ==========================================
// 6. 鈴聲提示 & 瀏覽器桌面通知
// ==========================================
function ensureAudioContext() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
}

function playSingleChime() {
    try {
        ensureAudioContext();
        if (!audioCtx) return;
        const notes = [523.25, 659.25, 783.99, 1046.50];
        const now = audioCtx.currentTime;
        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.12);
            gain.gain.setValueAtTime(0.001, now + idx * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.12 + 0.03);
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
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(() => updateNotifBadgeUI());
    }
}

function sendDesktopNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        try {
            const n = new Notification(title, {
                body: body,
                icon: './assets/chara_face_1-1.png'
            });
            activeSystemNotifications.push(n);
            n.onclick = () => {
                window.focus();
                if (typeof switchMainTab === 'function') {
                    switchMainTab('grid');
                }
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
                sendDesktopNotification(title, body);
            }
        });
    }
}

function testAlarm() {
    ensureAudioContext();
    playSingleChime();
    const nowMs = getAccurateNow().getTime();
    const msg = `【測試】 [${getDisplayAccountName('z')}] 士兵訓練 已完成！`;
    sendDesktopNotification('⏰ 遊戲鬧鐘測試提醒', msg);
    pushNotificationEvent({
        id: `test_${nowMs}`,
        accId: 'z',
        category: 'soldiers',
        itemId: null,
        message: msg,
        timestamp: nowMs,
        unread: true
    }, false);
    const drop = document.getElementById('notifDropdown');
    if (drop) drop.classList.add('open');
}

// ==========================================
// 7. 待辦清單 & 提醒紀錄系統
// ==========================================
function loadNotifHistory() {
    try {
        const raw = localStorage.getItem(NOTIF_HISTORY_KEY);
        if (raw) notifHistory = JSON.parse(raw) || [];
    } catch (e) {
        notifHistory = [];
    }
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
        sendDesktopNotification('⏰ 遊戲鬧鐘提醒', eventObj.message);
    }
}

function toggleBellDropdown(event) {
    if (event) event.stopPropagation();
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
    saveNotifHistory();
    renderBellUI();
    if (notifHistory.filter(n => n.unread).length === 0) stopRinging();
}

function markAllNotifsRead() {
    notifHistory.forEach(n => { n.unread = false; });
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
            target.endTime = new Date(getAccurateNow().getTime() + totalMs);
        }
    }

    const notifItem = notifHistory.find(n => n.id === notifId);
    if (notifItem) notifItem.unread = false;

    saveNotifHistory();
    renderBellUI();
    if (notifHistory.filter(n => n.unread).length === 0) stopRinging();

    renderGrid();
    updateTimeline(true);
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
    setJobTime(accId, jType, timeStr, true);
    const notifItem = notifHistory.find(n => n.id === notifId);
    if (notifItem) notifItem.unread = false;
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
            renewControlHtml = `
                <div class="todo-renew-box" id="todo_box_${idx}">
                    <div class="todo-renew-row">
                        <span style="font-weight:700;">預約時段：</span>
                        <select class="todo-time-select" id="todo_job_sel_${idx}" onchange="confirmJobFromTodo('${safeId}', '${accId}', '${jType}', this.value)">
                            ${generateJobOptions(selectedTime, '選擇時段')}
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

// ==========================================
// 8. Firebase 與本地儲存資料序列化
// ==========================================
function serializeStore() {
    const out = {
        showSunlightEvent: showSunlightEvent,
        resources: typeof resourcesStore !== 'undefined' ? resourcesStore : {},
        updatedAt: Date.now()
    };
    accounts.forEach(acc => {
        const s = store[acc.id];
        out[acc.id] = {
            soldiers: (s.soldiers || []).map(it => ({ ...it, endTime: it.endTime ? it.endTime.getTime() : null })),
            tech: (s.tech || []).map(it => ({ ...it, endTime: it.endTime ? it.endTime.getTime() : null })),
            master: (s.master || []).map(it => ({ ...it, endTime: it.endTime ? it.endTime.getTime() : null })),
            sunlight: (s.sunlight || []).map(it => ({ ...it, endTime: it.endTime ? it.endTime.getTime() : null })),
            soldierJobTime: s.soldierJobTime || '',
            soldierJobDate: s.soldierJobDate ? s.soldierJobDate.getTime() : null,
            soldierJobConfirmed: !!s.soldierJobConfirmed,
            soldierJobManual: !!s.soldierJobManual,
            techJobTime: s.techJobTime || '',
            techJobDate: s.techJobDate ? s.techJobDate.getTime() : null,
            techJobConfirmed: !!s.techJobConfirmed,
            techJobManual: !!s.techJobManual
        };
    });
    return out;
}

function applySerializedData(data) {
    if (!data || typeof data !== 'object') return;
    if (typeof data.showSunlightEvent === 'boolean') {
        showSunlightEvent = data.showSunlightEvent;
        updateSunlightToggleBtnUI();
    }
    if (data.resources && typeof resourcesStore !== 'undefined') {
        accounts.forEach(acc => {
            if (data.resources[acc.id]) {
                resourcesStore[acc.id] = {
                    ...resourcesStore[acc.id],
                    ...data.resources[acc.id]
                };
            }
        });
    }

    accounts.forEach(acc => {
        const d = data[acc.id];
        if (!d) return;
        ['soldiers', 'tech', 'master', 'sunlight'].forEach(cat => {
            if (Array.isArray(d[cat]) && d[cat].length > 0) {
                store[acc.id][cat] = d[cat].map(it => {
                    if (it.id >= nextId) nextId = it.id + 1;
                    return {
                        id: it.id,
                        d: Number(it.d) || 0,
                        h: Number(it.h) || 0,
                        m: Number(it.m) || 0,
                        endTime: it.endTime ? new Date(it.endTime) : null
                    };
                });
            }
        });
        store[acc.id].soldierJobTime = d.soldierJobTime || '';
        store[acc.id].soldierJobDate = d.soldierJobDate ? new Date(d.soldierJobDate) : null;
        store[acc.id].soldierJobConfirmed = !!d.soldierJobConfirmed;
        store[acc.id].soldierJobManual = !!d.soldierJobManual;

        store[acc.id].techJobTime = d.techJobTime || '';
        store[acc.id].techJobDate = d.techJobDate ? new Date(d.techJobDate) : null;
        store[acc.id].techJobConfirmed = !!d.techJobConfirmed;
        store[acc.id].techJobManual = !!d.techJobManual;
    });

    normalizeAllJobsConsistency();
}

function saveState() {
    const payload = serializeStore();
    latestStateUpdatedAt = payload.updatedAt;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}

    if (hasFirebase && dbRef) {
        dbRef.set(payload).catch(err => console.warn("Firebase 寫入失敗:", err));
    }
}

function saveProfiles() {
    try {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
    } catch (e) {}

    if (hasFirebase && profileDbRef) {
        profileDbRef.set(profiles).catch(err => console.warn("Profiles 寫入失敗:", err));
    }
}

function loadLocalBackups() {
    try {
        const rawP = localStorage.getItem(PROFILE_STORAGE_KEY);
        if (rawP) {
            const parsedP = JSON.parse(rawP);
            accounts.forEach(acc => {
                if (parsedP && parsedP[acc.id]) {
                    profiles[acc.id] = { ...profiles[acc.id], ...parsedP[acc.id] };
                }
            });
        }
    } catch (e) {}

    try {
        const rawS = localStorage.getItem(STORAGE_KEY);
        if (rawS) applySerializedData(JSON.parse(rawS));
    } catch (e) {}
}

function setupFirebaseListeners() {
    const syncBadge = document.getElementById('syncBadge');
    if (!hasFirebase || !dbRef) {
        if (syncBadge) {
            syncBadge.className = 'sync-badge error';
            syncBadge.innerText = '💾 本地儲存模式';
        }
        notifyDataReadyForSplash();
        return;
    }

    dbRef.on("value", (snap) => {
        const val = snap.val();
        if (val) {
            applySerializedData(val);
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(val)); } catch (e) {}
        }
        if (syncBadge) {
            syncBadge.className = 'sync-badge connected';
            syncBadge.innerText = '🟢 雲端已同步';
        }

        const activeEl = document.activeElement;
        const isTypingResource = activeEl && activeEl.classList && activeEl.classList.contains('res-num-input');
        const isTypingTimer = activeEl && activeEl.classList && activeEl.classList.contains('time-input');

        if (!isTypingTimer) {
            renderGrid();
        }
        if (typeof renderResourcesGrid === 'function') {
            if (isTypingResource) {
                accounts.forEach(acc => {
                    if (typeof refreshAccountResourceVisualsOnly === 'function') {
                        refreshAccountResourceVisualsOnly(acc.id, activeEl.id);
                    }
                });
            } else {
                renderResourcesGrid();
            }
        }
        updateTimeline(true);
        notifyDataReadyForSplash();
        isInitialLoadDone = true;
    }, (err) => {
        if (syncBadge) {
            syncBadge.className = 'sync-badge error';
            syncBadge.innerText = '⚠️ 雲端連線異常';
        }
        notifyDataReadyForSplash();
    });

    if (profileDbRef) {
        profileDbRef.on("value", (snap) => {
            const val = snap.val();
            if (val) {
                accounts.forEach(acc => {
                    if (val[acc.id]) {
                        profiles[acc.id] = { ...profiles[acc.id], ...val[acc.id] };
                    }
                });
                try { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles)); } catch (e) {}
                renderGrid();
                if (typeof renderResourcesGrid === 'function') renderResourcesGrid();
                updateTimeline(true);
            }
        });
    }
}

// ==========================================
// 9. 職位自動排程與狀態邏輯
// ==========================================
function generateJobOptions(selectedVal = '', emptyLabel = '無預約') {
    let html = `<option value="" ${!selectedVal ? 'selected' : ''}>${emptyLabel}</option>`;
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 30) {
            const val = `${formatPad(h)}:${formatPad(m)}`;
            html += `<option value="${val}" ${selectedVal === val ? 'selected' : ''}>${val}</option>`;
        }
    }
    return html;
}

function getRecommendedJobSlotFromDate(endDate) {
    if (!endDate || isNaN(endDate.getTime())) return null;
    const d = new Date(endDate.getTime());
    const mins = d.getMinutes();
    if (mins === 0 || mins === 30) {
        d.setSeconds(0, 0);
    } else if (mins < 30) {
        d.setMinutes(30, 0, 0);
    } else {
        d.setHours(d.getHours() + 1, 0, 0, 0);
    }
    return d;
}

function autoSyncJobFromTimer(accId, type, endDate) {
    const manualKey = type === 'soldier' ? 'soldierJobManual' : 'techJobManual';
    const timeKey = type === 'soldier' ? 'soldierJobTime' : 'techJobTime';
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';

    if (store[accId][manualKey]) return;
    const slot = getRecommendedJobSlotFromDate(endDate);
    if (!slot) return;

    store[accId][dateKey] = slot;
    store[accId][timeKey] = formatTimeHM(slot);
    store[accId][confKey] = false;
}

function setJobTime(accId, type, timeStr, confirmed = false) {
    const timeKey = type === 'soldier' ? 'soldierJobTime' : 'techJobTime';
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';
    const manualKey = type === 'soldier' ? 'soldierJobManual' : 'techJobManual';

    if (!timeStr) {
        store[accId][timeKey] = '';
        store[accId][dateKey] = null;
        store[accId][confKey] = false;
        store[accId][manualKey] = false;
    } else {
        const [h, m] = timeStr.split(':').map(Number);
        const d = getAccurateNow();
        d.setHours(h, m, 0, 0);
        if (d.getTime() < getAccurateNow().getTime() - 10 * 60 * 1000) {
            d.setDate(d.getDate() + 1);
        }
        store[accId][timeKey] = timeStr;
        store[accId][dateKey] = d;
        store[accId][confKey] = confirmed;
        store[accId][manualKey] = true;
    }

    renderGrid();
    updateTimeline(true);
    saveState();
}

function shiftJobTime(accId, type, deltaMinutes) {
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const timeKey = type === 'soldier' ? 'soldierJobTime' : 'techJobTime';
    const manualKey = type === 'soldier' ? 'soldierJobManual' : 'techJobManual';

    let base = store[accId][dateKey];
    if (!base || isNaN(base.getTime())) {
        base = getRecommendedJobSlotFromDate(getAccurateNow());
    }
    const shifted = new Date(base.getTime() + deltaMinutes * 60 * 1000);
    store[accId][dateKey] = shifted;
    store[accId][timeKey] = formatTimeHM(shifted);
    store[accId][manualKey] = true;

    renderGrid();
    updateTimeline(true);
    saveState();
}

function toggleJobConfirm(accId, type) {
    const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    if (!store[accId][dateKey]) {
        alert('請先選擇職位預約時間！');
        return;
    }
    if (isJobInCooldown(accId, type, getAccurateNow())) {
        alert('同一職位目前仍在 10 分鐘冷卻中，冷卻結束後才能重新申請！');
        return;
    }
    store[accId][confKey] = !store[accId][confKey];
    renderGrid();
    updateTimeline(true);
    saveState();
}

function normalizeAllJobsConsistency() {
    accounts.forEach(acc => {
        ['soldier', 'tech'].forEach(type => {
            const timeKey = type === 'soldier' ? 'soldierJobTime' : 'techJobTime';
            const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
            const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';
            const manualKey = type === 'soldier' ? 'soldierJobManual' : 'techJobManual';

            const jDate = store[acc.id][dateKey];
            const jTime = store[acc.id][timeKey];

            if (jDate && !isNaN(jDate.getTime())) {
                store[acc.id][timeKey] = formatTimeHM(jDate);
            } else if (jTime) {
                const [h, m] = jTime.split(':').map(Number);
                if (!isNaN(h) && !isNaN(m)) {
                    const d = getAccurateNow();
                    d.setHours(h, m, 0, 0);
                    if (d < getAccurateNow()) d.setDate(d.getDate() + 1);
                    store[acc.id][dateKey] = d;
                } else {
                    store[acc.id][timeKey] = '';
                    store[acc.id][dateKey] = null;
                    store[acc.id][confKey] = false;
                    store[acc.id][manualKey] = false;
                }
            } else {
                store[acc.id][timeKey] = '';
                store[acc.id][dateKey] = null;
                store[acc.id][confKey] = false;
                store[acc.id][manualKey] = false;
            }
        });
    });
}

function isJobInCooldown(accId, type, now = getAccurateNow()) {
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const jobDate = store[accId] ? store[accId][dateKey] : null;
    if (!jobDate) return false;
    const diffMs = now.getTime() - jobDate.getTime();
    return diffMs >= 0 && diffMs < 10 * 60 * 1000;
}

function hasSameAccountJobConflict(accId) {
    const s = store[accId];
    if (!s || !s.soldierJobDate || !s.techJobDate) return false;
    if (isNaN(s.soldierJobDate.getTime()) || isNaN(s.techJobDate.getTime())) return false;
    return Math.abs(s.soldierJobDate.getTime() - s.techJobDate.getTime()) < 10 * 60 * 1000;
}

// ==========================================
// 10. 計時器操作邏輯
// ==========================================
function addTimerItem(accId, category) {
    const newItem = {
        id: nextId++,
        d: 0,
        h: category === 'sunlight' ? 8 : 0,
        m: category === 'master' ? 10 : 0,
        endTime: null
    };
    store[accId][category].push(newItem);
    renderGrid();
    updateTimeline(true);
    saveState();
}

function deleteTimerItem(accId, category, id) {
    if (store[accId][category].length <= 1) {
        store[accId][category][0].endTime = null;
    } else {
        store[accId][category] = store[accId][category].filter(it => it.id !== id);
    }
    renderGrid();
    updateTimeline(true);
    saveState();
}

function updateInputVal(accId, category, id, field, val) {
    const item = store[accId][category].find(it => it.id === id);
    if (!item) return;
    let num = Math.max(0, parseInt(val, 10) || 0);
    if (field === 'h' && num > 23) num = 23;
    if (field === 'm' && num > 59) num = 59;
    item[field] = num;
    saveState();
}

function handleTimerInput(event, inputEl, accId, category, id, field, nextIdStr) {
    let clean = inputEl.value.replace(/\D/g, '').slice(0, 2);
    if (field === 'h' && Number(clean) > 23) clean = '23';
    if (field === 'm' && Number(clean) > 59) clean = '59';
    if (inputEl.value !== clean) {
        inputEl.value = clean;
    }
    updateInputVal(accId, category, id, field, clean);

    if (clean.length >= 2 && nextIdStr) {
        const nextEl = document.getElementById(nextIdStr);
        if (nextEl) {
            nextEl.focus();
            nextEl.select();
        }
    }
}

function handleTimerArrowNav(event, prevIdStr, nextIdStr, accId, category, id) {
    if (event.key === 'ArrowLeft' && prevIdStr) {
        event.preventDefault();
        const prevEl = document.getElementById(prevIdStr);
        if (prevEl) {
            prevEl.focus();
            prevEl.select();
        }
    } else if (event.key === 'ArrowRight' && nextIdStr) {
        event.preventDefault();
        const nextEl = document.getElementById(nextIdStr);
        if (nextEl) {
            nextEl.focus();
            nextEl.select();
        }
    } else if (event.key === 'Enter') {
        event.preventDefault();
        startTimer(accId, category, id);
    }
}

function startTimer(accId, category, id) {
    ensureAudioContext();
    const item = store[accId][category].find(it => it.id === id);
    if (!item) return;

    const totalMs = ((item.d * 24 + item.h) * 60 + item.m) * 60 * 1000;
    if (totalMs <= 0) {
        alert('請先輸入倒數時間！');
        return;
    }

    const endDate = new Date(getAccurateNow().getTime() + totalMs);
    item.endTime = endDate;

    if (category === 'soldiers') autoSyncJobFromTimer(accId, 'soldier', endDate);
    if (category === 'tech') autoSyncJobFromTimer(accId, 'tech', endDate);

    renderGrid();
    updateTimeline(true);
    saveState();
}

function startPresetTimer(accId, category, id, d, h, m) {
    const item = store[accId][category].find(it => it.id === id);
    if (!item) return;
    item.d = d;
    item.h = h;
    item.m = m;
    startTimer(accId, category, id);
}

function resetTimer(accId, category, id) {
    const item = store[accId][category].find(it => it.id === id);
    if (!item) return;
    if (item.endTime) {
        const remainMs = Math.max(0, item.endTime.getTime() - getAccurateNow().getTime());
        const totalMin = Math.ceil(remainMs / 60000);
        if (totalMin > 0) {
            item.d = Math.floor(totalMin / 1440);
            item.h = Math.floor((totalMin % 1440) / 60);
            item.m = totalMin % 60;
        }
    }
    item.endTime = null;
    renderGrid();
    updateTimeline(true);
    saveState();
}

function updateSunlightToggleBtnUI() {
    const btn = document.getElementById('sunlightToggleBtn');
    if (!btn) return;
    if (showSunlightEvent) {
        btn.classList.add('active');
        btn.innerText = '☀️ 沐光：顯示';
    } else {
        btn.classList.remove('active');
        btn.innerText = '☀️ 沐光：隱藏';
    }
}

function toggleSunlightEvent() {
    showSunlightEvent = !showSunlightEvent;
    updateSunlightToggleBtnUI();
    renderGrid();
    updateTimeline(true);
    saveState();
}

// ==========================================
// 11. 畫面渲染（3 欄主畫面 & 時間線）
// ==========================================
function renderProfileHeader(acc) {
    const p = profiles[acc.id] || {};
    const avatarSrc = p.avatar || getBearFaceFile(acc.id);
    const charaBadge = getBearFaceFile(acc.id);
    const crownHtml = acc.isMain ? `<span class="main-crown-badge">👑 主號</span>` : '';
    const allianceHtml = p.alliance ? `<span class="profile-alliance">[${p.alliance}]</span>` : '';

    return `
        <div class="profile-card">
            <button type="button" class="btn-edit-profile" title="編輯角色名稱與聯盟" onclick="editAccountQuery('${acc.id}')">✏️</button>
            <div class="profile-avatar-wrap">
                <img class="profile-avatar" src="${avatarSrc}" alt="${p.name || acc.id}" onerror="this.src='${charaBadge}'">
                <img class="avatar-chara-badge" src="${charaBadge}" alt="">
            </div>
            <div class="profile-details">
                <div class="profile-name-row">
                    <span class="profile-name">${p.name || acc.id}</span>
                    ${crownHtml}
                    ${allianceHtml}
                </div>
                <div class="profile-stats-row">
                    <span class="stat-pill tg">${p.levelLabel || 'TG'}</span>
                    <span class="stat-pill power">⚔️ ${formatPower(p.power)}</span>
                </div>
            </div>
        </div>
    `;
}

function renderTimerRow(accId, category, item, index, isMulti) {
    const now = getAccurateNow();
    const isRunning = item.endTime && item.endTime.getTime() > now.getTime();
    const remainMs = isRunning ? item.endTime.getTime() - now.getTime() : 0;
    const dueClass = isRunning ? getDueBorderClass(item.endTime) : '';
    const extraCardClass = category === 'master' ? 'master-card' : (category === 'sunlight' ? 'sunlight-card' : '');

    const leftBadgeHtml = isMulti
        ? `<div class="left-slot-box"><span class="flower-seq-badge">${index + 1}</span></div>`
        : '';

    let presetHtml = '';
    if (!isRunning && category === 'master') {
        presetHtml = `
            <div class="preset-row">
                <button class="btn-preset" onclick="startPresetTimer('${accId}','master',${item.id},0,0,10)">10分</button>
                <button class="btn-preset" onclick="startPresetTimer('${accId}','master',${item.id},0,2,0)">2時</button>
                <button class="btn-preset" onclick="startPresetTimer('${accId}','master',${item.id},0,10,0)">10時</button>
                <button class="btn-preset" onclick="startPresetTimer('${accId}','master',${item.id},0,23,0)">23時</button>
                <button class="btn-preset" onclick="startPresetTimer('${accId}','master',${item.id},3,0,0)">3天</button>
                <button class="btn-preset" onclick="startPresetTimer('${accId}','master',${item.id},5,0,0)">5天</button>
            </div>
        `;
    } else if (!isRunning && category === 'sunlight') {
        presetHtml = `
            <div class="preset-row">
                <button class="btn-preset" onclick="startPresetTimer('${accId}','sunlight',${item.id},0,8,0)">▶ 8小時整</button>
            </div>
        `;
    }

    if (isRunning) {
        return `
            <div class="timer-item-row">
                ${leftBadgeHtml}
                <div class="timer-card ${extraCardClass} ${dueClass}">
                    <div class="timer-main-row">
                        <div class="timer-info">
                            <div class="timer-display" id="cd_${accId}_${category}_${item.id}">${formatCountdown(remainMs)}</div>
                            <div class="timer-sub">${getDayTagHtml(item.endTime)}完結：${formatFullDateTime(item.endTime)}</div>
                        </div>
                        <div class="timer-actions">
                            <button class="btn-action" onclick="resetTimer('${accId}','${category}',${item.id})">修改</button>
                            ${isMulti ? `<button class="btn-del" title="刪除" onclick="deleteTimerItem('${accId}','${category}',${item.id})">✕</button>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    const dId = `in_d_${accId}_${category}_${item.id}`;
    const hId = `in_h_${accId}_${category}_${item.id}`;
    const mId = `in_m_${accId}_${category}_${item.id}`;

    return `
        <div class="timer-item-row">
            ${leftBadgeHtml}
            <div class="timer-card ${extraCardClass}">
                <div class="timer-main-row">
                    <div class="timer-inputs">
                        <input type="text" inputmode="numeric" class="time-input" id="${dId}" value="${item.d}" maxlength="2"
                            onfocus="requestAnimationFrame(() => this.select())"
                            oninput="handleTimerInput(event, this, '${accId}', '${category}', ${item.id}, 'd', '${hId}')"
                            onchange="updateInputVal('${accId}','${category}',${item.id},'d',this.value)"
                            onkeydown="handleTimerArrowNav(event, null, '${hId}', '${accId}', '${category}', ${item.id})">天
                        <input type="text" inputmode="numeric" class="time-input" id="${hId}" value="${formatPad(item.h)}" maxlength="2"
                            onfocus="requestAnimationFrame(() => this.select())"
                            oninput="handleTimerInput(event, this, '${accId}', '${category}', ${item.id}, 'h', '${mId}')"
                            onchange="updateInputVal('${accId}','${category}',${item.id},'h',this.value)"
                            onkeydown="handleTimerArrowNav(event, '${dId}', '${mId}', '${accId}', '${category}', ${item.id})">時
                        <input type="text" inputmode="numeric" class="time-input" id="${mId}" value="${formatPad(item.m)}" maxlength="2"
                            onfocus="requestAnimationFrame(() => this.select())"
                            oninput="handleTimerInput(event, this, '${accId}', '${category}', ${item.id}, 'm', null)"
                            onchange="updateInputVal('${accId}','${category}',${item.id},'m',this.value)"
                            onkeydown="handleTimerArrowNav(event, '${hId}', null, '${accId}', '${category}', ${item.id})">分
                    </div>
                    <div class="timer-actions">
                        <button class="btn-action" onclick="startTimer('${accId}','${category}',${item.id})">▶ 開始</button>
                        ${isMulti ? `<button class="btn-del" title="刪除" onclick="deleteTimerItem('${accId}','${category}',${item.id})">✕</button>` : ''}
                    </div>
                </div>
                ${presetHtml}
            </div>
        </div>
    `;
}

function renderJobSummaryBox(accId) {
    const s = store[accId];
    const now = getAccurateNow();
    const hasConflict = hasSameAccountJobConflict(accId);

    const buildCard = (label, type) => {
        const jDate = type === 'soldier' ? s.soldierJobDate : s.techJobDate;
        const jConf = type === 'soldier' ? s.soldierJobConfirmed : s.techJobConfirmed;
        const inCooldown = isJobInCooldown(accId, type, now);

        let dueBorderClass = '';
        let pillHtml = `<span class="status-pill none">未預約</span>`;
        let timeText = '尚未設定時段';
        let remainText = '';

        if (jDate && !isNaN(jDate.getTime())) {
            dueBorderClass = getDueBorderClass(jDate);
            timeText = `${getDayTagHtml(jDate)}${formatFullDateTime(jDate)}`;
            const diffMs = jDate.getTime() - now.getTime();

            if (inCooldown) {
                const cdRemainMin = Math.max(1, Math.ceil((10 * 60 * 1000 - (now.getTime() - jDate.getTime())) / 60000));
                pillHtml = `<span class="status-pill cooldown">⏳ 冷卻剩 ${cdRemainMin} 分</span>`;
                remainText = `同職位冷卻中（不可重申）`;
            } else if (diffMs > 0) {
                if (hasConflict) {
                    pillHtml = `<button type="button" class="status-pill conflict clickable" title="點擊切換確認狀態" onclick="toggleJobConfirm('${accId}','${type}')">⚠️ 撞期·${jConf ? '已確認' : '待確認'}</button>`;
                    remainText = `還有 <span class="dist-text">${formatCountdown(diffMs)}</span> · 同帳號雙職位同時間`;
                } else {
                    pillHtml = jConf
                        ? `<button type="button" class="status-pill confirmed clickable" title="點擊取消確認" onclick="toggleJobConfirm('${accId}','${type}')">✔ 已確認</button>`
                        : `<button type="button" class="status-pill pending clickable" title="點擊直接確認預約" onclick="toggleJobConfirm('${accId}','${type}')">⏳ 待確認</button>`;
                    remainText = `還有 <span class="dist-text">${formatCountdown(diffMs)}</span>`;
                }
            } else {
                pillHtml = `<span class="status-pill none">已過期</span>`;
            }
        }

        return `
            <div class="job-status-card ${dueBorderClass} ${hasConflict && jDate ? 'job-conflict-border' : ''}">
                <div class="job-status-row-split">
                    <div class="job-status-left">
                        <div class="job-status-title-line">${label}：${timeText}</div>
                        <div class="job-status-sub-line">${remainText || '&nbsp;'}</div>
                    </div>
                    <div class="job-status-right">
                        ${pillHtml}
                    </div>
                </div>
            </div>
        `;
    };

    return `
        <div class="job-section">
            <div class="job-section-header">
                <span class="job-section-title">🏛️ 職位預約狀態</span>
                <button class="btn-goto-timeline" onclick="openTimelineView()">管理預約 →</button>
            </div>
            ${buildCard('⚔️ 士兵職位', 'soldier')}
            ${buildCard('🔬 科技職位', 'tech')}
        </div>
    `;
}

function renderGrid() {
    const grid = document.getElementById('gridView');
    if (!grid) return;

    grid.innerHTML = accounts.map(acc => {
        const s = store[acc.id];
        const catBlocks = [
            { key: 'soldiers', title: '⚔️ 士兵訓練', allowAdd: true },
            { key: 'tech', title: '🔬 科技研究', allowAdd: true },
            { key: 'master', title: '📖 大師技能', allowAdd: false },
            ...(showSunlightEvent ? [{ key: 'sunlight', title: '☀️ 沐光之旅', allowAdd: false }] : [])
        ];

        const sectionsHtml = catBlocks.map(blk => {
            const list = s[blk.key] || [];
            const isMulti = list.length > 1;
            return `
                <div class="section-block">
                    <div class="section-header">
                        <span>${blk.title}</span>
                        ${blk.allowAdd ? `<button class="btn-add" title="新增列隊" onclick="addTimerItem('${acc.id}','${blk.key}')">+</button>` : ''}
                    </div>
                    ${list.map((it, idx) => renderTimerRow(acc.id, blk.key, it, idx, isMulti)).join('')}
                </div>
            `;
        }).join('');

        return `
            <div class="account-column ${acc.id}">
                ${renderProfileHeader(acc)}
                ${sectionsHtml}
                ${renderJobSummaryBox(acc.id)}
            </div>
        `;
    }).join('');
}

function toggleShowAllTimelineDays() {
    showAllTimelineDays = !showAllTimelineDays;
    updateTimeline(true);
}

function updateTimeline(force = false) {
    const tlView = document.getElementById('timelineView');
    if (!force && (!tlView || tlView.style.display !== 'block')) return;

    const tasksEl = document.getElementById('timeline_tasks');
    const soldierJobsEl = document.getElementById('timeline_soldier_jobs');
    const techJobsEl = document.getElementById('timeline_tech_jobs');
    if (!tasksEl || !soldierJobsEl || !techJobsEl) return;

    const now = getAccurateNow();
    const allTasks = [];

    accounts.forEach(acc => {
        const s = store[acc.id];
        const cats = [
            { key: 'soldiers', label: '士兵', tagClass: 'tag-soldier' },
            { key: 'tech', label: '科技', tagClass: 'tag-tech' },
            { key: 'master', label: '大師', tagClass: 'tag-master' },
            ...(showSunlightEvent ? [{ key: 'sunlight', label: '沐光', tagClass: 'tag-sunlight' }] : [])
        ];
        cats.forEach(c => {
            (s[c.key] || []).forEach(it => {
                if (it.endTime && it.endTime.getTime() > now.getTime()) {
                    allTasks.push({
                        accId: acc.id,
                        accName: getDisplayAccountName(acc.id),
                        label: c.label,
                        tagClass: c.tagClass,
                        endTime: it.endTime
                    });
                }
            });
        });
    });

    allTasks.sort((a, b) => a.endTime - b.endTime);

    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const limitDate = new Date(startToday.getTime() + 2 * 86400000);
    const visibleTasks = showAllTimelineDays ? allTasks : allTasks.filter(t => t.endTime < limitDate);

    if (visibleTasks.length === 0) {
        tasksEl.innerHTML = `<div style="text-align:center; color:#A38E7D; padding:24px 8px; font-size:14px;">目前沒有進行中的倒數項目</div>`;
    } else {
        let lastDateStr = '';
        tasksEl.innerHTML = visibleTasks.map(t => {
            const dStr = `${t.endTime.getFullYear()}-${t.endTime.getMonth()}-${t.endTime.getDate()}`;
            const divider = (lastDateStr && lastDateStr !== dStr)
                ? `<div class="date-dot-divider"><div class="date-dot-line"></div></div>`
                : '';
            lastDateStr = dStr;

            return `
                ${divider}
                <div class="timeline-item ${t.accId}">
                    <img class="tl-bear-sticker" src="${getBearFaceFile(t.accId)}" alt="">
                    <div class="tl-left-group">
                        <span class="tl-acc-name">${t.accName}</span>
                        <span class="tag ${t.tagClass}">${t.label}</span>
                    </div>
                    <div style="text-align:right; font-size:13px;">
                        <div>${getDayTagHtml(t.endTime)}${formatFullDateTime(t.endTime)}</div>
                        <div style="font-size:12px; opacity:0.85;">${formatCountdown(t.endTime - now)}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    if (allTasks.length > visibleTasks.length || showAllTimelineDays) {
        tasksEl.innerHTML += `
            <button class="btn-more-tasks" onclick="toggleShowAllTimelineDays()">
                ${showAllTimelineDays ? '收起後天以後項目 ▲' : `顯示全部 (${allTasks.length} 項) ▼`}
            </button>
        `;
    }

    const renderJobColumn = (type) => {
        const timeKey = type === 'soldier' ? 'soldierJobTime' : 'techJobTime';
        const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
        const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';

        return accounts.map(acc => {
            const s = store[acc.id];
            const jTime = s[timeKey] || '';
            const jDate = s[dateKey];
            const jConf = !!s[confKey];
            const accName = getDisplayAccountName(acc.id);
            const inCooldown = isJobInCooldown(acc.id, type, now);
            const hasConflict = hasSameAccountJobConflict(acc.id);
            const dueBorderClass = jDate ? getDueBorderClass(jDate) : '';

            let metaText = '尚未預約';
            if (jDate && !isNaN(jDate.getTime())) {
                const diff = jDate.getTime() - now.getTime();
                metaText = diff > 0
                    ? `${getDayTagHtml(jDate)}${formatFullDateTime(jDate)}（還有 ${formatCountdown(diff)}）`
                    : `${formatFullDateTime(jDate)}（已過期）`;
            }

            let warningHtml = '';
            if (inCooldown) {
                warningHtml = `<div class="job-warning-box">⏳ 同一職位拿到後 10 分鐘冷卻中，暫不可重新申請</div>`;
            } else if (hasConflict && jDate) {
                warningHtml = `<div class="job-warning-box">⚠️ 同帳號士兵與科技職位不能同一時間，請錯開時段</div>`;
            }

            return `
                <div class="job-manage-card ${acc.id} ${dueBorderClass}">
                    <img class="job-bear-sticker" src="${getBearFaceFile(acc.id)}" alt="">
                    <div class="job-manage-top">
                        <span>${accName}</span>
                        <button class="btn-confirm-job ${jConf ? 'confirmed' : ''}" onclick="toggleJobConfirm('${acc.id}','${type}')">
                            ${jConf ? '✔ 已確認預約' : '⏳ 標記已確認'}
                        </button>
                    </div>
                    <div class="job-manage-controls">
                        <select onchange="setJobTime('${acc.id}','${type}',this.value,false)">
                            ${generateJobOptions(jTime, '無預約')}
                        </select>
                        <button class="btn-shift" onclick="shiftJobTime('${acc.id}','${type}',-30)">-30分</button>
                        <button class="btn-shift" onclick="shiftJobTime('${acc.id}','${type}',30)">+30分</button>
                    </div>
                    <div class="job-manage-meta">
                        <span>${metaText}</span>
                    </div>
                    ${warningHtml}
                </div>
            `;
        }).join('');
    };

    soldierJobsEl.innerHTML = renderJobColumn('soldier');
    techJobsEl.innerHTML = renderJobColumn('tech');
}

// ==========================================
// 12. 每秒倒數與到期通知檢查
// ==========================================
function tickTimers() {
    const now = getAccurateNow();
    const nowMs = now.getTime();

    accounts.forEach(acc => {
        const s = store[acc.id];
        const accName = getDisplayAccountName(acc.id);
        const catNames = {
            soldiers: '士兵訓練',
            tech: '科技研究',
            master: '大師技能',
            sunlight: '沐光之旅'
        };

        ['soldiers', 'tech', 'master', 'sunlight'].forEach(cat => {
            (s[cat] || []).forEach(it => {
                if (!it.endTime) return;
                const remain = it.endTime.getTime() - nowMs;
                const el = document.getElementById(`cd_${acc.id}_${cat}_${it.id}`);
                if (el && remain > 0) {
                    el.innerText = formatCountdown(remain);
                } else if (remain <= 0) {
                    const evKey = `timer_${acc.id}_${cat}_${it.id}_${it.endTime.getTime()}`;
                    it.endTime = null;
                    if (!triggeredEventKeys.has(evKey)) {
                        triggeredEventKeys.add(evKey);
                        pushNotificationEvent({
                            id: evKey,
                            accId: acc.id,
                            category: cat,
                            itemId: it.id,
                            message: `[${accName}] ${catNames[cat]} 已完成！`,
                            timestamp: nowMs,
                            unread: true
                        }, true);
                    }
                    renderGrid();
                    saveState();
                }
            });
        });

        [
            { type: 'soldier', label: '士兵職位', date: s.soldierJobDate },
            { type: 'tech', label: '科技職位', date: s.techJobDate }
        ].forEach(job => {
            if (!job.date || isNaN(job.date.getTime())) return;
            const diff = job.date.getTime() - nowMs;
            if (diff <= 0 && diff > -60000) {
                const jKey = `job_${acc.id}_${job.type}_${job.date.getTime()}`;
                if (!triggeredEventKeys.has(jKey)) {
                    triggeredEventKeys.add(jKey);
                    pushNotificationEvent({
                        id: jKey,
                        accId: acc.id,
                        category: `job_${job.type}`,
                        message: `[${accName}] ${job.label}預約時間 (${formatTimeHM(job.date)}) 已到！`,
                        timestamp: nowMs,
                        unread: true
                    }, true);
                }
            }
        });
    });

    updateTimeline(false);
}

// ==========================================
// 13. 頁面分頁切換（粉藍圓圈兩線選單 + URL Hash 記憶）
// ==========================================
function hideAllMainViews() {
    const grid = document.getElementById('gridView');
    const timeline = document.getElementById('timelineView');
    const resView = document.getElementById('resourcesView');
    if (grid) grid.style.display = 'none';
    if (timeline) timeline.style.display = 'none';
    if (resView) resView.style.display = 'none';
}

function toggleNavDropdown(event) {
    if (event) event.stopPropagation();
    const bellDrop = document.getElementById('notifDropdown');
    if (bellDrop) bellDrop.classList.remove('open');

    const navDrop = document.getElementById('navDropdown');
    if (navDrop) navDrop.classList.toggle('open');
}

function selectNavPage(tabName) {
    const navDrop = document.getElementById('navDropdown');
    if (navDrop) navDrop.classList.remove('open');
    switchMainTab(tabName, true);
}

function switchMainTab(tabName, updateUrlHash = true) {
    const grid = document.getElementById('gridView');
    const timeline = document.getElementById('timelineView');
    const resView = document.getElementById('resourcesView');
    const timerOnlyBtns = document.getElementById('timerOnlyBtns');
    const btn = document.getElementById('toggleBtn');
    const pageTitle = document.getElementById('pageMainTitle');
    const navItemAlarm = document.getElementById('navItemAlarm');
    const navItemResources = document.getElementById('navItemResources');

    hideAllMainViews();

    const isAlarmSection = (tabName === 'grid' || tabName === 'timeline');
    if (timerOnlyBtns) {
        timerOnlyBtns.style.display = isAlarmSection ? 'inline-flex' : 'none';
    }
    if (navItemAlarm) navItemAlarm.classList.toggle('active', isAlarmSection);
    if (navItemResources) navItemResources.classList.toggle('active', tabName === 'resources');

    if (tabName === 'timeline') {
        if (timeline) timeline.style.display = 'block';
        if (btn) btn.innerHTML = '<img class="btn-icon-svg" src="./assets/btn_change.svg" alt=""> 切換 3 欄視圖';
        if (pageTitle) pageTitle.innerText = '多帳戶鬧鐘助手';
        updateTimeline(true);
    } else if (tabName === 'resources') {
        if (resView) resView.style.display = 'block';
        if (pageTitle) pageTitle.innerText = '多帳戶資源採集';
        if (typeof renderResourcesGrid === 'function') renderResourcesGrid();
    } else {
        tabName = 'grid';
        if (grid) grid.style.display = 'grid';
        if (btn) btn.innerHTML = '<img class="btn-icon-svg" src="./assets/btn_change.svg" alt=""> 切換時間線';
        if (pageTitle) pageTitle.innerText = '多帳戶鬧鐘助手';
    }

    if (updateUrlHash) {
        const nextHash = tabName === 'grid' ? '' : `#${tabName}`;
        if (window.location.hash !== nextHash) {
            history.replaceState(null, '', nextHash || window.location.pathname + window.location.search);
        }
    }
}

function toggleResourcesView() {
    const resView = document.getElementById('resourcesView');
    const isCurrentlyOpen = resView && resView.style.display === 'block';
    switchMainTab(isCurrentlyOpen ? 'grid' : 'resources');
}

function openTimelineView() {
    switchMainTab('timeline');
}

function toggleView() {
    const timeline = document.getElementById('timelineView');
    const isCurrentlyOpen = timeline && timeline.style.display === 'block';
    switchMainTab(isCurrentlyOpen ? 'grid' : 'timeline');
}

function restoreTabFromHash() {
    const hash = (window.location.hash || '').replace('#', '').trim();
    if (hash === 'resources' || hash === 'timeline') {
        switchMainTab(hash, false);
    } else {
        switchMainTab('grid', false);
    }
}

window.addEventListener('hashchange', restoreTabFromHash);

document.addEventListener('click', (e) => {
    const bellWrapper = document.getElementById('bellWrapper');
    const bellDrop = document.getElementById('notifDropdown');
    if (bellDrop && bellDrop.classList.contains('open') && bellWrapper && !bellWrapper.contains(e.target)) {
        bellDrop.classList.remove('open');
    }

    const navWrapper = document.getElementById('navMenuWrapper');
    const navDrop = document.getElementById('navDropdown');
    if (navDrop && navDrop.classList.contains('open') && navWrapper && !navWrapper.contains(e.target)) {
        navDrop.classList.remove('open');
    }
});

// ==========================================
// 14. 啟動初始化
// ==========================================
function init() {
    startSplashLoader();
    updateNotifBadgeUI();
    loadNotifHistory();
    loadLocalBackups();
    updateSunlightToggleBtnUI();
    renderGrid();
    restoreTabFromHash();

    setupFirebaseListeners();
    setupAutoTimeSync();
    fetchAllProfiles();

    setInterval(tickTimers, 1000);
    setInterval(renderBellUI, 30000);
}

init();
