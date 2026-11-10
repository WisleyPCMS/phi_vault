# PHI VAULT

公開的 Phigros 成績庫，個人成績由遊戲帳號名和自訂網站密碼保護。

- B27 + φ3、前六筆 Overflow、RKS 四位小數。
- 最佳分數與 ACC 分別保留，FC/AP、課題模式與彩色牌子。
- 搜尋曲目、自訂譜面、上傳個人曲繪、PNG 成績圖、JSON/CSV 匯出和 JSON 合併還原。
- 327 首曲目 / 1,037 張譜面的內建資料快照；曲繪在 `public/illustrations`，曲目、難度和定數在 `data/catalog.json`。

## 技術和儲存

Next.js App Router / React / TypeScript，部署到 Vercel。

- 帳號、密碼雜湊、工作階段、成績、課題、自訂譜面和曲繪索引：Turso/libSQL。
- 個人上傳曲繪：private Vercel Blob，透過登入後的 API 取得。
- 密碼使用 PBKDF2-SHA256（600,000 次）及隨機 salt；只儲存工作階段 token 的 SHA256 雜湊。
- HttpOnly / SameSite 登入 cookie 有效 24 小時。登出撤銷目前工作階段，修改密碼撤銷該帳號所有工作階段。
- 所有成績查詢均限制在已登入帳號；備份不含密碼或 token。

網站帳號與 Phigros 官方帳號獨立，無法驗證你是否擁有同名遊戲帳號。

## 本機

使用 Node.js 22.13+，執行 `npm ci`，建立 `.env.local`：

```dotenv
PHI_LOCAL_STORAGE=1
TURSO_DATABASE_URL=file:.data/vault.db
```

執行 `npm run dev`，開啟 <http://127.0.0.1:3002>。
本機測試資料在 `.data`，不會提交或部署。本機模式在 Vercel 一律停用，不會以暫存磁碟代替雲端資料庫。

```sh
npm test
npm run build
# 先以本機儲存模式啟動 npm start，再執行：
npm run test:integration
node tests/public-auth.mjs
```

## Vercel 網頁介面發布

1. 將此資料夾的原始碼放到自己的 Git 儲存庫；不提交 `.env.local`、`.data`、`.vercel` 或 `node_modules`。
2. 在 Vercel 網頁介面匯入該儲存庫，框架選 Next.js，根目錄選本專案。
3. 在專案 Storage 頁面，連接 Turso Cloud 的免費 Starter 資料庫。確認 Production 環境已有 `TURSO_DATABASE_URL` 和 `TURSO_AUTH_TOKEN`。
4. 同一頁面建立 **private** Vercel Blob 並連接專案。確認已有 `BLOB_READ_WRITE_TOKEN`（或支援 OIDC 的 `BLOB_STORE_ID`）。
5. 在 Deployments 頁面執行 Deploy / Redeploy。資料表會自動以冪等方式建立。
6. 正式網站的 Deployment Protection 應允許公開瀏覽；成績由本站帳號密碼保護。

只將憑證放在伺服器環境變數，勿使用 `NEXT_PUBLIC_*`。不要在 Vercel 設定 `PHI_LOCAL_STORAGE`。

`vercel.json` 將函式設為香港區域；Turso 可選鄰近的東京區域。

## 地區與外部資源

這個版本的訪客登入、成績 API、曲繪和圖片匯出均不使用 ChatGPT 或 OpenAI 服務。數字及英文字體隨網站提供；中文字使用裝置內建字體。執行時不需要連線 Google Fonts。

獨立託管可移除對 ChatGPT 訪問條件的依賴，但無法保證所有地區、所有網絡都能連線。若需中國內地使用，Vercel 官方建議自訂網域及自行託管資源，同時明確表示無法保證內地可用性：<https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china>。

## 舊網站資料

舊私人網站與此公開網站是不同資料庫。先在舊網站「帳號與資料 → 完整成績備份」匯出 JSON；在新網站建立自己的帳號後，選「從備份還原」合併成績。分數、ACC、FC/AP、自訂譜面和課題一同還原；個人曲繪需要重新上傳。

## 資料來源

曲目和內建曲繪：[Phigros Resource](https://github.com/7aGiven/Phigros_Resource)。曲繪版權屬於各原作者。
RKS 參考：[phi-plugin](https://github.com/Catrong/phi-plugin/blob/main/model/game/fCompute.js)。本網站為非官方玩家工具。

Barlow Condensed 字體：[Google Fonts 原始碼](https://github.com/google/fonts/tree/main/ofl/barlowcondensed)，授權見 `public/fonts/OFL.txt`。
