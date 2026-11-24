// ==========================================
// 【核心不變條款清單 - core.js】
// 1. 所有倒數與職位時間計算一律使用 getAccurateNow()（Firebase 雲端伺服器網路標準時間），絕不使用本機 Windows 時間。
// 2. Firebase 雲端即時同步時，若使用者正在輸入倒數框或資源框，絕對禁止重繪搶走游標焦點。
// ==========================================

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

let nextId = 300;
let isInitialLoadDone = false;
let serverTimeOffsetMs = 0;

let splashStartTime = 0;
let isFirebaseFirstLoaded = false;
let isSplashHidden = false;

// ==========================================
// 3. 載入動畫 & 網路伺服器時間校準
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
                if (!isTimerInputEditing && typeof renderGrid === 'function') renderGrid();
                if (typeof updateTimeline === 'function') updateTimeline(true);
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
    const m = formatPad(date
