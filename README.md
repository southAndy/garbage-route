# 清運地圖｜雙北垃圾車表定路線

以 Next.js、TypeScript 與 MapLibre GL JS 實作的 MVP。介面一次顯示一條路線，路線折線代表官方停靠點順序，不代表實際道路軌跡。

> 本資料為政府公布的表定資訊，並非垃圾車即時位置；實際清運狀況與座標可能不同。

## 本機執行

```bash
npm install
cp .env.example .env.local
npm run dev
```

開啟 `http://localhost:3000`。專案目前附有 2026-08-02 從雙北官方端點成功同步的 Last Known Good 快照，官方來源暫時失效時仍能測試與查詢完整 UI。

## 使用者回饋（Tally＋Google Sheets）

網站已提供頁首「意見回饋」、停靠點卡片「回報此站資訊」及查無路線時的回饋入口。點擊後才載入 Tally 表單，關閉視窗可繼續原本的查詢；若嵌入無法顯示，可另開分頁。未設定有效網址時不顯示入口。

1. 在 [Tally](https://tally.so) 建立一份表單，標題可用「清運地圖使用回饋」。建議題目：
   - 回饋類型（必填）：時間、地圖位置、地址／站名、清運日、操作問題、功能建議、其他。
   - 補充說明（選填；選「其他」時可設必填）。
   - 發生日期、實際觀察（選填；可用條件邏輯在選「時間」時顯示）。
   - 聯絡信箱（選填，說明僅供追問回饋內容）。
2. 輸入 `/hidden`，建立下列同名隱藏欄位。不同入口只傳送相關欄位：

   | 欄位 | 內容 |
   | --- | --- |
   | `entry` | `general`、`stop`、`empty_search` 或 `stop_outcome` |
   | `outcome` | 站點查詢回饋：`found`（有找到）或 `not_found`（還沒找到） |
   | `city` | 城市代碼 |
   | `district` | 行政區 |
   | `route_id` | 路線 ID |
   | `stop_id` | 停靠點 ID |
   | `source_synced_at` | 回報時顯示的資料同步時間 |
   | `query` | 查無結果的搜尋關鍵字 |

3. 設定送出成功訊息：「已收到，謝謝你協助改善清運資訊。回報將供資料核對參考，不會立即變更官方時刻。」不要設定送出後自動跳離網站。
4. 發布表單，將 Share 中的 `https://tally.so/r/表單ID` 填入 `.env.local` 的 `NEXT_PUBLIC_TALLY_FORM_URL`。正式環境也要設定此變數並重新建置部署；本機需重新啟動開發伺服器。此網址是公開設定，不是 API 密鑰。
5. 在 Tally 的 **Integrations → Google Sheets → Connect** 連接自己的 Google 帳號與試算表。可新增「處理狀態」「處理備註」欄位，初期使用待確認／處理中／已完成。
6. 分別從三個入口提交測試回饋，確認 Tally 與試算表都有收到，站點 ID、搜尋關鍵字及來源入口正確；測試手機開關視窗、鍵盤操作和另開分頁。

手機完整站點卡另提供「有找到／還沒找到」。兩種選擇皆開啟 Tally，只有使用者送出表單才會產生回覆；按鈕點擊不代表提交成功。必須在現有 Tally 表單新增 `outcome` 隱藏欄位並重新發布。建議使用條件邏輯：`entry = stop_outcome` 且 `outcome = found` 時隱藏必填的問題類型，讓使用者能直接送出；`not_found` 時提供地點不符、資訊不足、操作問題等選項。保留一般回報原有題目。分別提交兩種測試回覆，確認 `entry`、`outcome`、`stop_id` 正確；關閉未送出的表單不應新增回覆。這只能分析自願送出者的回答，不能當成全體訪客成功率。

隱藏欄位只提供問題情境，不是身分驗證，也不能直接用來修改官方資料。一般回饋不會自動附上搜尋歷史或定位；查無結果入口僅傳送當次關鍵字。網站目前不代建 Tally 表單，也不代授權 Google 帳號；必須完成以上設定才可實際收件。

參考：[Tally 隱藏欄位](https://tally.so/help/hidden-fields)、[嵌入表單](https://tally.so/help/embed-your-form)、[Google Sheets 串接](https://tally.so/help/google-sheets-integration)。

## 同步官方資料

```bash
npm run sync:data
```

同步程式會下載兩市完整 CSV、正規化時間與座標、依官方規則分組排序，品質檢查通過後才原子性更新應用資料；失敗時保留現有 Last Known Good。來源網址可由 `.env` 覆寫。

同步結果會寫入：

- `data/routes.json`：完整正規化路線、停靠點、地址、座標與時間。
- `data/manifest.json`：Schema 版本、同步時間、來源 checksum、ETag、路線／站點／行政區數量。

每次執行都會下載檢查兩市官方檔案；若來源網址與 checksum 都沒有變化，沿用既有路線及座標品質報告，只更新 `manifest.json` 的 `lastCheckedAt`。路線頁分別顯示「官方更新」「資料同步」「最後成功檢查」，不會把檢查日期當成來源資料更新日期。下載或資料品質檢查失敗時，不更新成功檢查時間。

## 路線頁的完整清運資訊

每條路線在地圖及站點時間軸下方，直接輸出所有站點的地址、抵達／離開時間、一般垃圾／資源回收／廚餘清運星期及備註。這些文字包含在初始 HTML，無須點選站點或載入地圖。沒有提供的欄位會標示未提供，不推測清運日；表定時間仍可能因假日或臨時公告調整。

## 每日同步與 Vercel 部署

`.github/workflows/sync-data.yml` 每天 **台北時間 05:23（UTC 21:23）** 排程執行，也支援 GitHub Actions 的 **Run workflow** 手動執行。GitHub 排程可能延遲，並非準點保證。

流程：下載兩市資料 → 品質檢查 → 測試與 lint → 正式建置 → 提交資料與檢查時間 → 呼叫 Vercel Deploy Hook。任一步驟失敗都會停止，下載或品質檢查失敗不會提交資料或觸發部署。來源內容沒變時仍會部署，讓網站顯示最新的成功檢查時間；sitemap 的路線 `lastModified` 仍使用資料同步時間。

啟用一次即可：

1. 在 Vercel 專案 **Settings → Git → Deploy Hooks** 建立 `daily-data-sync`，選擇正式分支 `main`。
2. 在 GitHub repository **Settings → Secrets and variables → Actions → New repository secret** 新增 `VERCEL_DEPLOY_HOOK`，值為剛產生的完整 Hook URL。不要把 URL 寫進程式碼或公開日誌。
3. 將 workflow 與程式碼推送至 repository 預設分支（目前為 `main`）。Vercel 正式分支與 Hook 分支必須和它一致；分支規則須允許此工作流程提交 `data/` 更新。
4. 到 **Actions → Sync official garbage routes → Run workflow** 執行一次，確認所有步驟成功，再到 Vercel 確認部署為 Ready，抽查路線頁的「最後成功檢查」。Hook 請求成功只代表部署已受理，不代表建置已完成。

未設定 secret 時，工作流程會在修改資料前明確失敗。若同步期間有人推送新提交，資料 push 會安全失敗而不覆蓋遠端；重新執行即可。若 Hook 或部署失敗，修正後重新執行 workflow。Git 整合也可能因資料提交觸發部署，請以 Vercel 最新的 Ready 部署為準。

GitHub 公開 repository 長期沒有活動時可能停用排程；請定期確認 Actions 紀錄及失敗通知。排程／建置不會自動讀取本機 `.env`；若要改用其他官方來源 URL，可在 workflow 的同步步驟設定對應環境變數。

參考：[Vercel Deploy Hooks](https://vercel.com/docs/deploy-hooks)、[GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。

## 可疑座標清單

```bash
npm run audit:coordinates
```

掃描器會找出「同時遠離前後站、但前後站彼此接近」的孤立座標，以及超過 10 公里的相鄰站區段，並將待人工確認項目寫入 `data/suspicious-coordinates.json`。已知但未達自動門檻的項目可加入 `data/coordinate-flags.json`，重新掃描與同步時會一併保留。清單只標示可疑資料，不會自行修改官方座標；一般地圖會以黃色問號標記相關站點，並以橘色虛線保留可疑的原始連線。

預設底圖使用免 API Key 的 OpenFreeMap Liberty 向量樣式，資料來自 OpenStreetMap；可透過 `NEXT_PUBLIC_MAP_STYLE_URL` 替換成 MapTiler、Stadia Maps 或自架 MapLibre 樣式。正式上線前仍應依預估流量重新確認圖磚服務條款與可用性需求。

## API

- `GET /api/v1/cities`
- `GET /api/v1/districts?city=TPE`
- `GET /api/v1/routes?city=TPE&district=士林區&q=天母`
- `GET /api/v1/routes/:routeId`

## 驗證

```bash
npm test
npm run lint
npm run build
```

## 授權與資料來源

本專案自行撰寫的程式碼採 [MIT License](./LICENSE) 開源。政府路線資料、OpenStreetMap 地圖資料及第三方服務維持各自的原始授權，不包含在 MIT 授權範圍內。

完整顯名、來源與免責說明請參閱 [NOTICE.md](./NOTICE.md)。
