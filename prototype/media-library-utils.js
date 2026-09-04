// Pure helpers for DirectorCut's media library and deliberate add-to-timeline workflow.
(function (root, factory) {
  const api = factory(root.DirectorTimeline || (typeof require === 'function' ? require('./timeline-engine.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DirectorMediaLibraryUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TL) {
  if (!TL) throw new Error('DirectorTimeline is required');

  const clone = value => JSON.parse(JSON.stringify(value));
  const keyFor = media => String(media?.path || media?.url || media?.name || '').toLowerCase();
  const mediaId = media => media?.libraryId || `media-${Math.random().toString(36).slice(2,10)}-${Date.now().toString(36)}`;

  function normalizeLibrary(items = []) {
    const seen = new Set();
    const out = [];
    for (const raw of Array.isArray(items) ? items : []) {
      if (!raw || raw.error) continue;
      const key = keyFor(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ ...raw, libraryId:mediaId(raw) });
    }
    return out;
  }

  function mergeLibrary(existing = [], incoming = []) {
    return normalizeLibrary([...(existing || []), ...(incoming || [])]);
  }

  function ensureTrack(timeline, kind, preferredId, preferredName) {
    let track = timeline.tracks.find(t => t.kind === kind && t.id === preferredId)
      || timeline.tracks.find(t => t.kind === kind);
    if (!track) {
      track = { id:preferredId, name:preferredName, kind, locked:false, muted:false, hidden:false, clips:[] };
      timeline.tracks.push(track);
    }
    return track;
  }

  function createLinkedClips(media, start, videoTrack, audioTrack, idSeed) {
    const duration = Math.max(1 / 120, Number(media.duration || 0));
    const videoId = `${idSeed}-v`;
    const audioId = `${idSeed}-a`;
    const video = TL.createClip({
      id:videoId, trackId:videoTrack.id, kind:'video', name:media.name || 'Video', sourcePath:media.path || null,
      start, sourceIn:0, duration, sourceDuration:duration, linkedId:media.hasAudio === false ? null : audioId
    });
    const audio = media.hasAudio === false ? null : TL.createClip({
      id:audioId, trackId:audioTrack.id, kind:'audio', name:`${media.name || 'Video'} · audio`, sourcePath:media.path || null,
      start, sourceIn:0, duration, sourceDuration:duration, linkedId:videoId
    });
    return { video, audio };
  }

  function appendMedia(base, media, options = {}) {
    const timeline = TL.normalizeTimeline(clone(base));
    const start = Number.isFinite(Number(options.start)) ? Math.max(0, Number(options.start)) : Math.max(0, Number(TL.duration(timeline) || 0));
    const videoTrack = ensureTrack(timeline, 'video', 'V1', 'V1 Video');
    const audioTrack = ensureTrack(timeline, 'audio', 'A1', 'A1 Dialogue');
    const seed = options.idSeed || `${media.libraryId || 'media'}-${Math.round(start * 1000)}-${Date.now().toString(36)}`;
    const clips = createLinkedClips(media, TL.snapTime(start, timeline.fps), videoTrack, audioTrack, seed);
    videoTrack.clips.push(clips.video);
    videoTrack.clips.sort((a,b) => a.start - b.start);
    if (clips.audio) {
      audioTrack.clips.push(clips.audio);
      audioTrack.clips.sort((a,b) => a.start - b.start);
    }
    return timeline;
  }

  function insertMedia(base, media, time, options = {}) {
    let timeline = TL.normalizeTimeline(clone(base));
    const fps = timeline.fps || 30;
    const at = TL.snapTime(Math.max(0, Number(time) || 0), fps);
    const duration = Math.max(1 / 120, Number(media.duration || 0));
    // Split anything crossing the insertion point first, then move the tail so no existing edit is overwritten.
    timeline = TL.splitAt(timeline, at);
    for (const track of timeline.tracks) {
      if (track.locked) continue;
      for (const clip of track.clips || []) {
        if (clip.start >= at - 1e-6) clip.start = TL.snapTime(clip.start + duration, fps);
      }
      track.clips.sort((a,b) => a.start - b.start);
    }
    return appendMedia(timeline, media, { ...options, start:at });
  }

  return { normalizeLibrary, mergeLibrary, appendMedia, insertMedia, keyFor };
});
