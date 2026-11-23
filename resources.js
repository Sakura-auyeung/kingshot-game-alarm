// ==========================================
// 資源採集計算 + Tesseract.js OCR 辨識模組
// ==========================================

const RESOURCE_DEFS = [
    { key: 'bread',  label: '糧食', iconFile: './assets/item_icon_bread.png', ratio: 20 },
    { key: 'wood',   label: '木材', iconFile: './assets/item_icon_wood.png',  ratio: 20 },
    { key: 'stone',  label: '石材', iconFile: './assets/item_icon_stone.png', ratio: 4  },
    { key: 'iron',   label: '鐵',   iconFile: './assets/item_icon_icon.png',  ratio: 1  }
];

function renderResIconHtml(item) {
    return `<span class="res-icon-wrap"><img class="res-item-png" src="${item.iconFile}" alt="${item.label}"></span>`;
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
        let tierClass = '';
        if (item.hasVal && validItems.length > 1 && maxScaled > minScaled) {
            const ratioPos = (item.scaledVal - minScaled) / (maxScaled - minScaled);
            if (ratioPos <= 0.25) tierClass = 'tier-green';
            else if (ratioPos <= 0.55) tierClass = 'tier-mid-green';
            else if (ratioPos <= 0.85) tierClass = 'tier-mid-red';
            else tierClass = 'tier-red';
        } else if (item.hasVal && validItems.length === 1) {
            tierClass = 'tier-green';
        }
        return { ...item, tierClass };
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

function openFilePickerForAcc(event, accId) {
    if (event) event.stopPropagation();
    activePasteAccId = accId;
    pendingUploadAccId = accId;
    renderResourcesGrid();
    const fileInput = document.getElementById('resFileInput');
    if (fileInput) {
        fileInput.value = '';
        fileInput.click();
    }
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

function renderResourcesGrid() {
    const grid = document.getElementById('resourcesGrid');
    if (!grid) return;

    grid.innerHTML = accounts.map(acc => {
        const p = profiles[acc.id] || {};
        const displayName = p.name || acc.id;
        const analysis = getAccountResourceAnalysis(acc.id);
        const isActiveTarget = (activePasteAccId === acc.id);
        const statusMsg = ocrStatusText[acc.id] || '';

        const bestHtml = analysis.hasAny && analysis.bestItem
            ? `<span class="res-best-badge">${renderResIconHtml(analysis.bestItem)}${analysis.bestItem.label}</span>`
            : `<span class="status-pill none">未填數量</span>`;

        const gapText = (analysis.hasAny && analysis.gapM !== null)
            ? `差距：<strong>${analysis.gapM.toFixed(1)}M</strong>`
            : `差距：--`;

        const rowsHtml = analysis.items.map(item => `
            <div class="res-row-card ${item.tierClass}" id="res_card_${acc.id}_${item.key}">
                <div class="res-row-top">
                    <div class="res-name-group">
                        ${renderResIconHtml(item)}
                        <span>${item.label}</span>
                        <span class="res-ratio-tag">÷${item.ratio}</span>
                    </div>
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
                    <span id="res_stock_${acc.id}_${item.key}">${item.hasVal ? `庫存：${item.valStr}${item.unit}` : '未填寫'}</span>
                    <span class="res-scaled-val" id="res_scaled_${acc.id}_${item.key}">${item.hasVal ? formatScaledMillions(item.scaledVal) : '--'}</span>
                </div>
            </div>
        `).join('');

        return `
            <div class="account-column ${acc.id}">
                ${renderProfileHeader(acc)}

                <div class="res-merged-row ${isActiveTarget ? 'active-target' : ''}">
                    <div class="res-merged-col paste-col">
                        <div class="res-paste-top">
                            <button type="button" class="res-target-btn" onclick="setPasteTarget('${acc.id}')">
                                ${isActiveTarget ? '✅ 目標：' : '📌 目標：'}[${displayName}]
                            </button>
                            <button type="button" class="res-pick-file-btn" title="選擇截圖檔" onclick="openFilePickerForAcc(event, '${acc.id}')">
                                📁 選檔
                            </button>
                        </div>
                        <div class="res-paste-hint">${statusMsg ? `<span class="res-ocr-status">${statusMsg}</span>` : 'Ctrl+V 貼上 In Stock'}</div>
                    </div>

                    <div class="res-merged-col prio-col" id="res_prio_${acc.id}">
                        <div class="res-best-line">
                            <span>採集優先</span>
                            ${bestHtml}
                        </div>
                        <div class="res-gap-line">
                            <span>${gapText}</span>
                        </div>
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
        const bestHtml = analysis.hasAny && analysis.bestItem
            ? `<span class="res-best-badge">${renderResIconHtml(analysis.bestItem)}${analysis.bestItem.label}</span>`
            : `<span class="status-pill none">未填數量</span>`;
        const gapText = (analysis.hasAny && analysis.gapM !== null)
            ? `差距：<strong>${analysis.gapM.toFixed(1)}M</strong>`
            : `差距：--`;
        prioBox.innerHTML = `
            <div class="res-best-line">
                <span>採集優先</span>
                ${bestHtml}
            </div>
            <div class="res-gap-line">
                <span>${gapText}</span>
            </div>
        `;
    }

    analysis.items.forEach(item => {
        const card = document.getElementById(`res_card_${accId}_${item.key}`);
        if (card) {
            card.className = `res-row-card ${item.tierClass}`;
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
        const stockEl = document.getElementById(`res_stock_${accId}_${item.key}`);
        if (stockEl) {
            stockEl.innerText = item.hasVal ? `庫存：${item.valStr}${item.unit}` : '未填寫';
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
// OCR 辨識區段（保持原狀未改動）
// ==========================================
async function getOcrWorker() {
    if (typeof Tesseract === 'undefined') {
        throw new Error("Tesseract OCR 尚未載入");
    }
    if (tesseractWorker) return tesseractWorker;
    tesseractWorker = await Tesseract.createWorker('eng');
    await tesseractWorker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.'
    });
    return tesseractWorker;
}

function preprocessImageToCanvas(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const isTwoPanel = (img.width / img.height) > 0.9;
            let sx, sy, sw, sh;

            if (isTwoPanel) {
                sx = Math.round(img.width * 0.05);
                sy = Math.round(img.height * 0.22);
                sw = Math.round(img.width * 0.48);
                sh = Math.round(img.height * 0.66);
            } else {
                sx = Math.round(img.width * 0.12);
                sy = Math.round(img.height * 0.22);
                sw = Math.round(img.width * 0.86);
                sh = Math.round(img.height * 0.66);
            }

            const scale = 2.5;
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(sw * scale);
            canvas.height = Math.round(sh * scale);
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
                const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                const val = gray < 150 ? 0 : 255;
                d[i] = d[i + 1] = d[i + 2] = val;
            }
            ctx.putImageData(imgData, 0, 0);
            resolve({ canvas, width: canvas.width, height: canvas.height });
        };
        img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(e);
        };
        img.src = url;
    });
}

function fixMissingDecimalToken(numStr, unit) {
    let clean = String(numStr || '').trim();
    const upperUnit = String(unit || 'M').toUpperCase();
    if (upperUnit === 'B' && !clean.includes('.') && clean.length >= 3) {
        clean = `${clean[0]}.${clean.slice(1, 3)}`;
    }
    return { num: clean, unit: upperUnit };
}

function extractLabeledInStockValues(data, canvasWidth, canvasHeight) {
    const rawWords = Array.isArray(data && data.words) ? data.words : [];
    const tokenRegex = /^(\d+(?:\.\d+)?)\s*([BMK])$/i;
    const rowTolerance = Math.max(28, Math.round(canvasHeight * 0.055));

    const labelY = { bread: null, wood: null, stone: null, iron: null };
    const numTokens = [];

    for (const w of rawWords) {
        if (!w || !w.bbox) continue;
        const rawText = String(w.text || '').replace(/,/g, '').trim();
        const lowerText = rawText.toLowerCase();
        const cy = (w.bbox.y0 + w.bbox.y1) / 2;
        const cx = (w.bbox.x0 + w.bbox.x1) / 2;

        if (cx < canvasWidth * 0.48) {
            if (lowerText.includes('bread') || lowerText === 'read') labelY.bread = cy;
            else if (lowerText.includes('wood')) labelY.wood = cy;
            else if (lowerText.includes('stone') || lowerText === 'tone') labelY.stone = cy;
            else if (lowerText.includes('iron') || lowerText === 'ron') labelY.iron = cy;
        }

        const m = tokenRegex.exec(rawText);
        if (m && cx > canvasWidth * 0.62) {
            numTokens.push({ ...fixMissingDecimalToken(m[1], m[2]), cx, cy });
        }
    }

    const resultMap = { bread: null, wood: null, stone: null, iron: null };
    const keys = ['bread', 'wood', 'stone', 'iron'];

    keys.forEach(k => {
        if (labelY[k] !== null) {
            const rowMatches = numTokens.filter(t => Math.abs(t.cy - labelY[k]) <= rowTolerance);
            if (rowMatches.length > 0) {
                rowMatches.sort((a, b) => b.cx - a.cx);
                resultMap[k] = rowMatches[0];
            }
        }
    });

    if (numTokens.length >= 4 && keys.some(k => !resultMap[k])) {
        const sortedByY = [...numTokens].sort((a, b) => a.cy - b.cy);
        const rows = [];
        for (const tok of sortedByY) {
            const existing = rows.find(r => Math.abs(r.avgY - tok.cy) <= rowTolerance);
            if (existing) {
                existing.items.push(tok);
                existing.avgY = existing.items.reduce((s, it) => s + it.cy, 0) / existing.items.length;
            } else {
                rows.push({ avgY: tok.cy, items: [tok] });
            }
        }
        if (rows.length >= 4) {
            keys.forEach((k, idx) => {
                if (!resultMap[k] && rows[idx]) {
                    const rowItems = rows[idx].items.sort((a, b) => b.cx - a.cx);
                    resultMap[k] = rowItems[0];
                }
            });
        }
    }

    return resultMap;
}

async function runOcrOnImageFile(file, accId) {
    ocrStatusText[accId] = 'OCR 辨識中...';
    renderResourcesGrid();

    try {
        const { canvas, width, height } = await preprocessImageToCanvas(file);
        const worker = await getOcrWorker();
        const { data } = await worker.recognize(canvas);
        const mapped = extractLabeledInStockValues(data || {}, width, height);

        const resKeys = ['bread', 'wood', 'stone', 'iron'];
        let filledCount = 0;
        resKeys.forEach(k => {
            const tok = mapped[k];
            if (tok) {
                resourcesStore[accId][k] = { val: tok.num, unit: tok.unit };
                filledCount++;
            }
        });

        ocrStatusText[accId] = filledCount > 0
            ? `已填入 ${filledCount} 項 In Stock`
            : '未認出數值，請手動輸入';
        renderResourcesGrid();
        saveState();
    } catch (err) {
        console.error('OCR Error:', err);
        ocrStatusText[accId] = '辨識失敗，請手動輸入';
        renderResourcesGrid();
    }
}
