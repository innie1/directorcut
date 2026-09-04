const path = require('path');
const FX = require('../prototype/effects-color-utils');

const n = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const ns = seconds => Math.max(0, Math.round(n(seconds) * 1e9));
const encodeField = value => encodeURIComponent(String(value ?? ''));

function keyframeField(clip, property, fallback = null) {
  let frames = Array.isArray(clip?.keyframes?.[property]) ? clip.keyframes[property] : [];
  if (!frames.length && fallback !== null) frames = [{ time:0, value:fallback }];
  const normalized = frames
    .map(frame => ({ time:Math.max(0, n(frame?.time)), value:n(frame?.value) }))
    .filter(frame => Number.isFinite(frame.value))
    .sort((a,b) => a.time - b.time)
    .map(frame => `${ns(frame.time)}:${frame.value}`)
    .join(',');
  return encodeField(normalized);
}

function effectFields(clip) {
  const color = FX.getEffect(clip, 'color');
  const blur = FX.getEffect(clip, 'blur');
  const sharpen = FX.getEffect(clip, 'sharpen');
  const vignette = FX.getEffect(clip, 'vignette');
  const colorEnabled = color?.enabled !== false;
  return [
    colorEnabled ? n(color?.params?.exposure) : 0,
    colorEnabled ? n(color?.params?.contrast, 1) : 1,
    colorEnabled ? n(color?.params?.saturation, 1) : 1,
    colorEnabled ? n(color?.params?.temperature) : 0,
    colorEnabled ? n(color?.params?.tint) : 0,
    blur?.enabled ? n(blur?.params?.radius) : 0,
    sharpen?.enabled ? n(sharpen?.params?.amount) : 0,
    vignette?.enabled ? n(vignette?.params?.amount) : 0
  ];
}

function buildTimelineManifest(project = {}) {
  const timeline = project.timeline || { tracks: [] };
  const fps = n(timeline.fps || project.media?.frameRate, 30);
  const canvasWidth = Math.max(0, Math.round(n(project.canvas?.width || project.media?.width)));
  const canvasHeight = Math.max(0, Math.round(n(project.canvas?.height || project.media?.height)));
  const lines = ['DIRECTORCUT_TIMELINE_V3', `fps\t${fps}`, `canvas\t${canvasWidth}\t${canvasHeight}`];
  let clips = 0;
  let videoClips = 0;
  let audioClips = 0;
  let mediaLayer = 0;
  let duration = 0;

  (timeline.tracks || []).forEach(track => {
    if (!track || track.locked === 'disabled') return;
    if (track.kind === 'video' && track.hidden) return;
    if (track.kind === 'audio' && track.muted) return;
    if (!['video', 'audio'].includes(track.kind)) return;

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
        encodeField(clip.name || path.basename(source)),
        keyframeField(clip, 'x', 0),
        keyframeField(clip, 'y', 0),
        keyframeField(clip, 'scale', 1),
        keyframeField(clip, 'rotation', 0),
        keyframeField(clip, 'opacity', 1),
        keyframeField(clip, 'speed', 1),
        keyframeField(clip, 'volume', 1),
        ...effectFields(clip)
      ].join('\t'));
      clips++;
      if (track.kind === 'video') videoClips++;
      if (track.kind === 'audio') audioClips++;
      duration = Math.max(duration, start + clipDuration);
    }
  });

  lines.push(`end\t${ns(duration)}`);
  return { text: `${lines.join('\n')}\n`, fps, clips, videoClips, audioClips, duration, canvasWidth, canvasHeight };
}

module.exports = { buildTimelineManifest, ns, keyframeField, effectFields };
