// ==========================================
// JOBS.JS：全帳號職位自動排程、過期解鎖、兩層撞期防呆與狀態卡片渲染（含佇列標記下拉選單）
// ==========================================

function getActiveJobQueueHints(accId, type) {
    const nowMs = getAccurateNow().getTime();
    const cat = type === 'soldier' ? 'soldiers' : 'tech';
    const prefix = type === 'soldier' ? '士兵' : '科技';
    const list = (store[accId] && Array.isArray(store[accId][cat])) ? store[accId][cat] : [];
    const hints = [];

    list.forEach((it, idx) => {
        if (it.endTime && !isNaN(it.endTime.getTime()) && it.endTime.getTime() > nowMs) {
            const slotDate = getRecommendedJobSlotFromDate(it.endTime);
            if (slotDate) {
                hints.push({
                    queueNum: idx + 1,
                    tagLabel: `${prefix}#${idx + 1}`,
                    endTime: it.endTime,
                    endHM: formatTimeHM(it.endTime),
                    slotDate,
                    slotHM: formatTimeHM(slotDate)
                });
            }
        }
    });

    return hints;
}

function generateJobOptions(selectedVal = '', emptyLabel = '無預約', accId = null, type = null) {
    const slotTagsMap = {};
    if (accId && type) {
        const hints = getActiveJobQueueHints(accId, type);
        hints.forEach(h => {
            if (!slotTagsMap[h.slotHM]) slotTagsMap[h.slotHM] = [];
            slotTagsMap[h.slotHM].push(h.tagLabel);
        });
    }

    let html = `<option value="" ${!selectedVal ? 'selected' : ''}>${emptyLabel}</option>`;
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 30) {
            const val = `${formatPad(h)}:${formatPad(m)}`;
            const tags = slotTagsMap[val];
            const displayText = tags && tags.length > 0
                ? `${val} [${tags.join('、')}]`
                : val;
            html += `<option value="${val}" ${selectedVal === val ? 'selected' : ''}>${displayText}</option>`;
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
    const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';
    const jobDate = store[accId] ? store[accId][dateKey] : null;
    const isConf = store[accId] ? !!store[accId][confKey] : false;
    if (!jobDate || !isConf) return false;
    const diffMs = now.getTime() - jobDate.getTime();
    return diffMs >= 0 && diffMs < 10 * 60 * 1000;
}

// 當職位手動預約或確認後，自動把待辦清單中對應的冷卻提醒標記為已完成
function autoResolveJobCooldownTodos(accId, type) {
    if (typeof notifHistory === 'undefined' || !Array.isArray(notifHistory)) return;
    const targetCat = type === 'soldier' ? 'cooldown_soldier' : 'cooldown_tech';
    let changed = false;

    notifHistory.forEach(n => {
        if (n && n.unread && n.accId === accId && n.category === targetCat) {
            n.unread = false;
            changed = true;
        }
    });

    if (changed) {
        if (typeof saveNotifHistory === 'function') saveNotifHistory(false);
        if (typeof renderBellUI === 'function') renderBellUI();
        if (typeof stopRinging === 'function' && notifHistory.filter(n => n.unread).length === 0) {
            stopRinging();
        }
    }
}

// 檢查跨帳號同職位撞期（20 分鐘內視為同時段相撞）
function findSameJobCrossAccountConflicts(accId, type, targetDate) {
    if (!targetDate || isNaN(targetDate.getTime())) return [];
    const targetMs = targetDate.getTime();
    const conflicts = [];

    accounts.forEach(otherAcc => {
        if (otherAcc.id === accId) return;
        const otherStore = store[otherAcc.id];
        if (!otherStore) return;

        const otherDate = type === 'soldier' ? otherStore.soldierJobDate : otherStore.techJobDate;
        const otherConf = type === 'soldier' ? !!otherStore.soldierJobConfirmed : !!otherStore.techJobConfirmed;
        if (!otherDate || isNaN(otherDate.getTime())) return;

        if (Math.abs(otherDate.getTime() - targetMs) < 20 * 60 * 1000) {
            conflicts.push({
                accId: otherAcc.id,
                accName: getDisplayAccountName(otherAcc.id),
                type,
                typeLabel: type === 'soldier' ? '⚔️ 士兵職位' : '🔬 科技職位',
                date: otherDate,
                confirmed: otherConf
            });
        }
    });

    return conflicts;
}

function formatConflictNamesChinese(conflicts) {
    const names = [...new Set(conflicts.map(c => c.accName))];
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    return `${names[0]}（及 ${names.slice(1).join('、')}）`;
}

function closeJobConflictModal() {
    const modal = document.getElementById('jobConflictModal');
    if (modal) modal.classList.remove('open');
}

// 第一層防呆：紅框警示彈窗（與角色編輯彈窗同尺寸、無輸入框）
// 若對方已確認則阻擋確認；若對方未確認則提供「依然確認 / 返回修改」
function openJobConflictModal({ accId, type, targetDate, conflicts, onProceed }) {
    const modal = document.getElementById('jobConflictModal');
    const titleEl = document.getElementById('jobConflictModalTitle');
    const bodyEl = document.getElementById('jobConflictModalBody');
    const actionsEl = document.getElementById('jobConflictModalActions');
    if (!modal || !bodyEl || !actionsEl) return;

    const myName = getDisplayAccountName(accId);
    const myTypeLabel = type === 'soldier' ? '⚔️ 士兵職位' : '🔬 科技職位';
    const timeLabel = formatFullDateTime(targetDate);
    const hasConfirmedOpponent = conflicts.some(c => c.confirmed);

    if (titleEl) {
        titleEl.innerText = hasConfirmedOpponent ? '🚫 職位時段已被確認佔用' : '⚠️ 職位時段相撞提醒';
    }

    const listHtml = conflicts.map(c =>
        `• <strong>[${c.accName}] ${c.typeLabel}</strong>（${formatFullDateTime(c.date)}）— <strong>${c.confirmed ? '✔ 已確認鎖定' : '⏳ 尚未確認'}</strong>`
    ).join('<br>');

    if (hasConfirmedOpponent) {
        bodyEl.innerHTML = `
            你為 <strong>[${myName}] ${myTypeLabel}</strong> 選擇的時段（<strong>${timeLabel}</strong>）與已確認的預約相撞：<br><br>
            ${listHtml}<br><br>
            對方已確認鎖定此時段，無法重複確認，請返回修改時間！
        `;
    } else {
        bodyEl.innerHTML = `
            你為 <strong>[${myName}] ${myTypeLabel}</strong> 選擇的時段（<strong>${timeLabel}</strong>）與其他帳號相撞：<br><br>
            ${listHtml}<br><br>
            對方尚未確認預約，請問是否依然要確認此時段？
        `;
    }

    actionsEl.innerHTML = '';

    const btnBack = document.createElement('button');
    btnBack.type = 'button';
    btnBack.className = 'btn-modal-cancel';
    btnBack.innerText = '返回修改';
    btnBack.onclick = () => {
        closeJobConflictModal();
        if (typeof renderGrid === 'function') renderGrid();
        if (typeof updateTimeline === 'function') updateTimeline(true);
    };
    actionsEl.appendChild(btnBack);

    if (!hasConfirmedOpponent && typeof onProceed === 'function') {
        const btnConfirmAnyway = document.createElement('button');
        btnConfirmAnyway.type = 'button';
        btnConfirmAnyway.className = 'btn-modal-danger';
        btnConfirmAnyway.innerText = '依然確認';
        btnConfirmAnyway.onclick = () => {
            closeJobConflictModal();
            onProceed();
        };
        actionsEl.appendChild(btnConfirmAnyway);
    }

    modal.classList.add('open');
}

function autoSyncJobFromTimer(accId, type, endDate, forceSync = false) {
    const manualKey = type === 'soldier' ? 'soldierJobManual' : 'techJobManual';
    const timeKey = type === 'soldier' ? 'soldierJobTime' : 'techJobTime';
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';

    if (!forceSync && (store[accId][confKey] || store[accId][manualKey] || isJobInCooldown(accId, type, getAccurateNow()))) {
        return;
    }

    const cat = type === 'soldier' ? 'soldiers' : 'tech';
    const latestEnd = getLatestActiveCategoryEndDate(accId, cat) || endDate;
    const slot = getRecommendedJobSlotFromDate(latestEnd);
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

    if (confirmed) {
        autoResolveJobCooldownTodos(accId, type);
    }

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

    // 手動改時間先解除鎖定，並檢查是否與他號同職位撞期（第一層防呆）
    const conflicts = findSameJobCrossAccountConflicts(accId, type, d);
    if (conflicts.length > 0) {
        openJobConflictModal({
            accId,
            type,
            targetDate: d,
            conflicts,
            onProceed: () => applyJobTimeDirect(accId, type, d, confirmed)
        });
        return;
    }

    applyJobTimeDirect(accId, type, d, confirmed);
}

function shiftJobTime(accId, type, deltaMinutes) {
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';

    let base = store[accId][dateKey];
    if (!base || isNaN(base.getTime())) {
        base = getRecommendedJobSlotFromDate(getAccurateNow());
    }
    const shifted = new Date(base.getTime() + deltaMinutes * 60 * 1000);

    const conflicts = findSameJobCrossAccountConflicts(accId, type, shifted);
    if (conflicts.length > 0) {
        openJobConflictModal({
            accId,
            type,
            targetDate: shifted,
            conflicts,
            onProceed: () => applyJobTimeDirect(accId, type, shifted, false)
        });
        return;
    }

    applyJobTimeDirect(accId, type, shifted, false);
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
        // 解除鎖定：立刻解除手動鎖定並對齊目前進行中的倒數
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

    // 準備按「✔ 已確認」前，檢查跨帳號同職位撞期（第一層防呆）
    const conflicts = findSameJobCrossAccountConflicts(accId, type, jDate);
    if (conflicts.length > 0) {
        openJobConflictModal({
            accId,
            type,
            targetDate: jDate,
            conflicts,
            onProceed: () => {
                store[accId][confKey] = true;
                autoResolveJobCooldownTodos(accId, type);
                if (typeof renderGrid === 'function') renderGrid();
                if (typeof updateTimeline === 'function') updateTimeline(true);
                saveState();
            }
        });
        return;
    }

    store[accId][confKey] = true;
    autoResolveJobCooldownTodos(accId, type);
    if (typeof renderGrid === 'function') renderGrid();
    if (typeof updateTimeline === 'function') updateTimeline(true);
    saveState();
}

function handleConflictPillClick(accId, type) {
    const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
    const jDate = store[accId][dateKey];
    if (!jDate) return;

    const conflicts = findSameJobCrossAccountConflicts(accId, type, jDate);
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
            store[accId][type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed'] = true;
            autoResolveJobCooldownTodos(accId, type);
            if (typeof renderGrid === 'function') renderGrid();
            if (typeof updateTimeline === 'function') updateTimeline(true);
            saveState();
        }
    });
}

// 過期自動解鎖檢查（回傳是否有任何狀態被更新）
function unlockExpiredJobsIfNeeded(now = getAccurateNow()) {
    const nowMs = now.getTime();
    let changed = false;

    accounts.forEach(acc => {
        ['soldier', 'tech'].forEach(type => {
            const timeKey = type === 'soldier' ? 'soldierJobTime' : 'techJobTime';
            const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
            const confKey = type === 'soldier' ? 'soldierJobConfirmed' : 'techJobConfirmed';
            const manualKey = type === 'soldier' ? 'soldierJobManual' : 'techJobManual';

            const jDate = store[acc.id][dateKey];
            const jConf = !!store[acc.id][confKey];
            if (!jDate || isNaN(jDate.getTime())) return;

            const elapsedMs = nowMs - jDate.getTime();
            // 若為已確認預約，保留 10 分鐘冷卻期，過了 10 分鐘立刻解鎖；若未確認，只要時間一過就立刻解鎖
            const isExpired = jConf ? (elapsedMs >= 10 * 60 * 1000) : (elapsedMs > 0);

            if (isExpired) {
                store[acc.id][confKey] = false;
                store[acc.id][manualKey] = false;

                const cat = type === 'soldier' ? 'soldiers' : 'tech';
                const activeEndDate = getLatestActiveCategoryEndDate(acc.id, cat);
                if (activeEndDate) {
                    const slot = getRecommendedJobSlotFromDate(activeEndDate);
                    store[acc.id][dateKey] = slot;
                    store[acc.id][timeKey] = slot ? formatTimeHM(slot) : '';
                } else {
                    store[acc.id][dateKey] = null;
                    store[acc.id][timeKey] = '';
                }
                changed = true;
            }
        });
    });

    return changed;
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

    unlockExpiredJobsIfNeeded(getAccurateNow());
}

// 圖 1 精簡佇列提示：直接顯示「#1 20:40完結 ｜ #2 21:26完結」
function buildFrontQueueHintText(accId, type, jTime) {
    const hints = getActiveJobQueueHints(accId, type);
    if (hints.length === 0) {
        return jTime ? '手動預約時段' : '尚未有進行中佇列';
    }
    return hints.map(h => `#${h.queueNum} ${h.endHM}完結`).join(' ｜ ');
}

function formatMonthDayOnly(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return '';
    return `${formatPad(dateObj.getMonth() + 1)}/${formatPad(dateObj.getDate())}`;
}

// 主畫面 3 欄底部的職位預約狀態卡片（圖 1 精簡零重複佈局）
function renderJobSummaryBox(accId) {
    const s = store[accId];
    const now = getAccurateNow();

    const buildCard = (label, type) => {
        const jTime = (type === 'soldier' ? s.soldierJobTime : s.techJobTime) || '';
        const jDate = type === 'soldier' ? s.soldierJobDate : s.techJobDate;
        const jConf = type === 'soldier' ? s.soldierJobConfirmed : s.techJobConfirmed;
        const inCooldown = isJobInCooldown(accId, type, now);
        const conflicts = jDate ? findSameJobCrossAccountConflicts(accId, type, jDate) : [];
        const hasConflict = conflicts.length > 0;

        let dueBorderClass = '';
        let pillHtml = `<span class="status-pill none">未預約</span>`;
        let dateBadgeText = '尚未設定';
        let hintText = buildFrontQueueHintText(accId, type, jTime);
        let hintConflictClass = '';

        if (jDate && !isNaN(jDate.getTime())) {
            dueBorderClass = getDueBorderClass(jDate);
            dateBadgeText = `${getDayTagHtml(jDate)}${formatMonthDayOnly(jDate)}`;
            const diffMs = jDate.getTime() - now.getTime();

            if (inCooldown) {
                const cdRemainMin = Math.max(1, Math.ceil((10 * 60 * 1000 - (now.getTime() - jDate.getTime())) / 60000));
                pillHtml = `<span class="status-pill cooldown">⏳ 冷卻剩 ${cdRemainMin} 分</span>`;
                hintText = `同職位冷卻中（不可重申）`;
            } else if (diffMs > 0) {
                if (hasConflict && !jConf) {
                    const whoText = formatConflictNamesChinese(conflicts);
                    pillHtml = `<button type="button" class="status-pill conflict clickable" title="點擊處理相撞時段" onclick="handleConflictPillClick('${accId}','${type}')">⚠️ 相撞了</button>`;
                    hintText = `⚠️ 與 ${whoText} 相撞`;
                    hintConflictClass = 'conflict-warn';
                } else {
                    pillHtml = jConf
                        ? `<button type="button" class="status-pill confirmed clickable" title="點擊解除鎖定並對齊倒數" onclick="toggleJobConfirm('${accId}','${type}')">✔ 已確認</button>`
                        : `<button type="button" class="status-pill pending clickable" title="點擊直接確認預約" onclick="toggleJobConfirm('${accId}','${type}')">⏳ 待確認</button>`;
                }
            } else {
                pillHtml = `<span class="status-pill none">已解鎖</span>`;
            }
        }

        const selectHtml = inCooldown
            ? ''
            : `<select class="job-front-select"
                    onfocus="isJobSelectActive=true"
                    onmousedown="isJobSelectActive=true"
                    onblur="isJobSelectActive=false"
                    onchange="setJobTime('${accId}','${type}',this.value,false)">
                    ${generateJobOptions(jTime, '無預約', accId, type)}
               </select>`;

        return `
            <div class="job-status-card ${dueBorderClass} ${hasConflict ? 'job-conflict-border' : ''}">
                <div class="job-status-top-row">
                    <div class="job-status-title-line">${label}：${dateBadgeText}</div>
                    ${selectHtml}
                </div>
                <div class="job-status-bottom-row">
                    <span class="job-front-hint ${hintConflictClass}">${hintText}</span>
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
