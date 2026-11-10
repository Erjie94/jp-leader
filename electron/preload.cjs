const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('jpLeaderDesktop', {
  isDesktop: true,
  platform: process.platform,
  googleTranslate: (params) => ipcRenderer.invoke('google-translate', params),
  readLibrary: () => ipcRenderer.invoke('library-read'),
  writeLibrary: (data) => ipcRenderer.invoke('library-write', data),
  getLibraryPath: () => ipcRenderer.invoke('library-path'),
})
