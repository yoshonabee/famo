# Famo

有需要時能附上脈絡的每日 todo list。每一列代表眼前可以動手做的一小步，輸入一句話就能開始；做完打勾，再自行決定下一步。資料存在本機 SQLite。

待實作功能見 [功能待辦](TODO.md)。

## 每日操作

- 開啟後直接顯示瀏覽器當地的「今日」。導覽保留今日、跨日期的任務列表與完成紀錄。
- 新增統一使用清單上方的一行輸入，支援 `- [ ] 任務`，Enter 後接著輸入下一件事。中文選字不誤送出，儲存失敗的列保留內容並可重試。
- 今日／日期頁新增時，任務使用正在查看的日期；跨日期的任務列表新增時，任務不指定日期。
- 點列表文字直接修改標題，Enter 或離開欄位儲存，Escape 取消。清空後再按一次 Backspace 才刪除該列；刪除採軟刪除。
- 方形 checkbox 完成／恢復該列任務。每個小步驟各自建立與完成，不要求預先規劃後續流程。
- 六點把手支援滑鼠、觸控及鍵盤排序。以手動順序安排先後，搜尋後排序只交換可見任務的位置。

任務類型、流程階段、優先順序及其設定頁已從介面撤下，新增也不再開啟完整表單。既有欄位、選項、步驟、metadata 與歷程仍保存在資料庫，API 維持相容，介面的改字、移動日期和完成操作不會清除這些資料。任務每 30 秒及視窗重新聚焦時同步。

## 日期與跨日整理

日期代表安排處理的那一天，可留空。日期頁只顯示所屬日期的任務，未完成在上、已完成在下，並顯示完成數。勾選完成或恢復任務都不改變所屬日期；今天補勾昨天的任務，仍留在昨天。

日期標題旁的 `< [ 今日 | ⌄ ] >` 可以切換前後一天、回到當地今日或展開月曆選日。月曆支援月份切換、日期輸入、方向鍵、Escape 與點選外部關閉。

下方預設收合的「先前未完成」依原日期分組，列出早於目前日期的未完成任務。可逐筆或多選移到這天；選取 checkbox 只用於移動，欲完成原日期的任務可回原日期或開啟詳情。任務不會自動跨日移動，移動時保留備註、連結與原任務身分。

今日頁另有預設收合的「未指定日期」，可逐筆選取或全選目前搜尋結果，再批次安排到當地今日。已排程或已完成任務不納入。

詳情中的「任務日期」選取或清除後立即儲存，已完成任務也可調整。失敗會保留選擇並提供重試；版本衝突時先讀取最新日期再重新選擇。批次移動逐筆檢查版本，失敗項目保留原日期與選取狀態。新增草稿切換日期後重試，仍使用原本指定的日期。

## 備註與連結

每列右側按鈕開啟日期、備註與相關連結。這些資訊都可以留白，不影響新增或完成。

- 點標題或備註直接編輯，離開欄位儲存、Escape 取消。標題以 Enter 儲存；備註的 Enter 換行，Ctrl／⌘＋Enter 儲存，也可使用儲存／取消按鈕。已完成任務也可修改。
- 新增連結只需貼上 HTTP／HTTPS 網址，不必選種類。同一任務可以保留多個 PR 或討論串，儲存失敗或版本衝突會保留輸入網址。
- 列表直接顯示前兩筆連結，其餘以 `+N` 開啟詳情。GitHub PR／Issue 顯示 repo 與編號，Slack、Asana、Google 文件顯示簡短名稱，其餘使用主機與路徑，完整網址可在詳情查看。
- 進展歷程與類型 metadata 保留於資料和 API，日常詳情只呈現工作所需的備註與連結。

所有內容寫入都帶版本；衝突與儲存失敗會保留編輯草稿，避免覆蓋其他視窗或 Agent 的更新。

## 執行

需要 Go 1.26.5 以上、Node.js 24 LTS 以上與 npm。

```sh
make build
./bin/famo
```

開啟 <http://127.0.0.1:8787>。資料預設存入啟動目錄的 `data/famo.db`。可指定路徑及位址：

```sh
./bin/famo -db /absolute/path/famo.db -addr 127.0.0.1:8787
```

正式執行檔已內嵌前端，搬動時不必搬動 Node.js 或 `web/dist`。修改程式後需重新執行 `make build` 並重新啟動程式。

### 資料升級

資料庫升級至 v4 時會在交易中建立選項設定，將原有 `goal`、`context`、`acceptance` 的非空內容依序加上小標合併成 `description`。原欄位、步驟、連結、歷程、任務版本與排序均保留；之後清空描述不會再次從舊欄位填回。

備份時先停止程式再複製 SQLite 檔案；執行中的 WAL 可能尚未合併到主檔。升級至 v5 會加入連結種類設定，將舊連結種類匯入並綁定固定 ID；保留原種類名稱、URL、重複種類連結、任務版本、歷程與順序。升級後請使用支援 v5 的執行檔。

## 開發與檢查

本專案 Git 操作文字一律使用英文，包括 commit messages、PR titles、PR descriptions 及相關 Git／PR 溝通文字。

先安裝前端依賴，再分別啟動後端與前端：

```sh
cd web
npm ci
```

```sh
make dev-api
```

```sh
make dev-web
```

前端位址為 <http://127.0.0.1:5173>，`/api` 代理到 Go。

```sh
make test                       # Go race tests、TypeScript、前端正式建置
cd web
npx playwright install chromium # 首次安裝測試瀏覽器
npm run test:e2e
npm run format:check
```

瀏覽器驗收會啟動獨立的 `127.0.0.1:8788` 伺服器，使用暫存目錄中的 SQLite，不接觸個人資料庫。測試涵蓋資料升級、URL-only 連結與既有設定相容、任務原子寫入、今日新增與完成紀錄、跨日保留脈絡、拖曳排序、直接編輯、版本衝突草稿，以及手機操作。

## Agent API

所有路徑同時支援 `/api` 前綴。僅供本機單一使用者使用；預設綁定 loopback，驗證 Host 與瀏覽器 Origin。寫入只接受 `application/json`，單次請求最多 1 MiB。

| 方法與路徑 | 用途 |
| --- | --- |
| `GET /health` | 健康檢查 |
| `GET /settings` | 選項設定及版本 |
| `POST /settings` | 提交完整設定，需帶讀取時的 `version` |
| `GET /workflows` | 類型及階段選項（含固定 ID、名稱、色彩、停用狀態及預設階段） |
| `GET /tasks` | 全部未刪除任務，含已完成任務 |
| `POST /tasks` | 建立任務 |
| `POST /tasks/reorder` | `{"task_ids":["id2","id1"]}` 調整未完成任務的相對順序 |
| `GET /tasks/{id}` | 完整任務 |
| `GET /tasks/{id}/context` | Agent 脈絡，與完整任務相同 |
| `POST /tasks/{id}/actions` | 具版本檢查的任務操作 |

建立任務只需標題。類型、階段與優先順序為舊版相容欄位，省略時使用既有預設值；連結可只提供網址：

```sh
curl http://127.0.0.1:8787/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "修復登入逾時",
    "description": "閒置後登入失敗，修復後需通過回歸測試。",
    "scheduled_date": "2026-11-04",
    "links": [{"url": "https://team.slack.com/archives/C123/p456"}],
    "source": "agent:codex"
  }'
```

讀取 context 的 `version` 後，可原子更新備註與附加連結：

```sh
curl http://127.0.0.1:8787/tasks/TASK_ID/actions \
  -H 'Content-Type: application/json' \
  -d '{
    "op": "update",
    "version": 1,
    "description": "修復已提交，等待 CI 結果。",
    "links": [{"url": "https://github.com/example/app/pull/1"}],
    "source": "agent:codex"
  }'
```

請替換範例 ID、版本與時間。`type`、`stage` 使用設定中的字串 ID；`priority` 維持非負整數 ID，選項可擴充，沒有 0–2 上限。切換類型時應一併指定該類型的合法階段。新增連結建議使用 `{"url":"https://…"}`，伺服器依網址辨識 GitHub PR／Issue、Slack、Asana、Google 文件，其他網址使用 `other` 種類。推定種類已停用或不存在時依序退回啟用中的 `other`、既有預設種類。回傳仍含 `type_id` 與 `type`。明確指定 `type_id` 或舊版 `type` 名稱的寫法維持相容；未知或已停用的明確種類回傳 `400`。

| `op` | 行為 |
| --- | --- |
| `update` | 更新 `title`、`description`、`scheduled_date`、`type`、`stage`、`priority`、`waiting_reason`、`review_at`、`metadata`；可附加 `links` |
| `rename` | 非空白 `title`，重新命名任務 |
| `set_waiting` | 舊版相容操作：非空白 `waiting_reason`，設定等待；介面已移除 |
| `resume` | 舊版相容操作：清除等待與查看時間；介面已移除 |
| `add_link` | 非空白 `links` 陣列，附加相關連結；同一 `type_id` 允許多筆 |
| `complete_task` | 完成任務，清除等待／提醒，保留描述與歷程 |
| `reopen_task` | 恢復任務為未完成 |
| `delete_item` | 軟刪除任務 |

`scheduled_date` 為可選的日期字串，格式為有效的 `YYYY-MM-DD`（年份 0001–9999），不含時間或時區；建立時省略或設為空字串代表無日期。`update` 省略此欄位維持原值，空字串清除日期，無效日期回傳 `400`。日期保存在既有 SQLite 任務 JSON 文件，無須 schema 升級；舊任務視為無日期。請使用支援日期欄位的執行檔，舊版寫入任務可能遺失此欄位。

省略欄位維持原值，空字串 `description`／`waiting_reason`／`review_at` 清除內容。回傳完整任務，版本遞增一次，並記錄來源與時間。`source` 省略為 `ui`。版本衝突回傳 `409`，應重新讀取並確認適用的修改；請勿直接以新版本覆蓋舊草稿。

舊 `goal`、`context`、`acceptance` 與步驟欄位及操作仍保留 API 相容性；新整合應只使用 `description` 與任務操作。建立時只提供舊內容欄位會合併到描述；之後舊內容欄位與描述各自獨立，不雙向同步。

設定提交使用 `GET /settings` 的完整結構，包含 `version`、`workflows`、`priorities`、`default_type`、`default_priority`、`link_types`、`default_link_type`。類型另有 `stages`、`default_stage`；每個選項包含 `id`、`name`、`color`（`#RRGGBB`）及 `disabled`。移除陣列中的選項即代表刪除，引用該選項的任務會原子改派至預設值；若保留引用請設 `disabled: true`。刪除預設選項時必須同時提交合法的新預設值。陣列順序就是選單順序。`color_presets` 為伺服器提供的唯讀預選色表，提交時不會覆寫內建色表。

排序不修改任務版本或歷程，只交換指定 ID 占用的位置。重複、不存在或已完成 ID 回傳 `400`，不留下部分更新。

錯誤回傳 `{"error":"說明"}`：`400` 輸入錯誤、`404` 找不到任務、`409` 版本衝突、`415` Content-Type 錯誤、`500` 儲存失敗。

## 專案結構

```text
cmd/famo/              啟動、參數、結束處理
internal/tasks/        資料模型、自訂選項、領域操作、SQLite 持久化與遷移
internal/server/       chi HTTP API、本機來源驗證、靜態檔案
web/src/               React 每日清單與輕量詳情
web/src/components/ui/ 專案持有的 UI 基礎元件
web/e2e/               Playwright 瀏覽器驗收
web/embed.go           內嵌前端建置產物
```

原始需求背景見 [personal-task-manager.md](personal-task-manager.md)；目前操作以本文件為準。
