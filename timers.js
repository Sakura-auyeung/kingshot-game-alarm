// ==========================================
// TIMERS.JS：計時器輸入、主畫面渲染、時間線渲染、分頁切換與啟動
// ==========================================

function onTimerInputFocus(inputEl) {
    if (timerBlurUnlockHandle) {
        clearTimeout(timerBlurUnlockHandle);
        timerBlurUnlockHandle = null;
    }
    isTimerInputEditing = true;
    requestAnimationFrame(() => {
        if (document.activeElement === inputEl) {
            inputEl.select();
        }
    });
}

function onTimerInputBlur(inputEl, accId, category, id, field) {
    updateInputVal(accId, category, id, field, inputEl.value, false);
    const item = store[accId]?.[category]?.find(it => it.id === id);
    if (item) {
        inputEl.value = (field === 'd') ? String(item.d) : formatPad(item[field]);
    }
    if (timerBlurUnlockHandle) clearTimeout(timerBlurUnlockHandle);
    timerBlurUnlockHandle = setTimeout(() => {
        const activeEl = document.activeElement;
        const stillInTimer = activeEl && activeEl.classList && activeEl.classList.contains('time-input');
        if (!stillInTimer) {
            isTimerInputEditing = false;
            saveState();
        }
    }, 120);
}

function addTimerItem(accId, category) {
    isTimerInputEditing = false;
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
    isTimerInputEditing = false;
    if (store[accId][category].length <= 1) {
        store[accId][category][0].endTime = null;
    } else {
        store[accId][category] = store[accId][category].filter(it => it.id !== id);
    }
    renderGrid();
    updateTimeline(true);
    saveState();
}

function updateInputVal(accId, category, id, field, val, shouldSaveNow = false) {
    const item = store[accId][category].find(it => it.id === id);
    if (!item) return;
    let num = Math.max(0, parseInt(val, 10) || 0);
    if (field === 'h' && num > 23) num = 23;
    if (field === 'm' && num > 59) num = 59;
    item[field] = num;
    if (shouldSaveNow) saveState();
}

function handleTimerInput(event, inputEl, accId, category, id, field, nextIdStr) {
    isTimerInputEditing = true;
    let clean = inputEl.value.replace(/\D/g, '').slice(0, 2);
    if (field === 'h' && Number(clean) > 23) clean = '23';
    if (field === 'm' && Number(clean) > 59) clean = '59';
    if (inputEl.value !== clean) {
        inputEl.value = clean;
    }
    updateInputVal(accId, category, id, field, clean, false);

    if (clean.length >= 2 && nextIdStr) {
        const nextEl = document.getElementById(nextIdStr);
        if (nextEl) {
            nextEl.focus();
            nextEl.select();
        }
    }
}

function handleTimerArrowNav(event, prevIdStr, nextIdStr, accId, category, id, field) {
    if (event.key === 'ArrowLeft') {
        event.preventDefault();
        isTimerInputEditing = true;
        if (prevIdStr) {
            const prevEl = document.getElementById(prevIdStr);
            if (prevEl) {
                prevEl.focus();
                prevEl.select();
            }
        }
    } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        isTimerInputEditing = true;
        if (nextIdStr) {
            const nextEl = document.getElementById(nextIdStr);
            if (nextEl) {
                nextEl.focus();
                nextEl.select();
            }
        } else {
            event.target.blur();
        }
    } else if (event.key === 'Enter') {
        event.preventDefault();
        isTimerInputEditing = false;
        startTimer(accId, category, id);
    }
}

function startTimer(accId, category, id) {
    isTimerInputEditing = false;
    ensureAudioContextUnlocked();
    const item = store[accId][category].find(it => it.id === id);
    if (!item) return;

    const totalMs = ((item.d * 24 + item.h) * 60 + item.m) * 60 * 1000;
    if (totalMs <= 0) {
        alert('請先輸入倒數時間！');
        return;
    }

    const endDate = new Date(getAccurateNow().getTime() + totalMs);
    item.endTime = endDate;

    if (category === 'soldiers' && typeof autoSyncJobFromTimer === 'function') {
        autoSyncJobFromTimer(accId, 'soldier', endDate);
    }
    if (category === 'tech' && typeof autoSyncJobFromTimer === 'function') {
        autoSyncJobFromTimer(accId, 'tech', endDate);
    }

    renderGrid();
    updateTimeline(true);
    saveState();
}

function startPresetTimer(accId, category, id, d, h, m) {
    isTimerInputEditing = false;
    const item = store[accId][category].find(it => it.id === id);
    if (!item) return;
    item.d = d;
    item.h = h;
    item.m = m;
    startTimer(accId, category, id);
}

function resetTimer(accId, category, id) {
    isTimerInputEditing = false;
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
    if (category === 'soldiers' && store[accId] && !store[accId].soldierJobConfirmed) {
        store[accId].soldierJobManual = false;
    }
    if (category === 'tech' && store[accId] && !store[accId].techJobConfirmed) {
        store[accId].techJobManual = false;
    }
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
                            onfocus="onTimerInputFocus(this)"
                            onblur="onTimerInputBlur(this, '${accId}', '${category}', ${item.id}, 'd')"
                            oninput="handleTimerInput(event, this, '${accId}', '${category}', ${item.id}, 'd', '${hId}')"
                            onkeydown="handleTimerArrowNav(event, null, '${hId}', '${accId}', '${category}', ${item.id}, 'd')">天
                        <input type="text" inputmode="numeric" class="time-input" id="${hId}" value="${formatPad(item.h)}" maxlength="2"
                            onfocus="onTimerInputFocus(this)"
                            onblur="onTimerInputBlur(this, '${accId}', '${category}', ${item.id}, 'h')"
                            oninput="handleTimerInput(event, this, '${accId}', '${category}', ${item.id}, 'h', '${mId}')"
                            onkeydown="handleTimerArrowNav(event, '${dId}', '${mId}', '${accId}', '${category}', ${item.id}, 'h')">時
                        <input type="text" inputmode="numeric" class="time-input" id="${mId}" value="${formatPad(item.m)}" maxlength="2"
                            onfocus="onTimerInputFocus(this)"
                            onblur="onTimerInputBlur(this, '${accId}', '${category}', ${item.id}, 'm')"
                            oninput="handleTimerInput(event, this, '${accId}', '${category}', ${item.id}, 'm', null)"
                            onkeydown="handleTimerArrowNav(event, '${hId}', null, '${accId}', '${category}', ${item.id}, 'm')">分
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

        const jobBoxHtml = typeof renderJobSummaryBox === 'function' ? renderJobSummaryBox(acc.id) : '';

        return `
            <div class="account-column ${acc.id}">
                ${renderProfileHeader(acc)}
                ${sectionsHtml}
                ${jobBoxHtml}
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

    const activeEl = document.activeElement;
    const isSelectFocused = activeEl && activeEl.classList && activeEl.classList.contains('job-time-select');
    if (!force && (isJobSelectActive || isSelectFocused)) {
        accounts.forEach(acc => {
            ['soldier', 'tech'].forEach(type => {
                const dateKey = type === 'soldier' ? 'soldierJobDate' : 'techJobDate';
                const jDate = store[acc.id][dateKey];
                const metaEl = document.getElementById(`tl_job_meta_${acc.id}_${type}`);
                if (metaEl && jDate && !isNaN(jDate.getTime())) {
                    const diff = jDate.getTime() - now.getTime();
                    metaEl.innerHTML = diff > 0
                        ? `${getDayTagHtml(jDate)}${formatFullDateTime(jDate)}（還有 ${formatCountdown(diff)}）`
                        : `${formatFullDateTime(jDate)}（已解鎖）`;
                }
            });
        });
        return;
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
            const conflicts = jDate ? findSameJobCrossAccountConflicts(acc.id, type, jDate) : [];
            const hasConflict = conflicts.length > 0;
            const dueBorderClass = jDate ? getDueBorderClass(jDate) : '';

            let metaText = '尚未預約';
            if (jDate && !isNaN(jDate.getTime())) {
                const diff = jDate.getTime() - now.getTime();
                metaText = diff > 0
                    ? `${getDayTagHtml(jDate)}${formatFullDateTime(jDate)}（還有 ${formatCountdown(diff)}）`
                    : `${formatFullDateTime(jDate)}（已解鎖）`;
            }

            let warningHtml = '';
            if (inCooldown) {
                warningHtml = `<div class="job-warning-box">⏳ 同一職位拿到後 10 分鐘冷卻中，暫不可重新申請</div>`;
            } else if (hasConflict && jDate) {
                const whoText = formatConflictNamesChinese(conflicts);
                warningHtml = `<div class="job-warning-box">⚠️ 與 ${whoText} 同時段相撞</div>`;
            }

            return `
                <div class="job-manage-card ${acc.id} ${dueBorderClass} ${hasConflict ? 'job-conflict-border' : ''}">
                    <img class="job-bear-sticker" src="${getBearFaceFile(acc.id)}" alt="">
                    <div class="job-manage-top">
                        <span>${accName}</span>
                        <button class="btn-confirm-job ${jConf ? 'confirmed' : ''}" onclick="toggleJobConfirm('${acc.id}','${type}')">
                            ${jConf ? '✔ 已確認預約' : '⏳ 標記已確認'}
                        </button>
                    </div>
                    <div class="job-manage-controls">
                        <select class="job-time-select"
                            onfocus="isJobSelectActive=true"
                            onmousedown="isJobSelectActive=true"
                            onblur="isJobSelectActive=false"
                            onchange="setJobTime('${acc.id}','${type}',this.value,false)">
                            ${generateJobOptions(jTime, '無預約')}
                        </select>
                        <button class="btn-shift" onclick="shiftJobTime('${acc.id}','${type}',-30)">-30分</button>
                        <button class="btn-shift" onclick="shiftJobTime('${acc.id}','${type}',30)">+30分</button>
                    </div>
                    <div class="job-manage-meta">
                        <span id="tl_job_meta_${acc.id}_${type}">${metaText}</span>
                    </div>
                    ${warningHtml}
                </div>
            `;
        }).join('');
    };

    soldierJobsEl.innerHTML = renderJobColumn('soldier');
    techJobsEl.innerHTML = renderJobColumn('tech');
}

// 3. 每秒倒數、到期通知、10 分鐘冷卻結束推播與過期自動解鎖
function tickTimers() {
    const now = getAccurateNow();
    const nowMs = now.getTime();
    let anyStateChanged = false;

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
                const endMs = it.endTime.getTime();
                const remain = endMs - nowMs;
                const el = document.getElementById(`cd_${acc.id}_${cat}_${it.id}`);
                if (el && remain > 0) {
                    el.innerText = formatCountdown(remain);
                } else if (remain <= 0) {
                    const evKey = `timer_${acc.id}_${cat}_${it.id}_${endMs}`;
                    it.endTime = null;
                    anyStateChanged = true;
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
                }
            });
        });

        [
            { type: 'soldier', label: '士兵職位', date: s.soldierJobDate, conf: s.soldierJobConfirmed, cat: 'soldiers' },
            { type: 'tech', label: '科技職位', date: s.techJobDate, conf: s.techJobConfirmed, cat: 'tech' }
        ].forEach(job => {
            if (!job.date || isNaN(job.date.getTime())) return;
            const jobMs = job.date.getTime();
            const diff = jobMs - nowMs;

            // 預約時間到達提醒
            if (diff <= 0 && diff > -10 * 60 * 1000) {
                const jKey = `job_${acc.id}_${job.type}_${jobMs}`;
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

            // 已確認職位過了 10 分鐘冷卻期：自動推送重新預約待辦到鈴鐺
            if (job.conf && nowMs - jobMs >= 10 * 60 * 1000 && nowMs - jobMs < 24 * 3600 * 1000) {
                const cdKey = `cooldown_${acc.id}_${job.type}_${jobMs}`;
                if (!triggeredEventKeys.has(cdKey)) {
                    triggeredEventKeys.add(cdKey);
                    const activeEnd = getLatestActiveCategoryEndDate(acc.id, job.cat);
                    const recSlot = activeEnd ? getRecommendedJobSlotFromDate(activeEnd) : null;
                    pushNotificationEvent({
                        id: cdKey,
                        accId: acc.id,
                        category: `cooldown_${job.type}`,
                        recommendedTime: recSlot ? formatTimeHM(recSlot) : '',
                        message: `[${accName}] ${job.label} 10 分鐘冷卻已結束，可重新預約！`,
                        timestamp: nowMs,
                        unread: true
                    }, true);
                }
            }
        });
    });

    if (typeof unlockExpiredJobsIfNeeded === 'function' && unlockExpiredJobsIfNeeded(now)) {
        anyStateChanged = true;
    }

    if (anyStateChanged) {
        if (!isTimerInputEditing) renderGrid();
        saveState();
    }

    updateTimeline(false);
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        tickTimers();
    }
});

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
    ensureAudioContextUnlocked();
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
    const resOnlyBtns = document.getElementById('resOnlyBtns');
    const btn = document.getElementById('toggleBtn');
    const pageTitle = document.getElementById('pageMainTitle');
    const navItemAlarm = document.getElementById('navItemAlarm');
    const navItemResources = document.getElementById('navItemResources');

    hideAllMainViews();

    const isAlarmSection = (tabName === 'grid' || tabName === 'timeline');
    if (timerOnlyBtns) {
        timerOnlyBtns.style.display = isAlarmSection ? 'inline-flex' : 'none';
    }
    if (resOnlyBtns) {
        resOnlyBtns.style.display = (tabName === 'resources') ? 'inline-flex' : 'none';
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
        if (typeof renderMobilizationSection === 'function') renderMobilizationSection();
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

function init() {
    setupGlobalAudioUnlock();
    startSplashLoader();
    updateNotifBadgeUI();
    loadNotifHistory();
    loadLocalBackups();
    updateSunlightToggleBtnUI();
    renderGrid();
    restoreTabFromHash();

    setupFirebaseListeners();
    if (typeof initNotifCloudSync === 'function') initNotifCloudSync();
    setupAutoTimeSync();
    fetchAllProfiles();

    tickTimers();
    setInterval(tickTimers, 1000);
    setInterval(renderBellUI, 30000);
}

init();

