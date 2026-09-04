// Streams simple Inspector property changes into the running native GES preview.
// Timeline state remains authoritative; committed edits still rebuild the native graph
// so speed changes and keyframe bindings are applied deterministically.
(() => {
  const TL = window.DirectorTimeline;
  const IU = window.DirectorInspectorUtils;
  if (!TL || !IU || !window.directorcut?.programMonitorSetProperty) return;

  let sequence = 0;
  const toTimelineValue = {
    x:value => Number(value) || 0,
    y:value => Number(value) || 0,
    scale:value => IU.clamp((Number(value) || 0) / 100, .01, 8),
    rotation:value => IU.clamp(Number(value) || 0, -360, 360),
    opacity:value => IU.clamp((Number(value) || 0) / 100, 0, 1),
    volume:value => IU.clamp((Number(value) || 0) / 100, 0, 10)
  };

  function targetClipId(property) {
    if (!state?.selectedClipId) return null;
    const found = TL.findClip(state.timeline, state.selectedClipId);
    if (!found) return null;
    if (property === 'volume' && found.track.kind === 'video' && found.clip.linkedId) {
      const linked = TL.findClip(state.timeline, found.clip.linkedId);
      if (linked?.track?.kind === 'audio') return linked.clip.id;
    }
    return found.clip.id;
  }

  async function sendLive(input) {
    const pm = window.DirectorCutProgramMonitor;
    if (!pm?.active) return;
    const property = input?.dataset?.inspectorProp;
    const convert = toTimelineValue[property];
    if (!convert || input.value === '') return;
    const clipId = targetClipId(property);
    if (!clipId) return;
    const value = convert(input.value);
    const ticket = ++sequence;
    const ok = await window.directorcut.programMonitorSetProperty(clipId, property, value).catch(() => false);
    if (ticket !== sequence) return;
    pm.lastInspectorSet = { clipId, property, value, ok, at:Date.now() };
  }

  // The Inspector's own input listener updates state first. This document-level
  // bubble listener therefore observes the already-updated edit and mirrors it to GES.
  document.addEventListener('input', event => {
    const input = event.target.closest?.('input[data-inspector-prop]');
    if (!input || input.dataset.inspectorProp === 'speed') return;
    sendLive(input);
  });

  window.DirectorCutNativeInspectorLive = { sendLive };
})();
