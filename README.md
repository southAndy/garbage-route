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

每次執行仍會檢查官方檔案；若兩個來源的 checksum 都沒有變化，會直接沿用現有 JSON，不重新解析或改寫。之後可將 `npm run sync:data` 接到 cron、GitHub Actions 或部署平台排程。

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
