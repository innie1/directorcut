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
    this.surfaceReady = false;
    this.enabled = false;
    this.lastBounds = null;
    this.manifestPath = null;
    this.waiters = [];
    this.pendingLines = [];
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
      surfaceReady: this.surfaceReady,
      backend: this.ready && this.surfaceReady ? 'ges-native' : 'chromium-source',
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
    this.pendingLines.push(trimmed);
    if (this.pendingLines.length > 64) this.pendingLines.splice(0, this.pendingLines.length - 64);
  }

  waitFor(prefix, timeoutMs = 5000) {
    const pendingIndex = this.pendingLines.findIndex(line => !prefix || line.startsWith(prefix));
    if (pendingIndex >= 0) {
      const [line] = this.pendingLines.splice(pendingIndex, 1);
      return Promise.resolve(line);
    }
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

  rejectWaiters(message) {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(message));
    }
  }

  async stop() {
    this.ready = false;
    this.surfaceReady = false;
    this.enabled = false;
    if (this.surface && !this.surface.isDestroyed()) this.surface.hide();
    if (this.child) {
      try { this.send('QUIT'); } catch (_) {}
      const child = this.child;
      this.child = null;
      setTimeout(() => { try { if (!child.killed) child.kill(); } catch (_) {} }, 350);
    }
    this.rejectWaiters('Native Program Monitor stopped.');
    this.pendingLines = [];
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
    this.pendingLines = [];

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
    this.child.on('error', error => {
      this.stderr = `${this.stderr}\n${error.message}`.slice(-12000);
      this.rejectWaiters(`Native Program Monitor process error: ${error.message}`);
    });
    this.child.on('exit', (code, signal) => {
      const wasReady = this.ready;
      this.ready = false;
      this.surfaceReady = false;
      this.enabled = false;
      if (this.surface && !this.surface.isDestroyed()) this.surface.hide();
      if (!wasReady) this.rejectWaiters(`Native Program Monitor exited before READY (${code ?? signal ?? 'unknown'}).`);
    });

    try {
      await this.waitFor('READY', 15000);
      this.ready = true;

      if (manifest.videoClips > 0) {
        try {
          await Promise.all([
            this.waitFor('OVERLAY_READY', 3000),
            this.waitFor('VIDEO_FRAME', 3000)
          ]);
          this.surfaceReady = true;
        } catch (_) {
          const detail = this.stderr.trim();
          await this.stop();
          return {
            ok:false,
            available:true,
            reason: detail || 'Native GES did not confirm both an attached video overlay and a rendered frame. Chromium preview was kept active to prevent a black monitor.'
          };
        }
      }

      if (positionSeconds > 0) await this.seek(positionSeconds);
      if (this.lastBounds) this.setBounds(this.lastBounds);
      this.enabled = this.surfaceReady;
      if (this.surfaceReady) surface.showInactive();
      else surface.hide();
      return {
        ok:true,
        available:true,
        backend:this.surfaceReady ? 'ges-native' : 'ges-native-audio',
        surfaceReady:this.surfaceReady,
        clips:manifest.clips,
        videoClips:manifest.videoClips,
        audioClips:manifest.audioClips,
        duration:manifest.duration
      };
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
  async setProperty(clipId, property, value) {
    if (!this.ready || !clipId || !property || !Number.isFinite(Number(value))) return false;
    const waiting = this.waitFor('OK\tSET', 800);
    const line = `SET\t${encodeURIComponent(String(clipId))}\t${String(property)}\t${Number(value)}`;
    if (!this.send(line)) return false;
    try { await waiting; return true; } catch (_) { return false; }
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
    this.enabled = Boolean(visible && this.ready && this.surfaceReady);
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
