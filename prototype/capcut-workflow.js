// Timeline-first editing workflow inspired by familiar desktop NLE behavior.
// Manual timeline actions stay out of Director chat; captions live as timed timeline clips;
// normal delete leaves a gap; ripple delete is explicit; timeline zoom/height are user controlled.
(() => {
  const TL = window.DirectorTimeline;
  const CU = window.DirectorCaptionUtils;
  const SA = window.DirectorSelectionActions;
  const video = document.querySelector('#video');
  const timeline = document.querySelector('.timeline');
  const timelineTop = document.querySelector('.timelineTop');
  const tracks = document.querySelector('#tracks');
  const ruler = document.querySelector('#ruler');
  const right = document.querySelector('.right');
  if (!TL || !video || !timeline || !timelineTop || !tracks) return;

  // ---------- Keep Director chat for actual conversation / Director work ----------
  // ux-controller's original compact observer intentionally limited chat history. Replace
  // the node so normal user/Director conversation can scroll naturally without manual edit logs.
  const oldActivity = document.querySelector('#activity');
  if (oldActivity?.parentNode) {
    const cleanActivity = oldActivity.cloneNode(true);
    oldActivity.replaceWith(cleanActivity);
    [...cleanActivity.querySelectorAll('.message')].forEach(node => {
      const text = node.textContent || '';
      if (/^(Split clips at|Split marker recorded|Undid the last timeline change|Frame-snapped ripple delete)/i.test(text)) node.remove();
    });
  }

  // Composer belongs inside Director, never over the timeline.
  const composer = document.querySelector('#floatingComposer');
  if (right && composer && composer.parentElement !== right) right.appendChild(composer);

  // ---------- Small editor status/toast, separate from Director chat ----------
  let toastTimer = null;
  function editorToast(text) {
    let toast = document.querySelector('#editorToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'editorToast';
      toast.className = 'editorToast';
      document.body.appendChild(toast);
    }
    clearTimeout(toastTimer);
    toast.textContent = text;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1400);
  }
  window.DirectorCutEditorToast = editorToast;

  // ---------- Captions are timeline clips, not a permanent panel under the monitor ----------
  const transcriptPanel = document.querySelector('.transcriptPanel');
  transcriptPanel?.classList.add('timelineTranscriptSource');
  let captionFingerprint = '';

  function captionTrack() {
    let track = state.timeline.tracks.find(track => track.kind === 'caption');
    if (!track) {
      track = { id:'C1', name:'C1 Captions', kind:'caption', locked:false, muted:false, hidden:false, clips:[] };
      state.timeline.tracks.push(track);
    }
    return track;
  }

  function transcriptFingerprint() {
    const words = state.transcript?.words || [];
    if (!words.length) return '';
    const first = words[0], last = words[words.length - 1];
    return `${words.length}|${state.transcript?.text || ''}|${first?.start_ms ?? first?.start ?? ''}|${last?.end_ms ?? last?.end ?? ''}`;
  }

  function syncCaptionsFromTranscript(force = false) {
    if (!CU || !state.transcript?.words?.length) return false;
    const fingerprint = transcriptFingerprint();
    const track = captionTrack();
    const auto = (track.clips || []).filter(clip => String(clip.id).startsWith('caption-auto-'));
    // Preserve already-saved auto captions on project load so user text corrections are not overwritten.
    if (!force && !captionFingerprint && auto.length) {
      captionFingerprint = fingerprint;
      return false;
    }
    if (!force && fingerprint === captionFingerprint) return false;
    const manual = (track.clips || []).filter(clip => !String(clip.id).startsWith('caption-auto-'));
    const generated = CU.clipsFromTranscript(state.transcript, track.id);
    track.clips = [...manual, ...generated].sort((a,b) => a.start - b.start);
    captionFingerprint = fingerprint;
    renderTimeline();
    editorToast(`${generated.length} caption${generated.length === 1 ? '' : 's'} added to timeline`);
    return true;
  }

  function removeCaptionsInRange(start, end, options = {}) {
    const track = state.timeline.tracks.find(track => track.kind === 'caption');
    if (!track || track.locked) return;
    const a = Math.min(start,end), b = Math.max(start,end);
    const kept = [];
    for (const clip of track.clips || []) {
      const clipEnd = TL.clipEnd(clip);
      if (clipEnd <= a + 1e-6 || clip.start >= b - 1e-6) kept.push(clip);
    }
    track.clips = kept;
    if (options.ripple) {
      const cut = b - a;
      for (const clip of track.clips) if (clip.start >= b - 1e-6) clip.start = TL.snapTime(Math.max(0, clip.start - cut), state.timeline.fps);
    }
  }
  window.DirectorCutCaptions = { sync:syncCaptionsFromTranscript, removeInRange };

  if (typeof renderTranscript === 'function') {
    const baseRenderTranscript = renderTranscript;
    renderTranscript = function (...args) {
      const result = baseRenderTranscript.apply(this,args);
      setTimeout(() => syncCaptionsFromTranscript(true),0);
      return result;
    };
  }
  setTimeout(() => syncCaptionsFromTranscript(false),0);

  // One direct entry point for captions near the timeline.
  const timelineLeft = timelineTop.querySelector(':scope > div');
  if (timelineLeft && !document.querySelector('#timelineCaptions')) {
    const captions = document.createElement('button');
    captions.id = 'timelineCaptions';
    captions.textContent = 'CC Captions';
    captions.title = 'Generate captions from speech and place them on the timeline';
    captions.onclick = () => {
      if (state.transcript?.words?.length) syncCaptionsFromTranscript(true);
      else if (state.media?.path) document.querySelector('#transcribe')?.click();
      else editorToast('Import a video first');
    };
    timelineLeft.appendChild(captions);
  }

  // ---------- Manual split: real clip edit, no Director message ----------
  function clipAtPlayhead(time) {
    if (state.selectedClipId) {
      const selected = TL.findClip(state.timeline,state.selectedClipId);
      if (selected && time > selected.clip.start + 1e-6 && time < TL.clipEnd(selected.clip) - 1e-6) return selected;
    }
    const videos = (state.timeline.tracks || []).filter(track => track.kind === 'video' && !track.hidden && !track.locked);
    for (const track of videos) {
      const clip = (track.clips || []).find(clip => time > clip.start + 1e-6 && time < TL.clipEnd(clip) - 1e-6);
      if (clip) return TL.findClip(state.timeline,clip.id);
    }
    return null;
  }

  function manualSplit() {
    if (!video.src) return false;
    const t = frameSnap(Number(video.currentTime || 0));
    const found = clipAtPlayhead(t);
    if (!found) { editorToast('Move the playhead inside a clip'); return false; }
    state.selectedClipId = found.clip.id;
    const workflow = window.DirectorCutSelectionWorkflow;
    if (workflow?.splitSelected) return workflow.splitSelected();
    const ids = [found.track.id];
    if (found.clip.linkedId) {
      const linked = TL.findClip(state.timeline,found.clip.linkedId);
      if (linked) ids.push(linked.track.id);
    }
    pushUndo();
    state.timeline = TL.splitAt(state.timeline,t,ids);
    state.splitPoints.push(t);
    markDirty();
    renderTimeline();
    editorToast('Split clip');
    return true;
  }
  const splitButton = document.querySelector('#split');
  if (splitButton) splitButton.onclick = manualSplit;

  // Manual undo stays in the editor, not Director chat.
  const undoButton = document.querySelector('#undoEdit');
  if (undoButton) undoButton.onclick = () => {
    const snapshot = state.undo.pop();
    if (!snapshot) { editorToast('Nothing to undo'); return; }
    restore(snapshot);
    editorToast('Undo');
  };

  // Delete an In/Out range without closing the gap. Ripple delete remains a separate action.
  function liftRange(start,end) {
    const a = frameSnap(Math.min(start,end)), b = frameSnap(Math.max(start,end));
    if (b - a < TL.frameDuration(state.timeline.fps)) return false;
    let next = TL.splitAt(state.timeline,a);
    next = TL.splitAt(next,b);
    for (const track of next.tracks || []) {
      if (track.locked) continue;
      track.clips = (track.clips || []).filter(clip => !(clip.start >= a - 1e-6 && TL.clipEnd(clip) <= b + 1e-6));
    }
    state.timeline = next;
    return true;
  }
  const deleteRange = document.querySelector('#deleteRange');
  if (deleteRange) deleteRange.onclick = () => {
    if (state.inPoint === null || state.outPoint === null) { editorToast('Set In and Out first'); return; }
    pushUndo();
    const start = state.inPoint, end = state.outPoint;
    if (!liftRange(start,end)) { state.undo.pop(); editorToast('Range is too short'); return; }
    state.inPoint = state.outPoint = null;
    const readout = document.querySelector('#rangeReadout');
    if (readout) readout.textContent = 'In — / Out —';
    markDirty();
    renderTimeline();
    editorToast('Deleted range · gap preserved');
  };

  // CapCut-style Ctrl/Cmd+B split shortcut while retaining C for existing users.
  window.addEventListener('keydown', event => {
    const typing = event.target?.closest?.('input,textarea,select,[contenteditable="true"]');
    if (typing) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      event.stopImmediatePropagation();
      manualSplit();
    }
  }, true);

  // ---------- Timeline zoom + resizable timeline height ----------
  let zoom = Math.max(1, Math.min(8, Number(localStorage.getItem('directorcut.timelineZoom') || 1)));
  let timelineHeight = Math.max(190, Math.min(520, Number(localStorage.getItem('directorcut.timelineHeight') || 282)));
  document.documentElement.style.setProperty('--dc-timeline-height',`${timelineHeight}px`);

  function ensureZoomControls() {
    let root = document.querySelector('#timelineZoom');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'timelineZoom';
    root.className = 'timelineZoom';
    root.innerHTML = '<button type="button" data-z="out" title="Zoom out">−</button><input aria-label="Timeline zoom" type="range" min="1" max="8" step="0.1"><button type="button" data-z="in" title="Zoom in">＋</button><button type="button" data-z="fit" class="zoomFit">Fit</button>';
    const status = document.querySelector('#status');
    timelineTop.insertBefore(root,status || null);
    const input = root.querySelector('input');
    input.value = String(zoom);
    input.oninput = () => { zoom = Number(input.value); saveZoom(); applyTimelineGeometry(); };
    root.querySelector('[data-z="out"]').onclick = () => { zoom = Math.max(1,zoom/1.25); input.value=String(zoom); saveZoom(); applyTimelineGeometry(); };
    root.querySelector('[data-z="in"]').onclick = () => { zoom = Math.min(8,zoom*1.25); input.value=String(zoom); saveZoom(); applyTimelineGeometry(); };
    root.querySelector('[data-z="fit"]').onclick = () => { zoom=1; input.value='1'; saveZoom(); applyTimelineGeometry(); timeline.scrollLeft=0; };
    return root;
  }
  function saveZoom(){ localStorage.setItem('directorcut.timelineZoom',String(zoom)); }
  function applyTimelineGeometry() {
    const available = Math.max(420,timeline.clientWidth - 148);
    const laneWidth = Math.round(available * zoom);
    timeline.style.setProperty('--dc-lane-width',`${laneWidth}px`);
    timeline.style.setProperty('--dc-ruler-step',`${Math.max(32,100*zoom)}px`);
  }
  ensureZoomControls();

  timeline.addEventListener('wheel', event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    zoom = Math.max(1,Math.min(8,zoom * (event.deltaY < 0 ? 1.12 : 1/1.12)));
    const input = document.querySelector('#timelineZoom input');
    if (input) input.value=String(zoom);
    saveZoom(); applyTimelineGeometry();
  }, { passive:false });

  if (!timeline.querySelector('.timelineResizeHandle')) {
    const handle = document.createElement('div');
    handle.className = 'timelineResizeHandle';
    handle.title = 'Drag to resize timeline';
    timeline.prepend(handle);
    let startY=0,startHeight=timelineHeight,resizing=false;
    handle.onpointerdown = event => {
      resizing=true; startY=event.clientY; startHeight=timelineHeight;
      handle.setPointerCapture?.(event.pointerId); document.body.classList.add('timelineResizing');
      event.preventDefault();
    };
    window.addEventListener('pointermove', event => {
      if (!resizing) return;
      timelineHeight=Math.max(190,Math.min(520,startHeight-(event.clientY-startY)));
      document.documentElement.style.setProperty('--dc-timeline-height',`${timelineHeight}px`);
      applyTimelineGeometry();
    });
    window.addEventListener('pointerup', () => {
      if (!resizing) return;
      resizing=false; document.body.classList.remove('timelineResizing');
      localStorage.setItem('directorcut.timelineHeight',String(Math.round(timelineHeight)));
    });
  }

  // ---------- Cleaner playback controls ----------
  video.controls = false;
  const transport = document.querySelector('.simplifiedTransport');
  function stepFrames(frames) {
    const step = TL.frameDuration(state.timeline.fps || 30) * frames;
    video.pause();
    const end = Math.max(0,TL.duration(state.timeline));
    video.currentTime = frameSnap(Math.max(0,Math.min(end || Infinity,Number(video.currentTime || 0)+step)));
    renderTimeline();
  }
  if (transport) {
    let play = document.querySelector('#programPlayPause');
    if (!play) {
      play=document.createElement('button'); play.id='programPlayPause'; play.textContent='▶'; play.title='Play / Pause · Space';
      document.querySelector('#time')?.insertAdjacentElement('afterend',play);
      play.onclick=()=>video.paused?video.play().catch(()=>{}):video.pause();
    }
    if (!document.querySelector('#stepBackFrame')) {
      const back=document.createElement('button');back.id='stepBackFrame';back.className='frameStep';back.textContent='‹';back.title='Previous frame · Left Arrow';back.onclick=()=>stepFrames(-1);
      const next=document.createElement('button');next.id='stepForwardFrame';next.className='frameStep';next.textContent='›';next.title='Next frame · Right Arrow';next.onclick=()=>stepFrames(1);
      play.insertAdjacentElement('beforebegin',back);play.insertAdjacentElement('afterend',next);
    }
  }

  // ---------- Source fallback must visibly respect simple timeline gaps ----------
  const viewport = document.querySelector('.videoViewport') || video.parentElement;
  let gapOverlay = document.querySelector('#timelineGapOverlay');
  if (viewport && !gapOverlay) {
    gapOverlay=document.createElement('div');
    gapOverlay.id='timelineGapOverlay'; gapOverlay.className='timelineGapOverlay'; gapOverlay.hidden=true;
    gapOverlay.innerHTML='<span>Gap</span>';
    viewport.appendChild(gapOverlay);
  }

  function sourceFallbackStateAt(time) {
    const visibleTracks=(state.timeline.tracks || []).filter(track=>track.kind==='video'&&!track.hidden);
    for(const track of visibleTracks){
      const clip=(track.clips||[]).find(clip=>time>=clip.start-1e-4&&time<TL.clipEnd(clip)-1e-4);
      if(clip) return {clip,track};
    }
    return null;
  }
  function syncSourceFallback() {
    if (!gapOverlay) return;
    if (window.DirectorCutProgramMonitor?.active) {
      gapOverlay.hidden=true; video.classList.remove('sourceTimelineHidden'); return;
    }
    const t=Number(video.currentTime||0), active=sourceFallbackStateAt(t);
    if(!active){
      gapOverlay.hidden=false;gapOverlay.querySelector('span').textContent='Gap';video.classList.add('sourceTimelineHidden');return;
    }
    const sameSource=!active.clip.sourcePath||!state.media?.path||active.clip.sourcePath===state.media.path;
    const directTime=Math.abs(Number(active.clip.sourceIn||0)-Number(active.clip.start||0))<=TL.frameDuration(state.timeline.fps)*0.75;
    if(sameSource&&directTime){gapOverlay.hidden=true;video.classList.remove('sourceTimelineHidden');return;}
    gapOverlay.hidden=false;gapOverlay.querySelector('span').textContent='Timeline preview requires GES';video.classList.add('sourceTimelineHidden');
  }
  video.addEventListener('timeupdate',syncSourceFallback);
  video.addEventListener('seeking',syncSourceFallback);

  // Right-click clip menu for basic actions.
  let contextMenu=null;
  function closeContext(){contextMenu?.remove();contextMenu=null;}
  document.addEventListener('contextmenu',event=>{
    const clip=event.target.closest?.('.clip[data-clip-id]');
    if(!clip)return;
    event.preventDefault();closeContext();selectClip(clip.dataset.clipId);
    contextMenu=document.createElement('div');contextMenu.className='clipContextMenu';
    contextMenu.innerHTML='<button data-a="split">Split <kbd>Ctrl+B</kbd></button><button data-a="delete">Delete <kbd>Del</kbd></button><button data-a="ripple">Ripple delete</button>';
    contextMenu.style.left=`${Math.min(window.innerWidth-190,event.clientX)}px`;contextMenu.style.top=`${Math.min(window.innerHeight-130,event.clientY)}px`;
    document.body.appendChild(contextMenu);
    contextMenu.querySelector('[data-a="split"]').onclick=()=>{window.DirectorCutSelectionWorkflow?.splitSelected?.();closeContext();};
    contextMenu.querySelector('[data-a="delete"]').onclick=()=>{window.DirectorCutSelectionWorkflow?.deleteSelected?.(false);closeContext();};
    contextMenu.querySelector('[data-a="ripple"]').onclick=()=>{window.DirectorCutSelectionWorkflow?.deleteSelected?.(true);closeContext();};
  });
  document.addEventListener('pointerdown',event=>{if(contextMenu&&!contextMenu.contains(event.target))closeContext();});

  // Re-apply geometry/gap state after every timeline render.
  const baseRenderTimeline=renderTimeline;
  renderTimeline=function(...args){
    const result=baseRenderTimeline.apply(this,args);
    applyTimelineGeometry();
    syncSourceFallback();
    return result;
  };
  window.addEventListener('resize',applyTimelineGeometry);

  applyTimelineGeometry();
  syncSourceFallback();
})();
