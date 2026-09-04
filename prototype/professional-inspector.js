// Professional timeline + Inspector layer. Keeps Director and clip properties separate.
(() => {
  const TL = window.DirectorTimeline;
  const IU = window.DirectorInspectorUtils;
  const video = document.querySelector('#video');
  const right = document.querySelector('aside.right');
  if (!TL || !IU || !video || !right) return;

  const clone = value => JSON.parse(JSON.stringify(value));
  const notice = text => window.DirectorCutEditorToast?.(text);
  const fieldSessions = new WeakMap();
  let activePane = 'director';

  function selected() { return state.selectedClipId ? TL.findClip(state.timeline, state.selectedClipId) : null; }
  function linked(found) { return found?.clip?.linkedId ? TL.findClip(state.timeline, found.clip.linkedId) : null; }
  function localTime(clip) { return Math.max(0, Math.min(Number(clip?.duration || 0), Number(video.currentTime || 0) - Number(clip?.start || 0))); }
  function snapFrame(value) { return TL.snapTime(Math.max(0, Number(value) || 0), state.timeline.fps); }

  // ---- Right-side tabs ----------------------------------------------------
  const existing = [...right.children];
  const tabs = document.createElement('div');
  tabs.className = 'rightPaneTabs';
  tabs.innerHTML = '<button type="button" data-right-pane="director" class="active">Director</button><button type="button" data-right-pane="inspector">Inspector</button>';
  const directorPane = document.createElement('div');
  directorPane.className = 'directorPane';
  existing.forEach(node => directorPane.appendChild(node));
  const inspectorPane = document.createElement('div');
  inspectorPane.className = 'inspectorPane';
  inspectorPane.hidden = true;
  inspectorPane.innerHTML = `
    <div id="inspectorEmpty" class="inspectorEmpty">Select a timeline clip to inspect and edit its properties.</div>
    <div id="inspectorContent" hidden>
      <div class="inspectorHead"><div><small>SELECTED CLIP</small><b id="inspectorClipName">Clip</b></div><button type="button" id="inspectorReset">Reset</button></div>
      <div class="inspectorMeta"><span>Start<b id="inspectorStart">—</b></span><span>Duration<b id="inspectorDuration">—</b></span></div>
      <section class="inspectorSection" id="inspectorVideoSection">
        <h3>Transform</h3>
        <div class="inspectorRow"><label>Position X</label><input data-inspector-prop="x" type="number" step="1" min="-10000" max="10000"><button data-keyframe="x" title="Add position X keyframe">◇</button></div>
        <div class="inspectorRow"><label>Position Y</label><input data-inspector-prop="y" type="number" step="1" min="-10000" max="10000"><button data-keyframe="y" title="Add position Y keyframe">◇</button></div>
        <div class="inspectorRow"><label>Scale %</label><input data-inspector-prop="scale" type="number" step="1" min="1" max="800"><button data-keyframe="scale" title="Add scale keyframe">◇</button></div>
        <div class="inspectorRow"><label>Rotation</label><input data-inspector-prop="rotation" type="number" step="1" min="-360" max="360"><button data-keyframe="rotation" title="Add rotation keyframe">◇</button></div>
        <div class="inspectorRow"><label>Opacity %</label><input data-inspector-prop="opacity" type="number" step="1" min="0" max="100"><button data-keyframe="opacity" title="Add opacity keyframe">◇</button></div>
      </section>
      <section class="inspectorSection">
        <h3>Timing</h3>
        <div class="inspectorRow"><label>Speed</label><input data-inspector-prop="speed" type="number" step="0.05" min="0.25" max="4"><button type="button" disabled title="Speed keyframes are not supported yet">—</button></div>
        <small class="inspectorHint">Changing speed preserves the same source section and changes the clip's timeline duration.</small>
      </section>
      <section class="inspectorSection" id="inspectorAudioSection">
        <h3>Audio</h3>
        <div class="inspectorRow"><label>Volume %</label><input data-inspector-prop="volume" type="number" step="1" min="0" max="800"><button data-keyframe="volume" title="Add volume keyframe">◇</button></div>
        <small class="inspectorHint" id="inspectorAudioHint">Volume applies to the selected audio clip.</small>
      </section>
      <small class="inspectorHint">◇ adds a keyframe at the current playhead. Property changes are undoable with Ctrl+Z.</small>
    </div>`;
  right.append(tabs, directorPane, inspectorPane);

  function setPane(name) {
    activePane = name === 'inspector' ? 'inspector' : 'director';
    directorPane.hidden = activePane !== 'director';
    inspectorPane.hidden = activePane !== 'inspector';
    tabs.querySelectorAll('[data-right-pane]').forEach(button => button.classList.toggle('active', button.dataset.rightPane === activePane));
    document.body.classList.toggle('inspectorOpen', activePane === 'inspector');
    if (activePane === 'inspector') syncInspector();
  }
  tabs.addEventListener('click', event => {
    const button = event.target.closest('[data-right-pane]');
    if (button) setPane(button.dataset.rightPane);
  });

  // A human click on a timeline clip opens Inspector. Programmatic Director selection does not.
  document.addEventListener('click', event => {
    if (event.target.closest('.clip[data-clip-id]')) setPane('inspector');
  }, true);

  // ---- Inspector model ---------------------------------------------------
  const conversions = {
    x: { fallback:0, toField:v=>v, fromField:v=>Number(v)||0 },
    y: { fallback:0, toField:v=>v, fromField:v=>Number(v)||0 },
    scale: { fallback:1, toField:v=>Number(v)*100, fromField:v=>IU.clamp(Number(v)/100,.01,8) },
    rotation: { fallback:0, toField:v=>v, fromField:v=>IU.clamp(Number(v),-360,360) },
    opacity: { fallback:1, toField:v=>Number(v)*100, fromField:v=>IU.clamp(Number(v)/100,0,1) },
    speed: { fallback:1, toField:v=>v, fromField:v=>IU.clamp(Number(v),.25,4) },
    volume: { fallback:1, toField:v=>Number(v)*100, fromField:v=>IU.clamp(Number(v)/100,0,8) }
  };

  function targetForProperty(found, property) {
    if (!found) return null;
    if (property === 'volume' && found.track.kind === 'video') {
      const other = linked(found);
      return other?.track?.kind === 'audio' ? other : null;
    }
    return found;
  }

  function propertyValue(found, property) {
    const target = targetForProperty(found, property);
    const config = conversions[property];
    if (!target || !config) return config?.fallback ?? 0;
    return IU.valueAt(target.clip, property, config.fallback, localTime(target.clip));
  }

  function syncKeyframeButtons(found) {
    inspectorPane.querySelectorAll('[data-keyframe]').forEach(button => {
      const property = button.dataset.keyframe;
      const target = targetForProperty(found, property);
      const t = target ? localTime(target.clip) : 0;
      const frame = TL.frameDuration(state.timeline.fps) * .55;
      const has = Boolean(target && IU.frames(target.clip, property).some(k => Math.abs(Number(k.time) - t) <= frame));
      button.classList.toggle('hasKey', has);
      button.textContent = has ? '◆' : '◇';
    });
  }

  function syncInspector() {
    const found = selected();
    const empty = inspectorPane.querySelector('#inspectorEmpty');
    const content = inspectorPane.querySelector('#inspectorContent');
    empty.hidden = Boolean(found);
    content.hidden = !found;
    if (!found) return;

    inspectorPane.querySelector('#inspectorClipName').textContent = found.clip.name || 'Clip';
    inspectorPane.querySelector('#inspectorStart').textContent = typeof tc === 'function' ? tc(found.clip.start) : `${Number(found.clip.start).toFixed(2)}s`;
    inspectorPane.querySelector('#inspectorDuration').textContent = typeof tc === 'function' ? tc(found.clip.duration) : `${Number(found.clip.duration).toFixed(2)}s`;
    inspectorPane.querySelector('#inspectorVideoSection').hidden = found.track.kind !== 'video';
    inspectorPane.querySelector('#inspectorAudioSection').hidden = !((found.track.kind === 'audio') || (found.track.kind === 'video' && linked(found)?.track?.kind === 'audio'));
    const hint = inspectorPane.querySelector('#inspectorAudioHint');
    if (hint) hint.textContent = found.track.kind === 'video' ? 'Volume applies to this video clip’s linked audio.' : 'Volume applies to the selected audio clip.';

    inspectorPane.querySelectorAll('input[data-inspector-prop]').forEach(input => {
      if (document.activeElement === input) return;
      const property = input.dataset.inspectorProp, config = conversions[property];
      const value = propertyValue(found, property);
      input.value = Number(config.toField(value).toFixed(property === 'speed' ? 2 : 2));
    });
    syncKeyframeButtons(found);
  }

  function applyStaticProperty(property, rawFieldValue) {
    const found = selected(); if (!found) return false;
    const target = targetForProperty(found, property); if (!target) return false;
    const value = conversions[property].fromField(rawFieldValue);
    if (property === 'speed') {
      state.timeline = IU.setPlaybackRate(state.timeline, found.clip.id, value, {linked:true});
    } else {
      state.timeline = IU.setStatic(state.timeline, target.clip.id, property, value);
    }
    return true;
  }

  function commitInput(input) {
    const before = fieldSessions.get(input);
    if (before) {
      pushUndo(before);
      fieldSessions.delete(input);
      const prop = input.dataset.inspectorProp;
      learn?.('accepted', `manual inspector ${prop}`, state.selectedClipId || '');
    }
    markDirty();
    renderTimeline();
    syncInspector();
  }

  inspectorPane.addEventListener('focusin', event => {
    const input = event.target.closest('input[data-inspector-prop]');
    if (input && !fieldSessions.has(input)) fieldSessions.set(input, snapshot());
  });
  inspectorPane.addEventListener('input', event => {
    const input = event.target.closest('input[data-inspector-prop]');
    if (!input || input.value === '') return;
    if (applyStaticProperty(input.dataset.inspectorProp, input.value)) {
      renderTimeline();
      applyPreviewProperties();
    }
  });
  inspectorPane.addEventListener('change', event => {
    const input = event.target.closest('input[data-inspector-prop]');
    if (input) commitInput(input);
  });

  inspectorPane.addEventListener('click', event => {
    const key = event.target.closest('[data-keyframe]');
    if (key) {
      const found = selected(); if (!found) return;
      const property = key.dataset.keyframe, target = targetForProperty(found, property); if (!target) return;
      const input = inspectorPane.querySelector(`input[data-inspector-prop="${property}"]`); if (!input) return;
      pushUndo();
      const value = conversions[property].fromField(input.value);
      state.timeline = IU.setKeyframe(state.timeline, target.clip.id, property, localTime(target.clip), value);
      markDirty(); renderTimeline(); syncInspector(); applyPreviewProperties(); notice?.(`Added ${property} keyframe`);
      return;
    }
    if (event.target.closest('#inspectorReset')) resetInspector();
  });

  function resetInspector() {
    const found = selected(); if (!found) return;
    pushUndo();
    let timeline = clone(state.timeline);
    const selectedTarget = IU.findClip(timeline, found.clip.id);
    if (!selectedTarget) return;
    if (selectedTarget.track.kind === 'video') {
      for (const prop of ['x','y','scale','rotation','opacity']) if (selectedTarget.clip.keyframes) delete selectedTarget.clip.keyframes[prop];
      timeline = IU.setPlaybackRate(timeline, selectedTarget.clip.id, 1, {linked:true});
      const audio = selectedTarget.clip.linkedId ? IU.findClip(timeline, selectedTarget.clip.linkedId) : null;
      if (audio?.clip?.keyframes) delete audio.clip.keyframes.volume;
    } else if (selectedTarget.track.kind === 'audio') {
      if (selectedTarget.clip.keyframes) delete selectedTarget.clip.keyframes.volume;
      timeline = IU.setPlaybackRate(timeline, selectedTarget.clip.id, 1, {linked:true});
    }
    state.timeline = timeline;
    markDirty(); renderTimeline(); syncInspector(); applyPreviewProperties(); notice?.('Reset clip properties');
  }

  // ---- Linked dragging ----------------------------------------------------
  function snappedLinkedStart(base, clipId, rawStart, threshold=.12) {
    const found = TL.findClip(base, clipId); if (!found) return Math.max(0, rawStart);
    const ignored = new Set([clipId, found.clip.linkedId].filter(Boolean));
    const duration = Number(found.clip.duration || 0), candidates=[0];
    for (const track of base.tracks || []) for (const clip of track.clips || []) if (!ignored.has(clip.id)) candidates.push(Number(clip.start||0), TL.clipEnd(clip));
    let best=Math.max(0,rawStart),distance=threshold;
    for (const edge of candidates) {
      const d1=Math.abs(edge-rawStart); if (d1<distance){best=edge;distance=d1}
      const aligned=edge-duration,d2=Math.abs(aligned-rawStart); if(d2<distance){best=aligned;distance=d2}
    }
    return snapFrame(Math.max(0,best));
  }
  function moveLinked(base,clipId,newStart) {
    let timeline=TL.normalizeTimeline(base);const found=TL.findClip(timeline,clipId);if(!found||found.track.locked)return timeline;
    const linkedId=found.clip.linkedId, originalStart=found.clip.start, target=state.timeline.snapping===false?snapFrame(newStart):snappedLinkedStart(timeline,clipId,newStart);
    timeline=TL.moveClip(timeline,clipId,target,{snap:false});const moved=TL.findClip(timeline,clipId);const actualDelta=(moved?.clip?.start??originalStart)-originalStart;
    if(linkedId){const other=TL.findClip(timeline,linkedId);if(other&&!other.track.locked)timeline=TL.moveClip(timeline,linkedId,other.clip.start+actualDelta,{snap:false})}
    return timeline;
  }
  window.addEventListener('pointermove', event => {
    const drag = state.drag;
    if (!drag || state.trimDrag || state.activeTool !== 'select') return;
    const delta=(event.clientX-drag.startX)/drag.width*drag.total;
    state.timeline=moveLinked(drag.base,drag.clipId,drag.original.start+delta);
    renderTimeline();
    document.querySelectorAll(`.clip[data-clip-id="${drag.clipId}"]`).forEach(el=>el.classList.add('dragLinked'));
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  // ---- Preview transform --------------------------------------------------
  function activeVideoClipAt(time) {
    const tracks=(state.timeline?.tracks||[]).filter(t=>t.kind==='video'&&!t.hidden);
    let active=null;
    for(const track of tracks)for(const clip of track.clips||[])if(time>=clip.start-1e-6&&time<TL.clipEnd(clip)-1e-6)active={track,clip};
    return active;
  }
  function applyPreviewProperties() {
    if (window.DirectorCutProgramMonitor?.active) return;
    const active=activeVideoClipAt(Number(video.currentTime||0));
    if(!active){video.style.transform='';video.style.opacity='';return}
    const t=localTime(active.clip),x=IU.valueAt(active.clip,'x',0,t),y=IU.valueAt(active.clip,'y',0,t),scale=IU.valueAt(active.clip,'scale',1,t),rotation=IU.valueAt(active.clip,'rotation',0,t),opacity=IU.valueAt(active.clip,'opacity',1,t);
    const sourceWidth=Number(state.media?.width||video.videoWidth||video.clientWidth||1),displayScale=Math.max(.0001,Number(video.clientWidth||sourceWidth)/sourceWidth);
    video.style.transformOrigin='50% 50%';
    video.style.transform=`translate(${x*displayScale}px, ${y*displayScale}px) scale(${scale}) rotate(${rotation}deg)`;
    video.style.opacity=String(IU.clamp(opacity,0,1));
  }
  ['timeupdate','seeking','seeked','loadedmetadata'].forEach(name=>video.addEventListener(name,()=>{applyPreviewProperties();if(activePane==='inspector')syncInspector()}));

  // Keep inspector state synchronized when old rendering code updates selection.
  if (typeof renderSelectedClip === 'function') {
    const baseRenderSelectedClip = renderSelectedClip;
    renderSelectedClip = function (...args) { const result=baseRenderSelectedClip.apply(this,args); syncInspector(); applyPreviewProperties(); return result; };
  }

  window.DirectorCutProfessionalInspector = { setPane, syncInspector, moveLinked, applyPreviewProperties };
  syncInspector();
  applyPreviewProperties();
})();
