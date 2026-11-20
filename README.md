# Famo

有需要時能附上脈絡的每日 todo list。每一列代表眼前可以動手做的一小步，輸入一句話就能開始；做完打勾，再自行決定下一步。資料存在本機 SQLite。

待實作功能見 [功能待辦](TODO.md)。

## 每日操作

- 開啟後直接顯示瀏覽器當地的「今日」。導覽保留今日、跨日期的任務列表與完成紀錄。
- 新增統一使用清單上方的一行輸入，支援 `- [ ] 任務`，Enter 後接著輸入下一件事。中文選字不誤送出，儲存失敗的列保留內容並可重試。
- 今日／日期頁新增時，任務使用正在查看的日期；跨日期的任務列表新增時，任務不指定日期。
- 點列表文字直接修改標題，Enter 或離開欄位儲存，Escape 取消。清空後再按一次 Backspace 才刪除該列；刪除採軟刪除。
- 側欄的「最近刪除」按刪除時間顯示最近 7 天的任務，可搜尋並還原。還原會保留原日期、完成狀態和排序位置；7 天後會從此檢視移除，SQLite 仍保留軟刪除紀錄。
- 方形 checkbox 完成／恢復該列任務。每個小步驟各自建立與完成，不要求預先規劃後續流程。
- 六點把手支援滑鼠、觸控及鍵盤排序。以手動順序安排先後，搜尋後排序只交換可見任務的位置。
- 日期頁的搜尋欄位於右上角，聚焦時會在搜尋圖示與輸入區外顯示高亮外框。

### 快捷鍵

| 快捷鍵 | 操作 |
| --- | --- |
| ⌘D | 收合或展開側邊欄 |
| ⌘T | 開啟快速新增浮窗，按 Enter 送出後可接著輸入下一件 |
| ⌘K | 返回本機今日 |
| ⌘F | 開啟搜尋浮窗，即時篩選目前清單，按 Enter 返回清單 |

浮窗會在視窗中央開啟，按 Escape 或點擊浮窗外可關閉。快速新增浮窗預設使用目前日期頁的日期，從其他頁面開啟時預設今天，點擊浮窗中的日期即可改選。從設定頁啟動搜尋會先返回今日。

任務每 30 秒及視窗重新聚焦時同步。

## Projects

從側欄的「Projects」按 + 建立分類，點選名稱即可查看該 Project 的待辦及已完成任務。可在 Project 標題旁重新命名。在 Project 頁面的清單或快速新增浮窗建立的任務會直接歸入目前的 Project。

在任務詳情的「Project」欄位可指派或變更分類，選擇「未分類」可清除歸屬。任務可同時有日期與 Project。「今日」和其他日期會一起顯示當天各 Project 的任務，原有「任務」與「已完成」仍跨 Project 檢視。

## macOS 選單列

桌面版啟動後，macOS 選單列會顯示 Famo 小圖示與今天的「已完成／總數」，例如 `2/5`。只計算安排在本機今天的任務，未指定日期、其他日期和已刪除任務不列入；沒有任務時顯示 `0/0`。進度每 2 秒更新，也會反映 Agent API 的修改與跨日變化；讀取失敗時顯示 `—`。

點擊圖示可開關浮動面板，查看今日任務、完成數與百分比，可直接勾選每列的方形核取方塊完成或恢復任務，進度與已開啟的主視窗會立即同步更新。面板可在目前桌面或其他 App 的全螢幕空間中開啟，不會因開啟面板而切回 Famo 主視窗所在的桌面。右上角日期旁的「Open Famo」可回到主視窗。面板沿用目前主題，點擊其他地方或按 Escape 可關閉。點擊關閉按鈕或按 ⌘W 關閉主視窗會保留選單列功能，可從面板、選單列右鍵選單或 Dock 再次開啟；要完全結束可使用右鍵選單的「Quit Famo」或 ⌘Q。

## 外觀與偏好設定

從側欄底部的「設定」，可預覽並選擇 12 款內建主題：淺色的苔綠（預設）、亞麻、海鹽、薰衣草、玫瑰、沙丘，以及深色的午夜、石墨、夜森、極光、暮紫、摩卡。「跟隨系統」會隨系統外觀即時切換苔綠與午夜。macOS 桌面版也可使用 Famo 選單中的「偏好設定⋯」或 ⌘, 開啟設定頁。

主題立即套用到清單、月曆、任務詳情與 App 內的 Famo 圖示，不需按儲存。偏好保存在目前瀏覽器或桌面 WebView 的本機儲存空間，重新開啟後沿用，同一來源的分頁也會同步；不同瀏覽器、瀏覽器與桌面版之間各自設定。無法使用本機儲存時仍可切換主題，介面會提示無法記住選擇。

「新增主題」可從既有主題開始，命名並選擇淺色／深色外觀，再用調色盤或 `#RRGGBB` 色碼調整頁面、內容、側欄、文字、強調色、邊框等 9 個配色。即時預覽會把配色套用到「今日」畫面的範例，按「儲存主題」才新增並套用；自訂主題也能編輯與刪除。儲存失敗會保留草稿。

「匯出目前主題」可匯出內建或自訂主題，也可一次「匯出全部自訂主題」；瀏覽器下載 JSON，桌面版使用 macOS 儲存視窗。「匯入主題」可讀取匯出檔，驗證完整檔案後一次新增，同名主題會加上編號並保留原有版本。檔案格式為 `{"format":"famo-theme","version":1,"themes":[…]}`，每款含名稱、說明、外觀模式與完整配色；單檔最多 1 MB，本機最多保留 100 款自訂主題。可透過匯出／匯入在瀏覽器與桌面版間搬移配色。

## 日期與跨日整理

日期代表安排處理的那一天，可留空。日期頁只顯示所屬日期的任務，未完成在上、已完成在下，並顯示完成數。日期頁和「已完成」頁皆將最近完成的任務排在最前。勾選完成或恢復任務都不改變所屬日期；今天補勾昨天的任務，仍留在昨天。

日期標題旁的 `< [ 今日 | ⌄ ] >` 可以切換前後一天、回到當地今日或展開月曆選日。點擊月曆上方的年月可開啟月份列表，再點擊年份可選擇其他年份。日曆可用方向鍵選日，按 Escape 或點選外部即可關閉。

下方預設收合的「先前未完成」依原日期分組，列出早於目前日期的未完成任務。可逐筆移到這天，也可多選或全選目前搜尋結果後批次移動。勾選詳情左上角的圓形核取方塊，可完成或恢復任務。任務不會自動跨日移動，移動時保留備註、連結與原任務身分。

今日頁另有預設收合的「未指定日期」，與「先前未完成」一樣，可逐筆移到今天，或多選與全選目前搜尋結果後批次移動。已排程或已完成任務不納入。

每列右側的月曆按鈕和詳情中的「任務日期」使用同一款月曆。選取或清除後立即儲存，已完成任務也可調整。詳情中儲存失敗會保留選擇並提供重試；版本衝突時先讀取最新日期再重新選擇。批次移動逐筆檢查版本，失敗項目保留原日期與選取狀態。新增草稿切換日期後重試，仍使用原本指定的日期。

## 備註與連結

每列右側按鈕開啟日期、備註與相關連結。這些資訊都可以留白，不影響新增或完成。

- 點標題或備註直接編輯，離開欄位儲存、Escape 取消。標題以 Enter 儲存；備註的 Enter 換行，Ctrl／⌘＋Enter 儲存，也可使用儲存／取消按鈕。已完成任務也可修改。
- 未完成與已完成任務都能貼上 HTTP／HTTPS 網址新增連結，不必選種類。同一任務可以保留多個 PR 或討論串，也可用詳情中連結旁的刪除按鈕移除單筆。新增失敗或版本衝突會保留輸入網址。
- 列表直接顯示前兩筆連結，其餘以 `+N` 開啟詳情。GitHub PR／Issue 顯示 repo 與編號，Slack、Asana、Claude Artifact、Google Doc、Google Slides、Google Sheets、Google Forms 和 Google Drive 顯示簡短名稱，其餘使用主機與路徑，完整網址可在詳情查看。

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

桌面版使用 Wails v3 與系統 WKWebView，直接開啟獨立視窗，不需要另外啟動伺服器或開啟瀏覽器。每日清單、日期、排序、備註和連結沿用相同介面；任務連結交給系統預設瀏覽器開啟。支援 macOS 13.3 以上，提供標準 App／Edit／Window 選單與 ⌘Q、複製貼上等操作；關閉主視窗後仍保留選單列功能，再次啟動已開啟的 App 會聚焦原視窗。

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

「設定 → 本機 Agent」可即時開啟或停用桌面版的 Agent API，選擇會儲存在 SQLite。停用時會清除該執行個體的位址檔案，桌面介面可繼續使用。`-addr 127.0.0.1:8789` 可指定固定 port，`-addr ''` 會在本次啟動時停用 API。未指定 `-addr` 時採用儲存的偏好。`-api-info /absolute/path/agent-api.json` 可為隔離測試指定其他位址檔案，`-db` 不會改變預設位址檔案的位置。

目前產物使用本機 ad-hoc 簽章，供本機建置與試用；Developer ID 簽署、公證與自動更新尚未提供。原始碼已保留其他平台可共用的核心，這一版僅支援及驗證 macOS 桌面打包。

### 資料升級

首次用新版開啟舊 SQLite 資料庫時，Famo 會在交易中升級到 v7，保留任務標題、備註、日期、連結網址、完成與刪除狀態、時間、排序和版本。很早期的任務若尚無備註欄位，會將原有目標、背景和驗收條件合併成備註。v6 之前的原始任務、排序和選項會封存，待你主動清理。v6 升級會保留現有任務和封存資料，既有任務預設為未分類。升級後請用支援 v7 的執行檔。

### 清理舊任務資料

先用 `make build` 取得 `bin/famo`。桌面版的預設資料庫如下，命令列版請將路徑替換為 `data/famo.db` 或你實際使用的資料庫。

```sh
./bin/famo cleanup -db "$HOME/Library/Application Support/Famo/famo.db"
./bin/famo cleanup -db "$HOME/Library/Application Support/Famo/famo.db" -apply -backup "$HOME/Library/Application Support/Famo/famo-before-cleanup.db"
```

第一個指令以唯讀模式列出受影響的資料表與筆數。確認後，請先結束 Famo，再執行第二個指令。工具會先在指定路徑寫入完整 SQLite 備份，包含尚在 WAL 中的資料。備份路徑必須是新檔。備份成功後才會在交易中刪除舊資料並壓縮資料庫。工作區與 Agent API 偏好維持原值。備份仍包含舊資料，可保留以便需要時復原。

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

瀏覽器驗收會啟動獨立的 `127.0.0.1:8788` 伺服器，使用暫存目錄中的 SQLite，不接觸個人資料庫。測試涵蓋資料升級、URL 連結、任務原子寫入、今日新增與完成紀錄、跨日保留脈絡、拖曳排序、直接編輯、版本衝突草稿，以及手機操作。

## Agent API

所有路徑同時支援 `/api` 前綴。僅供本機單一使用者使用；預設綁定 loopback，驗證 Host 與瀏覽器 Origin。寫入只接受 `application/json`，單次請求最多 1 MiB。

以下 `curl` 範例使用命令列版預設的 `127.0.0.1:8787`。桌面版請先依上方 `agent-api.json` 的方式取得位址，再替換範例中的主機與 port。

| 方法與路徑 | 用途 |
| --- | --- |
| `GET /health` | 健康檢查 |
| `GET /agent/workspace` | 預設工作區路徑 `dir` 和選填指引 `prompt` |
| `GET /projects` | 所有 Project，包含 `id`、`name` 與 `version` |
| `POST /projects` | 以 `{"name":"工作"}` 建立 Project |
| `POST /projects/{id}` | 以 `{"name":"新名稱","version":1}` 重新命名 Project |
| `GET /tasks` | 全部未刪除任務，含已完成任務 |
| `POST /tasks` | 建立任務 |
| `GET /tasks/recently-deleted` | 最近 7 天軟刪除的任務，依刪除時間由新到舊排列 |
| `POST /tasks/reorder` | `{"task_ids":["id2","id1"]}` 調整未完成任務的相對順序 |
| `GET /tasks/{id}` | 完整任務 |
| `GET /tasks/{id}/context` | Agent 脈絡，與完整任務相同 |
| `POST /tasks/{id}/actions` | 具版本檢查的任務操作 |
| `POST /tasks/{id}/restore` | 以 `{"version":3}` 還原最近刪除的任務，回傳完整任務及新版本 |

建立任務只需標題，可同時指定備註、日期、Project 或連結。

```sh
curl http://127.0.0.1:8787/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "修復登入逾時",
    "description": "閒置後登入失敗，修復後需通過回歸測試。",
    "scheduled_date": "2026-11-04",
    "links": [{"url": "https://team.slack.com/archives/C123/p456"}]
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
    "links": [{"url": "https://github.com/example/app/pull/1"}]
  }'
```

請替換範例 ID、版本與日期。新增連結使用 `{"url":"https://…"}`，Famo 介面會依網址呈現 GitHub PR／Issue、Slack、Asana、Claude Artifact 和 Google Doc 等簡短名稱。

| `op` | 行為 |
| --- | --- |
| `update` | 更新 `title`、`description`、`scheduled_date` 或 `project_id`，也可附加 `links` |
| `rename` | 重新命名任務，標題必須有內容 |
| `add_link` | 附加一筆或多筆相關連結 |
| `remove_link` | 送出目前版本與從 0 起算的 `link_index`，移除一筆相關連結 |
| `complete_task` | 完成任務 |
| `reopen_task` | 恢復任務為未完成 |
| `delete_item` | 軟刪除任務 |

`scheduled_date` 接受有效的 `YYYY-MM-DD`（年份 0001–9999），不含時間或時區。建立時省略或送空字串代表無日期，更新時送空字串清除日期。更新省略的欄位會保留原值，空字串 `description` 可清除備註。建立與更新可傳入既有的 `project_id`；更新時送空字串可清除分類。回傳的任務若有分類，會包含 `project_id`。寫入成功會回傳完整任務，版本遞增一次。版本衝突回傳 `409`，先重新讀取，再確認如何套用修改。

舊版類型、階段、優先順序、等待狀態、子步驟、獨立脈絡、類型 metadata、寫入來源與歷程、手動連結種類，以及 `/settings`、`/workflows` 端點已移除。串接舊版 API 的工具請改用備註、日期及 URL 連結等現行欄位。

排序只交換指定 ID 占用的位置，保留任務內容版本。重複、不存在或已完成 ID 回傳 `400`，並回復整次排序。

錯誤回傳 `{"error":"說明"}`：`400` 輸入錯誤、`404` 找不到任務、`409` 版本衝突、`415` Content-Type 錯誤、`500` 儲存失敗。

## Agent CLI 與 Skill

macOS 桌面版在「設定 → 本機 Agent」可安裝、更新或移除 CLI，並複製 Skill 安裝指令。CLI 安裝到 `~/.local/bin/famo-agent`。若該資料夾未加到 `PATH`，可用完整路徑執行。在同一頁設定本機工作區的絕對路徑，並選擇性填寫指引，例如先查哪份文件或怎麼跑測試。Famo 提供路徑和指引，由本機 Agent 直接讀取工作區檔案。

`make build` 也會產生 `bin/famo-agent`。可在專案根目錄用 `./bin/famo-agent cli install` 安裝 CLI，或直接執行二進位檔。連線到命令列版的網頁服務時，請在子指令前加 `--url http://127.0.0.1:8787`。桌面版預設自動探索 API，隔離環境可傳 `--api-info PATH`。

```sh
famo-agent skill install                      # 安裝至 ~/.agents/skills/famo
famo-agent skill install --dir /path/to/skills # 使用其他 Agent 的 Skill 資料夾
famo-agent today                              # 今日未完成任務與工作區
famo-agent context TASK_ID                    # 任務、版本與工作區
famo-agent add --title '調查登入逾時'
famo-agent update TASK_ID --version 1 --description '已重現，待確認重試條件' --link https://example.com/report
famo-agent complete TASK_ID --version 2
```

CLI 成功時將 JSON 寫入 stdout，失敗時將 JSON 寫入 stderr。版本衝突的 exit code 是 `3`。`--description` 會取代整段備註，省略時保留原備註，`--link` 可重複使用。Skill 負責從工作區查找脈絡與回寫結果，可由使用者在本機 Agent 裡觸發。

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
