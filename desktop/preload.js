const { contextBridge, ipcRenderer } = require('electron');

async function saveProject(project) {
  const result = await ipcRenderer.invoke('project:save', project);
  if (result?.path) {
    await ipcRenderer.invoke('home:remember-project', {
      path:result.path,
      name:project?.name || 'Untitled Project',
      duration:project?.duration || project?.media?.duration || 0
    });
  }
  return result;
}

async function exportVideo(project) {
  const result = await ipcRenderer.invoke('video:export', project);
  const outputPath = result?.outputPath || result?.path;
  if (outputPath) {
    await ipcRenderer.invoke('home:remember-export', {
      path:outputPath,
      name:project?.name || 'DirectorCut export',
      duration:project?.duration || project?.media?.duration || 0
    });
  }
  return result;
}

contextBridge.exposeInMainWorld('directorcut', {
  desktop: true,
  pickMedia: () => ipcRenderer.invoke('media:pick'),
  pickManyMedia: () => ipcRenderer.invoke('media:pick-many'),
  pickAttachments: () => ipcRenderer.invoke('attachment:pick'),
  pickScript: () => ipcRenderer.invoke('script:pick'),
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject,
  autosaveProject: project => ipcRenderer.invoke('project:autosave', project),
  readAutosave: () => ipcRenderer.invoke('project:autosave-read'),
  clearAutosave: () => ipcRenderer.invoke('project:autosave-clear'),
  exportVideo,
  exportSrt: project => ipcRenderer.invoke('subtitle:export', project),
  prepareMedia: (media, proxy = false) => ipcRenderer.invoke('media:prepare', { media, proxy }),
  transcribe: (mediaPath, model = 'small') => ipcRenderer.invoke('transcribe:run', { mediaPath, model }),
  localAIStatus: () => ipcRenderer.invoke('ai:status'),
  warmModel: model => ipcRenderer.invoke('ai:warm', model),
  askDirector: payload => ipcRenderer.invoke('director:ask', payload),

  homeRecent: () => ipcRenderer.invoke('home:recent'),
  homeChooseProject: () => ipcRenderer.invoke('home:choose-project'),
  homeOpenProject: filePath => ipcRenderer.invoke('home:open-project', filePath),
  homeOpenExport: filePath => ipcRenderer.invoke('home:open-export', filePath),
  rememberProject: entry => ipcRenderer.invoke('home:remember-project', entry),
  rememberExport: entry => ipcRenderer.invoke('home:remember-export', entry),

  programMonitorStatus: () => ipcRenderer.invoke('monitor:status'),
  programMonitorBounds: rect => ipcRenderer.invoke('monitor:bounds', rect),
  programMonitorLoad: (project, position = 0) => ipcRenderer.invoke('monitor:load', { project, position }),
  programMonitorPlay: () => ipcRenderer.invoke('monitor:play'),
  programMonitorPause: () => ipcRenderer.invoke('monitor:pause'),
  programMonitorSeek: seconds => ipcRenderer.invoke('monitor:seek', seconds),
  programMonitorPosition: () => ipcRenderer.invoke('monitor:position'),
  programMonitorVisible: visible => ipcRenderer.invoke('monitor:visible', visible),
  programMonitorStop: () => ipcRenderer.invoke('monitor:stop')
});
