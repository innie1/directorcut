// Director authoring operations: the verbs that let the Director build a cut rather
// than only trim one. Every function is pure - timeline in, new timeline out - so the
// same code runs in the renderer and under node in tests.
(function(root,factory){
  const api=factory(root);
  if (typeof module==='object'&&module.exports) module.exports=api; else root.DirectorOps=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  const req = name => { try { return typeof require==='function' ? require(name) : null; } catch(_) { return null; } };
  // Resolved per call, not at load: caption-editor-utils is injected into the page
  // after this file runs, so capturing these once would leave CE permanently null.
  let cache = null;
  function deps() {
    if (cache && cache.TL && cache.MU && cache.CE && cache.TR) return cache;
    const found = {
      TL: root?.DirectorTimeline || req('./timeline-engine'),
      MU: root?.DirectorMediaLibraryUtils || req('./media-library-utils'),
      CE: root?.DirectorCaptionEditor || req('./caption-editor-utils'),
      TR: root?.DirectorTransitions || req('./transitions-utils'),
      PT: root?.DirectorProfessionalTimeline || req('./professional-timeline-utils')
    };
    if (found.TL && found.MU && found.CE && found.TR) cache = found;
    return found;
  }

  const clone = v => JSON.parse(JSON.stringify(v));
  const num = (v,d=0) => Number.isFinite(Number(v)) ? Number(v) : d;

  // ---- media placement ----------------------------------------------------
  // The Director sees the bin as {libraryId,name}; resolve loosely so a small model
  // naming a file ("intro.mp4") lands on the right item as reliably as an exact id.
  function resolveMedia(library, ref) {
    const items = Array.isArray(library) ? library.filter(Boolean) : [];
    if (!items.length) return null;
    const want = String(ref ?? '').trim().toLowerCase();
    if (!want) return items[0];
    return items.find(m => String(m.libraryId||'').toLowerCase() === want)
        || items.find(m => String(m.name||'').toLowerCase() === want)
        || items.find(m => String(m.name||'').toLowerCase().includes(want))
        || items.find(m => want.includes(String(m.name||'').toLowerCase()))
        || null;
  }

  function addClip(timeline, media, options = {}) {
    const { MU, PT } = deps();
    if (!media || !MU) return timeline;
    const mode = ['append','insert','overwrite'].includes(options.mode) ? options.mode : 'append';
    if (mode === 'insert') return MU.insertMedia(timeline, media, num(options.time, 0));
    if (mode === 'overwrite' && PT && typeof PT.overwriteMedia === 'function') {
      return PT.overwriteMedia(timeline, media, num(options.time, 0));
    }
    const at = Number.isFinite(Number(options.time)) ? { start:num(options.time) } : {};
    return MU.appendMedia(timeline, media, at);
  }

  // ---- text -------------------------------------------------------------
  function ensureTrack(timeline, kind, id, name) {
    const found = timeline.tracks.find(t => t.kind === kind);
    if (found) return found;
    const track = { id, name, kind, locked:false, muted:false, hidden:false, clips:[] };
    timeline.tracks.push(track);
    return track;
  }

  function addCaption(base, { text='Text', start=0, duration=3, x=0.5, y=0.82, size, color } = {}) {
    const { TL, CE } = deps();
    if (!TL || !CE) return base;
    const timeline = TL.normalizeTimeline(clone(base));
    const track = ensureTrack(timeline, 'caption', 'C1', 'C1 Captions');
    const clip = CE.createManual({
      trackId: track.id,
      start: Math.max(0, num(start)),
      duration: Math.max(.2, num(duration, 3)),
      content: String(text || 'Text'),
      style: { ...(size ? { fontSize:num(size,28) } : {}), ...(color ? { color:String(color) } : {}) },
      position: { x:num(x,.5), y:num(y,.82) }
    });
    track.clips.push(clip);
    track.clips.sort((a,b) => a.start - b.start);
    return timeline;
  }

  // ---- motion graphics ----------------------------------------------------
  // Presets are keyframe recipes over properties the timeline already stores and the
  // renderer already draws, so an animated title exports the same as a hand-keyed one.
  const MOTION = {
    'fade-in':      [['opacity',0,0],['opacity',1,1]],
    'fade-out':     [['opacity',0,1],['opacity',1,0]],
    'zoom-in':      [['scale',0,1],['scale',1,1.18]],
    'zoom-out':     [['scale',0,1.18],['scale',1,1]],
    'ken-burns':    [['scale',0,1],['scale',1,1.14],['x',0,0],['x',1,26]],
    'slide-left':   [['x',0,140],['x',1,0],['opacity',0,0],['opacity',.35,1]],
    'slide-right':  [['x',0,-140],['x',1,0],['opacity',0,0],['opacity',.35,1]],
    'slide-up':     [['y',0,120],['y',1,0],['opacity',0,0],['opacity',.35,1]],
    'pop-in':       [['scale',0,.6],['scale',.6,1.06],['scale',1,1],['opacity',0,0],['opacity',.4,1]],
    'drift-up':     [['y',0,18],['y',1,-18]],
    'spin-in':      [['rotation',0,-12],['rotation',1,0],['opacity',0,0],['opacity',.4,1]]
  };
  const MOTION_PRESETS = Object.keys(MOTION);

  function applyMotion(base, clipId, preset, options = {}) {
    const { TL } = deps();
    if (!TL) return base;
    const recipe = MOTION[String(preset || '').toLowerCase()];
    const found = TL.findClip(TL.normalizeTimeline(base), String(clipId || ''));
    if (!recipe || !found) return base;
    const clipStart = num(found.clip.start);
    const clipDur = Math.max(.05, num(found.clip.duration, 1));
    // A preset may cover only the head or tail of the clip.
    const span = Math.max(.05, Math.min(clipDur, num(options.duration, clipDur)));
    const from = clipStart + Math.max(0, Math.min(clipDur - span, num(options.offset, 0)));
    let timeline = base;
    for (const [property, position, value] of recipe) {
      timeline = TL.addKeyframe(timeline, String(clipId), property, from + span * position, value);
    }
    return timeline;
  }

  // An animated title in one step: the text clip plus its motion.
  function addTitle(base, { text='Title', start=0, duration=3, motion='pop-in', x=.5, y=.5, size=44, color } = {}) {
    if (!deps().CE) return base;
    let timeline = addCaption(base, { text, start, duration, x, y, size, color });
    const track = timeline.tracks.find(t => t.kind === 'caption');
    const created = track && track.clips[track.clips.length - 1];
    const newest = track ? track.clips.reduce((a,c) => (c.start >= num(start) - 1e-6 && (!a || c.start <= a.start) && c.name === String(text) ? c : a), null) : null;
    const target = newest || created;
    if (target && motion) timeline = applyMotion(timeline, target.id, motion);
    return timeline;
  }

  // ---- transitions --------------------------------------------------------
  function addTransition(base, fromClipId, toClipId, type='dissolve', duration=.5) {
    const { TR } = deps();
    if (!TR || !fromClipId || !toClipId) return base;
    return TR.add(base, String(fromClipId), String(toClipId), type, Math.max(.1, num(duration,.5)));
  }

  // Neighbouring pairs on a track, so "add dissolves everywhere" needs no clip ids.
  function videoPairs(base) {
    const { TL } = deps();
    if (!TL) return [];
    const timeline = TL.normalizeTimeline(base);
    const track = timeline.tracks.find(t => t.kind === 'video');
    const clips = [...((track && track.clips) || [])].sort((a,b) => a.start - b.start);
    const pairs = [];
    for (let i = 0; i < clips.length - 1; i++) pairs.push([clips[i].id, clips[i+1].id]);
    return pairs;
  }

  function addTransitionsBetweenAll(base, type='dissolve', duration=.5) {
    let timeline = base;
    for (const [from, to] of videoPairs(timeline)) timeline = addTransition(timeline, from, to, type, duration);
    return timeline;
  }

  // ---- script assembly ----------------------------------------------------
  // Deterministic rough cut: one media item per scene, a caption carrying the scene
  // line, and optional dissolves. Building this in code rather than asking a 1B model
  // to emit fifty correct operations is what makes script-to-video reliable.
  function assembleFromScript(base, { scenes = [], library = [], perScene = 0, captions = true, transition = '', transitionDuration = .5 } = {}) {
    const { TL } = deps();
    const usable = TL ? (Array.isArray(library) ? library : []).filter(m => m && (m.path || m.url)) : [];
    const list = (Array.isArray(scenes) ? scenes : []).filter(s => s && String(s.text || s.title || '').trim());
    if (!usable.length || !list.length) return { timeline:base, placed:0, captioned:0, transitions:0 };

    let timeline = TL.normalizeTimeline(clone(base));
    let placed = 0, captioned = 0;
    for (let i = 0; i < list.length; i++) {
      const scene = list[i];
      const media = usable[i % usable.length];
      const start = Math.max(0, num(TL.duration(timeline)));
      timeline = addClip(timeline, media, { mode:'append' });
      placed++;

      // Trim the placed clip when the scene asks for a fixed length.
      const want = num(scene.dur ?? scene.duration ?? perScene, 0);
      if (want > 0) {
        const track = timeline.tracks.find(t => t.kind === 'video');
        const clip = track && track.clips.find(c => Math.abs(num(c.start) - start) < 1e-3);
        if (clip) {
          const capped = Math.min(want, num(clip.sourceDuration, want) || want);
          const delta = num(clip.duration) - capped;
          if (delta > 1e-3) {
            clip.duration = capped;
            const linked = clip.linkedId && TL.findClip(timeline, clip.linkedId);
            if (linked) linked.clip.duration = capped;
          }
        }
      }

      const end = Math.max(0, num(TL.duration(timeline)));
      if (captions) {
        const line = String(scene.text || scene.title || '').trim().slice(0, 220);
        if (line) { timeline = addCaption(timeline, { text:line, start, duration:Math.max(.6, end - start) }); captioned++; }
      }
    }

    let transitions = 0;
    if (transition) {
      const before = (timeline.transitions || []).length;
      timeline = addTransitionsBetweenAll(timeline, transition, transitionDuration);
      transitions = (timeline.transitions || []).length - before;
    }
    return { timeline, placed, captioned, transitions };
  }

  return { resolveMedia, addClip, addCaption, addTitle, applyMotion, MOTION_PRESETS,
           addTransition, addTransitionsBetweenAll, videoPairs, assembleFromScript };
});
