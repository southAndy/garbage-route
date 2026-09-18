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
