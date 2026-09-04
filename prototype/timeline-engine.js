(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DirectorTimeline = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const EPS = 1e-6;

  function parseFps(value, fallback = 30) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    if (typeof value === 'string') {
      const s = value.trim();
      if (s.includes('/')) {
        const [n, d] = s.split('/').map(Number);
        if (Number.isFinite(n) && Number.isFinite(d) && d !== 0 && n / d > 0) return n / d;
      }
      const n = Number(s);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return fallback;
  }

  function frameDuration(fps) { return 1 / parseFps(fps); }
  function snapTime(seconds, fps) { const f = parseFps(fps); return Math.max(0, Math.round((Number(seconds) || 0) * f) / f); }
  function snapDelta(seconds, fps) { const f = parseFps(fps); return Math.round((Number(seconds) || 0) * f) / f; }
  function clipEnd(clip) { return (Number(clip.start) || 0) + (Number(clip.duration) || 0); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function createClip(input = {}) {
    return {
      id: input.id || `clip-${Math.random().toString(36).slice(2, 10)}`,
      trackId: input.trackId || 'V1', kind: input.kind || 'video', name: input.name || 'Clip', sourcePath: input.sourcePath || null,
      start: Math.max(0, Number(input.start) || 0), duration: Math.max(0.001, Number(input.duration) || 1), sourceIn: Math.max(0, Number(input.sourceIn) || 0),
      sourceDuration: Math.max(Number(input.sourceDuration) || Number(input.duration) || 1, Number(input.duration) || 1), linkedId: input.linkedId || null,
      keyframes: clone(input.keyframes || {})
    };
  }

  function normalizeTimeline(timeline = {}) {
    const out = clone(timeline); out.fps = parseFps(out.fps || 30); out.snapping = out.snapping !== false; out.tracks = Array.isArray(out.tracks) ? out.tracks : [];
    out.tracks = out.tracks.map((t, i) => ({
      id: t.id || `${t.kind === 'audio' ? 'A' : t.kind === 'caption' ? 'C' : 'V'}${i + 1}`, name: t.name || t.id || `Track ${i + 1}`,
      kind: t.kind || 'video', locked: Boolean(t.locked), muted: Boolean(t.muted), hidden: Boolean(t.hidden),
      clips: (t.clips || []).map(createClip).sort((a, b) => a.start - b.start)
    }));
    return out;
  }

  function findClip(timeline, clipId) {
    for (const track of timeline.tracks || []) { const index = (track.clips || []).findIndex(c => c.id === clipId); if (index >= 0) return { track, clip: track.clips[index], index }; }
    return null;
  }

  function neighborSnap(timeline, clipId, rawStart, threshold = 0.12) {
    const found = findClip(timeline, clipId); if (!found) return rawStart; const { clip } = found; const candidates = [0];
    for (const track of timeline.tracks || []) for (const other of track.clips || []) if (other.id !== clipId) candidates.push(other.start, clipEnd(other));
    let best = rawStart, dist = threshold + EPS;
    for (const c of candidates) {
      const d = Math.abs(c - rawStart); if (d < dist) { best = c; dist = d; }
      const alignEndStart = c - clip.duration; const de = Math.abs(alignEndStart - rawStart); if (de < dist) { best = alignEndStart; dist = de; }
    }
    return Math.max(0, best);
  }

  function moveClip(timelineInput, clipId, newStart, opts = {}) {
    const timeline = normalizeTimeline(timelineInput); const found = findClip(timeline, clipId); if (!found || found.track.locked) return timeline;
    let target = Math.max(0, Number(newStart) || 0); if (timeline.snapping && opts.snap !== false) target = neighborSnap(timeline, clipId, target, opts.threshold || 0.12);
    found.clip.start = snapTime(target, timeline.fps); found.track.clips.sort((a, b) => a.start - b.start); return timeline;
  }

  function rippleDelete(timelineInput, start, end, trackIds = null) {
    const timeline = normalizeTimeline(timelineInput); const a = snapTime(Math.min(start, end), timeline.fps); const b = snapTime(Math.max(start, end), timeline.fps); const cut = Math.max(0, b - a);
    if (cut <= EPS) return timeline; const allow = trackIds ? new Set(trackIds) : null;
    for (const track of timeline.tracks) {
      if (track.locked || (allow && !allow.has(track.id))) continue; const next = [];
      for (const clip of track.clips) {
        const ce = clipEnd(clip);
        if (ce <= a + EPS) { next.push(clip); continue; }
        if (clip.start >= b - EPS) { clip.start = snapTime(Math.max(0, clip.start - cut), timeline.fps); next.push(clip); continue; }
        if (clip.start < a && ce > b) { clip.duration = snapTime(Math.max(frameDuration(timeline.fps), clip.duration - cut), timeline.fps); next.push(clip); continue; }
        if (clip.start < a && ce > a) { clip.duration = snapTime(Math.max(frameDuration(timeline.fps), a - clip.start), timeline.fps); next.push(clip); continue; }
        if (clip.start < b && ce > b) { const trim = b - clip.start; clip.sourceIn = snapTime(clip.sourceIn + trim, timeline.fps); clip.duration = snapTime(Math.max(frameDuration(timeline.fps), ce - b), timeline.fps); clip.start = a; next.push(clip); }
      }
      track.clips = next.sort((x, y) => x.start - y.start);
    }
    return timeline;
  }

  function rollBoundary(timelineInput, leftId, rightId, deltaSeconds) {
    const timeline = normalizeTimeline(timelineInput), leftFound = findClip(timeline, leftId), rightFound = findClip(timeline, rightId);
    if (!leftFound || !rightFound || leftFound.track.id !== rightFound.track.id || leftFound.track.locked) return timeline;
    const left = leftFound.clip, right = rightFound.clip, frame = frameDuration(timeline.fps), delta = snapDelta(deltaSeconds, timeline.fps);
    const maxLeftGrow = Math.max(0, left.sourceDuration - (left.sourceIn + left.duration)), maxRightTrim = Math.max(0, right.duration - frame), maxLeftTrim = Math.max(0, left.duration - frame), maxRightGrow = Math.max(0, right.sourceIn);
    const clamped = Math.max(-Math.min(maxLeftTrim, maxRightGrow), Math.min(delta, maxLeftGrow, maxRightTrim)); if (Math.abs(clamped) <= EPS) return timeline;
    left.duration = snapTime(left.duration + clamped, timeline.fps); right.start = snapTime(right.start + clamped, timeline.fps); right.sourceIn = snapTime(right.sourceIn + clamped, timeline.fps); right.duration = snapTime(right.duration - clamped, timeline.fps); return timeline;
  }

  function slipClip(timelineInput, clipId, deltaSeconds) {
    const timeline = normalizeTimeline(timelineInput), found = findClip(timeline, clipId); if (!found || found.track.locked) return timeline; const clip = found.clip;
    const maxIn = Math.max(0, clip.sourceDuration - clip.duration); clip.sourceIn = snapTime(Math.max(0, Math.min(maxIn, clip.sourceIn + snapDelta(deltaSeconds, timeline.fps))), timeline.fps); return timeline;
  }

  function slideClip(timelineInput, clipId, deltaSeconds) {
    const timeline = normalizeTimeline(timelineInput), found = findClip(timeline, clipId); if (!found || found.track.locked) return timeline; const track = found.track, i = found.index, prev = track.clips[i - 1], next = track.clips[i + 1];
    if (!prev || !next) return moveClip(timeline, clipId, found.clip.start + deltaSeconds); const frame = frameDuration(timeline.fps), delta = snapDelta(deltaSeconds, timeline.fps), minDelta = -Math.max(0, prev.duration - frame), maxDelta = Math.max(0, next.duration - frame), d = Math.max(minDelta, Math.min(maxDelta, delta));
    if (Math.abs(d) <= EPS) return timeline; prev.duration = snapTime(prev.duration + d, timeline.fps); found.clip.start = snapTime(found.clip.start + d, timeline.fps); next.start = snapTime(next.start + d, timeline.fps); next.sourceIn = snapTime(next.sourceIn + d, timeline.fps); next.duration = snapTime(next.duration - d, timeline.fps); return timeline;
  }

  function addKeyframe(timelineInput, clipId, property, time, value) {
    const timeline = normalizeTimeline(timelineInput), found = findClip(timeline, clipId); if (!found || found.track.locked) return timeline;
    const local = snapTime(Math.max(0, Math.min(found.clip.duration, time - found.clip.start)), timeline.fps), list = Array.isArray(found.clip.keyframes[property]) ? found.clip.keyframes[property] : [], filtered = list.filter(k => Math.abs(k.time - local) > frameDuration(timeline.fps) / 2);
    filtered.push({ time: local, value: Number(value) }); filtered.sort((a, b) => a.time - b.time); found.clip.keyframes[property] = filtered; return timeline;
  }

  function duration(timelineInput) { const timeline = normalizeTimeline(timelineInput); let max = 0; for (const track of timeline.tracks) for (const clip of track.clips) max = Math.max(max, clipEnd(clip)); return max; }
  return { parseFps, frameDuration, snapTime, snapDelta, clipEnd, createClip, normalizeTimeline, findClip, moveClip, rippleDelete, rollBoundary, slipClip, slideClip, addKeyframe, duration };
});
