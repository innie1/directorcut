const path = require('path');
const { app, ipcMain, shell, dialog } = require('electron');
const { attachNativeProgramMonitor } = require('./native-monitor-ipc');
const { attachHomeHistory } = require('./home-history');

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
