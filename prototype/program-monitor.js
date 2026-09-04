// DirectorCut v0.4 Program Monitor controller.
// Uses native GES playback when available while preserving the existing HTML video
// element as a lightweight UI clock / compatibility layer.
(() => {
  if (!window.directorcut?.desktop || !window.DirectorTimeline) return;

  const video = document.querySelector('#video');
  const viewport = document.querySelector('.videoViewport');
  const monitor = document.querySelector('.monitor');
  const badge = document.querySelector('#previewBadge');
  const gstStatus = document.querySelector('#gstStatus');
  const timeLabel = document.querySelector('#time');
  const transport = document.querySelector('.simplifiedTransport');
  if (!video || !viewport || !monitor) return;

  const pm = {
    available:false,
    active:false,
    surfaceReady:false,
    loading:false,
    playing:false,
    position:0,
    duration:0,
    reason:null,
    reloadTimer:null,
    pollTimer:null,
    syncing:false,
    generation:0,
    previousMuted:null,
    missedPolls:0
  };
  window.DirectorCutProgramMonitor = pm;

  const seconds = value => Math.max(0, Number(value) || 0);
  const timelineDuration = () => Math.max(0, Number(window.DirectorTimeline.duration(state.timeline) || 0));

  function setBadge(text, native = false) {
    if (!badge) return;
    badge.textContent = text;
    badge.classList.toggle('nativePreview', native);
  }

  function setStatus(text) {
    if (gstStatus) gstStatus.textContent = text;
  }

  function useSourcePreview(reason = null) {
    pm.active = false;
    pm.surfaceReady = false;
    pm.missedPolls = 0;
    if (reason) pm.reason = reason;
    video.style.visibility = 'visible';
    if (pm.previousMuted !== null) {
      video.muted = pm.previousMuted;
      pm.previousMuted = null;
    }
    setBadge('SOURCE', false);
    if (reason) setStatus(`${reason} Using Chromium source preview.`);
    window.directorcut.programMonitorVisible(false).catch(() => {});
  }

  function useNativePreview() {
    if (!pm.surfaceReady) {
      useSourcePreview('Native timeline engine is running, but its video surface is not confirmed ready.');
      return false;
    }
    if (pm.previousMuted === null) pm.previousMuted = Boolean(video.muted);
    video.muted = true;
    video.style.visibility = 'hidden';
    pm.active = true;
    pm.missedPolls = 0;
    setBadge('TIMELINE · GES', true);
    setStatus('Native GStreamer/GES timeline preview active.');
    return true;
  }

  async function syncBounds() {
    if (!viewport.isConnected) return;
    const rect = viewport.getBoundingClientRect();
    await window.directorcut.programMonitorBounds({ x:rect.x, y:rect.y, width:rect.width, height:rect.height }).catch(() => {});
  }

  const resizeObserver = new ResizeObserver(() => syncBounds());
  resizeObserver.observe(viewport);
  window.addEventListener('resize', syncBounds);
  document.addEventListener('scroll', syncBounds, true);

  function updatePlayButton() {
    const button = document.querySelector('#programPlayPause');
    if (!button) return;
    button.textContent = pm.playing ? 'Ⅱ' : '▶';
    button.title = pm.playing ? 'Pause · Space' : 'Play · Space';
  }

  if (transport && !document.querySelector('#programPlayPause')) {
    const button = document.createElement('button');
    button.id = 'programPlayPause';
    button.className = 'programPlayPause';
    button.textContent = '▶';
    button.title = 'Play · Space';
    document.querySelector('#time')?.insertAdjacentElement('afterend', button);
    button.addEventListener('click', () => {
      if (pm.playing) video.pause();
      else video.play().catch(() => {});
    });
  }

  async function activateNative(project, position = pm.position || video.currentTime || 0) {
    if (!pm.available || pm.loading) return false;
    const duration = timelineDuration();
    if (!duration) return false;
    pm.loading = true;
    pm.surfaceReady = false;
    const generation = ++pm.generation;
    setBadge('LOADING', false);
    setStatus('Preparing GES timeline preview…');
    try {
      await syncBounds();
      const result = await window.directorcut.programMonitorLoad(project, Math.min(seconds(position), duration));
      if (generation !== pm.generation) return false;
      if (!result?.ok) {
        useSourcePreview(result?.reason || 'Native Program Monitor unavailable.');
        return false;
      }
      pm.position = Math.min(seconds(position), duration);
      pm.duration = Number(result.duration || duration);
      pm.reason = null;
      pm.surfaceReady = Boolean(result.surfaceReady);
      if (!pm.surfaceReady && Number(result.videoClips || 0) > 0) {
        useSourcePreview('Native GES did not confirm a rendered video surface.');
        return false;
      }
      if (!useNativePreview()) return false;
      await syncBounds();
      const visible = await window.directorcut.programMonitorVisible(true);
      if (!visible) {
        useSourcePreview('Native video surface could not be shown safely.');
        return false;
      }
      if (pm.playing) await window.directorcut.programMonitorPlay();
      return true;
    } catch (error) {
      useSourcePreview(`Native preview failed: ${error.message}`);
      return false;
    } finally {
      pm.loading = false;
    }
  }

  function scheduleReload(delay = 420) {
    if (!pm.available) return;
    clearTimeout(pm.reloadTimer);
    pm.reloadTimer = setTimeout(() => {
      if (typeof projectObject !== 'function') return;
      activateNative(projectObject(), pm.position || video.currentTime || 0);
    }, delay);
  }

  async function detect() {
    try {
      const info = await window.directorcut.programMonitorStatus();
      pm.available = Boolean(info?.available);
      pm.reason = info?.reason || null;
      if (pm.available) {
        setStatus('Native GES Program Monitor ready.');
        scheduleReload(100);
      } else {
        useSourcePreview(pm.reason || 'Native Program Monitor is not built.');
      }
    } catch (error) {
      pm.available = false;
      useSourcePreview(error.message);
    }
  }

  video.addEventListener('play', () => {
    pm.playing = true;
    updatePlayButton();
    if (pm.active) window.directorcut.programMonitorPlay().catch(() => {});
  });
  video.addEventListener('pause', () => {
    pm.playing = false;
    updatePlayButton();
    if (pm.active) window.directorcut.programMonitorPause().catch(() => {});
  });
  video.addEventListener('seeking', () => {
    if (!pm.active || pm.syncing) return;
    pm.position = seconds(video.currentTime);
    window.directorcut.programMonitorSeek(pm.position).catch(() => {});
  });

  pm.pollTimer = setInterval(async () => {
    if (!pm.active || pm.loading) return;
    const position = await window.directorcut.programMonitorPosition().catch(() => null);
    if (!Number.isFinite(position)) {
      pm.missedPolls++;
      if (pm.missedPolls >= 8) {
        const wasPlaying = pm.playing;
        useSourcePreview('Native timeline preview stopped unexpectedly.');
        window.directorcut.programMonitorStop().catch(() => {});
        if (wasPlaying && video.paused) video.play().catch(() => {});
      }
      return;
    }
    pm.missedPolls = 0;
    pm.position = Math.min(seconds(position), timelineDuration() || seconds(position));
    if (timeLabel && typeof tc === 'function') timeLabel.textContent = tc(pm.position);
    const sourceDuration = Number(video.duration || 0);
    if (sourceDuration > 0 && pm.position <= sourceDuration && Math.abs(Number(video.currentTime || 0) - pm.position) > 0.08) {
      pm.syncing = true;
      try { video.currentTime = pm.position; } catch (_) {}
      pm.syncing = false;
    }
  }, 120);

  if (typeof markDirty === 'function') {
    const baseMarkDirty = markDirty;
    markDirty = function (...args) {
      const result = baseMarkDirty.apply(this, args);
      scheduleReload();
      return result;
    };
  }

  if (typeof loadProjectObject === 'function') {
    const baseLoadProject = loadProjectObject;
    loadProjectObject = function (...args) {
      const result = baseLoadProject.apply(this, args);
      setTimeout(() => scheduleReload(80), 0);
      return result;
    };
  }

  if (typeof acceptDesktopMedia === 'function') {
    const baseAcceptMedia = acceptDesktopMedia;
    acceptDesktopMedia = async function (...args) {
      const result = await baseAcceptMedia.apply(this, args);
      scheduleReload(100);
      return result;
    };
  }

  window.addEventListener('beforeunload', () => {
    clearInterval(pm.pollTimer);
    clearTimeout(pm.reloadTimer);
    if (pm.previousMuted !== null) video.muted = pm.previousMuted;
    window.directorcut.programMonitorStop().catch(() => {});
  });

  updatePlayButton();
  syncBounds();
  detect();
})();
