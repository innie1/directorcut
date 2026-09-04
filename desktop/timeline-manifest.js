const path = require('path');

const n = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const ns = seconds => Math.max(0, Math.round(n(seconds) * 1e9));
const encodeField = value => encodeURIComponent(String(value ?? ''));

function buildTimelineManifest(project = {}) {
  const timeline = project.timeline || { tracks: [] };
  const fps = n(timeline.fps || project.media?.frameRate, 30);
  const lines = ['DIRECTORCUT_TIMELINE_V1', `fps\t${fps}`];
  let clips = 0;
  let mediaLayer = 0;
  let duration = 0;

  (timeline.tracks || []).forEach(track => {
    if (!track || track.locked === 'disabled') return;
    if (track.kind === 'video' && track.hidden) return;
    if (track.kind === 'audio' && track.muted) return;
    if (!['video', 'audio'].includes(track.kind)) return;

    // GES layers are non-overlapping clip containers. Keep every DirectorCut media
    // track on its own GES layer so linked V/A clips can occupy the same time range.
    const layer = mediaLayer++;
    for (const clip of track.clips || []) {
      const clipDuration = n(clip?.duration);
      if (!clip?.sourcePath || clipDuration <= 0) continue;
      const start = Math.max(0, n(clip.start));
      const source = path.resolve(String(clip.sourcePath));
      lines.push([
        'clip',
        track.kind,
        layer,
        ns(start),
        ns(clip.sourceIn),
        Math.max(1, ns(clipDuration)),
        encodeField(source),
        encodeField(clip.id || ''),
        encodeField(clip.name || path.basename(source))
      ].join('\t'));
      clips++;
      // Native preview duration must reflect exactly what GES receives. Hidden
      // video and muted audio therefore cannot create an invisible dead tail.
      duration = Math.max(duration, start + clipDuration);
    }
  });

  lines.push(`end\t${ns(duration)}`);
  return { text: `${lines.join('\n')}\n`, fps, clips, duration };
}

module.exports = { buildTimelineManifest, ns };
