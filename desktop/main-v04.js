const path = require('path');
const { app, ipcMain } = require('electron');
const { attachNativeProgramMonitor } = require('./native-monitor-ipc');

const ROOT = path.resolve(__dirname, '..');
let attachedMainWindow = null;

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
