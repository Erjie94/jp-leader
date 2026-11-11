# AI 接手備忘：個人主機＋Cloudflare Tunnel

給下一任 AI／工程師閱讀。產品名：**日習 JP Leader**。倉庫路徑常見為 `D:\Desktop\JP_leader`（或使用者當下 clone 路徑）。

---

## 1. 已鎖定的產品決策（勿擅自改方案）

| 項目 | 決定 |
|------|------|
| 題庫共用方式 | **自動同步**；**不接受**以手動匯出／匯入當主流程 |
| 連線方式 | Chromebook **只開瀏覽器**；優先 **Cloudflare Tunnel**（一般 `https://…`），**不要**改成必須裝 Tailscale／VPN |
| 資料所在 | **另一台 Windows「驅動主機」**上的 `data/library.json`；**不是**目前開發機當唯一來源 |
| 開發機角色 | 可選：設定頁填主機 HTTPS＋Token，把本機 Electron／`npm run dev` 指到驅動主機 |
| 主機關機 | **接受**無法同步（不做 Cloudflare Pages＋KV 當主方案） |
| Chromebook 模型 | 預設 **不**自動載入本機 WebLLM（省電）；練習可不開模型，產題回有模型的電腦 |
| 衝突策略 | last-write-wins＋依 `id` merge（見 `src/lib/library-merge.ts`） |
| API 安全 | 公開 Tunnel 網址必須靠 `Authorization: Bearer <LIBRARY_TOKEN>` |

**明確不做（除非使用者重新決策）：**

- 以 Cloudflare Pages Functions＋KV 當題庫主儲存
- 以家裡「目前這台開發 PC」當常駐驅動主機（驅動主機＝**其他** Windows 裝置）
- 要求 Chromebook 安裝桌面 App／VPN 才能用

---

## 2. 使用者環境假設

- **Chromebook**：只能用瀏覽器；要個人 HTTPS 網址；要與 Windows 共用單字／片語／短文／題庫。
- **驅動主機**：另一台 **Windows**，會安裝 Node、跑 `npm run host`、跑 `cloudflared`。
- **目前開發機**：可寫程式／測功能；可選填遠端主機 URL 同步。
- 帳號：需 Cloudflare（Tunnel）；GitHub 可有 `Erjie94/jp-leader`。真實 token **禁止 commit**。

---

## 3. 架構（現況）

```
Chromebook 瀏覽器 ──HTTPS──► Cloudflare Tunnel ──► Windows 驅動主機
                                                    │
                                         node server/host.mjs
                                         :8787 (僅 127.0.0.1)
                                         ├─ 靜態 dist/
                                         └─ GET/PUT /api/library
                                              → data/library.json
```

前端後端探測順序（`src/lib/library-io.ts`）：

1. **host**：設定了 `hostBaseUrl`＋`hostToken` → 打遠端 `/api/library`＋Bearer；寫入前 merge  
2. **api**：同源相對 `/api/library`（開 Tunnel 網址或本機 Vite）；有 `hostToken` 也帶 Bearer  
3. **electron** IPC  
4. **idb-fallback**

本機開發（無 token）：Vite 中介層仍提供無驗證的 `/api/library` → 專案 `data/library.json`。  
驅動主機：`server/host.mjs` **強制** Bearer；未設 `LIBRARY_TOKEN` 則 API 503。

---

## 4. 已實作檔案（程式面大致完成）

| 路徑 | 用途 |
|------|------|
| `server/host.mjs` | 常駐：靜態＋題庫 API＋CORS＋Bearer |
| `.env.host.example` | `PORT`／`LIBRARY_TOKEN`／`LIBRARY_PATH` 範本 |
| `docs/cloudflared-config.example.yml` | Tunnel 設定範本 |
| `src/lib/library-io.ts` | host／api 同步、`testHostSync`、`resetLibraryBackendCache` |
| `src/lib/library-merge.ts` | 雙端 id merge |
| `src/lib/settings.ts` | `hostBaseUrl`／`hostToken`；低功耗預設 `autoLoadModel` |
| `src/lib/device.ts` | CrOS／觸控小螢幕 → 低功耗 |
| `src/pages/Settings.tsx` | 「個人主機／題庫同步」UI＋省電提示 |
| `src/i18n/locales/zh-TW.json`、`ja.json` | `host.*`、`settings.lowPowerModelHint` |
| `package.json` | `host`、`host:build` |
| `.gitignore` | 含 `.env.host` |
| `README.md` | 使用者操作步驟 |
| 測試 | `library-host.test.ts`、`library-merge.test.ts`、`device.test.ts` |

驗證過（本機）：`npm run test`；`npm run build`；host GET 200／無 token 401／PUT 200；靜態 `/` 200。  
**注意：** 用 curl PUT 測 API 時勿用空／測試 payload 覆寫真實 `data/library.json`；測完用 git 還原。

---

## 5. 仍須「人類／下一 AI 在驅動主機上」完成的事

程式多半已備妥；**上線仍缺現場佈署**（下一 AI 若協助，應引導使用者在**驅動主機**操作，勿假設目前開發機就是主機）：

1. 在驅動主機取得專案＋`npm.cmd install`  
2. `copy .env.host.example .env.host`，設 **≥32 字元** 隨機 `LIBRARY_TOKEN`（勿提交）  
3. `npm.cmd run host:build`（或 build 後 `npm.cmd run host`）  
4. 安裝並設定 **cloudflared**，hostname → `http://127.0.0.1:8787`（見 `docs/cloudflared-config.example.yml`）  
5. （建議）工作排程器開機啟動 host＋tunnel  
6. Chromebook 開 HTTPS 網址 → 設定只填 **Token**（網址可空）→ 測試連線  
7. （可選）開發機設定頁填 Tunnel HTTPS＋同一 Token  

成功標準：裝置 A 新增單字 → 裝置 B 重新整理／稍候可見；Chromebook 不自動下載 WebLLM。

---

## 6. 關鍵指令

```powershell
# 開發機日常
npm.cmd run dev
npm.cmd run test
npm.cmd run build

# 驅動主機常駐
copy .env.host.example .env.host   # 首次
npm.cmd run host:build             # 含 build
# 或
npm.cmd run host                   # 需已有 dist/

# 驗證 API（主機本機）
curl.exe -s -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:8787/api/library
```

Windows PowerShell 請優先用 `npm.cmd`，避免 `npm.ps1` 執行原則問題。

---

## 7. 給下一 AI 的行為約束

- 使用者規則：回覆用**繁體中文**；未要求勿亂 commit／push；勿改 git config。  
- 勿編輯「使用者未要求」的 markdown；**本檔與個人主機說明相關的更新除外**。  
- 改同步／託管前先對齊第 1 節；若要改回雲端 KV 或 Tailscale，**先問使用者**。  
- Token、`.env.host`、真實 Tunnel 憑證：**不寫進 repo、不貼完整密鑰到對話紀錄以外的公開檔**。  
- 設定鍵名是 `hostBaseUrl`／`hostToken`（不是舊計畫裡的 `syncBaseUrl`／`syncToken`）。  
- 計畫檔若在 `~/.cursor/plans/`：使用者說「不要改計畫檔」時就不要改。

---

## 8. 相關文件

- 使用者步驟摘要：`README.md`「個人主機＋Cloudflare Tunnel」  
- Tunnel 範本：`docs/cloudflared-config.example.yml`  
- 環境變數範本：`.env.host.example`  

若對話摘要與本檔衝突：**以本檔第 1～3 節為準**。
