const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('directorcut', {
  desktop: true,
  pickMedia: () => ipcRenderer.invoke('media:pick'),
  pickScript: () => ipcRenderer.invoke('script:pick'),
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (project) => ipcRenderer.invoke('project:save', project),
  exportVideo: (project) => ipcRenderer.invoke('video:export', project),
  exportSrt: (project) => ipcRenderer.invoke('subtitle:export', project),
  transcribe: (mediaPath, model = 'small') => ipcRenderer.invoke('transcribe:run', { mediaPath, model }),
  askDirector: (payload) => ipcRenderer.invoke('director:ask', payload)
});
