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
    loading:false,
    playing:false,
    position:0,
    duration:0,
    reason:null,
    reloadTimer:null,
    pollTimer:null,
    syncing:false,
    generation:0
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
    const time = document.querySelector('#time');
    time?.insertAdjacentElement('afterend', button);
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
    const generation = ++pm.generation;
    setBadge('LOADING', false);
    setStatus('Preparing GES timeline preview…');
    try {
      await syncBounds();
      const result = await window.directorcut.programMonitorLoad(project, Math.min(seconds(position), duration));
      if (generation !== pm.generation) return false;
      if (!result?.ok) {
        pm.active = false;
        pm.reason = result?.reason || 'Native Program Monitor unavailable.';
        setBadge('SOURCE', false);
        setStatus(`${pm.reason} Using Chromium source preview.`);
        video.style.visibility = 'visible';
        return false;
      }
      pm.active = true;
      pm.position = Math.min(seconds(position), duration);
      pm.duration = Number(result.duration || duration);
      pm.reason = null;
      setBadge('TIMELINE · GES', true);
      setStatus('Native GStreamer/GES timeline preview active.');
      // The native child window paints over this viewport. Keep the HTML video alive
      // invisibly so existing timeline controls continue to have a media clock.
      video.style.visibility = 'hidden';
      await syncBounds();
      await window.directorcut.programMonitorVisible(true);
      if (pm.playing) await window.directorcut.programMonitorPlay();
      return true;
    } catch (error) {
      pm.active = false;
      pm.reason = error.message;
      setBadge('SOURCE', false);
      setStatus(`Native preview failed: ${error.message}`);
      video.style.visibility = 'visible';
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
        setBadge('SOURCE', false);
        setStatus(`${pm.reason || 'Native Program Monitor is not built.'} Source preview remains available.`);
      }
    } catch (error) {
      pm.available = false;
      pm.reason = error.message;
      setBadge('SOURCE', false);
    }
  }

  // Keep native playback synchronized with existing transport and keyboard logic.
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

  // GES is the playback authority when active. Poll its timeline position and use
  // that to draw the playhead/timecode. The HTML video is only a compatibility clock.
  pm.pollTimer = setInterval(async () => {
    if (!pm.active || pm.loading) return;
    const position = await window.directorcut.programMonitorPosition().catch(() => null);
    if (!Number.isFinite(position)) return;
    pm.position = Math.min(seconds(position), timelineDuration() || seconds(position));
    if (timeLabel && typeof tc === 'function') timeLabel.textContent = tc(pm.position);
    const sourceDuration = Number(video.duration || 0);
    if (sourceDuration > 0 && pm.position <= sourceDuration && Math.abs(Number(video.currentTime || 0) - pm.position) > 0.08) {
      pm.syncing = true;
      try { video.currentTime = pm.position; } catch (_) {}
      pm.syncing = false;
    }
  }, 120);

  // Editing functions already call markDirty after committed changes. Reload the GES
  // graph only after the user finishes the edit instead of during every drag frame.
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
    window.directorcut.programMonitorStop().catch(() => {});
  });

  updatePlayButton();
  syncBounds();
  detect();
})();
