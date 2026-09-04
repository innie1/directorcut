(function (root, factory) {
  const timelineApi = typeof module === 'object' && module.exports ? require('./timeline-engine') : root.DirectorTimeline;
  const api = factory(timelineApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DirectorSelectionActions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TL) {
  function selectedContext(timelineInput, clipId) {
    const timeline = TL.normalizeTimeline(timelineInput || {});
    const found = clipId ? TL.findClip(timeline, clipId) : null;
    if (!found) return { timeline, found:null, linked:null };
    const linked = found.clip.linkedId ? TL.findClip(timeline, found.clip.linkedId) : null;
    return { timeline, found, linked };
  }

  function removeSelectedClip(timelineInput, clipId) {
    const { timeline, found, linked } = selectedContext(timelineInput, clipId);
    if (!found || found.track.locked) return timeline;
    const removeIds = new Set([found.clip.id]);
    if (linked && !linked.track.locked) removeIds.add(linked.clip.id);
    for (const track of timeline.tracks || []) {
      if (track.locked) continue;
      track.clips = (track.clips || []).filter(clip => !removeIds.has(clip.id));
    }
    return timeline;
  }

  function rippleDeleteSelectedClip(timelineInput, clipId) {
    const { timeline, found, linked } = selectedContext(timelineInput, clipId);
    if (!found || found.track.locked) return timeline;
    const trackIds = [found.track.id];
    if (linked && !linked.track.locked && !trackIds.includes(linked.track.id)) trackIds.push(linked.track.id);
    return TL.rippleDelete(timeline, found.clip.start, TL.clipEnd(found.clip), trackIds);
  }

  return { selectedContext, removeSelectedClip, rippleDeleteSelectedClip };
});
