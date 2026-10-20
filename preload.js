const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hub', {
  listConnectors: () => ipcRenderer.invoke('connectors:list'),
  route: (prompt) => ipcRenderer.invoke('router:route', prompt),
  runCli: (id, prompt, runId, via, display) => ipcRenderer.send('cli:run', { id, prompt, runId, via, display }),
  onCliEvent: (fn) => ipcRenderer.on('cli:event', (_e, ev) => fn(ev)),
  onRunStart: (fn) => ipcRenderer.on('run:start', (_e, ev) => fn(ev)),
  startOrchestra: (request, orchId, display) => ipcRenderer.send('orch:start', { request, orchId, display }),
  onOrchEvent: (fn) => ipcRenderer.on('orch:event', (_e, ev) => fn(ev)),
  invoices: {
    list: () => ipcRenderer.invoke('invoice:list'),
    save: (inv) => ipcRenderer.invoke('invoice:save', inv),
    remove: (id) => ipcRenderer.invoke('invoice:remove', id),
    nextNumber: (date) => ipcRenderer.invoke('invoice:nextNumber', date),
    draft: (memo) => ipcRenderer.invoke('invoice:draft', memo),
    pdf: (inv) => ipcRenderer.invoke('invoice:pdf', inv),
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  pickFolder: () => ipcRenderer.invoke('settings:pickFolder'),
  importHistory: () => ipcRenderer.invoke('obsidian:import'),
  openInObsidian: (file) => ipcRenderer.invoke('obsidian:open', file),
});
