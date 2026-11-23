// ==========================================
// 資源採集計算 + Tesseract.js OCR 辨識模組
// ==========================================

const RESOURCE_DEFS = [
    { key: 'bread',  label: '糧食', iconFile: './assets/item_icon_bread.png', ratio: 20 },
    { key: 'wood',   label: '木材', iconFile: './assets/item_icon_wood.png',  ratio: 20 },
    { key: 'stone',  label: '石材', iconFile: './assets/item_icon_stone.png', ratio: 4  },
    { key: 'iron',   label: '鐵',   iconFile: './assets/item_icon_icon.png',  ratio: 1  }
];

function renderResCardBigIconHtml(item) {
    return `<span class="res-card-big-icon-wrap"><img class="res-card-big-png" src="${item.iconFile}" alt="${item.label}"></span>`;
}

function renderPrioBigIconHtml(item) {
    return `<span class="res-prio-big-icon-wrap"><img class="res-prio-big-png" src="${item.iconFile}" alt="${item.label}" title="${item.label}"></span>`;
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
// Excel / Google Sheets 原汁原味 5 色階斜向漸層（翡翠綠 -> 抹茶黃綠 -> 柔暖黃 -> 蜜桃橘 -> 珊瑚磚紅）
// ==========================================
const EXCEL_5_LEVELS = [
    'linear-gradient(135deg, #63C796 0%, #4BA87A 100%)', // 第 1 階：最缺（Excel 翡翠綠 #57BB8A）
    'linear-gradient(135deg, #AFD283 0%, #92B864 100%)', // 第 2 階：次缺（Excel 抹茶黃綠 #A3C876）
    'linear-gradient(135deg, #FAD76B 0%, #E5BE48 100%)', // 第 3 階：中間（Excel 柔暖黃 #F8D05B）
    'linear-gradient(135deg, #F5A973 0%, #DF894E 100%)', // 第 4 階：偏多（Excel 蜜桃橘 #F09D64）
    'linear-gradient(135deg, #EC8980 0%, #D6675D 100%)'  // 第 5 階：最多（Excel 珊瑚磚紅 #E67C73）
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
                                oninput="onResourceNumberTyping('${acc.id}', '${item.key}', this)"
                                onblur="saveState()">
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
// 精準 4 格固定座標 OCR 辨識（中英文介面通用，完全避開 Items）
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

function cropFixedInStockCell(img, y0Ratio, y1Ratio) {
    const isTwoPanel = (img.width / img.height) > 0.9;
    const panelWidth = isTwoPanel ? img.width * 0.5 : img.width;

    const sx = Math.round(panelWidth * 0.65);
    const sw = Math.round(panelWidth * 0.25);
    const sy = Math.round(img.height * y0Ratio);
    const sh = Math.round(img.height * (y1Ratio - y0Ratio));

    const scale = 3;
    const pad = 18;
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
        const val = lum < 155 ? 0 : 255;
        d[i] = d[i + 1] = d[i + 2] = val;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

function parseOcrCellText(rawText) {
    const clean = String(rawText || '').replace(/\s+/g, '').toUpperCase();
    const match = clean.match(/(\d+(?:\.\d+)?)([BMK])/);
    if (!match) return null;

    let numStr = match[1];
    const unit = match[2];

    if (unit === 'B' && !numStr.includes('.') && numStr.length >= 3) {
        numStr = `${numStr[0]}.${numStr.slice(1, 3)}`;
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
            const cellCanvas = cropFixedInStockCell(img, box.y0, box.y1);
            const { data } = await worker.recognize(cellCanvas);
            const parsed = parseOcrCellText(data && data.text);
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
