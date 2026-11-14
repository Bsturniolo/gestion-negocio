const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  saveBackup: (json) => ipcRenderer.invoke('backup:save', json),
  openBackups: () => ipcRenderer.invoke('backup:open'),
});
