// ==========================================
// JOBS.JS：全帳號職位自動排程、兩層撞期防呆與狀態卡片渲染
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

function getLatestActiveCategoryEndDate(accId, category) {
    const nowMs = getAccurateNow().getTime();
    const list = (store[accId] && Array.isArray(store[accId][category])) ? store[accId][category] : [];
    let latestDate = null;
    list.forEach(it => {
        if (it.endTime && !isNaN(it.endTime.getTime()) && it.endTime.getTime() > nowMs) {
            if (!latestDate || it.endTime.getTime() > latestDate.getTime()) {
                latestDate = it.endTime;
            }
        }
    });
    return latestDate;
}

function isJobInCooldown(accId, type, now = getAccurateNow()) {
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const jobDate = store[accId] ? store[accId][dateKey] : null;
    if (!jobDate) return false;
    const diffMs = now.getTime() - jobDate.getTime();
    return diffMs >= 0 && diffMs < 10 * 60 * 1000;
}

// 檢查指定帳號與職位在 targetDate 時，是否與其他職位在 10 分鐘內相撞
// 包含：(1) 同帳號雙職位撞期 (2) 不同帳號預約同一職位同一時段
function findJobConflicts(accId, type, targetDate) {
    if (!targetDate || isNaN(targetDate.getTime())) return [];
    const targetMs = targetDate.getTime();
    const conflicts = [];

    accounts.forEach(otherAcc => {
        const otherStore = store[otherAcc.id];
        if (!otherStore) return;

        ['soldier', 'tech'].forEach(otherType => {
            if (otherAcc.id === accId && otherType === type) return;

            const isSameAcc = (otherAcc.id === accId);
            const isSameType = (otherType === type);
            if (!isSameAcc && !isSameType) return;

            const otherDate = otherType === 'soldier' ? otherStore.soldierJobDate : otherStore.techJobDate;
            if (!otherDate || isNaN(otherDate.getTime())) return;

            if (Math.abs(otherDate.getTime() - targetMs) < 10 * 60 * 1000) {
                conflicts.push({
                    accId: otherAcc.id,
                    accName: getDisplayAccountName(otherAcc.id),
                    type: otherType,
                    typeLabel: otherType === 'soldier' ? '⚔️ 士兵職位' : '🔬 科技職位',
                    date: otherDate,
                    reason: isSameAcc
                        ? '同一帳號不能同時段擔任雙職位'
                        : '不同帳號預約了同一職位同一時段'
                });
            }
        });
    });

    return conflicts;
}

function hasAnyJobConflict(accId, type) {
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const jDate = store[accId] ? store[accId][dateKey] : null;
    if (!jDate) return false;
    return findJobConflicts(accId, type, jDate).length > 0;
}

function closeJobConflictModal() {
    const modal = document.getElementById('jobConflictModal');
    if (modal) modal.classList.remove('open');
}

// 紅框職位撞期確認彈窗（第一層防呆）
function openJobConflictModal({ accId, type, targetDate, conflicts, onProceed, onShiftAuto }) {
    const modal = document.getElementById('jobConflictModal');
    const titleEl = document.getElementById('jobConflictModalTitle');
    const bodyEl = document.getElementById('jobConflictModalBody');
    const actionsEl = document.getElementById('jobConflictModalActions');
    if (!modal || !bodyEl || !actionsEl) return;

    const myName = getDisplayAccountName(accId);
    const myTypeLabel = type === 'soldier' ? '⚔️ 士兵職位' : '🔬 科技職位';
    const timeLabel = formatFullDateTime(targetDate);

    if (titleEl) {
        titleEl.innerText = '⚠️ 職位時段相撞提醒';
    }

    const listHtml = conflicts.map(c =>
        `• <strong>[${c.accName}] ${c.typeLabel}</strong>（${formatFullDateTime(c.date)}）<br><span style="font-size:12.5px; color:#8C6A58;">原因：${c.reason}</span>`
    ).join('<br>');

    bodyEl.innerHTML = `
        你為 <strong>[${myName}] ${myTypeLabel}</strong> 設定的時段（<strong>${timeLabel}</strong>）與以下預約重疊：<br><br>
        ${listHtml}<br><br>
        是否要自動順延 30 分鐘錯開時段，或仍要保留重疊？
    `;

    actionsEl.innerHTML = '';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'btn-modal-cancel';
    btnCancel.innerText = '取消返回';
    btnCancel.onclick = () => {
        closeJobConflictModal();
        if (typeof renderGrid === 'function') renderGrid();
        if (typeof updateTimeline === 'function') updateTimeline(true);
    };

    const btnProceed = document.createElement('button');
    btnProceed.type = 'button';
    btnProceed.className = 'btn-modal-danger';
    btnProceed.innerText = '仍要保留重疊';
    btnProceed.onclick = () => {
        closeJobConflictModal();
        if (typeof onProceed === 'function') onProceed();
    };

    const btnShift = document.createElement('button');
    btnShift.type = 'button';
    btnShift.className = 'btn-modal-save';
    btnShift.innerText = '自動順延 +30分';
    btnShift.onclick = () => {
        closeJobConflictModal();
        if (typeof onShiftAuto === 'function') onShiftAuto();
    };

    actionsEl.appendChild(btnCancel);
    actionsEl.appendChild(btnProceed);
    actionsEl.appendChild(btnShift);

    modal.classList.add('open');
}

function autoSyncJobFromTimer(accId, type, endDate, forceSync = false) {
    const manualKey = type === 'soldier' ? 'soldierJobManual' : 'techJobManual';
    const timeKey = type === 'soldier' ? 'soldierJobTime' : 'techJobTime';
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';

    // 若職位已鎖定確認、已手動固定、或目前仍在冷卻期內，不覆蓋
    if (!forceSync && (store[accId][confKey] || store[accId][manualKey] || isJobInCooldown(accId, type, getAccurateNow()))) {
        return;
    }

    const slot = getRecommendedJobSlotFromDate(endDate);
    if (!slot) return;

    store[accId][dateKey] = slot;
    store[accId][timeKey] = formatTimeHM(slot);
    store[accId][confKey] = false;
}

function applyJobTimeDirect(accId, type, targetDate, confirmed) {
    const timeKey = type === 'soldier' ? 'soldierJobTime' : 'techJobTime';
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';
    const manualKey = type === 'soldier' ? 'soldierJobManual' : 'techJobManual';

    store[accId][timeKey] = formatTimeHM(targetDate);
    store[accId][dateKey] = targetDate;
    store[accId][confKey] = !!confirmed;
    store[accId][manualKey] = true;

    if (typeof renderGrid === 'function') renderGrid();
    if (typeof updateTimeline === 'function') updateTimeline(true);
    saveState();
}

function setJobTime(accId, type, timeStr, confirmed = false) {
    isJobSelectActive = false;
    const timeKey = type === 'soldier' ? 'soldierJobTime' : 'techJobTime';
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';
    const manualKey = type === 'soldier' ? 'soldierJobManual' : 'techJobManual';

    if (!timeStr) {
        store[accId][timeKey] = '';
        store[accId][dateKey] = null;
        store[accId][confKey] = false;
        store[accId][manualKey] = false;
        if (typeof renderGrid === 'function') renderGrid();
        if (typeof updateTimeline === 'function') updateTimeline(true);
        saveState();
        return;
    }

    const [h, m] = timeStr.split(':').map(Number);
    const d = getAccurateNow();
    d.setHours(h, m, 0, 0);
    if (d.getTime() < getAccurateNow().getTime() - 10 * 60 * 1000) {
        d.setDate(d.getDate() + 1);
    }

    const conflicts = findJobConflicts(accId, type, d);
    if (conflicts.length > 0) {
        openJobConflictModal({
            accId,
            type,
            targetDate: d,
            conflicts,
            onProceed: () => applyJobTimeDirect(accId, type, d, confirmed),
            onShiftAuto: () => {
                const shifted = new Date(d.getTime() + 30 * 60 * 1000);
                applyJobTimeDirect(accId, type, shifted, confirmed);
            }
        });
        return;
    }

    applyJobTimeDirect(accId, type, d, confirmed);
}

function shiftJobTime(accId, type, deltaMinutes) {
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';

    let base = store[accId][dateKey];
    if (!base || isNaN(base.getTime())) {
        base = getRecommendedJobSlotFromDate(getAccurateNow());
    }
    const shifted = new Date(base.getTime() + deltaMinutes * 60 * 1000);
    const keepConfirmed = !!store[accId][confKey];

    const conflicts = findJobConflicts(accId, type, shifted);
    if (conflicts.length > 0) {
        openJobConflictModal({
            accId,
            type,
            targetDate: shifted,
            conflicts,
            onProceed: () => applyJobTimeDirect(accId, type, shifted, keepConfirmed),
            onShiftAuto: () => {
                const nextSlot = new Date(shifted.getTime() + 30 * 60 * 1000);
                applyJobTimeDirect(accId, type, nextSlot, keepConfirmed);
            }
        });
        return;
    }

    applyJobTimeDirect(accId, type, shifted, keepConfirmed);
}

function toggleJobConfirm(accId, type) {
    const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const manualKey = type === 'soldier' ? 'soldierJobManual' : 'techJobManual';

    const jDate = store[accId][dateKey];
    if (!jDate) {
        alert('請先選擇職位預約時間！');
        return;
    }
    if (isJobInCooldown(accId, type, getAccurateNow())) {
        alert('同一職位目前仍在 10 分鐘冷卻中，冷卻結束後才能重新申請！');
        return;
    }

    const wasConfirmed = !!store[accId][confKey];
    if (wasConfirmed) {
        // 解除鎖定：取消手動固定旗標，並立刻對齊目前正在跑的士兵／科技倒數時間
        store[accId][confKey] = false;
        store[accId][manualKey] = false;
        const cat = type === 'soldier' ? 'soldiers' : 'tech';
        const activeEndDate = getLatestActiveCategoryEndDate(accId, cat);
        if (activeEndDate) {
            autoSyncJobFromTimer(accId, type, activeEndDate, true);
        }
        if (typeof renderGrid === 'function') renderGrid();
        if (typeof updateTimeline === 'function') updateTimeline(true);
        saveState();
        return;
    }

    // 準備鎖定確認前，先檢查是否有與其他職位重疊（第一層防呆）
    const conflicts = findJobConflicts(accId, type, jDate);
    if (conflicts.length > 0) {
        openJobConflictModal({
            accId,
            type,
            targetDate: jDate,
            conflicts,
            onProceed: () => {
                store[accId][confKey] = true;
                if (typeof renderGrid === 'function') renderGrid();
                if (typeof updateTimeline === 'function') updateTimeline(true);
                saveState();
            },
            onShiftAuto: () => {
                const shifted = new Date(jDate.getTime() + 30 * 60 * 1000);
                applyJobTimeDirect(accId, type, shifted, true);
            }
        });
        return;
    }

    store[accId][confKey] = true;
    if (typeof renderGrid === 'function') renderGrid();
    if (typeof updateTimeline === 'function') updateTimeline(true);
    saveState();
}

function handleConflictPillClick(accId, type) {
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';
    const jDate = store[accId][dateKey];
    if (!jDate) return;

    const conflicts = findJobConflicts(accId, type, jDate);
    if (conflicts.length === 0) {
        toggleJobConfirm(accId, type);
        return;
    }

    openJobConflictModal({
        accId,
        type,
        targetDate: jDate,
        conflicts,
        onProceed: () => {
            store[accId][confKey] = !store[accId][confKey];
            if (typeof renderGrid === 'function') renderGrid();
            if (typeof updateTimeline === 'function') updateTimeline(true);
            saveState();
        },
        onShiftAuto: () => {
            const shifted = new Date(jDate.getTime() + 30 * 60 * 1000);
            applyJobTimeDirect(accId, type, shifted, !!store[accId][confKey]);
        }
    });
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

// 主畫面 3 欄底部的職位預約狀態卡片（第二層防呆：⚠️ 相撞了）
function renderJobSummaryBox(accId) {
    const s = store[accId];
    const now = getAccurateNow();

    const buildCard = (label, type) => {
        const jDate = type === 'soldier' ? s.soldierJobDate : s.techJobDate;
        const jConf = type === 'soldier' ? s.soldierJobConfirmed : s.techJobConfirmed;
        const inCooldown = isJobInCooldown(accId, type, now);
        const conflicts = jDate ? findJobConflicts(accId, type, jDate) : [];
        const hasConflict = conflicts.length > 0;

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
                    const otherNames = [...new Set(conflicts.map(c => c.accName))].join(' / ');
                    pillHtml = `<button type="button" class="status-pill conflict clickable" title="點擊處理相撞時段" onclick="handleConflictPillClick('${accId}','${type}')">⚠️ 相撞了</button>`;
                    remainText = `還有 <span class="dist-text">${formatCountdown(diffMs)}</span> · 與 ${otherNames} 重疊`;
                } else {
                    pillHtml = jConf
                        ? `<button type="button" class="status-pill confirmed clickable" title="點擊取消確認並對齊倒數" onclick="toggleJobConfirm('${accId}','${type}')">✔ 已確認</button>`
                        : `<button type="button" class="status-pill pending clickable" title="點擊直接確認預約" onclick="toggleJobConfirm('${accId}','${type}')">⏳ 待確認</button>`;
                    remainText = `還有 <span class="dist-text">${formatCountdown(diffMs)}</span>`;
                }
            } else {
                pillHtml = `<span class="status-pill none">已過期</span>`;
            }
        }

        return `
            <div class="job-status-card ${dueBorderClass} ${hasConflict ? 'job-conflict-border' : ''}">
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
