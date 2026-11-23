// ==========================================
// 資源採集比例計算 & 截圖 OCR 辨識模組
// ==========================================

const RESOURCE_DEFS = [
    { key: 'bread', label: '糧食', emoji: '🍞', ratio: 20 },
    { key: 'wood',  label: '木材', emoji: '🪵', ratio: 20 },
    { key: 'stone', label: '石材', emoji: '🪨', ratio: 4  },
    { key: 'iron',  label: '鐵',   emoji: '⛓️', ratio: 1  }
];

let resourcesStore = {
    h: { bread: { val: '', unit: 'M' }, wood: { val: '', unit: 'M' }, stone: { val: '', unit: 'M' }, iron: { val: '', unit: 'M' } },
    z: { bread: { val: '', unit: 'B' }, wood: { val: '', unit: 'B' }, stone: { val: '', unit: 'M' }, iron: { val: '', unit: 'M' } },
    p: { bread: { val: '', unit: 'B' }, wood: { val: '', unit: 'B' }, stone: { val: '', unit: 'M' }, iron: { val: '', unit: 'M' } }
};

let activePasteAccId = 'z';
let pendingUploadAccId = 'z';
let ocrStatusText = { h: '', z: '', p: '' };
let tesseractWorker = null;

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
            ? `<span class="res-best-badge">最缺：${analysis.bestItem.emoji} ${analysis.bestItem.label}</span>`
            : `<span class="status-pill none">未輸入數量</span>`;

        const gapText = (analysis.hasAny && analysis.gapM !== null)
            ? `紅綠差距：<strong>${analysis.gapM.toFixed(1)}M</strong>（除比例後）`
            : `紅綠差距：--`;

        const rowsHtml = analysis.items.map(item => `
            <div class="res-row-card ${item.tierClass}">
                <div class="res-row-top">
                    <div class="res-name-group">
                        <span>${item.emoji} ${item.label}</span>
                        <span class="res-ratio-tag">÷${item.ratio}</span>
                    </div>
                    <div class="res-input-group">
                        <input type="text" inputmode="decimal" class="res-num-input"
                            value="${item.valStr}" placeholder="0.00"
                            oninput="updateResourceField('${acc.id}', '${item.key}', 'val', this.value)">
                        <select class="res-unit-select"
                            onchange="updateResourceField('${acc.id}', '${item.key}', 'unit', this.value)">
                            <option value="K" ${item.unit === 'K' ? 'selected' : ''}>K</option>
                            <option value="M" ${item.unit === 'M' ? 'selected' : ''}>M</option>
                            <option value="B" ${item.unit === 'B' ? 'selected' : ''}>B</option>
                        </select>
                    </div>
                </div>
                <div class="res-row-bottom">
                    <span>${item.hasVal ? `庫存：${item.valStr}${item.unit}` : '未填寫'}</span>
                    <span class="res-scaled-val">${item.hasVal ? formatScaledMillions(item.scaledVal) : '--'}</span>
                </div>
            </div>
        `).join('');

        return `
            <div class="account-column ${acc.id}">
                ${renderProfileHeader(acc)}

                <div class="res-paste-box ${isActiveTarget ? 'active-target' : ''}">
                    <div class="res-paste-top">
                        <button type="button" class="res-target-btn" onclick="setPasteTarget('${acc.id}')">
                            ${isActiveTarget ? '✅ 貼上目標：' : '📌 設為貼上目標：'}[${displayName}]
                        </button>
                        <button type="button" class="res-pick-file-btn" onclick="openFilePickerForAcc(event, '${acc.id}')">
                            📁 選檔
                        </button>
                    </div>
                    <div class="res-paste-hint">截圖後直接按 Ctrl+V 貼上（精準鎖定紅框 4 項 In Stock）</div>
                    ${statusMsg ? `<div class="res-ocr-status">${statusMsg}</div>` : ''}
                </div>

                <div class="res-recommend-box">
                    <div class="res-best-line">
                        <span>採集優先</span>
                        ${bestHtml}
                    </div>
                    <div class="res-gap-line">
                        <span>${gapText}</span>
                    </div>
                </div>

                ${rowsHtml}
            </div>
        `;
    }).join('');
}

function updateResourceField(accId, resKey, field, value) {
    if (!resourcesStore[accId]) resourcesStore[accId] = {};
    if (!resourcesStore[accId][resKey]) resourcesStore[accId][resKey] = { val: '', unit: 'M' };
    resourcesStore[accId][resKey][field] = value;
    renderResourcesGrid();
    if (typeof saveState === 'function') saveState();
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

async function getOcrWorker() {
    if (typeof Tesseract === 'undefined') {
        throw new Error("Tesseract OCR 尚未載入");
    }
    if (tesseractWorker) return tesseractWorker;
    tesseractWorker = await Tesseract.createWorker('eng');
    await tesseractWorker.setParameters({
        tessedit_char_whitelist: '0123456789.BMKbmK'
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

            // 只包住糧、木、石、鐵頭 4 行，徹底排除第 5 行金幣
            if (isTwoPanel) {
                sx = Math.round(img.width * 0.32);
                sy = Math.round(img.height * 0.31);
                sw = Math.round(img.width * 0.20);
                sh = Math.round(img.height * 0.255);
            } else {
                sx = Math.round(img.width * 0.64);
                sy = Math.round(img.height * 0.31);
                sw = Math.round(img.width * 0.34);
                sh = Math.round(img.height * 0.255);
            }

            const scale = 3;
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(sw * scale);
            canvas.height = Math.round(sh * scale);
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

            // 調柔對比度增強（保留灰度抗鋸齒，避免 B 黏成 8 或小數點消失）
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
                const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                let contrasted = (gray - 135) * 2.2 + 135;
                contrasted = Math.max(0, Math.min(255, contrasted));
                d[i] = d[i + 1] = d[i + 2] = contrasted;
            }
            ctx.putImageData(imgData, 0, 0);
            resolve(canvas);
        };
        img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(e);
        };
        img.src = url;
    });
}

function fixMissingDecimalToken(numStr, unit) {
    let clean = String(numStr || '').replace(/,/g, '.').trim();
    let upperUnit = String(unit || '').toUpperCase();

    // 修正「B」被 OCR 誤認成「8」的情況（例如 1.478 -> 1.47B, 2.398 -> 2.39B）
    if (!upperUnit) {
        const m8 = /^(\d+\.\d{2})8$/.exec(clean);
        if (m8) {
            clean = m8[1];
            upperUnit = 'B';
        } else {
            upperUnit = 'M';
        }
    }

    if (upperUnit === 'B' && !clean.includes('.') && clean.length >= 3) {
        clean = `${clean[0]}.${clean.slice(1, 3)}`;
    }
    return { num: clean, unit: upperUnit };
}

function extractRedBoxStockValues(data) {
    const tokenRegex = /^(\d+(?:\.\d+)?)\s*([BMK])?$|^(\d+\.\d{2}8)$/i;
    const rawWords = Array.isArray(data && data.words) ? data.words : [];

    const numTokens = [];
    for (const w of rawWords) {
        const clean = String(w.text || '').replace(/,/g, '.').trim();
        const m = tokenRegex.exec(clean);
        if (m && w.bbox) {
            const cy = (w.bbox.y0 + w.bbox.y1) / 2;
            if (m[3]) {
                numTokens.push({ ...fixMissingDecimalToken(m[3], ''), cy });
            } else if (m[2]) {
                numTokens.push({ ...fixMissingDecimalToken(m[1], m[2]), cy });
            }
        }
    }

    if (numTokens.length > 0) {
        numTokens.sort((a, b) => a.cy - b.cy);
        const rows = [];
        for (const tok of numTokens) {
            const targetRow = rows.find(r => Math.abs(r.avgY - tok.cy) <= 35);
            if (targetRow) {
                targetRow.items.push(tok);
                targetRow.avgY = targetRow.items.reduce((s, it) => s + it.cy, 0) / targetRow.items.length;
            } else {
                rows.push({ avgY: tok.cy, items: [tok] });
            }
        }
        return rows.slice(0, 4).map(r => r.items[r.items.length - 1]);
    }

    const pairedRegex = /(\d+(?:\.\d+)?)\s*([BMK])|(\d+\.\d{2}8)/gi;
    const results = [];
    let match;
    while ((match = pairedRegex.exec((data && data.text) || '')) !== null && results.length < 4) {
        if (match[3]) {
            results.push(fixMissingDecimalToken(match[3], ''));
        } else {
            results.push(fixMissingDecimalToken(match[1], match[2]));
        }
    }
    return results;
}

async function runOcrOnImageFile(file, accId) {
    ocrStatusText[accId] = 'OCR 辨識紅框 In Stock 中...';
    renderResourcesGrid();

    try {
        const canvas = await preprocessImageToCanvas(file);
        const worker = await getOcrWorker();
        const { data } = await worker.recognize(canvas);
        const chosen = extractRedBoxStockValues(data || {});

        const resKeys = ['bread', 'wood', 'stone', 'iron'];
        let filledCount = 0;
        chosen.forEach((tok, idx) => {
            const k = resKeys[idx];
            if (k && tok) {
                resourcesStore[accId][k] = { val: tok.num, unit: tok.unit };
                filledCount++;
            }
        });

        ocrStatusText[accId] = filledCount > 0
            ? `已填入紅框 ${filledCount} 項 In Stock`
            : '未認出清晰數值，請手動輸入';
        renderResourcesGrid();
        if (typeof saveState === 'function') saveState();
    } catch (err) {
        console.error('OCR Error:', err);
        ocrStatusText[accId] = '辨識失敗，請手動輸入';
        renderResourcesGrid();
    }
}