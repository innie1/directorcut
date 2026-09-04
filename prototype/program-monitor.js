// DirectorCut Program Monitor: native GES is the authoritative timeline clock when active.
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
    available: false,
    active: false,
    surfaceReady: false,
    loading: false,
    playing: false,
    position: 0,
    duration: 0,
    reason: null,
    reloadTimer: null,
    pollTimer: null,
    syncing: false,
    suppressSourceEvents: false,
    generation: 0,
    previousMuted: null,
    missedPolls: 0
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

  function renderNativePlayhead() {
    const total = Math.max(1, timelineDuration());
    document.querySelectorAll('.playhead').forEach(playhead => {
      playhead.style.left = `${Math.min(100, pm.position / total * 100)}%`;
    });
    if (timeLabel && typeof tc === 'function') timeLabel.textContent = tc(pm.position);
  }

  function updatePlayButton() {
    const button = document.querySelector('#programPlayPause');
    if (!button) return;
    button.textContent = pm.playing ? 'Ⅱ' : '▶';
    button.title = pm.playing ? 'Pause · Space' : 'Play · Space';
  }

  function restoreSourceMute() {
    if (pm.previousMuted === null) return;
    video.muted = pm.previousMuted;
    pm.previousMuted = null;
  }

  function showSafeFallbackDuringReload() {
    pm.active = false;
    pm.surfaceReady = false;
    pm.missedPolls = 0;
    window.directorcut.programMonitorVisible(false).catch(() => {});
    video.style.visibility = 'visible';
    // Keep the compatibility video silent while the native graph is merely rebuilding.
    // Its audio must never double with the native timeline when playback resumes.
    if (pm.previousMuted === null) pm.previousMuted = Boolean(video.muted);
    video.muted = true;
    setBadge('UPDATING', false);
  }

  function useSourcePreview(reason = null, { resume = false } = {}) {
    pm.active = false;
    pm.surfaceReady = false;
    pm.missedPolls = 0;
    if (reason) pm.reason = reason;
    video.style.visibility = 'visible';
    restoreSourceMute();
    setBadge('SOURCE', false);
    if (reason) setStatus(`${reason} Using Chromium source preview.`);
    window.directorcut.programMonitorVisible(false).catch(() => {});
    if (resume && video.paused) video.play().catch(() => {});
    updatePlayButton();
  }

  function useNativePreview({ playing = pm.playing } = {}) {
    if (!pm.surfaceReady) {
      useSourcePreview('Native timeline engine is running, but its video surface is not confirmed ready.');
      return false;
    }
    if (pm.previousMuted === null) pm.previousMuted = Boolean(video.muted);
    pm.suppressSourceEvents = true;
    if (!video.paused) video.pause();
    video.muted = true;
    video.style.visibility = 'hidden';
    pm.suppressSourceEvents = false;
    pm.active = true;
    pm.playing = Boolean(playing);
    pm.missedPolls = 0;
    setBadge('TIMELINE · GES', true);
    setStatus('Native GStreamer/GES timeline preview active.');
    renderNativePlayhead();
    updatePlayButton();
    return true;
  }

  async function syncBounds() {
    if (!viewport.isConnected) return;
    const rect = viewport.getBoundingClientRect();
    await window.directorcut.programMonitorBounds({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    }).catch(() => {});
  }

  const resizeObserver = new ResizeObserver(() => syncBounds());
  resizeObserver.observe(viewport);
  window.addEventListener('resize', syncBounds);
  document.addEventListener('scroll', syncBounds, true);

  async function nativePlayPause(force = null) {
    if (!pm.active) return false;
    const next = force === null ? !pm.playing : Boolean(force);
    pm.playing = next;
    updatePlayButton();
    if (next) await window.directorcut.programMonitorPlay().catch(() => false);
    else await window.directorcut.programMonitorPause().catch(() => false);
    return true;
  }

  if (transport && !document.querySelector('#programPlayPause')) {
    const button = document.createElement('button');
    button.id = 'programPlayPause';
    button.className = 'programPlayPause';
    button.textContent = '▶';
    document.querySelector('#time')?.insertAdjacentElement('afterend', button);
  }

  const playButton = document.querySelector('#programPlayPause');
  if (playButton) {
    playButton.onclick = () => {
      if (pm.active) nativePlayPause();
      else video.paused ? video.play().catch(() => {}) : video.pause();
    };
  }

  async function seekTimeline(time) {
    const end = Math.max(0, timelineDuration());
    const target = Math.max(0, Math.min(end || Infinity, seconds(time)));
    pm.position = target;
    renderNativePlayhead();
    if (pm.active) {
      await window.directorcut.programMonitorSeek(target).catch(() => false);
      const sourceDuration = Number(video.duration || 0);
      if (sourceDuration > 0 && target <= sourceDuration) {
        pm.syncing = true;
        try { video.currentTime = target; } catch (_) {}
        pm.syncing = false;
      }
      return true;
    }
    try {
      video.currentTime = target;
      return true;
    } catch (_) {
      return false;
    }
  }

  function stepTimeline(frames) {
    const fps = Number(state.timeline?.fps || 30) || 30;
    if (pm.active) nativePlayPause(false);
    else video.pause();
    return seekTimeline((pm.active ? pm.position : Number(video.currentTime || 0)) + frames / fps);
  }

  window.DirectorCutTimelineClock = {
    now: () => pm.active ? pm.position : Number(video.currentTime || 0),
    seek: seekTimeline,
    step: stepTimeline,
    isNative: () => pm.active
  };

  for (const [id, frames] of [['stepBackFrame', -1], ['stepForwardFrame', 1]]) {
    const button = document.querySelector(`#${id}`);
    if (button) button.onclick = () => stepTimeline(frames);
  }

  const ruler = document.querySelector('#ruler');
  if (ruler) {
    ruler.onpointerdown = event => {
      const rect = ruler.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
      seekTimeline(ratio * Math.max(1, timelineDuration()));
    };
  }

  async function activateNative(project, position = pm.position || video.currentTime || 0) {
    if (!pm.available || pm.loading) return false;
    const duration = timelineDuration();
    if (!duration) return false;

    const wasPlaying = Boolean(pm.playing);
    const wasActive = Boolean(pm.active);
    const targetPosition = Math.min(seconds(position), duration);
    pm.loading = true;
    pm.position = targetPosition;
    const generation = ++pm.generation;

    if (wasActive) showSafeFallbackDuringReload();
    else {
      setBadge('LOADING', false);
      setStatus('Preparing GES timeline preview…');
    }

    try {
      await syncBounds();
      const result = await window.directorcut.programMonitorLoad(project, targetPosition);
      if (generation !== pm.generation) return false;
      if (!result?.ok) {
        pm.playing = wasPlaying;
        useSourcePreview(result?.reason || 'Native Program Monitor unavailable.', { resume: wasPlaying });
        return false;
      }

      pm.position = targetPosition;
      pm.duration = Number(result.duration || duration);
      pm.reason = null;
      pm.surfaceReady = Boolean(result.surfaceReady);
      const visualClips = Number(result.visualClips ?? (Number(result.videoClips || 0) + Number(result.titleClips || 0)));
      if (!pm.surfaceReady && visualClips > 0) {
        pm.playing = wasPlaying;
        useSourcePreview('Native GES did not confirm a rendered video surface.', { resume: wasPlaying });
        return false;
      }

      if (!useNativePreview({ playing: wasPlaying })) return false;
      await syncBounds();
      const visible = await window.directorcut.programMonitorVisible(true);
      if (!visible) {
        pm.playing = wasPlaying;
        useSourcePreview('Native video surface could not be shown safely.', { resume: wasPlaying });
        return false;
      }
      if (wasPlaying) await window.directorcut.programMonitorPlay();
      return true;
    } catch (error) {
      pm.playing = wasPlaying;
      useSourcePreview(`Native preview failed: ${error.message}`, { resume: wasPlaying });
      return false;
    } finally {
      pm.loading = false;
    }
  }

  function scheduleReload(delay = 140) {
    if (!pm.available) return;
    clearTimeout(pm.reloadTimer);
    const requestedPosition = pm.active ? pm.position : Number(video.currentTime || 0);
    pm.reloadTimer = setTimeout(() => {
      if (typeof projectObject !== 'function') return;
      activateNative(projectObject(), requestedPosition);
    }, delay);
  }

  async function detect() {
    try {
      const info = await window.directorcut.programMonitorStatus();
      pm.available = Boolean(info?.available);
      pm.reason = info?.reason || null;
      if (pm.available) {
        setStatus('Native GES Program Monitor ready.');
        scheduleReload(80);
      } else {
        useSourcePreview(pm.reason || 'Native Program Monitor is not built.');
      }
    } catch (error) {
      pm.available = false;
      useSourcePreview(error.message);
    }
  }

  video.addEventListener('play', () => {
    if (pm.suppressSourceEvents) return;
    if (pm.active) {
      pm.suppressSourceEvents = true;
      video.pause();
      pm.suppressSourceEvents = false;
      return;
    }
    pm.playing = true;
    updatePlayButton();
  });

  video.addEventListener('pause', () => {
    if (pm.suppressSourceEvents) return;
    if (!pm.active && !pm.loading) {
      pm.playing = false;
      updatePlayButton();
    }
  });

  video.addEventListener('seeking', () => {
    if (!pm.active || pm.syncing) return;
    seekTimeline(video.currentTime);
  });

  window.addEventListener('keydown', event => {
    if (!pm.active || event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    if (event.code === 'Space') {
      event.preventDefault();
      event.stopImmediatePropagation();
      nativePlayPause();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopImmediatePropagation();
      stepTimeline(event.shiftKey ? -10 : -1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopImmediatePropagation();
      stepTimeline(event.shiftKey ? 10 : 1);
    }
  }, true);

  pm.pollTimer = setInterval(async () => {
    if (!pm.active || pm.loading) return;
    const position = await window.directorcut.programMonitorPosition().catch(() => null);
    if (!Number.isFinite(position)) {
      pm.missedPolls++;
      if (pm.missedPolls >= 8) {
        const wasPlaying = pm.playing;
        pm.playing = false;
        useSourcePreview('Native timeline preview stopped unexpectedly.', { resume: wasPlaying });
        window.directorcut.programMonitorStop().catch(() => {});
      }
      return;
    }

    pm.missedPolls = 0;
    pm.position = Math.min(seconds(position), timelineDuration() || seconds(position));
    renderNativePlayhead();

    const sourceDuration = Number(video.duration || 0);
    if (sourceDuration > 0 && pm.position <= sourceDuration && Math.abs(Number(video.currentTime || 0) - pm.position) > 0.08) {
      pm.syncing = true;
      try { video.currentTime = pm.position; } catch (_) {}
      pm.syncing = false;
    }
  }, 80);

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
      scheduleReload(80);
      return result;
    };
  }

  window.addEventListener('beforeunload', () => {
    clearInterval(pm.pollTimer);
    clearTimeout(pm.reloadTimer);
    restoreSourceMute();
    window.directorcut.programMonitorStop().catch(() => {});
  });

  updatePlayButton();
  syncBounds();
  detect();
})();
