# Famo

能夠擴充資訊的 Markdown todo list，資料保存在本機。

## 產品理念

操作先像寫 Markdown 待辦清單：直接輸入、直接改字、勾選完成、拖曳排序，不需要先填完一張表單才能記下一件事。每個快速新增的項目本身就是完整的獨立任務。

需要更多脈絡時，再透過列右側的詳情按鈕補上目標、背景、子步驟、相關連結與等待狀態。這些資訊是可選的擴充，不是建立或完成待辦的必要條件。簡單的事保持一行；複雜的事也能留住隔天接著做所需的 context。

列表的互動原則：

- 快速輸入框聚焦時只顯示文字游標，不改變邊框或加上 focus ring。
- 點列內文字直接編輯該列標題，Enter 或離開欄位時儲存，Escape 放棄修改。子步驟列修改的是步驟名稱，所屬任務不變。
- 清空文字後，再按一次 Backspace 才刪除該項目；單純清空或離開欄位不會刪除。有 parent 的步驟只刪該步驟，獨立任務則刪除整個任務。
- 列右側的詳情按鈕開啟擴充資訊，點標題不開啟表單。
- 已完成項目可以取消勾選，恢復成未完成；子步驟也可以反勾恢復。
- 每列左側六點把手用來調整順序，方形 checkbox 用來切換完成狀態。

產品設計與需求背景見 [personal-task-manager.md](personal-task-manager.md)。

## 第一次開發的範圍

- 建立任務，設定目標、背景、驗收條件、類型、優先順序與子步驟。
- 首頁快速新增僅一個輸入框，按 Enter 後任務直接進入下方列表，不在輸入區保留副本。支援 `- [ ] 任務` 文字，中文選字不誤送出，儲存不打斷下一行輸入；失敗的列留在下方供重試。新任務預設為無 parent 的獨立任務、一般類型與一般優先順序，步驟與 context 可以一直留白，也可點開再補。工具列保留「完整表單」。
- 首頁以精簡 todo 條列呈現「可繼續」、「該回來看了」、「等外部結果」，右側顯示狀態、進度與相關連結，支援搜尋。
- 方形 checkbox：顯示目前子步驟時，右側 chip 顯示所屬任務，勾選只完成該步驟，原位確認下一步後繼續；沒有待做子步驟時顯示完整任務，勾選直接完成整件事。完成回饋與資料儲存分開，重新整理不會重做步驟。
- 每列左側的六點把手可在同區塊拖曳排序，支援滑鼠、觸控及鍵盤（空白鍵／Enter 拿起、上下鍵移動、空白鍵／Enter 放下、Escape 取消），順序寫入 SQLite。搜尋後拖曳只交換可見項目的位置，其他任務的位置維持原狀。
- 詳情視窗可編輯內容、流程階段、下一步、查看時間，新增多筆 HTTP / HTTPS 連結，查看全部步驟與歷程，也可完成整件任務。
- 已完成任務保留在完成紀錄，可取消勾選或由詳情恢復為未完成。刪除任務採軟刪除，從列表與 API 隱藏，資料與歷程仍留在 SQLite；第一版沒有垃圾桶介面。
- UI 與本機 Agent 共用操作 API；每次寫入必須帶任務版本，並記錄來源與時間。
- SQLite 持久化與 Go 內嵌前端，正式使用只需啟動一個執行檔。

首頁採互斥分區：已完成的任務離開工作台；`review_at` 到期優先放入「該回來看了」；其餘有等待原因的任務放入「等外部結果」；剩餘放入「可繼續」。等待中的任務仍可以有可做的小步驟。時間由瀏覽器每 15 秒重算，任務每 30 秒及視窗重新聚焦時同步；Agent 寫入後可重新整理立即查看。

優先順序為 `2` 優先、`1` 一般、`0` 之後，以 chip 呈現；列表順序由使用者拖曳決定，新任務加在最後。舊資料庫第一次升級會保留原本的優先順序與建立時間排序，再建立獨立排序資料。尚未加入每日分隔線、今天進展清單、雲端 Agent 連線、MCP、CI 自動查詢或外部服務整合。

## 執行

需要 Go 1.26.5 以上、Node.js 24 LTS 以上與 npm。首次安裝與建置：

```sh
make build
./bin/famo
```

開啟 <http://127.0.0.1:8787>。初始資料庫為空，可直接建立自己的任務。資料預設存入啟動目錄下的 `data/famo.db`。

```sh
./bin/famo -db /absolute/path/famo.db -addr 127.0.0.1:8787
```

備份時先停止程式，再複製 SQLite 檔案；執行期間的 SQLite WAL 可能尚未合併進主檔。正式執行檔已含前端，搬動執行檔時不必搬動 Node.js 或 `web/dist`。

## 開發與檢查

本專案的 Git 操作文字一律使用英文，包括 commit messages、PR titles、PR descriptions 及相關 Git／PR 溝通文字。

第一次先安裝前端依賴，再分開啟動兩個終端機：

```sh
cd web
npm ci
cd ..
make dev-api
```

```sh
make dev-web
```

前端開發位址為 <http://127.0.0.1:5173>，`/api` 由 Vite 代理到 Go。只有正式建置時需要把前端嵌入 Go；修改前端後請重新執行 `make build` 才會更新正式執行檔。

```sh
make test                       # Go race tests、TypeScript、前端正式建置
cd web
npx playwright install chromium # 首次執行瀏覽器測試時安裝
npm run test:e2e                 # 桌面核心流程、Agent 回報、手機操作
npm run format:check
```

瀏覽器測試會啟動獨立的 `127.0.0.1:8788` 伺服器，使用系統暫存目錄中的獨立 SQLite，不接觸個人資料庫。Go 測試涵蓋並行版本衝突、複合操作的原子性、重新開啟資料庫、步驟與任務完成的區別，以及 HTTP 驗證與本機來源限制。

採開發當下套件 registry 的最新穩定版本（不使用 prerelease）：Go chi 5.5.0、modernc SQLite 1.61.1、React 19.3.1、Vite 8.3.5、TypeScript 7.0.2、Tailwind CSS 4.3.4、TanStack Query 5.105.3。確切版本由 `go.mod`、`go.sum` 與 `web/package-lock.json` 鎖定。shadcn/ui 採原始碼持有方式，Button、Checkbox、Dialog 位於 `web/src/components/ui`，使用 Radix primitives，後續可透過 `web/components.json` 加入元件。

## Agent API

以下路徑同時支援 `/api` 前綴；UI 使用 `/api/tasks`，Agent 可直接使用 `/tasks`。僅供本機單一使用者使用，預設綁定 loopback，無帳號或認證。後端驗證 Host 與瀏覽器 Origin，寫入僅接受 `application/json`，單次請求最多 1 MiB。

| 方法與路徑 | 用途 |
| --- | --- |
| `GET /health` | 健康檢查 |
| `GET /workflows` | 取得任務類型及各自的合法階段 |
| `GET /tasks` | 全部任務，含已完成任務 |
| `POST /tasks` | 建立任務 |
| `POST /tasks/reorder` | 以 `{"task_ids":["id2","id1"]}` 調整兩件以上未完成任務的相對順序，回傳完整任務列表 |
| `GET /tasks/{id}` | 完整任務 |
| `GET /tasks/{id}/context` | Agent 脈絡，含目標、背景、驗收、步驟、連結、metadata 與歷程 |
| `POST /tasks/{id}/actions` | 具版本檢查的任務操作 |

建立任務（`steps` 是文字陣列，回傳時每一步會有自己的 ID）：

```sh
curl http://127.0.0.1:8787/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "修復登入逾時",
    "type": "development",
    "priority": 2,
    "goal": "登入流程恢復正常",
    "context": "Slack 討論指出閒置後登入失敗",
    "acceptance": "重現測試與回歸測試通過",
    "steps": ["重現並修復問題", "開 PR"],
    "links": [{"type": "Slack", "url": "https://example.com/thread"}],
    "metadata": {"repo": "example/app"},
    "source": "agent:codex"
  }'
```

讀取 `GET /tasks/{id}/context`，取得 `version` 與待完成的 `steps[].id`。完成步驟、附上 PR 與標記等待 CI 可以一次提交：

```sh
curl http://127.0.0.1:8787/tasks/TASK_ID/actions \
  -H 'Content-Type: application/json' \
  -d '{
    "op": "complete_step",
    "version": 1,
    "source": "agent:codex",
    "step_id": "STEP_ID",
    "next_step": "查看 CI 結果",
    "stage": "PR review",
    "waiting_reason": "CI 執行中",
    "review_at": "2026-11-05T09:00:00+08:00",
    "links": [{"type": "GitHub PR", "url": "https://github.com/example/app/pull/1"}]
  }'
```

請把範例 ID、版本與時間替換為實際值。回傳完整任務，版本遞增一次，步驟、狀態、連結與歷程在同一筆 SQLite 更新中原子提交。兩個寫入者使用相同版本時只會有一個成功。失敗不留下部分修改。

| `op` | 必要資料與行為 |
| --- | --- |
| `complete_step` | `step_id`，只完成該步驟 |
| `update_next_step` | 非空白 `next_step`，更新第一個未完成步驟；沒有時建立新步驟 |
| `set_waiting` | 非空白 `waiting_reason`，保留流程階段，記錄開始等待的時間 |
| `resume` | 清除等待原因、開始等待與下次查看時間 |
| `add_link` | 非空白 `links` 陣列，附加多筆連結 |
| `update` | 可更新 `title`、`goal`、`context`、`acceptance`、`priority`、`metadata` |
| `complete_task` | 完成整件任務，保留步驟與歷程供回顧 |
| `reopen_task` | 將已完成任務恢復成未完成，保留原有步驟、內容與排序 |
| `reopen_step` | `step_id`，將已完成步驟恢復成未完成；必要時一併恢復所屬任務 |
| `rename` | 非空白 `title`；有 `step_id` 時修改該步驟，否則修改任務名稱 |
| `delete_item` | 有 `step_id` 時刪除該步驟，否則軟刪除整件任務；仍需 `version` |

每次操作都必須有 `version`；`source` 可辨識寫入者，省略時為 `ui`。一般操作可以一併帶 `next_step`、`stage`、`waiting_reason`、`review_at`、`links`。省略欄位維持原值；空字串 `waiting_reason` / `review_at` 清除該設定。`review_at` 使用含時區的 RFC3339。已完成任務仍接受重新命名、刪除及恢復操作；其他內容更新需先恢復為未完成。

排序 API 與任務內容操作分開：排序以交易一次提交，只交換指定 ID 所占的位置，不修改任務版本、步驟、背景或歷程。重複、找不到或已完成的 ID 會回傳 `400`，不保留部分排序。多個視窗同時調整相同位置時採最後一次成功儲存的順序。

錯誤回傳 `{"error":"說明"}`：`400` 輸入錯誤、`404` 找不到任務、`409` 版本衝突、`415` Content-Type 錯誤、`500` 儲存失敗。遇到 `409` 請重新讀取 context，確認目前狀態後重做適用的操作，避免直接覆寫新資料。UI 編輯表單保留開始編輯時的版本，背景同步收到更新時保留草稿、暫停送出，由使用者重新載入最新內容。第一版沒有冪等鍵；網路中斷導致無法確認是否成功時，先重讀任務與歷程。

## 專案結構

```text
cmd/famo/              啟動、參數、結束處理
internal/tasks/        資料模型、流程設定、領域操作、SQLite 持久化
internal/server/       chi HTTP API、本機來源驗證、靜態檔案
web/src/               React 工作台、詳情與新增任務
web/src/components/ui/ 專案持有的 UI 基礎元件
web/e2e/               Playwright 瀏覽器驗收
web/embed.go           將前端建置產物嵌入 Go
```

流程設定目前定義在 `internal/tasks/model.go` 的 `Workflows`，透過 API 提供給 UI；第一版先設定各類型的階段，預設子步驟留給實際試用後再定義。
