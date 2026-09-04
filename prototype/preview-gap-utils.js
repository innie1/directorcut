(function (root, factory) {
  const timelineApi = typeof module === 'object' && module.exports ? require('./timeline-engine') : root.DirectorTimeline;
  const api = factory(timelineApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DirectorPreviewGapUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TL) {
  function visibleVideoClipAt(timelineInput, time) {
    const timeline = TL.normalizeTimeline(timelineInput || {});
    const t = Math.max(0, Number(time) || 0);
    const tracks = (timeline.tracks || []).filter(track => track.kind === 'video' && !track.hidden);
    for (const track of tracks) {
      const clip = (track.clips || []).find(clip => t >= Number(clip.start || 0) - 1e-4 && t < TL.clipEnd(clip) - 1e-4);
      if (clip) return { track, clip };
    }
    return null;
  }

  function isTimelineGap(timelineInput, time) {
    const timeline = TL.normalizeTimeline(timelineInput || {});
    if (!(timeline.tracks || []).some(track => track.kind === 'video' && !track.hidden)) return false;
    return !visibleVideoClipAt(timeline, time);
  }

  return { visibleVideoClipAt, isTimelineGap };
});
