const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const UI = path.join(ROOT, 'prototype', 'index.html');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#090a0d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadFile(UI);
}

const { runProcess, probeMedia, renderCuts, wordsToSrt } = require('./media-utils');

function skillContext() {
  const skillDir = path.join(ROOT, 'skills');
  if (!fs.existsSync(skillDir)) return '';
  return fs.readdirSync(skillDir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => `# ${f}\n${fs.readFileSync(path.join(skillDir, f), 'utf8')}`)
    .join('\n\n');
}

ipcMain.handle('media:pick', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4','mov','mkv','webm','m4v','avi'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return probeMedia(r.filePaths[0]);
});

ipcMain.handle('script:pick', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Script', extensions: ['txt','md'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return { path: r.filePaths[0], name: path.basename(r.filePaths[0]), text: fs.readFileSync(r.filePaths[0], 'utf8') };
});

ipcMain.handle('project:open', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'DirectorCut Project', extensions: ['directorcut','json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
});

ipcMain.handle('project:save', async (_e, project) => {
  const defaultName = `${(project.name || 'untitled').replace(/[^a-z0-9-_]+/gi,'-')}.directorcut`;
  const r = await dialog.showSaveDialog({ defaultPath: defaultName, filters: [{ name: 'DirectorCut Project', extensions: ['directorcut'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, JSON.stringify(project, null, 2), 'utf8');
  return { path: r.filePath };
});

ipcMain.handle('video:export', async (_e, project) => {
  const r = await dialog.showSaveDialog({ defaultPath: `${project.name || 'directorcut-export'}.mp4`, filters: [{ name: 'MP4 Video', extensions: ['mp4'] }] });
  if (r.canceled || !r.filePath) return null;
  return renderCuts({ sourcePath: project.media?.path, duration: Number(project.media?.duration || 0), removeRanges: project.removeRanges || [], outputPath: r.filePath });
});

ipcMain.handle('subtitle:export', async (_e, project) => {
  if (!project.transcript?.words?.length) throw new Error('No word-timestamp transcript is loaded.');
  const r = await dialog.showSaveDialog({ defaultPath: `${project.name || 'captions'}.srt`, filters: [{ name: 'SubRip Captions', extensions: ['srt'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, wordsToSrt(project.transcript.words), 'utf8');
  return { path: r.filePath };
});

ipcMain.handle('transcribe:run', async (_e, { mediaPath, model }) => {
  if (!mediaPath) throw new Error('Load a video first.');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'directorcut-transcript-'));
  const out = path.join(temp, 'transcript.json');
  const py = process.platform === 'win32' ? 'python' : 'python3';
  try {
    await runProcess(py, [path.join(ROOT, 'scripts', 'transcribe_local.py'), mediaPath, '--model', model || 'small', '-o', out]);
    return JSON.parse(fs.readFileSync(out, 'utf8'));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

ipcMain.handle('director:ask', async (_e, payload) => {
  const endpoint = process.env.DIRECTORCUT_LLM_URL || 'http://127.0.0.1:8080/v1/chat/completions';
  const system = `You are DirectorCut Director, an expert professional video editor. You operate a typed, undoable timeline. Be concise. When proposing edits, explain the creative reason and prefer the smallest reversible change. Do not claim an edit happened unless the caller says it was applied.\n\nInstalled skills:\n${skillContext()}`;
  const body = {
    model: process.env.DIRECTORCUT_LLM_MODEL || 'local-model',
    temperature: 0.4,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(payload) }
    ]
  };
  try {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
    if (!res.ok) throw new Error(`Local model HTTP ${res.status}`);
    const json = await res.json();
    return { available: true, text: json.choices?.[0]?.message?.content || 'No response from local Director model.' };
  } catch (error) {
    return { available: false, error: String(error.message || error) };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
