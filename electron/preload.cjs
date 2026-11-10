const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('jpLeaderDesktop', {
  isDesktop: true,
  platform: process.platform,
  googleTranslate: (params) => ipcRenderer.invoke('google-translate', params),
})
