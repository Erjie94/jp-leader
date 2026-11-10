const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('path')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

async function googleTranslate({ sl, tl, q }) {
  const target = new URL('https://translate.googleapis.com/translate_a/single')
  target.searchParams.set('client', 'gtx')
  target.searchParams.set('sl', sl || 'auto')
  target.searchParams.set('tl', tl || 'zh-TW')
  target.searchParams.set('q', q || '')
  const res = await fetch(`${target.toString()}&dt=t&dt=rm`)
  if (!res.ok) {
    throw new Error(`translate HTTP ${res.status}`)
  }
  return res.json()
}

ipcMain.handle('google-translate', async (_event, payload) => {
  return googleTranslate(payload ?? {})
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: '#f3eee4',
    autoHideMenuBar: true,
    title: '日習 JP Leader',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  // 與 Vite 一致：讓 WebLLM 在 Linux Electron 也能用 SharedArrayBuffer
  const { session } = require('electron')
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...(details.responseHeaders || {}) }
    headers['Cross-Origin-Opener-Policy'] = ['same-origin']
    headers['Cross-Origin-Embedder-Policy'] = ['credentialless']
    callback({ responseHeaders: headers })
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
