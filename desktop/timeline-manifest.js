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

function argb(value, fallback) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(0xffffffff, Math.round(Number(value)))) >>> 0;
  const raw = String(value || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(raw)) return parseInt(`ff${raw}`, 16) >>> 0;
  if (/^[0-9a-f]{8}$/i.test(raw)) return parseInt(raw, 16) >>> 0;
  return fallback >>> 0;
}

function titleFields(clip = {}, trackKind = 'caption') {
  const text = clip.text && typeof clip.text === 'object' ? clip.text : {};
  const style = text.style && typeof text.style === 'object' ? text.style : text;
  const content = String(text.content ?? clip.name ?? '').trim();
  const family = String(style.fontFamily || 'Sans').trim() || 'Sans';
  const size = Math.max(8, Math.min(240, n(style.fontSize, trackKind === 'caption' ? 34 : 42)));
  const weight = style.bold === false || Number(style.fontWeight) < 600 ? '' : ' Bold';
  const italic = style.italic ? ' Italic' : '';
  const font = `${family}${weight}${italic} ${Math.round(size)}`;
  const color = argb(style.color, 0xffffffff);
  const background = argb(style.backgroundColor, 0x00000000);
  const position = text.position && typeof text.position === 'object' ? text.position : style.position || {};
  const x = Math.max(0, Math.min(1, n(position.x, .5)));
  const y = Math.max(0, Math.min(1, n(position.y, trackKind === 'caption' ? .86 : .5)));
  const halign = ['left','center','right','position','absolute'].includes(style.halign) ? style.halign : 'position';
  const valign = ['baseline','bottom','top','position','center','absolute'].includes(style.valign) ? style.valign : 'position';
  return { content, font, color, background, x, y, halign, valign };
}

function visualLayerMap(timeline = {}) {
  const tracks = timeline.tracks || [];
  const visible = tracks.filter(track => track && !track.hidden && ['caption','graphic','video'].includes(track.kind));
  const ordered = [
    ...visible.filter(track => track.kind === 'caption'),
    ...visible.filter(track => track.kind === 'graphic'),
    ...visible.filter(track => track.kind === 'video')
  ];
  const map = new Map();
  ordered.forEach((track, index) => map.set(track.id, index));
  let next = ordered.length;
  for (const track of tracks) if (track?.kind === 'audio' && !track.muted) map.set(track.id, next++);
  return map;
}

function buildTimelineManifest(project = {}) {
  const timeline = project.timeline || { tracks: [] };
  const fps = n(timeline.fps || project.media?.frameRate, 30);
  const canvasWidth = Math.max(0, Math.round(n(project.canvas?.width || project.media?.width)));
  const canvasHeight = Math.max(0, Math.round(n(project.canvas?.height || project.media?.height)));
  const transitions = (Array.isArray(timeline.transitions) ? timeline.transitions : []).filter(t => t?.fromClipId && t?.toClipId);
  const nativeTransitionSafe = transitions.every(t => (t.type || 'dissolve') === 'dissolve');
  const lines = ['DIRECTORCUT_TIMELINE_V5', `fps\t${fps}`, `canvas\t${canvasWidth}\t${canvasHeight}`, `auto-transition\t${transitions.length && nativeTransitionSafe ? 1 : 0}`];
  const layers = visualLayerMap(timeline);
  let clips = 0;
  let videoClips = 0;
  let audioClips = 0;
  let titleClips = 0;
  let graphicClips = 0;
  let duration = 0;

  (timeline.tracks || []).forEach(track => {
    if (!track || track.locked === 'disabled') return;
    if (['video','graphic','caption'].includes(track.kind) && track.hidden) return;
    if (track.kind === 'audio' && track.muted) return;
    if (!['video','audio','graphic','caption'].includes(track.kind)) return;
    const layer = layers.get(track.id);
    if (!Number.isFinite(layer)) return;

    for (const clip of track.clips || []) {
      const clipDuration = n(clip?.duration);
      if (clipDuration <= 0) continue;
      const start = Math.max(0, n(clip.start));
      const sourceLike = track.kind === 'video' || track.kind === 'audio' || (track.kind === 'graphic' && clip.sourcePath);
      if (sourceLike) {
        if (!clip?.sourcePath) continue;
        const source = path.resolve(String(clip.sourcePath));
        const mediaKind = track.kind === 'audio' ? 'audio' : 'video';
        lines.push([
          'clip', mediaKind, layer, ns(start), ns(clip.sourceIn), Math.max(1, ns(clipDuration)), encodeField(source), encodeField(clip.id || ''), encodeField(clip.name || path.basename(source)),
          keyframeField(clip, 'x', 0), keyframeField(clip, 'y', 0), keyframeField(clip, 'scale', 1), keyframeField(clip, 'rotation', 0), keyframeField(clip, 'opacity', 1), keyframeField(clip, 'speed', 1), keyframeField(clip, 'volume', 1),
          ...effectFields(clip)
        ].join('\t'));
        clips++;
        if (mediaKind === 'video') videoClips++;
        else audioClips++;
        if (track.kind === 'graphic') graphicClips++;
      } else {
        const title = titleFields(clip, track.kind);
        if (!title.content) continue;
        lines.push([
          'title', layer, ns(start), Math.max(1, ns(clipDuration)), encodeField(clip.id || ''), encodeField(title.content), encodeField(title.font), title.color, title.background,
          title.x.toFixed(6), title.y.toFixed(6), title.halign, title.valign
        ].join('\t'));
        titleClips++;
        if (track.kind === 'graphic') graphicClips++;
      }
      duration = Math.max(duration, start + clipDuration);
    }
  });

  for (const transition of transitions) {
    lines.push(['transition', encodeField(transition.id || ''), encodeField(transition.trackId || ''), encodeField(transition.fromClipId), encodeField(transition.toClipId), encodeField(transition.type || 'dissolve'), ns(transition.duration || .5)].join('\t'));
  }

  lines.push(`end\t${ns(duration)}`);
  return { text:`${lines.join('\n')}\n`, fps, clips, videoClips, audioClips, titleClips, graphicClips, transitions:transitions.length, nativeTransitionSafe, duration, canvasWidth, canvasHeight };
}

module.exports = { buildTimelineManifest, ns, keyframeField, effectFields, titleFields, visualLayerMap, argb };
