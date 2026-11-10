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

## 外觀與偏好設定

從側欄底部的「設定」，可預覽並選擇 12 款內建主題：淺色的苔綠（預設）、亞麻、海鹽、薰衣草、玫瑰、沙丘，以及深色的午夜、石墨、夜森、極光、暮紫、摩卡。「跟隨系統」會隨系統外觀即時切換苔綠與午夜。macOS 桌面版也可使用 Famo 選單中的「偏好設定⋯」或 ⌘, 開啟設定頁。

主題立即套用到清單、月曆與任務詳情，不需按儲存。偏好保存在目前瀏覽器或桌面 WebView 的本機儲存空間，重新開啟後沿用，同一來源的分頁也會同步；不同瀏覽器、瀏覽器與桌面版之間各自設定。無法使用本機儲存時仍可切換主題，介面會提示無法記住選擇。

「新增主題」可從既有主題開始，命名並選擇淺色／深色外觀，再用調色盤或 `#RRGGBB` 色碼調整頁面、內容、側欄、文字、強調色、邊框等 9 個配色。調色時先看即時預覽，按「儲存主題」才新增並套用；自訂主題也能編輯與刪除。儲存失敗會保留草稿。

「匯出目前主題」可匯出內建或自訂主題，也可一次「匯出全部自訂主題」；瀏覽器下載 JSON，桌面版使用 macOS 儲存視窗。「匯入主題」可讀取匯出檔，驗證完整檔案後一次新增，同名主題會加上編號並保留原有版本。檔案格式為 `{"format":"famo-theme","version":1,"themes":[…]}`，每款含名稱、說明、外觀模式與完整配色；單檔最多 1 MB，本機最多保留 100 款自訂主題。可透過匯出／匯入在瀏覽器與桌面版間搬移配色。

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

### macOS 桌面版

桌面版使用 Wails v3 與系統 WKWebView，直接開啟獨立視窗，不需要另外啟動伺服器或開啟瀏覽器。每日清單、日期、排序、備註和連結沿用相同介面；任務連結交給系統預設瀏覽器開啟。支援 macOS 13.3 以上，提供標準 App／Edit／Window 選單與 ⌘Q、複製貼上等操作；關閉最後一個視窗會結束 App，再次啟動已開啟的 App 會聚焦原視窗。

建置需要前述 Go／Node.js／npm，以及 Xcode Command Line Tools（`xcode-select --install`）。不需要另外安裝 Wails CLI：

```sh
make desktop
open bin/Famo.app
```

也可使用 `make run-desktop` 一次完成建置與開啟。`bin/Famo.app` 已包含執行檔、前端與圖示，可從 Finder 開啟或搬到 Applications；執行時不需要 Go 或 Node.js。預設建置目前 Mac 的 CPU 架構；`make desktop ARCH=universal` 會打包同時支援 Apple Silicon 與 Intel 的版本。

要加入 macOS 的 App 畫面，將 `Famo.app` 拖進 Finder 的「應用程式」（`/Applications`），之後可從 App 畫面或 Spotlight 搜尋開啟。需要固定在 Dock 時，將「應用程式」中的 Famo 拖到 Dock。更新已安裝的版本時，先以 ⌘Q 結束 Famo，再用新 `Famo.app` 替換「應用程式」中的版本；資料庫獨立存放，替換 App 不會刪除任務。

桌面版的預設資料庫固定為 `~/Library/Application Support/Famo/famo.db`，不受啟動位置影響。第一次啟動會建立新資料庫，不會自動搬動或覆寫命令列版的 `data/famo.db`。若要使用既有資料，先結束原本的 Famo，再指定完整路徑：

```sh
open bin/Famo.app --args -db /absolute/path/to/existing/famo.db
```

啟動參數只在第一次啟動程序時生效。也可直接執行 `bin/Famo.app/Contents/MacOS/famo-desktop -db /absolute/path/famo.db`，在終端機查看訊息。

桌面版的 Agent API 預設監聽 `127.0.0.1:0`，由作業系統直接分配空閒 port；雙擊開啟時不需要設定埠，也不會與原本的 8787 服務爭用。介面透過程序內部的 Wails asset server 存取資料，無須經過 TCP 埠。Agent API 與桌面視窗仍共用資料及版本檢查。

實際位址在啟動時原子寫入固定的 `~/Library/Application Support/Famo/agent-api.json`，例如：

```json
{
  "version": 1,
  "url": "http://127.0.0.1:52431",
  "pid": 12345,
  "instance_id": "THIS_LAUNCH_HAS_A_UNIQUE_ID"
}
```

Agent 應先讀取這個檔案，再呼叫 `url` 下的 `/health`，確認狀態為 `ok`，且回應的 `X-Famo-Instance-ID` header 與檔案的 `instance_id` 相同，然後使用相同的 `/api/tasks` 等路徑。這個識別碼用於核對執行個體，不是存取憑證。App 每次啟動都會重新分配 port 並更新檔案；連線失敗或識別碼不符時，應重新讀取檔案，避免使用異常結束前留下的位址。正常結束會清除所屬位址檔案、關閉資料庫並釋放埠。

目前可用啟動參數選擇 `-addr 127.0.0.1:8789` 固定 port，或用 `-addr ''` 停用 Agent API；停用時會清除舊位址檔案，桌面介面仍可正常使用。指定固定埠而發生衝突時會顯示啟動錯誤。這些參數只對本次程序生效，Agent API 的 App 內設定留待後續提供。`-api-info /absolute/path/agent-api.json` 可為隔離測試指定其他位址檔案；`-db` 不會改變預設位址檔案的位置。

目前產物使用本機 ad-hoc 簽章，供本機建置與試用；Developer ID 簽署、公證與自動更新尚未提供。原始碼已保留其他平台可共用的核心，這一版僅支援及驗證 macOS 桌面打包。

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

以下 `curl` 範例使用命令列版預設的 `127.0.0.1:8787`。桌面版請先依上方 `agent-api.json` 的方式取得位址，再替換範例中的主機與 port。

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
cmd/famo-desktop/      macOS Wails 桌面入口
internal/desktop/     桌面視窗、固定資料目錄、共用資料庫及 Agent API 生命週期
internal/tasks/        資料模型、自訂選項、領域操作、SQLite 持久化與遷移
internal/server/       chi HTTP API、本機來源驗證、靜態檔案
web/src/               React 每日清單與輕量詳情
web/src/components/ui/ 專案持有的 UI 基礎元件
web/e2e/               Playwright 瀏覽器驗收
web/embed.go           內嵌前端建置產物
build/macos/           App bundle metadata 與圖示
scripts/build-macos.sh macOS 建置、Universal binary 與本機簽章
```

原始需求背景見 [personal-task-manager.md](personal-task-manager.md)；目前操作以本文件為準。
