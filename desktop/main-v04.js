const fs = require('fs');
const path = require('path');
const { app, ipcMain, shell, dialog } = require('electron');
const { attachNativeProgramMonitor } = require('./native-monitor-ipc');
const { attachHomeHistory } = require('./home-history');
const { renderCuts, wordsToSrt } = require('./media-utils');
const { renderTimelineProject } = require('./timeline-renderer-stage4');
const { analyzeFootage } = require('./footage-intelligence');
const CE = require('../prototype/caption-editor-utils');

const ROOT = path.resolve(__dirname, '..');
let attachedMainWindow = null;

attachHomeHistory({ ipcMain, app, shell, dialog });

// Register before main.js creates its BrowserWindow. Only the first top-level
// DirectorCut window receives the native monitor. The monitor's own child surface
// is also a BrowserWindow and must never recursively attach another monitor.
app.on('browser-window-created', (_event, window) => {
  if (attachedMainWindow && !attachedMainWindow.isDestroyed()) return;
  attachedMainWindow = window;
  attachNativeProgramMonitor({ ipcMain, app, root:ROOT, window });
  window.once('closed', () => {
    if (attachedMainWindow === window) attachedMainWindow = null;
  });
});

require('./main');

ipcMain.handle('lut:pick', async () => {
  const result = await dialog.showOpenDialog({
    title:'Choose a color LUT',
    properties:['openFile'],
    filters:[
      { name:'3D LUT', extensions:['cube','3dl','dat','m3d'] },
      { name:'All files', extensions:['*'] }
    ]
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  return { path:path.resolve(result.filePaths[0]) };
});

ipcMain.handle('media:analyze', async (_event, payload = {}) => {
  const sourcePath = payload?.sourcePath || payload?.path;
  if (!sourcePath) throw new Error('Choose a local media file before running footage analysis.');
  return analyzeFootage({
    sourcePath,
    sceneThreshold:payload.sceneThreshold ?? .30,
    noiseDb:payload.noiseDb ?? -35,
    minSilence:payload.minSilence ?? .35,
    maxQualitySamples:payload.maxQualitySamples ?? 32,
    sampleSize:payload.sampleSize ?? 16
  });
});

// main.js provides the base application handlers. Stage 4 replaces only export
// handlers so edited caption clips become the source of truth for both MP4 and SRT.
ipcMain.removeHandler('video:export');
ipcMain.handle('video:export', async (_event, project) => {
  const result = await dialog.showSaveDialog({ defaultPath:`${project?.name || 'directorcut-export'}.mp4`, filters:[{ name:'MP4 Video', extensions:['mp4'] }] });
  if (result.canceled || !result.filePath) return null;
  const renderable = project?.timeline?.tracks?.some(track => track.kind === 'video' && !track.hidden && (track.clips || []).some(clip => clip.sourcePath && Number(clip.duration) > 0));
  if (renderable) return renderTimelineProject({ project, outputPath:result.filePath });
  return renderCuts({ sourcePath:project?.media?.path, duration:Number(project?.media?.duration || 0), removeRanges:project?.removeRanges || [], outputPath:result.filePath, frameRate:project?.media?.frameRate || project?.timeline?.fps || 30 });
});

ipcMain.removeHandler('subtitle:export');
ipcMain.handle('subtitle:export', async (_event, project) => {
  const edited = CE.srtFromTimeline(project?.timeline || {});
  const fallback = project?.transcript?.words?.length ? wordsToSrt(project.transcript.words) : '';
  const srt = edited.trim() ? edited : fallback;
  if (!srt.trim()) throw new Error('No caption clips or word-timestamp transcript is loaded.');
  const result = await dialog.showSaveDialog({ defaultPath:`${project?.name || 'captions'}.srt`, filters:[{ name:'SubRip Captions', extensions:['srt'] }] });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, srt, 'utf8');
  return { path:result.filePath, source:edited.trim() ? 'timeline-captions' : 'transcript' };
});
