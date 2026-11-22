# 跨裝置同步

Mac 仍可離線使用 SQLite。設好同步後，Mac 背景會推送任務異動並拉取遠端結果。手機從同一個 HTTPS 網域開啟共用的 Famo React 介面，使用「今日」、任務、已完成、最近刪除、Project、Board 和全域搜尋，也可編輯日期、備註和連結。同步涵蓋任務內容、日期、連結、完成狀態、刪除和還原，也包含 Project 的名稱、顏色、順序及 Board 的名稱、圖示和 Project 篩選。手機可從右上角展開側邊欄切換檢視，或新增、編輯和刪除 Project 與 Board。刪除 Project 後，原本的任務會顯示為未分類，相關 Board 會移除該篩選。Mac 的 Project Agent 工作區路徑和提示詞、任務的手動排序、側欄順序和外觀偏好各自留在本機。

啟用同步會把這份 SQLite 中的任務、Project 和 Board 傳到所指定的 Worker 和 D1。D1 保留已接受的任務版本和刪除紀錄，本機「最近刪除」到期後仍可供其他裝置同步。建議先用測試資料庫驗證部署，再設定日常使用的資料庫。同一份資料庫的同步紀錄會綁定網址和帳號。搬到另一個 Worker 或帳號時，用另一份本機資料庫開始。

Mac 活躍時預設每 30 秒同步一次，可在 `famo-sync.json` 設定 `interval_seconds`。Famo 閒置 5 分鐘後暫停輪詢。再次操作 Famo、切回視窗、開啟選單列面板，或透過 Famo 或 Agent API 寫入任務、Project 或 Board 時，Mac 會主動同步。閒置期間遠端變更會在下次同步時顯示。手機網頁在前景每 10 秒拉取一次，回到頁面、恢復連線或按「同步」也會拉取。網頁會在目前分頁保存尚未確認的寫入，重新載入時用相同的操作 ID 重試。網頁的手動任務排序、外觀和語言會保存在瀏覽器。

Mac 主視窗和選單列面板以及手機網頁會顯示同步燈號與文字。綠燈表示最近同步成功且沒有待送異動。黃燈表示同步中、等待異動送出或等待連線。紅燈表示同步失敗或需處理版本衝突。按燈號可立即同步。

## 本機驗證

準備 Go 1.26.5、Node.js 24 和 Chromium，從專案根目錄執行：

```sh
npm --prefix web ci
npm --prefix sync ci
(cd web && npx playwright install chromium)
npm --prefix sync run typecheck
npm --prefix sync test
npm --prefix web run test:e2e:sync
node scripts/test-sync.mjs
```

整合測試啟動本機 Wrangler、D1、Go 程序和手機尺寸的 Chromium，使用各自的暫存資料庫。驗證桌面離線新增後重啟、回應中斷後重送、手機新增和完成、雙裝置版本衝突、解決衝突及刪除。也驗證離線新增 Project／Board 後上傳、手機改名及更新篩選回到 Mac、刪除後解除關聯，以及本機工作區設定保留。可將截圖輸出路徑傳給腳本。

要手動操作，先用 `npm --prefix web run build:sync` 建置手機網頁，再從 `sync/` 目錄啟動 Worker。將指令中的測試 token 替換為自選的隨機值：

```sh
npx wrangler d1 migrations apply DB --local --config wrangler.dev.jsonc
npx wrangler dev --local --ip 127.0.0.1 --port 8789 --config wrangler.dev.jsonc --var LOCAL_SYNC_TOKEN:<test-token>
```

在同一台電腦開啟 `http://127.0.0.1:8789`。另以測試資料庫啟動桌面版或命令列版，測試設定檔內容為 `{"url":"http://127.0.0.1:8789","account":"personal","interval_seconds":1}`。在啟動程序的環境中將 `FAMO_SYNC_LOCAL_TOKEN` 設為同一個 token，並用 `-sync-config` 指定測試設定檔。測試模式依賴 loopback 與明確啟用的 token，正式部署使用 Cloudflare Access。

## Cloudflare 設定與部署

1. 建立 D1 資料庫，記下名稱和 database ID；準備 Cloudflare 管理的自訂網域，例如 `sync.example.com`。 [D1 入門](https://developers.cloudflare.com/d1/get-started/)
2. 在 Zero Trust 建立 Self-hosted Access 應用程式，保護該完整主機名及其所有路徑。新增只包含自己完整 email 的 **Allow** 規則，以及只包含專用 token 的 **Service Auth** 規則。記下應用程式 AUD、團隊網址和 service token 的 Client ID；Client Secret 留給 Mac 鑰匙圈。瀏覽器沿用這個應用程式的登入，Worker 驗證 JWT 的簽名、簽發者和 AUD，並將 service token 限制在同步 API。兩種身分都對應同一個內部帳號。 [Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/) [JWT 驗證](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
3. 從 `sync/` 將 `wrangler.example.jsonc` 複製為 `wrangler.local.jsonc`。填入 D1 名稱與 ID、`routes[0].pattern` 和 `ACCESS_HOST`（同一主機名），以及 `ACCESS_ISSUER`（例如 `https://your-team.cloudflareaccess.com`）、`ACCESS_AUDIENCE`、`ACCESS_EMAIL`、`ACCESS_SERVICE_CLIENT_ID` 和 `ACCESS_ACCOUNT_ID`（自選穩定識別碼，例如 `personal`）。Worker 僅服務指定主機，範本也停用 `workers.dev` 和預覽入口。 [Wrangler 設定](https://developers.cloudflare.com/workers/wrangler/configuration/)
4. 從根目錄先跑 `npm --prefix web run build:sync`。執行以下指令時，兩個步驟共用同一份設定檔和 D1：

   ```sh
   cd sync
   npx wrangler d1 migrations apply DB --remote --config wrangler.local.jsonc
   npx wrangler deploy --config wrangler.local.jsonc
   ```

5. 在 Workers 的 **Domains & Routes** 確認只有正式自訂網域啟用。用手機登入測試；以登出或另一個帳號的瀏覽器確認無法取用。同一個 service token 應只可讀寫同步 API，開啟網頁路徑會被拒絕。完成 Mac 設定後，用測試任務跑一次離線新增、手機勾選和 Mac 收到結果的流程。 [Workers 預覽入口](https://developers.cloudflare.com/workers/previews/)

CI 可從乾淨 checkout 執行 `node sync/configure-deploy.mjs` 產生同格式的 `sync/wrangler.local.jsonc`。設定 `FAMO_D1_DATABASE_ID`、`FAMO_SYNC_HOST`、`FAMO_ACCESS_ISSUER`、`FAMO_ACCESS_AUDIENCE`、`FAMO_ACCESS_EMAIL`、`FAMO_ACCESS_SERVICE_CLIENT_ID`、`FAMO_ACCESS_ACCOUNT_ID`，以及選填的 `FAMO_D1_DATABASE_NAME`。若 CI 使用 dotenv 檔，可以 `node --env-file=sync/.env.local sync/configure-deploy.mjs` 明確載入。部署步驟讓 Wrangler 從環境讀取 `CLOUDFLARE_ACCOUNT_ID` 與 `CLOUDFLARE_API_TOKEN`，後者放在 CI secret。部署用 API token 與 Mac 同步用 service token 各自獨立。

## Mac 設定與版本衝突

在 Mac 版開啟「設定 → 一般 → 跨裝置同步」，可填寫同步網址、帳號及輪詢間隔。「設定教學」列出 Cloudflare 與鑰匙圈的準備步驟。儲存會以擁有者專用的檔案權限寫入資料庫旁的 `famo-sync.json`，Access 憑證由鑰匙圈保存。

也可手動編輯同一份檔案。預設路徑為 `~/Library/Application Support/Famo/famo-sync.json`，內容如下：

```json
{
  "url": "https://sync.example.com",
  "account": "personal"
}
```

在 macOS「鑰匙圈存取」的登入鑰匙圈分別建立以下兩個一般密碼項目。兩筆的「帳號」都填設定檔的 `account`，並將範例網址換成正式同步來源。

| 鑰匙圈項目名稱 | 密碼 |
| --- | --- |
| `Famo Sync https://sync.example.com Client ID` | Cloudflare Access service token Client ID |
| `Famo Sync https://sync.example.com Client Secret` | Cloudflare Access service token Client Secret |

重啟 Famo 套用設定或更新後的鑰匙圈憑證。要暫停同步，可移開設定檔後重啟。命令列版 `famo` 需傳入 `-sync-config` 才會執行同步。

如果兩台裝置從同一版本修改任務，伺服器先接受的版本保留在遠端；Mac 保存兩個版本供選擇。用 CLI 查看兩個版本，再將所見的版本號傳給 `resolve`。請將範例的 `3`、`3` 和任務 ID 換成實際值；若遠端版本為 `null`，傳 `0`。也可用 `bin/Famo.app/Contents/MacOS/famo-desktop sync` 執行相同指令。

```sh
db="$HOME/Library/Application Support/Famo/famo.db"
./bin/famo sync status -db "$db"
./bin/famo sync resolve -db "$db" -choice local -local-version 3 -remote-version 3 <task-id>
./bin/famo sync resolve -db "$db" -choice remote -local-version 3 -remote-version 3 <task-id>
```

`status` 的 `rejections` 列出被 Worker 拒絕的任務及 HTTP 狀態碼。例如 HTTP 413 表示任務過大。在 Mac 編輯該任務並儲存即可送出新版本，其他任務會繼續同步。

Project 和 Board 共用一個集合版本，讓 Board 的篩選關聯可與 Project 一起更新。即使是修改不同的 Project 或 Board，兩台裝置從同一集合版本送出異動時，仍可能出現衝突。手機會載入最新集合並保留編輯中的表單，確認內容後可重送。Mac 會保留本機和遠端集合，任務仍繼續同步。

用 `famo sync status` 讀取 `collections.conflict`。將其中的 `local_token` 和 `remote.version` 傳給 `resolve-collections`。選 `local` 會以所見的遠端版本為基準，送出整份本機集合。選 `remote` 會採用遠端集合。

```sh
./bin/famo sync resolve-collections -db "$db" -choice local -local-token <local_token> -remote-version <remote_version>
./bin/famo sync resolve-collections -db "$db" -choice remote -local-token <local_token> -remote-version <remote_version>
```

升級時先套用 D1 migration `0002_collections.sql` 並部署更新後的 Worker，再更新 Mac。若遠端集合尚未建立，現有 Mac 的 Project 與 Board 會在第一次同步時上傳。若 Mac 和遠端各有不同資料，Mac 會保留兩份集合供選擇。

## 協定 v1

- `POST /api/sync/push` 接收 `operation_id`、`task_id`、`base_version` 和完整 `task`。新任務的 base version 為 0，其餘操作以最後讀到的版本為 base，提交版本為 base + 1。請求上限為 2 MiB，單筆任務文件上限為 1.5 MiB。重送同一個操作 ID 及內容會得到原本的 `{change:{sequence,task}}`。版本衝突回傳 HTTP 409 與 `{current}`，不新增變更或確認紀錄。
- `POST /api/sync/push-batch` 接收 `{operations:[...]}`，一次提交多筆上述操作。批次內的任務 ID 和操作 ID 各自必須唯一。整批成功時，按原請求順序回傳 `{changes:[...]}`，完整重送會取得原本的結果。版本衝突或只有部分操作已有紀錄時，整批回傳 HTTP 409。請求上限為 2,000,000 位元組，單筆任務仍適用 1.5 MiB 上限。 [D1 限制](https://developers.cloudflare.com/d1/platform/limits/)
- `GET /api/sync/pull?after=0` 依序回傳 `{changes,cursor,has_more}`，下一頁從回傳的 cursor 繼續。單頁最多 20 筆和 4 MiB 的任務內容。刪除以包含 `deleted_at` 的任務快照傳送，清空欄位代表還原。
- `GET /api/sync/collections` 讀取 `{version,projects,boards}`。用 `POST` 送出 `{operation_id,base_version,projects,boards}` 原子更新集合，衝突回傳 `409 {current}`，重送同一操作會得到原始回應。
- `X-Famo-Sync-Account` 可用來核對伺服器解析的內部帳號。Go 與 TypeScript 的共用案例見 [protocol-v1.json](../sync/protocol-v1.json)。
