const { BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildTimelineManifest } = require('./timeline-manifest');
const { detectGStreamer } = require('./gstreamer');

function helperNames() {
  return process.platform === 'win32' ? ['directorcut_program_monitor.exe'] : ['directorcut_program_monitor'];
}

function candidateHelpers(root) {
  const out = [];
  if (process.env.DIRECTORCUT_PROGRAM_MONITOR) out.push(process.env.DIRECTORCUT_PROGRAM_MONITOR);
  for (const name of helperNames()) {
    out.push(
      path.join(root, 'build', name),
      path.join(root, 'build', 'Release', name),
      path.join(root, 'build', 'Debug', name),
      path.join(root, 'out', name),
      path.join(root, 'bin', name)
    );
  }
  return [...new Set(out.map(p => path.resolve(p)))];
}

function nativeHandleString(win) {
  const buffer = win.getNativeWindowHandle();
  if (!buffer?.length) return '0';
  try {
    if (buffer.length >= 8) return buffer.readBigUInt64LE(0).toString();
    if (buffer.length >= 4) return BigInt(buffer.readUInt32LE(0)).toString();
  } catch (_) {}
  return '0';
}

class NativeProgramMonitor {
  constructor({ parent, root, userData }) {
    this.parent = parent;
    this.root = root;
    this.userData = userData;
    this.surface = null;
    this.child = null;
    this.ready = false;
    this.enabled = false;
    this.lastBounds = null;
    this.manifestPath = null;
    this.waiters = [];
    this.stderr = '';
    this.gstreamer = null;
  }

  async status() {
    this.gstreamer = await detectGStreamer();
    const helper = candidateHelpers(this.root).find(p => fs.existsSync(p)) || null;
    return {
      available: Boolean(this.gstreamer?.available && this.gstreamer?.ges && helper),
      helper,
      gstreamer: this.gstreamer,
      enabled: this.enabled,
      ready: this.ready,
      backend: this.ready ? 'ges-native' : 'chromium-timeline',
      reason: !this.gstreamer?.available ? 'GStreamer runtime not detected.' : !this.gstreamer?.ges ? 'GStreamer Editing Services is not installed.' : !helper ? 'Native Program Monitor helper has not been built yet.' : null
    };
  }

  ensureSurface() {
    if (this.surface && !this.surface.isDestroyed()) return this.surface;
    this.surface = new BrowserWindow({
      parent: this.parent,
      frame: false,
      show: false,
      focusable: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      skipTaskbar: true,
      backgroundColor: '#000000',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    this.surface.setIgnoreMouseEvents(true);
    this.surface.loadURL('data:text/html,<html><body style="margin:0;background:#000;overflow:hidden"></body></html>').catch(() => {});
    if (this.lastBounds) this.setBounds(this.lastBounds);
    return this.surface;
  }

  setBounds(rect) {
    if (!rect || !this.parent || this.parent.isDestroyed()) return false;
    this.lastBounds = rect;
    if (!this.surface || this.surface.isDestroyed()) return true;
    const content = this.parent.getContentBounds();
    const width = Math.max(1, Math.round(Number(rect.width) || 1));
    const height = Math.max(1, Math.round(Number(rect.height) || 1));
    this.surface.setBounds({
      x: Math.round(content.x + (Number(rect.x) || 0)),
      y: Math.round(content.y + (Number(rect.y) || 0)),
      width,
      height
    }, false);
    return true;
  }

  resolveLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return;
    for (let i = 0; i < this.waiters.length; i++) {
      const waiter = this.waiters[i];
      if (!waiter.prefix || trimmed.startsWith(waiter.prefix)) {
        this.waiters.splice(i, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(trimmed);
        return;
      }
    }
  }

  waitFor(prefix, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const waiter = { prefix, resolve, reject, timer:null };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`Native Program Monitor timed out waiting for ${prefix || 'response'}.`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  send(line) {
    if (!this.child?.stdin?.writable) return false;
    this.child.stdin.write(`${line}\n`);
    return true;
  }

  async stop() {
    this.ready = false;
    this.enabled = false;
    if (this.surface && !this.surface.isDestroyed()) this.surface.hide();
    if (this.child) {
      try { this.send('QUIT'); } catch (_) {}
      const child = this.child;
      this.child = null;
      setTimeout(() => { try { if (!child.killed) child.kill(); } catch (_) {} }, 350);
    }
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Native Program Monitor stopped.'));
    }
    if (this.manifestPath) {
      try { fs.rmSync(path.dirname(this.manifestPath), { recursive:true, force:true }); } catch (_) {}
      this.manifestPath = null;
    }
  }

  async load(project, positionSeconds = 0) {
    const info = await this.status();
    if (!info.available) return { ok:false, ...info };
    const manifest = buildTimelineManifest(project);
    if (!manifest.clips) return { ok:false, available:true, reason:'The timeline has no playable media clips.' };

    const previousBounds = this.lastBounds;
    await this.stop();
    this.lastBounds = previousBounds;
    this.gstreamer = info.gstreamer;

    const surface = this.ensureSurface();
    if (this.lastBounds) this.setBounds(this.lastBounds);
    const handle = nativeHandleString(surface);
    if (!handle || handle === '0') return { ok:false, available:true, reason:'Could not obtain native monitor window handle.' };

    const temp = fs.mkdtempSync(path.join(this.userData || os.tmpdir(), 'directorcut-monitor-'));
    this.manifestPath = path.join(temp, 'timeline.dctimeline');
    fs.writeFileSync(this.manifestPath, manifest.text, 'utf8');

    const env = { ...process.env };
    const gstBin = this.gstreamer?.gstLaunch ? path.dirname(this.gstreamer.gstLaunch) : null;
    if (gstBin && path.isAbsolute(gstBin)) env.PATH = `${gstBin}${path.delimiter}${env.PATH || ''}`;

    this.stderr = '';
    this.child = spawn(info.helper, ['--manifest', this.manifestPath, '--window-handle', handle], {
      cwd: this.root,
      env,
      windowsHide: true,
      stdio: ['pipe','pipe','pipe']
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    let stdoutBuffer = '';
    this.child.stdout.on('data', chunk => {
      stdoutBuffer += chunk;
      let idx;
      while ((idx = stdoutBuffer.indexOf('\n')) >= 0) {
        const line = stdoutBuffer.slice(0, idx).replace(/\r$/, '');
        stdoutBuffer = stdoutBuffer.slice(idx + 1);
        this.resolveLine(line);
      }
    });
    this.child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk).slice(-12000); });
    this.child.on('exit', () => {
      this.ready = false;
      this.enabled = false;
      if (this.surface && !this.surface.isDestroyed()) this.surface.hide();
    });

    try {
      await this.waitFor('READY', 15000);
      this.ready = true;
      this.enabled = true;
      if (positionSeconds > 0) await this.seek(positionSeconds);
      if (this.lastBounds) this.setBounds(this.lastBounds);
      surface.showInactive();
      return { ok:true, available:true, backend:'ges-native', clips:manifest.clips, duration:manifest.duration };
    } catch (error) {
      const detail = this.stderr.trim();
      await this.stop();
      return { ok:false, available:true, reason:detail || error.message };
    }
  }

  async play() {
    if (!this.ready) return false;
    this.send('PLAY');
    return true;
  }
  async pause() {
    if (!this.ready) return false;
    this.send('PAUSE');
    return true;
  }
  async seek(seconds) {
    if (!this.ready) return false;
    const value = Math.max(0, Math.round(Number(seconds || 0) * 1e9));
    this.send(`SEEK\t${value}`);
    return true;
  }
  async position() {
    if (!this.ready) return null;
    const waiting = this.waitFor('POSITION\t', 1200);
    if (!this.send('POSITION')) return null;
    try {
      const line = await waiting;
      return Number(line.split('\t')[1] || 0) / 1e9;
    } catch (_) { return null; }
  }
  async setVisible(visible) {
    this.enabled = Boolean(visible && this.ready);
    if (!this.surface || this.surface.isDestroyed()) return this.enabled;
    if (this.enabled) this.surface.showInactive(); else this.surface.hide();
    return this.enabled;
  }

  destroy() {
    this.stop().catch(() => {});
    if (this.surface && !this.surface.isDestroyed()) this.surface.destroy();
    this.surface = null;
  }
}

module.exports = { NativeProgramMonitor, candidateHelpers, nativeHandleString };
