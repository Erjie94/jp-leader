# 日習 JP Leader

可離線／可線上的日文打字練習應用。內容為 HTML／網頁技術，可用瀏覽器開啟，也可打包成 Windows **exe** 桌面程式。

專案路徑：`D:\Desktop\JP_leader`

---

## 執行指令速查（Windows PowerShell）

本機常見兩種錯誤與解法：

| 錯誤訊息 | 原因 | 解法 |
|----------|------|------|
| 無法辨識 `npm` / `node` | PATH 未載入 | 先跑「步驟 0」 |
| 已停用指令碼執行…`npm.ps1` | PowerShell 擋 `.ps1` | **改用 `npm.cmd`**（下方皆用此寫法） |

> **建議**：在 PowerShell 一律打 `npm.cmd`，不要打 `npm`。

### 步驟 0：載入 PATH + 確認可用（必做）

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
cd D:\Desktop\JP_leader
node -v
npm.cmd -v
```

預期：

- `node` → `v26.x`
- `npm.cmd` → `11.x`

若 `npm.cmd` 仍失敗，用完整路徑：

```powershell
& "C:\Program Files\nodejs\npm.cmd" -v
```

（可選）放寬目前使用者的執行原則，之後也能直接打 `npm`：

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

---

### 一、第一次安裝依賴

```powershell
cd D:\Desktop\JP_leader
npm.cmd install
```

---

### 二、瀏覽器開發預覽（最快）

```powershell
cd D:\Desktop\JP_leader
npm.cmd run dev
```

瀏覽器開啟： [http://localhost:5173/](http://localhost:5173/)  
停止：在終端按 `Ctrl + C`

---

### 三、桌面視窗開發（Electron）

```powershell
cd D:\Desktop\JP_leader
npm.cmd run dev:app
```

會開原生視窗，內容仍是網頁 UI。  
停止：在終端按 `Ctrl + C`

---

### 四、只建置網頁版（不打包 exe）

```powershell
cd D:\Desktop\JP_leader
npm.cmd run build
npm.cmd run preview
```

`preview` 會用本機伺服器預覽 `dist/`。

---

### 五、打包 Windows exe（推薦給日常使用）

```powershell
cd D:\Desktop\JP_leader
npm.cmd run build:app
```

完成後產物在 `D:\Desktop\JP_leader\release\`：

| 檔案 | 說明 |
|------|------|
| `日習 JP Leader-0.1.0-win-x64.exe` | 免安裝 portable，雙擊即可開 |
| `win-unpacked\日習 JP Leader.exe` | 解壓版主程式 |

雙擊上述 exe 即可使用（不必再開 `npm run dev`）。

---

### 六、常用 script 一覽

| 指令 | 用途 |
|------|------|
| `npm.cmd install` | 安裝依賴 |
| `npm.cmd run dev` | 瀏覽器開發伺服器 |
| `npm.cmd run dev:app` | Electron 桌面開發 |
| `npm.cmd run build` | 建置網頁 `dist/` |
| `npm.cmd run build:app` | 建置並打包 Windows exe |
| `npm.cmd run preview` | 預覽已建置的網頁 |
| `npm.cmd run lint` | 程式碼檢查 |

---

### 七、一鍵複製（完整流程：修 PATH → 安裝 → 打包）

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
cd D:\Desktop\JP_leader
npm.cmd install
npm.cmd run build:app
```

然後開啟：

```text
D:\Desktop\JP_leader\release\日習 JP Leader-0.1.0-win-x64.exe
```

---

## 使用說明（程式內）

1. **首次開啟**：選介面語言  
2. **模型**：可在設定載入；曾下載過可自動讀取快取（供 AI 產單字）  
3. **單字／片語**：選擇題；題庫會保存並重用  

## 功能

1. 五十音練習（平／片假名、拼音）  
2. 單字練習（選擇題 + 題庫；手動／CSV／AI 產字）  
3. 片語練習（挖空選擇題）  
4. 錯題複習（簡易間隔）  
5. 設定：繁中／日文、離線 WebLLM、AI 產單字題  

## 單字 CSV 標準格式

範本檔：[`public/templates/vocab-import-template.csv`](public/templates/vocab-import-template.csv)

| 欄位 | 說明 | 範例 |
|------|------|------|
| `word` | 日文單字（必填） | 食べる |
| `reading` | 讀音假名（可空白） | たべる |
| `meaning` | 繁體中文意思（必填） | 吃 |

規則：

- 第一列必須是標題：`word,reading,meaning`
- 以逗號分隔；意思請用**繁中**（勿用英文）
- 檔案編碼為 **UTF-8（含 BOM）**，用 Excel／記事本開啟才不會亂碼
- Excel：資料 → 從文字／CSV → 選 UTF-8；或直接用「記事本」另存為 UTF-8
- 程式內「管理單字庫」可下載同一份範本

## 模型

預設／產題推薦：`gemma-2-2b-jpn-it`（日文特化，WebLLM）  
通用可選：`Qwen2.5` 1.5B／3B（非日文特化，產題可能夾雜其他語言）  
`Qwen3-1.7B` 僅建議對話／批改，不建議產題。  
五十音／單字測驗不需模型。

## 技術

Vite + React + TypeScript + Electron + IndexedDB + i18next + `@mlc-ai/web-llm`
