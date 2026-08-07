# 疫情訊息週報第一階段預覽

本資料夾目前是審核用，不會自動寄信或部署。

## 管理者審核入口

此入口定位為「預覽、編輯與本地草稿存檔」。它不會寄信、不會部署網頁，也不會上架 SharePoint。

## GitHub 部署定位

可以打包到 GitHub，建議使用 private repository。

- GitHub Pages：只能放 `web-preview.html`、`email-preview.html` 或已核准的靜態 `output/issues/.../*.html`，不能登入、鎖定或儲存草稿。
- Private GitHub repo + Python 主機：可保留完整 Admin Portal、多人登入、編輯鎖與草稿存檔。

部署細節見 `DEPLOYMENT.md`。

```powershell
python scripts/admin_server.py 8787
```

開啟：

```text
http://127.0.0.1:8787/
```

可用功能：

- 多管理者登入；本地預覽使用 `data/admin_users.json` 的帳號/通行碼雜湊，正式部署建議改接院內 SSO/AD。
- owner 可在管理入口下方的「管理者權限維護」新增、停用管理者，調整 `preview`、`edit_content`、`override_links`、`save_draft` 權限。
- 歷期草稿列表與狀態檢視。
- 網頁版與信件版雙預覽。
- 摘要、標題、嚴重度依據與主旨編輯。
- 教育課程/KM 文件搜尋與覆寫。
- 儲存本地草稿到 `data/admin_reports.json`。
- 編輯鎖定：管理者點選「開始編輯」後，其他管理者會看到「目前由某管理者編輯中」，避免覆蓋。
- 修訂歷史：頁面下方顯示取得鎖、釋放鎖、存檔與調整摘要。

本地開發請先建立 `data/admin_users.json`：

```powershell
Copy-Item data/admin_users.example.json data/admin_users.json
python scripts/make_admin_user.py --passcode "<your-passcode>"
```

將產生的雜湊貼入 `data/admin_users.json`。正式使用前請改用正式通行碼，或直接改接院內帳號系統。

安全邊界：

- `scripts/admin_server.py` 沒有 `send_email`、`publish`、`deploy_sharepoint` 類型 endpoint。
- `data/admin_schema.json` 明確禁止 `publish_targets` 欄位。
- `匯入最新產生稿` 只會讀取 `output/current_issue.generated.json` 或 `data/current_issue.json` 並存成草稿，不會重新抓取、寄信或發布。

## 檔案

- `email-preview.html`: 可直接開啟的 Email HTML 預覽，使用信件端較穩定的 HTML/CSS。
- `web-preview.html`: 網頁視覺與互動架構預覽，含分頁、展開內容、浮動粒子與角色/吉祥物視覺。
- `data/current_issue.json`: 本期整理後的資料樣本。
- `data/km_documents.json`: KM 感染管制手冊文件對照表，產生週報時依疾病主題自動比對。
- `data/edu_courses.json`: 教育訓練課程對照表，產生週報時依疾病主題自動比對。
- `data/resource_mapping.json`: 管理者入口使用的教育課程與 KM 文件統一知識庫。
- `data/admin_reports.json`: 管理者審核草稿資料；僅保留預覽、編輯、存檔狀態。
- `data/admin_schema.json`: 草稿資料 JSON Schema 與禁止發布規則。
- `scripts/cdc_weekly_digest.py`: CDC 新聞稿擷取、排除澄清新聞、分類、輸出與測試寄信框架。
- `scripts/resource_linker.py`: 疾病主題到教育課程/KM 文件的比對腳本。
- `scripts/admin_server.py`: 本地管理者審核 API；不提供寄信、發布或 SharePoint 上架 endpoint。
- `admin-portal.html`: 管理者審核與編輯 SPA。
- `assets/character-green.png`: 從 `123.jpg` 裁出的單一角色。
- `assets/mascot-helper.png`: 透明背景的防疫小助手寵物，已放入網頁與 Email。
- `assets/cdc-weekly-banner.png`: 預覽用橫幅資產。

## 排程規則

每月第一與第三週週二執行。Linux cron 建議每天週二執行一次，再由 Python 檢查是否第一或第三週：

```cron
0 8 * * 2 cd /path/to/cdc-weekly && python scripts/cdc_weekly_digest.py
```

Codex/排程系統可用 RRULE：

```text
FREQ=MONTHLY;BYDAY=TU;BYSETPOS=1,3
```

## 每期輸出檔案

每次 CDC 產生流程會保留一組新的期別檔案：

```text
output/issues/cdc-weekly-YYYY-MM-DD/issue.json
output/issues/cdc-weekly-YYYY-MM-DD/web.html
output/issues/cdc-weekly-YYYY-MM-DD/email.html
```

同時也會更新 latest 相容檔：

```text
output/current_issue.generated.json
output/web.generated.html
output/email.generated.html
```

管理者入口的「匯入最新產生稿」會讀 latest JSON，再把草稿預覽指向該期獨立 HTML。這仍然只是本地草稿，不會寄信或發布。

## 測試寄信

第一階段預設不寄信。審核後若要寄測試信給 `inq36@ntuh.gov.tw`：

```powershell
python scripts/cdc_weekly_digest.py --force --send-test --recipient inq36@ntuh.gov.tw --smtp-host <smtp-host> --sender <sender-email>
```

SMTP 密碼不要寫入程式或交談紀錄，部署階段改用環境變數或伺服器密鑰管理。

## 前端元件架構建議

目前以 `HTML+CSS+Vanilla JS` 製作第一階段樣板，方便直接寄信與瀏覽器預覽。部署階段若改 React/Vue，可拆成：

- `IssueHero`: 期別、摘要、主視覺角色與防疫小助手。
- `DigestTabs`: 依傳播途徑切換疾病分頁。
- `DiseaseSection`: 傳播途徑區塊，負責嚴重度排序後的疾病集合。
- `DiseaseCard`: 重點摘要、Read More、CDC 原文、教育訓練、KM 文件連結。
- `ArchiveList`: 過去發訊紀錄。
- 歷史紀錄入口：`https://ntuhgovtw.sharepoint.com/sites/intra.ifc/SitePages/Home.aspx`
- `ResourceLinks`: 教育訓練與 KM 連結都依疾病主題比對個別課程/文件；找不到完全或高度相關項目時才回到各自主入口。

## 教育課程對照

教育訓練系統的課程清單需要登入才能瀏覽，預設 fallback 為 `https://edu.ntuh.gov.tw/index/login?next=%2F`。請先在院內把相關課程盤點成 `課程名稱 + Direct Link`，可填入 `data/edu_courses_template.csv`，再轉成 `data/edu_courses.json`：

```powershell
python scripts/import_edu_courses.py --csv data/edu_courses_template.csv
```

比對邏輯會讀新聞稿標題與正文，先判斷疾病主題，再用課程 `name`、`keywords`、`aliases` 加權比對。若沒有命中課程，才使用教育訓練系統課程入口。

## KM 文件對照

KM 系統為院內權限，外部自動抓取會遇到登入限制。請先在院內把「感染管制手冊」資料夾內文件盤點成 `文件名稱 + 完整連結`，可填入 `data/km_documents_template.csv`，再轉成 `data/km_documents.json`：

```powershell
python scripts/import_km_documents.py --csv data/km_documents_template.csv
```

也可以直接編輯 `data/km_documents.json`：

```json
{
  "fallback": {
    "name": "KM系統感染管制手冊目錄",
    "url": "https://km.ntuh.gov.tw/km/listfolders.aspx?uid=531"
  },
  "documents": [
    {
      "name": "COVID-19 感染管制作業規範",
      "url": "https://km.ntuh.gov.tw/km/...",
      "keywords": ["新冠", "COVID", "呼吸道"],
      "aliases": ["SARS-CoV-2"],
      "enabled": true
    }
  ]
}
```

比對邏輯會讀新聞稿標題與正文，先判斷疾病主題，再用 `name`、`keywords`、`aliases` 加權比對。若沒有命中文件，才使用 `fallback.url`。

## 審核後待辦

- 提供正式疫情主網頁 URL，替換 Email 內 `https://example.ntuh.gov.tw/cdc-weekly/`。
- 提供伺服器與 SMTP 設定後，才啟用部署與測試寄送。
- 確認院內自動簽名移除方式，建議使用專用寄信帳號或 SMTP API，避免郵件客戶端自動簽名。
