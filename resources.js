// ==========================================
// 資源採集計算 + Tesseract.js OCR 辨識 + 聯盟總動員採集子集計算器（分帳號獨立分頁儲存）
// ==========================================

const RESOURCE_DEFS = [
    { key: 'bread',  label: '糧食', iconFile: './assets/item_icon_bread.png', ratio: 20, mobMult: 1,  maxRawK: 14000 },
    { key: 'wood',   label: '木材', iconFile: './assets/item_icon_wood.png',  ratio: 20, mobMult: 1,  maxRawK: 14000 },
    { key: 'stone',  label: '石材', iconFile: './assets/item_icon_stone.png', ratio: 4,  mobMult: 5,  maxRawK: 2800  },
    { key: 'iron',   label: '鐵',   iconFile: './assets/item_icon_icon.png',  ratio: 1,  mobMult: 20, maxRawK: 700   }
];

function getResDef(key) {
    return RESOURCE_DEFS.find(d => d.key === key) || RESOURCE_DEFS[0];
}

function renderResCardBigIconHtml(item) {
    return `<span class="res-card-big-icon-wrap"><img class="res-card-big-png" src="${item.iconFile}" alt="${item.label}"></span>`;
}

function renderPrioBigIconHtml(item) {
    return `<span class="res-prio-big-icon-wrap"><img class="res-prio-big-png" src="${item.iconFile}" alt="${item.label}" title="${item.label}"></span>`;
}

// 黃色花花序號徽章（對齊 timers.css 的 bg_epi_num.svg 樣式）
function renderYellowFlowerBadgeHtml(num, isChip = false) {
    const cls = isChip ? 'mob-flower-badge in-chip' : 'mob-flower-badge in-row';
    return `<span class="${cls}">${num}</span>`;
}

let resourcesStore = {
    h: { bread: { val: '', unit: 'M' }, wood: { val: '', unit: 'M' }, stone: { val: '', unit: 'M' }, iron: { val: '', unit: 'M' } },
    z: { bread: { val: '', unit: 'B' }, wood: { val: '', unit: 'B' }, stone: { val: '', unit: 'M' }, iron: { val: '', unit: 'M' } },
    p: { bread: { val: '', unit: 'B' }, wood: { val: '', unit: 'B' }, stone: { val: '', unit: 'M' }, iron: { val: '', unit: 'M' } }
};

let activePasteAccId = 'z';
let pendingUploadAccId = 'z';
let ocrStatusText = { h: '', z: '', p: '' };
let tesseractWorker = null;
let resSaveDebounceTimer = null;

function scheduleResourceSave() {
    if (resSaveDebounceTimer) clearTimeout(resSaveDebounceTimer);
    resSaveDebounceTimer = setTimeout(() => {
        saveState();
    }, 350);
}

function unitMultiplier(unit) {
    if (unit === 'B') return 1e9;
    if (unit === 'K') return 1e3;
    return 1e6;
}

// ==========================================
// Excel / Google Sheets 原汁原味 5 色階斜向漸層
// ==========================================
const EXCEL_5_LEVELS = [
    'linear-gradient(135deg, #63C796 0%, #4BA87A 100%)', // 第 1 階：最缺
    'linear-gradient(135deg, #AFD283 0%, #92B864 100%)', // 第 2 階：次缺
    'linear-gradient(135deg, #FAD76B 0%, #E5BE48 100%)', // 第 3 階：中間
    'linear-gradient(135deg, #F5A973 0%, #DF894E 100%)', // 第 4 階：偏多
    'linear-gradient(135deg, #EC8980 0%, #D6675D 100%)'  // 第 5 階：最多
];

function getExcel5LevelStyle(pos) {
    if (pos === null || pos === undefined || isNaN(pos)) return '';
    const clamped = Math.max(0, Math.min(1, pos));
    const idx = Math.min(4, Math.floor(clamped * 5));
    return `background: ${EXCEL_5_LEVELS[idx]};`;
}

function getAccountResourceAnalysis(accId) {
    const accRes = resourcesStore[accId] || {};
    const items = RESOURCE_DEFS.map(def => {
        const entry = accRes[def.key] || { val: '', unit: 'M' };
        const rawNum = parseFloat(String(entry.val).replace(/,/g, ''));
        const hasVal = !isNaN(rawNum) && entry.val !== '' && entry.val !== null;
        const totalAmount = hasVal ? rawNum * unitMultiplier(entry.unit || 'M') : 0;
        const scaledVal = hasVal ? totalAmount / def.ratio : 0;
        return {
            ...def,
            valStr: entry.val ?? '',
            unit: entry.unit || 'M',
            hasVal,
            totalAmount,
            scaledVal
        };
    });

    const validItems = items.filter(i => i.hasVal);
    let minScaled = null;
    let maxScaled = null;
    let bestItem = null;
    let gapM = null;

    if (validItems.length > 0) {
        minScaled = Math.min(...validItems.map(i => i.scaledVal));
        maxScaled = Math.max(...validItems.map(i => i.scaledVal));
        bestItem = validItems.reduce((prev, cur) => (cur.scaledVal < prev.scaledVal ? cur : prev), validItems[0]);
        gapM = (maxScaled - minScaled) / 1e6;
    }

    const coloredItems = items.map(item => {
        let ratioPos = null;
        if (item.hasVal && validItems.length > 1 && maxScaled > minScaled) {
            ratioPos = (item.scaledVal - minScaled) / (maxScaled - minScaled);
        } else if (item.hasVal) {
            ratioPos = 0;
        }
        return {
            ...item,
            ratioPos,
            inlineGradientStyle: getExcel5LevelStyle(ratioPos)
        };
    });

    return { items: coloredItems, bestItem, gapM, hasAny: validItems.length > 0 };
}

function formatScaledMillions(scaledVal) {
    if (!scaledVal && scaledVal !== 0) return '--';
    const m = scaledVal / 1e6;
    if (m >= 1000) return `${(m / 1000).toFixed(2)}B 基準`;
    return `${m.toFixed(2)}M 基準`;
}

function setPasteTarget(accId) {
    activePasteAccId = accId;
    pendingUploadAccId = accId;
    renderResourcesGrid();
}

function sanitizeResourceNumberInput(raw) {
    let s = String(raw || '').replace(/[^\d.]/g, '');
    const dotIndex = s.indexOf('.');
    if (dotIndex !== -1) {
        const intPart = s.slice(0, dotIndex);
        const decPart = s.slice(dotIndex + 1).replace(/\./g, '').slice(0, 2);
        s = `${intPart}.${decPart}`;
    }
    return s;
}

function renderPrioSplitInnerHtml(analysis) {
    const gapText = (analysis.hasAny && analysis.gapM !== null)
        ? `差距：<strong>${analysis.gapM.toFixed(1)}M</strong>`
        : `差距：--`;
    const bigIconHtml = (analysis.hasAny && analysis.bestItem)
        ? renderPrioBigIconHtml(analysis.bestItem)
        : `<span class="res-prio-empty">--</span>`;

    return `
        <div class="res-prio-split">
            <div class="res-prio-left">
                <div class="res-prio-title">採集優先</div>
                <div class="res-gap-line">${gapText}</div>
            </div>
            <div class="res-prio-right">
                ${bigIconHtml}
            </div>
        </div>
    `;
}

function renderResourcesGrid() {
    const grid = document.getElementById('resourcesGrid');
    if (!grid) return;

    grid.innerHTML = accounts.map(acc => {
        const analysis = getAccountResourceAnalysis(acc.id);
        const isActiveTarget = (activePasteAccId === acc.id);
        const statusMsg = ocrStatusText[acc.id] || '';

        const rowsHtml = analysis.items.map(item => `
            <div class="res-row-card ${item.hasVal ? 'has-candy' : ''}" id="res_card_${acc.id}_${item.key}" style="${item.inlineGradientStyle}">
                <div class="res-card-left-icon">
                    ${renderResCardBigIconHtml(item)}
                </div>
                <div class="res-card-right-body">
                    <div class="res-row-top">
                        <span class="res-name-title">${item.label}</span>
                        <div class="res-input-group">
                            <input type="text" inputmode="decimal" class="res-num-input"
                                id="res_in_${acc.id}_${item.key}"
                                value="${item.valStr}" placeholder="0.00"
                                onfocus="this.select()"
                                oninput="onResourceNumberTyping('${acc.id}', '${item.key}', this)"
                                onblur="scheduleResourceSave()">
                            <select class="res-unit-select"
                                id="res_unit_${acc.id}_${item.key}"
                                onchange="updateResourceUnit('${acc.id}', '${item.key}', this.value)">
                                <option value="K" ${item.unit === 'K' ? 'selected' : ''}>K</option>
                                <option value="M" ${item.unit === 'M' ? 'selected' : ''}>M</option>
                                <option value="B" ${item.unit === 'B' ? 'selected' : ''}>B</option>
                            </select>
                        </div>
                    </div>
                    <div class="res-row-bottom">
                        <span class="res-ratio-tag">比例 ÷${item.ratio}</span>
                        <span class="res-scaled-val" id="res_scaled_${acc.id}_${item.key}">${item.hasVal ? formatScaledMillions(item.scaledVal) : '--'}</span>
                    </div>
                </div>
            </div>
        `).join('');

        return `
            <div class="account-column ${acc.id}">
                ${renderProfileHeader(acc)}

                <div class="res-merged-row ${isActiveTarget ? 'active-target' : ''}">
                    <div class="res-merged-col paste-col">
                        <button type="button" class="res-target-btn" onclick="setPasteTarget('${acc.id}')">
                            ${isActiveTarget ? '✔ 貼上目標' : '📌 貼上目標'}
                        </button>
                        ${statusMsg ? `<div class="res-ocr-status">${statusMsg}</div>` : ''}
                    </div>

                    <div class="res-merged-col prio-col" id="res_prio_${acc.id}">
                        ${renderPrioSplitInnerHtml(analysis)}
                    </div>
                </div>

                ${rowsHtml}
            </div>
        `;
    }).join('');
}

function refreshAccountResourceVisualsOnly(accId, skipInputId = null) {
    const analysis = getAccountResourceAnalysis(accId);

    const prioBox = document.getElementById(`res_prio_${accId}`);
    if (prioBox) {
        prioBox.innerHTML = renderPrioSplitInnerHtml(analysis);
    }

    analysis.items.forEach(item => {
        const card = document.getElementById(`res_card_${accId}_${item.key}`);
        if (card) {
            card.setAttribute('style', item.inlineGradientStyle);
            card.classList.toggle('has-candy', item.hasVal);
        }
        const inputId = `res_in_${accId}_${item.key}`;
        if (inputId !== skipInputId) {
            const inp = document.getElementById(inputId);
            if (inp && inp.value !== String(item.valStr)) {
                inp.value = item.valStr;
            }
        }
        const unitSel = document.getElementById(`res_unit_${accId}_${item.key}`);
        if (unitSel && unitSel.value !== item.unit) {
            unitSel.value = item.unit;
        }
        const scaledEl = document.getElementById(`res_scaled_${accId}_${item.key}`);
        if (scaledEl) {
            scaledEl.innerText = item.hasVal ? formatScaledMillions(item.scaledVal) : '--';
        }
    });
}

function onResourceNumberTyping(accId, resKey, inputEl) {
    const cleaned = sanitizeResourceNumberInput(inputEl.value);
    if (inputEl.value !== cleaned) {
        inputEl.value = cleaned;
    }
    if (!resourcesStore[accId]) resourcesStore[accId] = {};
    if (!resourcesStore[accId][resKey]) resourcesStore[accId][resKey] = { val: '', unit: 'M' };
    resourcesStore[accId][resKey].val = cleaned;

    refreshAccountResourceVisualsOnly(accId, inputEl.id);
    scheduleResourceSave();
}

function updateResourceUnit(accId, resKey, unitVal) {
    if (!resourcesStore[accId]) resourcesStore[accId] = {};
    if (!resourcesStore[accId][resKey]) resourcesStore[accId][resKey] = { val: '', unit: 'M' };
    resourcesStore[accId][resKey].unit = unitVal;
    refreshAccountResourceVisualsOnly(accId);
    saveState();
}

// 全域監聽所有資源輸入框（含總動員輸入框）的 Enter 鍵自動跳下一格
document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!target || !target.classList) return;
    const isResInput = target.classList.contains('res-num-input');
    const isMobInput = target.classList.contains('mob-march-input');
    if (!isResInput && !isMobInput) return;
    if (event.isComposing || event.keyCode === 229) return;

    if (event.key === 'Enter' || event.keyCode === 13) {
        event.preventDefault();
        event.stopPropagation();

        const selector = isResInput ? '#resourcesGrid .res-num-input' : '#guildMobilizationSection .mob-march-input';
        const allInputs = Array.from(document.querySelectorAll(selector));
        const curIdx = allInputs.indexOf(target);

        if (curIdx >= 0 && curIdx < allInputs.length - 1) {
            const nextInput = allInputs[curIdx + 1];
            nextInput.focus();
            nextInput.select();
        } else {
            target.blur();
        }
        if (isResInput) scheduleResourceSave();
    }
}, true);

function handleResFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (file) {
        runOcrOnImageFile(file, pendingUploadAccId);
    }
}

document.addEventListener('paste', (event) => {
    const resView = document.getElementById('resourcesView');
    if (!resView || resView.style.display !== 'block') return;
    const items = event.clipboardData && event.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
                event.preventDefault();
                runOcrOnImageFile(blob, activePasteAccId);
                break;
            }
        }
    }
});

// ==========================================
// 精準 4 格固定座標 OCR 辨識
// ==========================================
const FIXED_IN_STOCK_BOXES = [
    { key: 'bread', y0: 0.335, y1: 0.405 },
    { key: 'wood',  y0: 0.405, y1: 0.475 },
    { key: 'stone', y0: 0.475, y1: 0.545 },
    { key: 'iron',  y0: 0.545, y1: 0.615 }
];

async function getOcrWorker() {
    if (typeof Tesseract === 'undefined') {
        throw new Error("Tesseract OCR 尚未載入");
    }
    if (tesseractWorker) return tesseractWorker;
    tesseractWorker = await Tesseract.createWorker('eng');
    await tesseractWorker.setParameters({
        tessedit_char_whitelist: '0123456789.BMK',
        tessedit_pageseg_mode: '7'
    });
    return tesseractWorker;
}

function loadImageFromBlob(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(e);
        };
        img.src = url;
    });
}

function cropFixedInStockCell(img, y0Ratio, y1Ratio, mode = 'soft') {
    const isTwoPanel = (img.width / img.height) > 0.9;
    const panelWidth = isTwoPanel ? img.width * 0.5 : img.width;

    const sx = Math.round(panelWidth * 0.64);
    const sw = Math.round(panelWidth * 0.27);
    const sy = Math.round(img.height * y0Ratio);
    const sh = Math.round(img.height * (y1Ratio - y0Ratio));

    const scale = 3;
    const pad = 20;
    const canvas = document.createElement('canvas');
    canvas.width = sw * scale + pad * 2;
    canvas.height = sh * scale + pad * 2;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, pad, pad, sw * scale, sh * scale);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        let val = 255;
        if (mode === 'soft') {
            if (lum >= 175) {
                val = 255;
            } else if (lum <= 95) {
                val = 0;
            } else {
                val = Math.round(((lum - 95) / 80) * 255);
            }
        } else {
            val = lum < 138 ? 0 : 255;
        }
        d[i] = d[i + 1] = d[i + 2] = val;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

function parseOcrCellText(rawText) {
    const clean = String(rawText || '').replace(/\s+/g, '').toUpperCase();
    if (!clean) return null;

    let match = clean.match(/(\d+(?:\.\d+)?)([BMK])/);

    if (!match) {
        const bMisread = clean.match(/^(\d+\.\d{2})[83]$/);
        if (bMisread) {
            match = [clean, bMisread[1], 'B'];
        }
    }

    if (!match) return null;

    let numStr = match[1];
    const unit = match[2];

    if (unit === 'B' && !numStr.includes('.') && numStr.length >= 3) {
        numStr = `${numStr[0]}.${numStr.slice(1, 3)}`;
    }

    if (numStr.includes('.')) {
        const parts = numStr.split('.');
        numStr = `${parts[0]}.${parts[1].slice(0, 2)}`;
    }

    const numVal = parseFloat(numStr);
    if (isNaN(numVal) || numVal <= 0) return null;

    return { num: numStr, unit };
}

async function runOcrOnImageFile(file, accId) {
    ocrStatusText[accId] = 'OCR 辨識中...';
    renderResourcesGrid();

    try {
        const img = await loadImageFromBlob(file);
        const worker = await getOcrWorker();
        let filledCount = 0;

        for (const box of FIXED_IN_STOCK_BOXES) {
            const softCanvas = cropFixedInStockCell(img, box.y0, box.y1, 'soft');
            const res1 = await worker.recognize(softCanvas);
            let parsed = parseOcrCellText(res1 && res1.data && res1.data.text);

            if (!parsed) {
                const sharpCanvas = cropFixedInStockCell(img, box.y0, box.y1, 'sharp');
                const res2 = await worker.recognize(sharpCanvas);
                parsed = parseOcrCellText(res2 && res2.data && res2.data.text);
            }

            if (parsed) {
                resourcesStore[accId][box.key] = { val: parsed.num, unit: parsed.unit };
                filledCount++;
            }
        }

        ocrStatusText[accId] = filledCount > 0
            ? `已填入 ${filledCount} 項`
            : '未認出數值';
        renderResourcesGrid();
        saveState();
    } catch (err) {
        console.error('OCR Error:', err);
        ocrStatusText[accId] = '辨識失敗';
        renderResourcesGrid();
    }
}

// ==========================================
// 🏆 聯盟總動員採集任務子集組合計算器（每位帳號獨立儲存）
// ==========================================
const MOB_PANEL_VISIBLE_KEY = 'kingshot_mob_panel_visible_v1';
const MOB_CALC_STATE_KEY = 'kingshot_mob_calc_state_v2';
const MOB_LEGACY_CALC_KEY = 'kingshot_mob_calc_state_v1';
const MOB_TARGETS_M = [30, 25, 20, 15, 10];
const MOB_STD_TILE_MAX_K = 14000;
const MOB_PET_SKILL_SCORE_K = 14000;
const MOB_WAIT_TOLERANCE_K = 500;

function createDefaultMobAccountData() {
    return {
        targetM: 25,
        hasPetSkill: false,
        marches: [
            { id: 'm1', resKey: 'bread', fixed: true,  rawK: '' },
            { id: 'm2', resKey: 'wood',  fixed: true,  rawK: '' },
            { id: 'm3', resKey: 'stone', fixed: true,  rawK: '' },
            { id: 'm4', resKey: 'iron',  fixed: true,  rawK: '' },
            { id: 'm5', resKey: 'bread', fixed: false, rawK: '' },
            { id: 'm6', resKey: 'wood',  fixed: false, rawK: '' }
        ]
    };
}

function normalizeMobAccountData(rawObj) {
    const base = createDefaultMobAccountData();
    if (!rawObj || typeof rawObj !== 'object') return base;
    if (MOB_TARGETS_M.includes(Number(rawObj.targetM))) {
        base.targetM = Number(rawObj.targetM);
    }
    base.hasPetSkill = Boolean(rawObj.hasPetSkill);
    if (Array.isArray(rawObj.marches) && rawObj.marches.length === 6) {
        base.marches = rawObj.marches.map((m, i) => ({
            id: m.id || `m${i + 1}`,
            resKey: ['bread', 'wood', 'stone', 'iron'].includes(m.resKey) ? m.resKey : base.marches[i].resKey,
            fixed: typeof m.fixed === 'boolean' ? m.fixed : (i < 4),
            rawK: m.rawK !== undefined && m.rawK !== null ? String(m.rawK) : ''
        }));
    }
    return base;
}

let mobPanelVisible = true;
let mobDragSrcIdx = null;
let activeMobAccId = 'z';
let mobByAccount = {
    h: createDefaultMobAccountData(),
    z: createDefaultMobAccountData(),
    p: createDefaultMobAccountData()
};

function getCurrentMobData() {
    if (!mobByAccount[activeMobAccId]) {
        mobByAccount[activeMobAccId] = createDefaultMobAccountData();
    }
    return mobByAccount[activeMobAccId];
}

function serializeMobilizationStore() {
    return {
        activeAccId: activeMobAccId,
        accounts: {
            h: normalizeMobAccountData(mobByAccount.h),
            z: normalizeMobAccountData(mobByAccount.z),
            p: normalizeMobAccountData(mobByAccount.p)
        }
    };
}

function applyMobilizationSerialized(mobPayload) {
    if (!mobPayload || typeof mobPayload !== 'object') return;
    if (mobPayload.activeAccId && ['h', 'z', 'p'].includes(mobPayload.activeAccId)) {
        activeMobAccId = mobPayload.activeAccId;
    }
    if (mobPayload.accounts && typeof mobPayload.accounts === 'object') {
        ['h', 'z', 'p'].forEach(accId => {
            if (mobPayload.accounts[accId]) {
                mobByAccount[accId] = normalizeMobAccountData(mobPayload.accounts[accId]);
            }
        });
    } else if (Array.isArray(mobPayload.marches) || mobPayload.targetM !== undefined) {
        const legacy = normalizeMobAccountData(mobPayload);
        mobByAccount[activeMobAccId] = legacy;
    }
}

function loadMobState() {
    try {
        const vis = localStorage.getItem(MOB_PANEL_VISIBLE_KEY);
        if (vis !== null) mobPanelVisible = (vis === '1');

        const rawV2 = localStorage.getItem(MOB_CALC_STATE_KEY);
        if (rawV2) {
            applyMobilizationSerialized(JSON.parse(rawV2));
            return;
        }

        const rawV1 = localStorage.getItem(MOB_LEGACY_CALC_KEY);
        if (rawV1) {
            applyMobilizationSerialized(JSON.parse(rawV1));
        }
    } catch (e) {}
}

function saveMobState() {
    const payload = serializeMobilizationStore();
    try {
        localStorage.setItem(MOB_PANEL_VISIBLE_KEY, mobPanelVisible ? '1' : '0');
        localStorage.setItem(MOB_CALC_STATE_KEY, JSON.stringify(payload));
    } catch (e) {}
    scheduleResourceSave();
}

function setMobAccountTab(accId) {
    if (!['h', 'z', 'p'].includes(accId)) return;
    activeMobAccId = accId;
    saveMobState();
    renderMobilizationSection();
}

function updateMobilizationToggleBtn() {
    const btn = document.getElementById('mobilizationToggleBtn');
    const sec = document.getElementById('guildMobilizationSection');
    if (btn) {
        btn.innerText = mobPanelVisible ? '🏆 總動員採集：顯示' : '🏆 總動員採集：隱藏';
        btn.classList.toggle('active', mobPanelVisible);
    }
    if (sec) {
        sec.style.display = mobPanelVisible ? 'block' : 'none';
    }
}

function toggleMobilizationPanel() {
    mobPanelVisible = !mobPanelVisible;
    saveMobState();
    updateMobilizationToggleBtn();
    if (mobPanelVisible) renderMobilizationSection();
}

function setMobTargetM(valM) {
    const cur = getCurrentMobData();
    cur.targetM = Number(valM);
    saveMobState();
    renderMobilizationSection();
}

function toggleMobPetSkill() {
    const cur = getCurrentMobData();
    cur.hasPetSkill = !cur.hasPetSkill;
    saveMobState();
    renderMobilizationSection();
}

function updateMobMarchRes(slotIdx, resKey) {
    const cur = getCurrentMobData();
    if (!cur.marches[slotIdx]) return;
    cur.marches[slotIdx].resKey = resKey;
    saveMobState();
    renderMobilizationSection();
}

function onMobMarchInput(slotIdx, inputEl) {
    const cur = getCurrentMobData();
    let cleaned = String(inputEl.value || '').replace(/[^\d.]/g, '');
    const dotIdx = cleaned.indexOf('.');
    if (dotIdx !== -1) {
        cleaned = cleaned.slice(0, dotIdx) + '.' + cleaned.slice(dotIdx + 1).replace(/\./g, '').slice(0, 1);
    }
    if (inputEl.value !== cleaned) inputEl.value = cleaned;
    if (!cur.marches[slotIdx]) return;
    cur.marches[slotIdx].rawK = cleaned;
    saveMobState();
    updateMobPlansOnly();
}

function clearAllMobMarches() {
    const cur = getCurrentMobData();
    cur.marches.forEach(m => { m.rawK = ''; });
    saveMobState();
    renderMobilizationSection();
}

// ==========================================
// 左欄上下拖拉搬動（對齊遊戲內行軍順序）
// ==========================================
function onMobDragStart(event, idx) {
    mobDragSrcIdx = idx;
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(idx));
    }
    const row = event.currentTarget;
    if (row) row.classList.add('is-dragging');
}

function onMobDragOver(event, idx) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const row = event.currentTarget;
    if (row && mobDragSrcIdx !== idx) {
        row.classList.add('drag-over');
    }
}

function onMobDragLeave(event) {
    const row = event.currentTarget;
    if (row) row.classList.remove('drag-over');
}

function onMobDrop(event, targetIdx) {
    event.preventDefault();
    const row = event.currentTarget;
    if (row) row.classList.remove('drag-over');
    if (mobDragSrcIdx === null || mobDragSrcIdx === targetIdx) return;

    const cur = getCurrentMobData();
    const moved = cur.marches.splice(mobDragSrcIdx, 1)[0];
    cur.marches.splice(targetIdx, 0, moved);
    mobDragSrcIdx = null;
    saveMobState();
    renderMobilizationSection();
}

function onMobDragEnd() {
    mobDragSrcIdx = null;
    document.querySelectorAll('.mob-compact-row').forEach(r => {
        r.classList.remove('is-dragging', 'drag-over');
    });
}

// ==========================================
// 計算「等多一會」各隊到達什麼數量才召回（紅字目標量）
// ==========================================
function distributeLackAcrossEntries(entries, initialLack) {
    let remainingLack = initialLack;
    let activeList = entries.filter(e => e.capScore - e.curScore > 0.05);

    while (remainingLack > 0.05 && activeList.length > 0) {
        const share = remainingLack / activeList.length;
        const nextActive = [];
        let consumed = 0;

        for (const entry of activeList) {
            const room = entry.capScore - entry.curScore;
            if (room <= share + 0.01) {
                entry.curScore = entry.capScore;
                consumed += room;
            } else {
                entry.curScore += share;
                consumed += share;
                nextActive.push(entry);
            }
        }

        remainingLack -= consumed;
        activeList = nextActive;
        if (consumed <= 0.001) break;
    }
    return remainingLack;
}

function computeTargetRawKForWaitSubset(subset, lackK) {
    const targetsMap = new Map();
    const entries = subset
        .filter(it => !it.isPetSkillNode)
        .map(it => ({
            item: it,
            curScore: it.curScoreK,
            capScore: it.curScoreK < MOB_STD_TILE_MAX_K - 0.1
                ? MOB_STD_TILE_MAX_K
                : it.curScoreK + MOB_WAIT_TOLERANCE_K + 100
        }));

    // 優先分配給尚未滿標準 8 級礦（14,000K 積分）的隊伍
    const stdEntries = entries.filter(e => e.item.curScoreK < MOB_STD_TILE_MAX_K - 0.1);
    let remainingLack = distributeLackAcrossEntries(stdEntries, lackK);

    // 若組合中沒有未滿標準礦的隊伍（例如單獨派聯盟礦），則直接加在該聯盟礦隊伍上
    if (remainingLack > 0.05) {
        const megaEntries = entries.filter(e => e.item.curScoreK >= MOB_STD_TILE_MAX_K - 0.1);
        distributeLackAcrossEntries(megaEntries, remainingLack);
    }

    entries.forEach(entry => {
        const targetRaw = Math.ceil(entry.curScore / entry.item.def.mobMult);
        targetsMap.set(entry.item, targetRaw);
    });

    return targetsMap;
}

function computeMobPlans(usePetSkill) {
    const cur = getCurrentMobData();
    const targetK = cur.targetM * 1000;
    const activeItems = [];

    cur.marches.forEach((m, idx) => {
        const valK = parseFloat(m.rawK);
        if (!isNaN(valK) && valK > 0) {
            const def = getResDef(m.resKey);
            const curScoreK = valK * def.mobMult;
            const maxScoreK = Math.max(MOB_STD_TILE_MAX_K, curScoreK + MOB_WAIT_TOLERANCE_K);
            activeItems.push({
                orderNum: idx + 1,
                idx,
                resKey: m.resKey,
                def,
                rawK: valK,
                curScoreK,
                maxScoreK,
                isPetSkillNode: false
            });
        }
    });

    if (activeItems.length === 0) {
        return { instantPlans: [], waitPlans: [] };
    }

    if (usePetSkill) {
        activeItems.push({
            orderNum: 'pet',
            idx: 99,
            resKey: 'pet',
            def: null,
            rawK: MOB_PET_SKILL_SCORE_K,
            curScoreK: MOB_PET_SKILL_SCORE_K,
            maxScoreK: MOB_PET_SKILL_SCORE_K,
            isPetSkillNode: true
        });
    }

    const n = activeItems.length;
    const instantPlans = [];
    const waitPlans = [];

    const totalMasks = 1 << n;
    for (let mask = 1; mask < totalMasks; mask++) {
        const subset = [];
        for (let i = 0; i < n; i++) {
            if (mask & (1 << i)) subset.push(activeItems[i]);
        }

        const hasPetInSubset = subset.some(it => it.isPetSkillNode);
        if (usePetSkill && !hasPetInSubset) continue;

        const marchCount = subset.filter(it => !it.isPetSkillNode).length;
        if (marchCount === 0) continue;

        let curK = 0;
        let maxK = 0;
        subset.forEach(it => {
            curK += it.curScoreK;
            maxK += it.maxScoreK;
        });

        const diffK = curK - targetK;

        if (diffK >= 0) {
            instantPlans.push({
                subset,
                curK,
                overK: diffK,
                marchCount,
                hasPet: hasPetInSubset
            });
        } else {
            const lackK = Math.abs(diffK);
            if (lackK <= MOB_WAIT_TOLERANCE_K && maxK >= targetK) {
                const targetRawMap = computeTargetRawKForWaitSubset(subset, lackK);
                waitPlans.push({
                    subset,
                    curK,
                    lackK,
                    maxK,
                    marchCount,
                    hasPet: hasPetInSubset,
                    targetRawMap
                });
            }
        }
    }

    instantPlans.sort((a, b) => (a.marchCount - b.marchCount) || (a.overK - b.overK));
    waitPlans.sort((a, b) => (a.lackK - b.lackK) || (a.marchCount - b.marchCount));

    return {
        instantPlans: instantPlans.slice(0, 4),
        waitPlans: waitPlans.slice(0, 4)
    };
}

function formatKAndM(valK) {
    const m = (valK / 1000).toFixed(2);
    return `${Math.round(valK).toLocaleString()}K (${m}M)`;
}

function renderPlanCardsHtml(plans, mode) {
    const cur = getCurrentMobData();
    if (!plans || plans.length === 0) {
        return `<div class="mob-plan-empty">無符合此條件的組合</div>`;
    }

    return plans.map((p, idx) => {
        const chipsHtml = p.subset.map(it => {
            if (it.isPetSkillNode) {
                return `
                    <span class="mob-chip is-pet">
                        <img class="mob-chip-pet-icon" src="./assets/pet_skill.png" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
                        <span style="display:none;">🐾</span>
                        <span class="mob-chip-val">寵物技 +14M</span>
                    </span>
                `;
            }

            let targetHtml = '';
            if (mode === 'wait' && p.targetRawMap && p.targetRawMap.has(it)) {
                const goalK = p.targetRawMap.get(it);
                if (goalK > Math.ceil(it.rawK)) {
                    targetHtml = `<span class="mob-chip-target-red">→${goalK}K</span>`;
                }
            }

            return `
                <span class="mob-chip">
                    ${renderYellowFlowerBadgeHtml(it.orderNum, true)}
                    <img class="mob-chip-res-icon" src="${it.def.iconFile}" alt="${it.def.label}">
                    <span class="mob-chip-val">${it.rawK}K${targetHtml}</span>
                </span>
            `;
        }).join('');

        const badgeHtml = mode === 'instant'
            ? `<span class="mob-badge-ok">✅ 溢出 +${(p.overK / 1000).toFixed(2)}M</span>`
            : `<span class="mob-badge-wait">⏳ 再等 +${(p.lackK / 1000).toFixed(2)}M</span>`;

        const countLabel = p.hasPet ? `召回 ${p.marchCount} 隊 + 寵物技` : `共 ${p.marchCount} 隊`;

        return `
            <div class="mob-plan-card ${mode === 'instant' ? 'plan-instant' : 'plan-wait'}">
                <div class="mob-plan-top">
                    <span class="mob-plan-rank">方案 ${idx + 1}（${countLabel}）</span>
                    ${badgeHtml}
                </div>
                <div class="mob-plan-chips-grid">${chipsHtml}</div>
                <div class="mob-plan-foot">
                    總分：<strong>${formatKAndM(p.curK)}</strong> ／ 目標 ${cur.targetM}M
                </div>
            </div>
        `;
    }).join('');
}

function updateMobPlansOnly() {
    const resContainer = document.getElementById('mobResultsContainer');
    if (!resContainer) return;

    const cur = getCurrentMobData();
    const noPetRes = computeMobPlans(false);
    const withPetRes = cur.hasPetSkill ? computeMobPlans(true) : null;

    resContainer.innerHTML = `
        <div class="mob-results-inner ${cur.hasPetSkill ? 'two-cols' : 'one-col'}">
            <div class="mob-result-col">
                <div class="mob-col-header">🚶 不用寵物技 — 推薦召回組合</div>
                <div class="mob-scroll-body">
                    <div class="mob-sub-title">✅ 立刻召回即達標（保留其餘隊伍給下次任務）</div>
                    ${renderPlanCardsHtml(noPetRes.instantPlans, 'instant')}
                    <div class="mob-sub-title" style="margin-top:10px;">⏳ 等多一會（差距 ≤ 0.5M，紅字為召回目標量）</div>
                    ${renderPlanCardsHtml(noPetRes.waitPlans, 'wait')}
                </div>
            </div>

            ${cur.hasPetSkill ? `
                <div class="mob-result-col pet-col">
                    <div class="mob-col-header">🐾 使用寵物技 — 推薦組合</div>
                    <div class="mob-scroll-body">
                        <div class="mob-sub-title">✅ 立刻召回即達標</div>
                        ${renderPlanCardsHtml(withPetRes.instantPlans, 'instant')}
                        <div class="mob-sub-title" style="margin-top:10px;">⏳ 等多一會（差距 ≤ 0.5M，紅字為召回目標量）</div>
                        ${renderPlanCardsHtml(withPetRes.waitPlans, 'wait')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

function renderMobAccountTabsHtml() {
    return `
        <div class="mob-chrome-tabs" role="tablist" aria-label="帳號總動員分頁">
            ${accounts.map(acc => {
                const isActive = (activeMobAccId === acc.id);
                const faceSrc = getBearFaceFile(acc.id);
                return `
                    <button type="button"
                        role="tab"
                        aria-selected="${isActive ? 'true' : 'false'}"
                        class="mob-chrome-tab tab-${acc.id} ${isActive ? 'is-active' : ''}"
                        onclick="setMobAccountTab('${acc.id}')">
                        <img class="mob-tab-bear-face" src="${faceSrc}" alt="">
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

function renderMobilizationSection() {
    const sec = document.getElementById('guildMobilizationSection');
    if (!sec) return;
    updateMobilizationToggleBtn();
    if (!mobPanelVisible) return;

    const cur = getCurrentMobData();

    const targetBtnsHtml = MOB_TARGETS_M.map(t => `
        <button type="button" class="mob-target-pill ${cur.targetM === t ? 'active' : ''}" onclick="setMobTargetM(${t})">
            ${t}M
        </button>
    `).join('');

    const compactRowsHtml = cur.marches.map((m, idx) => {
        const def = getResDef(m.resKey);

        const leftVisualHtml = m.fixed
            ? `<div class="mob-compact-left-slot" title="${def.label} (×${def.mobMult})">
                   <img class="mob-big-res-png" src="${def.iconFile}" alt="${def.label}">
               </div>`
            : `<div class="mob-compact-left-slot is-select" title="自選資源">
                   <img class="mob-sel-res-png" src="${def.iconFile}" alt="${def.label}">
                   <select class="mob-compact-select" onchange="updateMobMarchRes(${idx}, this.value)">
                       ${RESOURCE_DEFS.map(r => `
                           <option value="${r.key}" ${m.resKey === r.key ? 'selected' : ''}>${r.label}</option>
                       `).join('')}
                   </select>
               </div>`;

        return `
            <div class="mob-compact-row"
                draggable="true"
                ondragstart="onMobDragStart(event, ${idx})"
                ondragover="onMobDragOver(event, ${idx})"
                ondragleave="onMobDragLeave(event)"
                ondrop="onMobDrop(event, ${idx})"
                ondragend="onMobDragEnd()">
                <span class="mob-drag-handle" title="按住花花上下拖拉對齊遊戲行軍順序">
                    ${renderYellowFlowerBadgeHtml(idx + 1, false)}
                </span>
                ${leftVisualHtml}
                <input type="text" inputmode="decimal" class="mob-march-input"
                    id="mob_in_${activeMobAccId}_${idx}"
                    value="${m.rawK}"
                    placeholder="輸入 K"
                    onfocus="this.select()"
                    oninput="onMobMarchInput(${idx}, this)">
                <span class="mob-unit-k">K</span>
            </div>
        `;
    }).join('');

    sec.innerHTML = `
        <div class="mob-panel-card">
            <div class="mob-panel-header">
                <div class="mob-title-box">
                    <span class="mob-main-title">🏆 聯盟總動員採集計算器</span>
                    ${renderMobAccountTabsHtml()}
                </div>
                <div class="mob-header-actions">
                    <div class="mob-target-group">${targetBtnsHtml}</div>
                    <button type="button" class="mob-pet-btn ${cur.hasPetSkill ? 'active' : ''}" onclick="toggleMobPetSkill()">
                        <img class="mob-pet-icon" src="./assets/pet_skill.png" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
                        <span class="mob-pet-fallback" style="display:none;">🐾</span>
                        <span>寵物技</span>
                    </button>
                    <button type="button" class="mob-clear-btn" onclick="clearAllMobMarches()">🧹 清空</button>
                </div>
            </div>

            <div class="mob-three-col-layout ${cur.hasPetSkill ? 'has-pet' : 'no-pet'}">
                <div class="mob-left-inputs-col">
                    <div class="mob-left-hint">🌼 按住花花可上下拖拉對齊遊戲順序</div>
                    ${compactRowsHtml}
                </div>
                <div class="mob-right-plans-wrap" id="mobResultsContainer"></div>
            </div>
        </div>
    `;

    updateMobPlansOnly();
}

document.addEventListener('DOMContentLoaded', () => {
    if (!isInitialLoadDone) {
        loadMobState();
    }
    renderMobilizationSection();
});
