// Ensures the Chromium/source fallback obeys the edited timeline instead of leaking deleted footage.
(() => {
  const TL = window.DirectorTimeline;
  const Gap = window.DirectorPreviewGapUtils;
  const video = document.querySelector('#video');
  const viewport = document.querySelector('.videoViewport') || video?.parentElement;
  if (!TL || !Gap || !video || !viewport) return;

  let overlay = document.querySelector('#timelineGapOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'timelineGapOverlay';
    overlay.className = 'timelineGapOverlay hardGap';
    overlay.hidden = true;
    viewport.appendChild(overlay);
  } else {
    overlay.classList.add('hardGap');
    overlay.innerHTML = '';
  }

  let gapMuted = false;
  let mutedBeforeGap = false;
  let raf = 0;

  const position = () => {
    const pm = window.DirectorCutProgramMonitor;
    if (pm?.active && Number.isFinite(pm.position)) return Number(pm.position);
    return Number(video.currentTime || 0);
  };

  function restoreGapMute() {
    if (!gapMuted) return;
    video.muted = mutedBeforeGap;
    gapMuted = false;
  }

  function enterGap() {
    if (!gapMuted) {
      mutedBeforeGap = Boolean(video.muted);
      gapMuted = true;
    }
    video.muted = true;
    video.classList.add('timelineHardGap');
    video.style.visibility = 'hidden';
    overlay.hidden = false;
    viewport.classList.add('timelineGapActive');
  }

  function leaveGap() {
    restoreGapMute();
    video.classList.remove('timelineHardGap');
    video.style.visibility = 'visible';
    overlay.hidden = true;
    viewport.classList.remove('timelineGapActive');
  }

  function yieldToNative() {
    restoreGapMute();
    video.classList.remove('timelineHardGap');
    video.style.visibility = 'hidden';
    overlay.hidden = true;
    viewport.classList.remove('timelineGapActive');
  }

  function sync() {
    const pm = window.DirectorCutProgramMonitor;
    if (pm?.active) {
      yieldToNative();
      return;
    }
    const duration = Math.max(0, Number(TL.duration(state.timeline) || 0));
    if (!duration || !state.timeline?.tracks?.length) {
      leaveGap();
      return;
    }
    if (Gap.isTimelineGap(state.timeline, position())) enterGap();
    else leaveGap();
  }

  function tick() {
    sync();
    raf = requestAnimationFrame(tick);
  }

  video.controls = false;
  ['timeupdate','seeking','seeked','play','pause','loadedmetadata'].forEach(name => video.addEventListener(name,sync));
  document.addEventListener('pointerup', () => requestAnimationFrame(sync), true);
  document.addEventListener('keyup', () => requestAnimationFrame(sync), true);

  if (typeof renderTimeline === 'function') {
    const baseRenderTimeline = renderTimeline;
    renderTimeline = function (...args) {
      const result = baseRenderTimeline.apply(this,args);
      requestAnimationFrame(sync);
      return result;
    };
  }

  raf = requestAnimationFrame(tick);
  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(raf);
    restoreGapMute();
  });
})();
