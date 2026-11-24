/* ==========================================
   RESOURCES.CSS：資源採集分頁（貼上目標、採集優先與 Excel 5 色階漸層卡片）
   ========================================== */

#resourcesView {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding-bottom: 28px;
}

/* 3 欄主網格（與主畫面 #gridView 保持一致對齊） */
#resourcesGrid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
    align-items: start;
}

/* 頂部操作列（若 HTML 有放置說明或上傳按鈕區） */
.res-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    background: #FFFDFB;
    border: 2px solid #D8C3AE;
    border-radius: 20px;
    padding: 12px 16px;
    margin-bottom: 16px;
    box-shadow: 0 4px 12px rgba(92, 61, 46, 0.08);
}

.res-toolbar-hint {
    font-size: 13.5px;
    font-weight: 700;
    color: #5C3D2E;
    display: flex;
    align-items: center;
    gap: 6px;
}

.btn-res-upload {
    background: #FFFDFB;
    color: #5C3D2E;
    border: 2px solid #D8C3AE;
    border-radius: 999px;
    padding: 6px 14px;
    font-size: 13.5px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 2px 0 #D8C3AE;
    transition: transform 0.12s ease, background 0.15s ease;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.btn-res-upload:hover {
    background: #FFF6EB;
    transform: translateY(-1px);
}

.btn-res-upload:active {
    transform: translateY(1px);
    box-shadow: 0 1px 0 #D8C3AE;
}

/* ==========================================
   貼上目標 + 採集優先雙欄合併區塊
   ========================================== */
.res-merged-row {
    display: grid;
    grid-template-columns: 1fr 1.25fr;
    gap: 10px;
    background: #FFFDFB;
    border: 2px solid #D8C3AE;
    border-radius: 18px;
    padding: 10px 12px;
    margin-bottom: 12px;
    box-shadow: 0 3px 8px rgba(92, 61, 46, 0.06);
    transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.res-merged-row.active-target {
    border-color: #EB5A87;
    background: #FFF5F8;
    box-shadow: 0 4px 12px rgba(235, 90, 135, 0.16);
}

.account-column.z .res-merged-row.active-target {
    border-color: #E69A15;
    background: #FFFDF2;
    box-shadow: 0 4px 12px rgba(230, 154, 21, 0.18);
}

.account-column.p .res-merged-row.active-target {
    border-color: #38A866;
    background: #F4FBF7;
    box-shadow: 0 4px 12px rgba(56, 168, 102, 0.16);
}

.res-merged-col {
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.res-merged-col.paste-col {
    align-items: flex-start;
    gap: 5px;
    padding-right: 8px;
    border-right: 1.5px dashed #E5D4C3;
}

.res-target-btn {
    width: 100%;
    background: #FFF8F0;
    color: #5C3D2E;
    border: 2px solid #D8C3AE;
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 2px 0 #D8C3AE;
    transition: all 0.14s ease;
    white-space: nowrap;
}

.res-target-btn:hover {
    background: #FFF1E0;
}

.res-merged-row.active-target .res-target-btn {
    background: #EB5A87;
    color: #FFFFFF;
    border-color: #D14370;
    box-shadow: 0 2px 0 #B8355E;
}

.account-column.z .res-merged-row.active-target .res-target-btn {
    background: #F5A623;
    color: #FFFFFF;
    border-color: #D4880D;
    box-shadow: 0 2px 0 #B57208;
}

.account-column.p .res-merged-row.active-target .res-target-btn {
    background: #48B876;
    color: #FFFFFF;
    border-color: #33995D;
    box-shadow: 0 2px 0 #287D4B;
}

.res-ocr-status {
    font-size: 11.5px;
    font-weight: 800;
    color: #9C7A63;
    background: #F7EFE6;
    padding: 2px 8px;
    border-radius: 8px;
    width: 100%;
    text-align: center;
    box-sizing: border-box;
}

/* 採集優先右側區塊 */
.res-prio-split {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-left: 2px;
}

.res-prio-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.res-prio-title {
    font-size: 13px;
    font-weight: 800;
    color: #8C6A58;
}

.res-gap-line {
    font-size: 12.5px;
    font-weight: 700;
    color: #5C3D2E;
}

.res-gap-line strong {
    font-size: 14px;
    font-weight: 900;
    color: #D6537C;
}

.res-prio-right {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.res-prio-big-icon-wrap {
    width: 42px;
    height: 42px;
    border-radius: 13px;
    background: #FFF6EB;
    border: 2px solid #E2CEBA;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(92, 61, 46, 0.1);
}

.res-prio-big-png {
    width: 30px;
    height: 30px;
    object-fit: contain;
}

.res-prio-empty {
    width: 42px;
    height: 42px;
    border-radius: 13px;
    background: #F8F2EC;
    border: 1.5px dashed #D8C3AE;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 800;
    color: #B29A86;
}

/* ==========================================
   4 種資源卡片（預設奶油白 + 填值後 Excel 5 色階漸層）
   ========================================== */
.res-row-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #FFFDFB;
    border: 2px solid #D8C3AE;
    border-radius: 18px;
    padding: 10px 12px;
    margin-bottom: 10px;
    box-shadow: 0 3px 0 #E6D5C3;
    transition: transform 0.12s ease, box-shadow 0.15s ease, border-color 0.2s ease;
}

.res-row-card:last-child {
    margin-bottom: 0;
}

/* 填入數值套用 Excel 5 色階漸層時，加白邊與清晰陰影 */
.res-row-card.has-candy {
    border-color: rgba(255, 255, 255, 0.85);
    box-shadow: 0 4px 12px rgba(92, 61, 46, 0.16);
}

.res-card-left-icon {
    flex-shrink: 0;
}

.res-card-big-icon-wrap {
    width: 46px;
    height: 46px;
    border-radius: 14px;
    background: #FFF7EE;
    border: 2px solid #E5D4C3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 5px rgba(92, 61, 46, 0.08);
}

.res-row-card.has-candy .res-card-big-icon-wrap {
    background: rgba(255, 255, 255, 0.88);
    border-color: #FFFFFF;
}

.res-card-big-png {
    width: 34px;
    height: 34px;
    object-fit: contain;
}

.res-card-right-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.res-row-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.res-name-title {
    font-size: 15.5px;
    font-weight: 900;
    color: #5C3D2E;
    white-space: nowrap;
}

.res-row-card.has-candy .res-name-title {
    color: #FFFFFF;
    text-shadow: 0 1px 2px rgba(92, 61, 46, 0.35);
}

.res-input-group {
    display: inline-flex;
    align-items: center;
    gap: 5px;
}

.res-num-input {
    width: 78px;
    height: 32px;
    padding: 0 8px;
    border: 2px solid #D8C3AE;
    border-radius: 10px;
    background: #FFFFFF;
    color: #5C3D2E;
    font-size: 14.5px;
    font-weight: 800;
    text-align: right;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.res-num-input:focus {
    border-color: #EB5A87;
    box-shadow: 0 0 0 3px rgba(235, 90, 135, 0.18);
}

.res-row-card.has-candy .res-num-input {
    border-color: rgba(255, 255, 255, 0.9);
}

.res-unit-select {
    height: 32px;
    padding: 0 6px;
    border: 2px solid #D8C3AE;
    border-radius: 10px;
    background: #FFF9F2;
    color: #5C3D2E;
    font-size: 13.5px;
    font-weight: 800;
    cursor: pointer;
    outline: none;
}

.res-row-card.has-candy .res-unit-select {
    border-color: rgba(255, 255, 255, 0.9);
    background: #FFFFFF;
}

.res-row-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 800;
}

.res-ratio-tag {
    color: #8C6A58;
    background: #F6ECE1;
    padding: 2px 8px;
    border-radius: 999px;
}

.res-row-card.has-candy .res-ratio-tag {
    color: #FFFFFF;
    background: rgba(92, 61, 46, 0.22);
}

.res-scaled-val {
    color: #7A5C48;
}

.res-row-card.has-candy .res-scaled-val {
    color: #FFFFFF;
    text-shadow: 0 1px 2px rgba(92, 61, 46, 0.3);
}

/* ==========================================
   RWD 響應式斷點
   ========================================== */
@media (max-width: 1024px) {
    #resourcesGrid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 680px) {
    #resourcesGrid {
        grid-template-columns: 1fr;
    }

    .res-num-input {
        width: 72px;
    }
}
