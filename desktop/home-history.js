const fs = require('fs');
const path = require('path');

function attachHomeHistory({ ipcMain, app, shell, dialog }) {
  const historyPath = () => path.join(app.getPath('userData'), 'home-history.json');

  function readHistory() {
    try {
      const raw = JSON.parse(fs.readFileSync(historyPath(), 'utf8'));
      return {
        projects: Array.isArray(raw.projects) ? raw.projects : [],
        exports: Array.isArray(raw.exports) ? raw.exports : []
      };
    } catch (_) {
      return { projects: [], exports: [] };
    }
  }

  function writeHistory(history) {
    const target = historyPath();
    const temp = `${target}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(history, null, 2), 'utf8');
    fs.renameSync(temp, target);
  }

  function cleanEntry(entry, kind) {
    const filePath = typeof entry?.path === 'string' ? entry.path : '';
    if (!filePath) return null;
    return {
      kind,
      path: filePath,
      name: String(entry?.name || path.basename(filePath)),
      duration: Math.max(0, Number(entry?.duration || 0)),
      updatedAt: new Date().toISOString()
    };
  }

  function remember(listName, entry, kind) {
    const clean = cleanEntry(entry, kind);
    if (!clean) return false;
    const history = readHistory();
    const list = history[listName].filter(item => item?.path !== clean.path);
    list.unshift(clean);
    history[listName] = list.slice(0, 24);
    writeHistory(history);
    return true;
  }

  function readProject(filePath) {
    if (typeof filePath !== 'string' || !filePath) throw new Error('Project path is missing.');
    const ext = path.extname(filePath).toLowerCase();
    if (!['.directorcut', '.json'].includes(ext)) throw new Error('That is not a DirectorCut project file.');
    if (!fs.existsSync(filePath)) throw new Error('Project file no longer exists.');
    const project = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    remember('projects', { path:filePath, name:project?.name || path.basename(filePath), duration:project?.duration || project?.media?.duration || 0 }, 'project');
    return project;
  }

  ipcMain.handle('home:recent', async () => {
    const history = readHistory();
    history.projects = history.projects.filter(item => item?.path && fs.existsSync(item.path));
    history.exports = history.exports.filter(item => item?.path && fs.existsSync(item.path));
    writeHistory(history);
    return history;
  });

  ipcMain.handle('home:remember-project', async (_event, entry) => remember('projects', entry, 'project'));
  ipcMain.handle('home:remember-export', async (_event, entry) => remember('exports', entry, 'export'));
  ipcMain.handle('home:open-project', async (_event, filePath) => readProject(filePath));

  ipcMain.handle('home:choose-project', async () => {
    if (!dialog) throw new Error('Project picker is unavailable.');
    const result = await dialog.showOpenDialog({ properties:['openFile'], filters:[{ name:'DirectorCut Project', extensions:['directorcut','json'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    return readProject(result.filePaths[0]);
  });

  ipcMain.handle('home:open-export', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath || !fs.existsSync(filePath)) throw new Error('Edited video no longer exists.');
    const result = await shell.openPath(filePath);
    if (result) throw new Error(result);
    return true;
  });
}

module.exports = { attachHomeHistory };
