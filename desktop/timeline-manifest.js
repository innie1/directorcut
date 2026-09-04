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

  (timeline.tracks || []).forEach(track => {
    if (!track || track.locked === 'disabled') return;
    if (track.kind === 'video' && track.hidden) return;
    if (track.kind === 'audio' && track.muted) return;
    if (!['video', 'audio'].includes(track.kind)) return;

    // GES layers are non-overlapping clip containers. Keep every DirectorCut media
    // track on its own GES layer so linked V/A clips can occupy the same time range.
    const layer = mediaLayer++;
    for (const clip of track.clips || []) {
      if (!clip?.sourcePath || n(clip.duration) <= 0) continue;
      const source = path.resolve(String(clip.sourcePath));
      lines.push([
        'clip',
        track.kind,
        layer,
        ns(clip.start),
        ns(clip.sourceIn),
        Math.max(1, ns(clip.duration)),
        encodeField(source),
        encodeField(clip.id || ''),
        encodeField(clip.name || path.basename(source))
      ].join('\t'));
      clips++;
    }
  });

  const duration = Math.max(0, ...((timeline.tracks || []).flatMap(t => (t.clips || []).map(c => n(c.start) + n(c.duration)))));
  lines.push(`end\t${ns(duration)}`);
  return { text: `${lines.join('\n')}\n`, fps, clips, duration };
}

module.exports = { buildTimelineManifest, ns };
