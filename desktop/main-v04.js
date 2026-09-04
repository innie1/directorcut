const path = require('path');
const { app, ipcMain } = require('electron');
const { attachNativeProgramMonitor } = require('./native-monitor-ipc');

const ROOT = path.resolve(__dirname, '..');

// Register before main.js creates its BrowserWindow. This keeps the stable desktop
// host untouched while v0.4 attaches the native GES Program Monitor to each window.
app.on('browser-window-created', (_event, window) => {
  attachNativeProgramMonitor({ ipcMain, app, root:ROOT, window });
});

require('./main');
