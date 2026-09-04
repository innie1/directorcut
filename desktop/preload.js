const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('directorcut', {
  desktop: true,
  pickMedia: () => ipcRenderer.invoke('media:pick'),
  pickAttachments: () => ipcRenderer.invoke('attachment:pick'),
  pickScript: () => ipcRenderer.invoke('script:pick'),
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: project => ipcRenderer.invoke('project:save', project),
  autosaveProject: project => ipcRenderer.invoke('project:autosave', project),
  readAutosave: () => ipcRenderer.invoke('project:autosave-read'),
  clearAutosave: () => ipcRenderer.invoke('project:autosave-clear'),
  exportVideo: project => ipcRenderer.invoke('video:export', project),
  exportSrt: project => ipcRenderer.invoke('subtitle:export', project),
  prepareMedia: (media, proxy = false) => ipcRenderer.invoke('media:prepare', { media, proxy }),
  transcribe: (mediaPath, model = 'small') => ipcRenderer.invoke('transcribe:run', { mediaPath, model }),
  localAIStatus: () => ipcRenderer.invoke('ai:status'),
  warmModel: model => ipcRenderer.invoke('ai:warm', model),
  askDirector: payload => ipcRenderer.invoke('director:ask', payload)
});
