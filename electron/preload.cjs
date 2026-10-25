const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('medalHive', {
  invoke: (method, payload, token) => ipcRenderer.invoke('medalhive:request', { method, payload, token }),
});
