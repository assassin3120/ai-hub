const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hub', {
  listConnectors: () => ipcRenderer.invoke('connectors:list'),
  route: (prompt) => ipcRenderer.invoke('router:route', prompt),
  runCli: (id, prompt, runId) => ipcRenderer.send('cli:run', { id, prompt, runId }),
  onCliEvent: (fn) => ipcRenderer.on('cli:event', (_e, ev) => fn(ev)),
});
