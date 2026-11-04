# Famo

可以直接輸入、編輯、勾選完成與拖曳排序的本機任務清單。簡單的事保持一行，需要更多脈絡時再開啟詳細頁。

## 任務操作

- 快速新增支援 `- [ ] 任務`，按 Enter 後立即接著輸入下一件事，中文選字不誤送出。任務使用設定頁的預設類型、該類型的預設階段與預設優先順序。
- 點列表文字直接修改任務標題：Enter 或離開欄位儲存，Escape 取消。清空後再按一次 Backspace 才刪除任務；刪除採軟刪除。
- 點任務列的狀態 chip 可直接展開該類型的階段選單，選取後立即儲存，保留選項的自訂顏色。
- 方形 checkbox 直接完成／恢復整件任務。舊步驟資料保留，但介面不再顯示或操作步驟，也不再顯示步驟進度。
- 六點把手支援滑鼠、觸控及鍵盤排序；搜尋後排序只交換可見任務的位置。順序存入 SQLite。
- 完整表單包含標題、描述、任務類型及優先順序。描述可自由填寫目標、背景與完成條件。
- 詳細頁點標題或描述直接編輯，離開欄位儲存、Escape 取消。標題以 Enter 儲存；描述的 Enter 換行，Ctrl／⌘＋Enter 儲存，也可使用欄位下方的儲存／取消。已完成任務也可修改標題和描述。
- 類型、流程階段與優先順序可在詳細頁直接選取；切換類型時使用新類型的預設階段。等待原因與查看時間獨立設定，另可新增 HTTP／HTTPS 相關連結。進展歷程預設收合，點擊後展開。
- 所有內容寫入都帶版本。版本衝突與儲存失敗會保留編輯草稿，避免覆蓋其他視窗或 Agent 的更新。

首頁採互斥分區：已完成任務放入完成紀錄；`review_at` 到期放入「該回來看了」；其餘有等待原因的任務放入「等外部結果」；剩餘放入「可繼續」。瀏覽器每 15 秒重算時間，任務每 30 秒及視窗重新聚焦時同步。

## 下拉選項設定

導覽列的「下拉選項設定」可以編輯任務類型、各類型的流程階段與優先順序。支援新增、刪除、改名、排序、預選／自訂顏色、停用與預設值；選項色彩同步顯示在任務列表、詳細頁與選單。這些設定不改變首頁依等待／提醒時間自動分區的規則。

每個選項有固定 ID，修改名稱與顏色不會改寫任務關聯。停用選項會保留既有任務的顯示，新任務不可選用；刪除則會將使用中的任務改到對應的預設類型、階段或優先順序。刪除預設選項時，介面自動選擇第一個仍啟用的選項作為預設，最後一個啟用中的預設選項不可刪除。

刪除在按下儲存後生效。設定與任務改派在同一筆交易提交；受影響任務的版本會遞增，並新增歷程，描述、完成／刪除狀態與排序保持原樣。已開啟的編輯草稿會依版本檢查避免覆蓋改派結果。

預選色提供 16 款柔和的糖果色，點名稱輸入框右側的 chip 才展開配色選單；色票可一鍵套用並收起選單，也可自訂任何顏色。點選單外或按 Escape 可關閉。新增選項會從同組使用次數最少的預選色中自動選色：

| 色彩 | 色碼 |
| --- | --- |
| 草莓奶昔 | `#F4B8CB` |
| 蜜桃布丁 | `#F7C5AB` |
| 奶油餅乾 | `#F5DFA0` |
| 開心果 | `#C9DFAD` |
| 薄荷糖 | `#ADE0D2` |
| 晴空棉花糖 | `#B5D8F5` |
| 薰衣草 | `#CFC1F0` |
| 葡萄軟糖 | `#E3BCE0` |
| 玫瑰馬卡龍 | `#EBA5B3` |
| 珊瑚果凍 | `#F3B6AE` |
| 橘子汽水 | `#F6CF9F` |
| 檸檬雪酪 | `#EEE6AD` |
| 青蘋果 | `#D9E8B8` |
| 海鹽蘇打 | `#AEDBDF` |
| 藍莓優格 | `#BAC9EB` |
| 可可奶茶 | `#DCCABD` |

文字顏色會依背景明暗調整。既有自訂顏色保持原樣。詳細頁選單採用至少 46px 高、15px 字級與較寬留白。

設定存於 SQLite，有獨立版本檢查。多視窗修改發生衝突時保留草稿，可重新載入最新設定。

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

備份時先停止程式再複製 SQLite 檔案；執行中的 WAL 可能尚未合併到主檔。升級後請使用支援 v4 的執行檔。

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

瀏覽器驗收會啟動獨立的 `127.0.0.1:8788` 伺服器，使用暫存目錄中的 SQLite，不接觸個人資料庫。測試涵蓋資料升級、設定持久化／驗證／版本衝突、任務原子寫入、拖曳排序、直接編輯、封存步驟不介入列表操作、歷程收合，以及手機操作。

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

建立任務，只需標題；未提供類型、階段與優先順序時使用設定預設值：

```sh
curl http://127.0.0.1:8787/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "修復登入逾時",
    "description": "閒置後登入失敗，修復後需通過回歸測試。",
    "links": [{"type": "Slack", "url": "https://example.com/thread"}],
    "source": "agent:codex"
  }'
```

讀取 context 的 `version` 與 settings 中的選項 ID 後，可原子更新描述、階段、等待時間及連結：

```sh
curl http://127.0.0.1:8787/tasks/TASK_ID/actions \
  -H 'Content-Type: application/json' \
  -d '{
    "op": "update",
    "version": 1,
    "description": "修復已提交，等待 CI 結果。",
    "waiting_reason": "CI 執行中",
    "review_at": "2026-11-05T09:00:00+08:00",
    "links": [{"type": "GitHub PR", "url": "https://github.com/example/app/pull/1"}],
    "source": "agent:codex"
  }'
```

請替換範例 ID、版本與時間。`type`、`stage` 使用設定中的字串 ID；`priority` 維持非負整數 ID，選項可擴充，沒有 0–2 上限。切換類型時應一併指定該類型的合法階段。`review_at` 使用含時區的 RFC3339。

| `op` | 行為 |
| --- | --- |
| `update` | 更新 `title`、`description`、`type`、`stage`、`priority`、`waiting_reason`、`review_at`、`metadata`；可附加 `links` |
| `rename` | 非空白 `title`，重新命名任務 |
| `set_waiting` | 非空白 `waiting_reason`，設定等待 |
| `resume` | 清除等待原因、開始等待與下次查看時間 |
| `add_link` | 非空白 `links` 陣列，附加相關連結 |
| `complete_task` | 完成任務，清除等待／提醒，保留描述與歷程 |
| `reopen_task` | 恢復任務為未完成 |
| `delete_item` | 軟刪除任務 |

省略欄位維持原值，空字串 `description`／`waiting_reason`／`review_at` 清除內容。回傳完整任務，版本遞增一次，並記錄來源與時間。`source` 省略為 `ui`。版本衝突回傳 `409`，應重新讀取並確認適用的修改；請勿直接以新版本覆蓋舊草稿。

舊 `goal`、`context`、`acceptance` 與步驟欄位及操作仍保留 API 相容性；新整合應只使用 `description` 與任務操作。建立時只提供舊內容欄位會合併到描述；之後舊內容欄位與描述各自獨立，不雙向同步。

設定提交使用 `GET /settings` 的完整結構，包含 `version`、`workflows`、`priorities`、`default_type`、`default_priority`。類型另有 `stages`、`default_stage`；每個選項包含 `id`、`name`、`color`（`#RRGGBB`）及 `disabled`。移除陣列中的選項即代表刪除，引用該選項的任務會原子改派至預設值；若保留引用請設 `disabled: true`。刪除預設選項時必須同時提交合法的新預設值。陣列順序就是選單順序。`color_presets` 為伺服器提供的唯讀預選色表，提交時不會覆寫內建色表。

排序不修改任務版本或歷程，只交換指定 ID 占用的位置。重複、不存在或已完成 ID 回傳 `400`，不留下部分更新。

錯誤回傳 `{"error":"說明"}`：`400` 輸入錯誤、`404` 找不到任務、`409` 版本衝突、`415` Content-Type 錯誤、`500` 儲存失敗。

## 專案結構

```text
cmd/famo/              啟動、參數、結束處理
internal/tasks/        資料模型、自訂選項、領域操作、SQLite 持久化與遷移
internal/server/       chi HTTP API、本機來源驗證、靜態檔案
web/src/               React 工作台、詳細頁、新增任務與設定頁
web/src/components/ui/ 專案持有的 UI 基礎元件
web/e2e/               Playwright 瀏覽器驗收
web/embed.go           內嵌前端建置產物
```

原始需求背景見 [personal-task-manager.md](personal-task-manager.md)；目前操作以本文件為準。
