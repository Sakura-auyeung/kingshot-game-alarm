// ==========================================
// CORE.JS：Firebase 設定、全域狀態、格式化工具、角色同步與資料庫讀寫
// ==========================================

// 1. Firebase 雲端即時資料庫設定
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

// 2. 全域常數與狀態變數
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
let isJobSelectActive = false;
let isTimerInputEditing = false;
let timerBlurUnlockHandle = null;

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

// 3. 載入動畫 & 伺服器時間校準
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
                if (!isTimerInputEditing && typeof renderGrid === 'function') renderGrid();
                if (typeof updateTimeline === 'function') updateTimeline(true);
            }
        });
    } catch (e) {
        serverTimeOffsetMs = 0;
    }
}

// 4. 格式化工具函式
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

// 5. 外部角色戰力與頭像 API 同步 & 雙欄位編輯彈窗
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
        if (!isTimerInputEditing && typeof renderGrid === 'function') renderGrid();
        if (typeof renderResourcesGrid === 'function') renderResourcesGrid();
        if (typeof updateTimeline === 'function') updateTimeline(true);
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
    if (typeof renderGrid === 'function') renderGrid();
    if (typeof renderResourcesGrid === 'function') renderResourcesGrid();
    if (typeof updateTimeline === 'function') updateTimeline(true);

    const ok = await fetchSingleProfile(accId);
    if (ok) {
        saveProfiles();
        if (typeof renderGrid === 'function') renderGrid();
        if (typeof renderResourcesGrid === 'function') renderResourcesGrid();
        if (typeof updateTimeline === 'function') updateTimeline(true);
    }
}

// 6. Firebase 與本地儲存資料序列化
function serializeStore() {
    const out = {
        showSunlightEvent: showSunlightEvent,
        resources: typeof resourcesStore !== 'undefined' ? resourcesStore : {},
        mobilization: typeof serializeMobilizationStore === 'function' ? serializeMobilizationStore() : {},
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
    if (typeof data.updatedAt === 'number') {
        latestStateUpdatedAt = data.updatedAt;
    }
    if (typeof data.showSunlightEvent === 'boolean') {
        showSunlightEvent = data.showSunlightEvent;
        if (typeof updateSunlightToggleBtnUI === 'function') updateSunlightToggleBtnUI();
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
    if (data.mobilization && typeof applyMobilizationSerialized === 'function') {
        applyMobilizationSerialized(data.mobilization);
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

    if (typeof normalizeAllJobsConsistency === 'function') {
        normalizeAllJobsConsistency();
    }
}

function saveState() {
    // 重要防護：有連 Firebase 時，若尚未完成首次雲端載入，嚴禁拿本機舊快取覆蓋雲端
    if (hasFirebase && dbRef && !isInitialLoadDone) {
        console.warn("尚未完成首次雲端同步，已攔截寫入以防止舊資料覆蓋雲端");
        return;
    }

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
        isInitialLoadDone = true;
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
        isInitialLoadDone = true;
        if (syncBadge) {
            syncBadge.className = 'sync-badge connected';
            syncBadge.innerText = '🟢 雲端已同步';
        }

        const activeEl = document.activeElement;
        const isTypingResource = activeEl && activeEl.classList && activeEl.classList.contains('res-num-input');
        const isTypingMob = activeEl && activeEl.classList && activeEl.classList.contains('mob-march-input');
        const isTypingTimer = isTimerInputEditing || (activeEl && activeEl.classList && activeEl.classList.contains('time-input'));

        if (!isTypingTimer && typeof renderGrid === 'function') {
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
        if (typeof renderMobilizationSection === 'function' && !isTypingMob) {
            renderMobilizationSection();
        }
        if (typeof updateTimeline === 'function') updateTimeline(true);
        if (typeof tickTimers === 'function') tickTimers();
        notifyDataReadyForSplash();
    }, (err) => {
        isInitialLoadDone = true;
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
                if (!isTimerInputEditing && typeof renderGrid === 'function') renderGrid();
                if (typeof renderResourcesGrid === 'function') renderResourcesGrid();
                if (typeof renderMobilizationSection === 'function') renderMobilizationSection();
                if (typeof updateTimeline === 'function') updateTimeline(true);
            }
        });
    }
}
