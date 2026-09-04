const { NativeProgramMonitor } = require('./native-program-monitor');

let monitor = null;
let registered = false;

function attachNativeProgramMonitor({ ipcMain, app, root, window }) {
  if (monitor) monitor.destroy();
  monitor = new NativeProgramMonitor({ parent:window, root, userData:app.getPath('userData') });

  if (!registered) {
    registered = true;
    ipcMain.handle('monitor:status', async () => monitor ? monitor.status() : { available:false, reason:'No DirectorCut window.' });
    ipcMain.handle('monitor:bounds', async (_event, rect) => monitor ? monitor.setBounds(rect) : false);
    ipcMain.handle('monitor:load', async (_event, payload) => monitor ? monitor.load(payload?.project || {}, payload?.position || 0) : { ok:false, reason:'No DirectorCut window.' });
    ipcMain.handle('monitor:play', async () => monitor ? monitor.play() : false);
    ipcMain.handle('monitor:pause', async () => monitor ? monitor.pause() : false);
    ipcMain.handle('monitor:seek', async (_event, seconds) => monitor ? monitor.seek(seconds) : false);
    ipcMain.handle('monitor:position', async () => monitor ? monitor.position() : null);
    ipcMain.handle('monitor:visible', async (_event, visible) => monitor ? monitor.setVisible(visible) : false);
    ipcMain.handle('monitor:stop', async () => { if (!monitor) return true; await monitor.stop(); return true; });
  }

  // BrowserWindow parenting keeps Z-order correct, but Windows can still require
  // explicit repositioning when the owner window moves. Reapply the last renderer
  // viewport rectangle whenever the desktop window geometry changes.
  const reattach = () => {
    if (monitor?.parent === window && monitor.lastBounds && !window.isDestroyed()) monitor.setBounds(monitor.lastBounds);
  };
  window.on('move', reattach);
  window.on('resize', reattach);
  window.on('restore', () => {
    reattach();
    if (monitor?.parent === window && monitor.ready && monitor.enabled) monitor.setVisible(true);
  });
  window.on('maximize', reattach);
  window.on('unmaximize', reattach);
  window.on('minimize', () => {
    if (monitor?.parent === window) monitor.setVisible(false);
  });
  window.on('hide', () => {
    if (monitor?.parent === window) monitor.setVisible(false);
  });
  window.on('show', () => {
    reattach();
    if (monitor?.parent === window && monitor.ready && monitor.enabled) monitor.setVisible(true);
  });

  window.on('closed', () => {
    if (monitor?.parent === window) {
      monitor.destroy();
      monitor = null;
    }
  });
  return monitor;
}

module.exports = { attachNativeProgramMonitor };
