// DirectorCut v0.3.1 integration layer. Loaded after app.js so it can refine behavior without duplicating app orchestration.
(() => {
  if (!window.DirectorTimeline) return;

  state.mediaLibrary = Array.isArray(state.mediaLibrary) ? state.mediaLibrary : [];

  const originalProjectObject = projectObject;
  projectObject = function () {
    const p = originalProjectObject();
    p.mediaLibrary = state.mediaLibrary || [];
    p.attachments = (state.attachments || []).map(a => ({ ...a }));
    return p;
  };

  const originalLoadProjectObject = loadProjectObject;
  loadProjectObject = function (p) {
    originalLoadProjectObject(p);
    state.mediaLibrary = Array.isArray(p.mediaLibrary) ? p.mediaLibrary : (state.media ? [state.media] : []);
    if (Array.isArray(p.attachments)) state.attachments = p.attachments;
    renderMediaBin();
    if (typeof renderAttachments === 'function') renderAttachments();
  };

  const originalAcceptDesktopMedia = acceptDesktopMedia;
  acceptDesktopMedia = async function (media) {
    await originalAcceptDesktopMedia(media);
    if (media?.path && !state.mediaLibrary.some(m => m.path === media.path)) state.mediaLibrary.push(media);
    renderMediaBin();
  };

  function ensureTrack(kind, preferredId) {
    let track = state.timeline.tracks.find(t => t.id === preferredId && t.kind === kind);
    if (track) return track;
    track = state.timeline.tracks.find(t => t.kind === kind);
    if (track) return track;
    const prefix = kind === 'audio' ? 'A' : 'V';
    const nums = state.timeline.tracks.filter(t => t.kind === kind).map(t => Number(String(t.id).replace(/\D/g,'')) || 0);
    const id = `${prefix}${Math.max(0,...nums)+1}`;
    track = { id, name:`${id} ${kind === 'audio' ? 'Audio' : 'Video'}`, kind, locked:false, muted:false, hidden:false, clips:[] };
    state.timeline.tracks.push(track);
    return track;
  }

  function renderMediaBin() {
    const root = $('#mediaBin');
    if (!root) return;
    root.innerHTML = '';
    for (const media of state.mediaLibrary || []) {
      const item = document.createElement('div');
      item.className = 'mediaBinItem';
      item.title = media.path || media.name;
      const name = document.createElement('span');
      name.textContent = media.name || 'Media';
      const meta = document.createElement('small');
      meta.textContent = `${tc(Number(media.duration || 0))}${media.width ? ` · ${media.width}×${media.height}` : ''}`;
      item.append(name, meta);
      item.ondblclick = () => { if (media.url) { setVideoSource(media.url); systemMessage(`Previewing ${media.name}. The timeline is unchanged.`); } };
      root.appendChild(item);
    }
  }

  async function addMediaFiles() {
    if (!desktop || !window.directorcut.pickManyMedia) return;
    const mediaList = (await window.directorcut.pickManyMedia()).filter(m => m && !m.error && m.path);
    if (!mediaList.length) return;
    let list = mediaList;
    if (!state.media?.path) {
      await acceptDesktopMedia(mediaList[0]);
      list = mediaList.slice(1);
    }
    if (!list.length) return;
    pushUndo();
    let cursor = TL.duration(state.timeline);
    const videoTrack = ensureTrack('video','V1'), audioTrack = ensureTrack('audio','A1');
    for (const media of list) {
      if (!state.mediaLibrary.some(m => m.path === media.path)) state.mediaLibrary.push(media);
      const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
      const vid = `video-${token}`, aud = `audio-${token}`, duration = Math.max(1 / fps(), Number(media.duration || 0.1));
      videoTrack.clips.push(TL.createClip({ id:vid, trackId:videoTrack.id, kind:'video', name:media.name, sourcePath:media.path, start:cursor, duration, sourceDuration:duration, linkedId:media.hasAudio === false ? null : aud }));
      if (media.hasAudio !== false) audioTrack.clips.push(TL.createClip({ id:aud, trackId:audioTrack.id, kind:'audio', name:`${media.name} · audio`, sourcePath:media.path, start:cursor, duration, sourceDuration:duration, linkedId:vid }));
      cursor += duration;
    }
    videoTrack.clips.sort((a,b)=>a.start-b.start); audioTrack.clips.sort((a,b)=>a.start-b.start);
    state.duration = Math.max(state.duration, cursor);
    renderMediaBin(); renderTimeline(); markDirty();
    say(`Added ${list.length} media file${list.length===1?'':'s'} to the timeline with linked audio.`, 'ai');
  }

  const addMediaButton = $('#addMedia');
  if (addMediaButton) addMediaButton.onclick = () => addMediaFiles().catch(e => say(`Add media failed: ${e.message}`));

  window.addEventListener('pointermove', ev => {
    const drag = state.drag;
    if (!drag) return;
    const delta = (ev.clientX - drag.startX) / Math.max(1, drag.width) * drag.total;
    const original = TL.findClip(drag.base, drag.clipId);
    if (!original) return;
    if (state.activeTool === 'select') {
      const lane = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.lane');
      const targetTrack = lane ? drag.base.tracks.find(t => t.id === lane.dataset.trackId) : null;
      let timeline;
      const desired = original.clip.start + delta;
      if (targetTrack && targetTrack.kind === original.track.kind && targetTrack.id !== original.track.id) {
        timeline = TL.moveClipToTrack(drag.base, drag.clipId, targetTrack.id, desired);
        const moved = TL.findClip(timeline, drag.clipId), actualDelta = moved ? moved.clip.start - original.clip.start : 0;
        if (original.clip.linkedId) {
          const linked = TL.findClip(timeline, original.clip.linkedId);
          if (linked) timeline = TL.moveClip(timeline, linked.clip.id, linked.clip.start + actualDelta, { snap:false });
        }
      } else timeline = TL.moveClipLinked(drag.base, drag.clipId, desired);
      state.timeline = timeline;
      renderTimeline();
    } else if (state.activeTool === 'slip') {
      state.timeline = TL.slipClipLinked(drag.base, drag.clipId, delta);
      renderTimeline();
    }
  });

  function applyEnhancedOperations(operations, context = 'Director edit', options = {}) {
    const ops = Array.isArray(operations) ? operations : [];
    if (!ops.length) return 0;
    if (options.recordUndo !== false) pushUndo();
    let changed = 0;
    for (const op of ops) {
      if (!op) continue;
      if (op.type === 'seek') { video.currentTime = frameSnap(Number(op.time)||0); renderTimeline(); continue; }
      if (op.type === 'split_at') { state.timeline = TL.splitAt(state.timeline, Number(op.time)||video.currentTime); state.splitPoints.push(frameSnap(Number(op.time)||video.currentTime)); changed++; continue; }
      if (op.type === 'remove_range') { state.timeline = TL.rippleDelete(state.timeline, Number(op.start)||0, Number(op.end)||0); changed++; continue; }
      if (op.type === 'add_marker') { state.marks.push(frameSnap(Number(op.time)||video.currentTime)); changed++; continue; }
      if (op.type === 'move_clip') { state.timeline = TL.moveClipLinked(state.timeline, String(op.clipId), Number(op.newStart)||0); changed++; continue; }
      if (op.type === 'slip_clip') { state.timeline = TL.slipClipLinked(state.timeline, String(op.clipId), Number(op.delta)||0); changed++; continue; }
      if (op.type === 'slide_clip') {
        const before = TL.findClip(state.timeline,String(op.clipId)), linkedId = before?.clip?.linkedId;
        state.timeline = TL.slideClip(state.timeline,String(op.clipId),Number(op.delta)||0);
        if (linkedId) state.timeline = TL.slideClip(state.timeline,linkedId,Number(op.delta)||0);
        changed++; continue;
      }
      if (op.type === 'roll_boundary') {
        const left = TL.findClip(state.timeline,String(op.leftId)), right = TL.findClip(state.timeline,String(op.rightId));
        const linkedLeft = left?.clip?.linkedId, linkedRight = right?.clip?.linkedId;
        state.timeline = TL.rollBoundary(state.timeline,String(op.leftId),String(op.rightId),Number(op.delta)||0);
        if (linkedLeft && linkedRight) state.timeline = TL.rollBoundary(state.timeline,linkedLeft,linkedRight,Number(op.delta)||0);
        changed++; continue;
      }
      if (op.type === 'add_keyframe') { state.timeline = TL.addKeyframe(state.timeline,String(op.clipId),String(op.property),Number(op.time)||video.currentTime,Number(op.value)); changed++; }
    }
    if (changed) {
      renderTimeline(); markDirty();
      if (options.learn !== false) learn('accepted',context,ops.map(o=>o.type).join(', '));
    }
    return changed;
  }
  window.DirectorCutApplyOperations = applyEnhancedOperations;

  function fallbackIntent(q) {
    const low = q.toLowerCase(), ops = [];
    if (/\bsplit\b.*\b(here|playhead|now)\b/.test(low)) ops.push({ type:'split_at', time:frameSnap(video.currentTime) });
    if (/\b(remove|delete|cut out)\b/.test(low) && state.inPoint !== null && state.outPoint !== null) ops.push({ type:'remove_range', start:Math.min(state.inPoint,state.outPoint), end:Math.max(state.inPoint,state.outPoint) });
    if (/\bmark(er)?\b.*\b(here|now)\b/.test(low)) ops.push({ type:'add_marker', time:frameSnap(video.currentTime) });
    if (ops.length) return { intent:'edit_task', text:'I can apply that as a reversible timeline edit.', operations:ops };
    return { intent:'conversation', text:'I can discuss the project normally here. Switch to Director when you want a request to become a timeline operation.', operations:[] };
  }
  window.DirectorCutFallbackIntent = fallbackIntent;

  const sendButton = $('#send');
  if (sendButton) sendButton.onclick = async () => {
    const prompt = $('#prompt'), q = prompt.value.trim();
    if (!q) return;
    say(q,'user'); prompt.value=''; sendButton.disabled = true;
    try {
      const selected = state.selectedClipId ? TL.findClip(state.timeline,state.selectedClipId) : null;
      const payload = {
        request:q, workspaceMode:state.workspaceMode, directorPolicy:state.directorPolicy, model:state.selectedModel,
        history:state.conversation.slice(-12), currentTime:frameSnap(video.currentTime || 0),
        selection:selected ? { trackId:selected.track.id, clip:selected.clip } : null,
        project:{ name:state.name, duration:Math.max(state.duration,TL.duration(state.timeline)), timeline:state.timeline, learned:state.edits.slice(-24) },
        transcript_excerpt:(state.transcript?.text || state.script || '').slice(0,12000),
        attachments:(state.attachments||[]).map(a=>({name:a.name,kind:a.kind,path:(a.kind==='image'||a.kind==='video')?a.path:null,text:a.text?.slice?.(0,5000)||null}))
      };
      let result = desktop ? await window.directorcut.askDirector(payload) : null;
      if (!result?.available) result = fallbackIntent(q);
      const text = result.text || 'Done.', ops = Array.isArray(result.operations) ? result.operations : [];
      if (state.workspaceMode !== 'Director' || state.directorPolicy === 'Ask' || result.intent !== 'edit_task' || !ops.length) { say(text); return; }
      if (state.directorPolicy === 'Co-edit') { showProposal(text,ops,q); state.pendingProposal={text,ops,context:q}; return; }
      const count = applyEnhancedOperations(ops,q);
      say(count ? `${text}\n\nApplied ${count} reversible timeline operation${count===1?'':'s'}.` : text);
    } catch (e) { say(`Director error: ${e.message}`); }
    finally { sendButton.disabled=false; }
  };

  const approve = $('#approve'), reject = $('#reject');
  if (approve) approve.onclick = () => {
    const pending = state.pendingProposal;if (!pending) return;
    const count = applyEnhancedOperations(pending.ops,pending.context || 'approved proposal');
    say(count ? `Applied ${count} approved operation${count===1?'':'s'}.` : 'There was no valid operation to apply.');
    state.pendingProposal=null; $('#proposal').hidden=true;
  };
  if (reject) reject.onclick = () => {
    const pending=state.pendingProposal;if (pending) learn('rejected',pending.context||'proposal',pending.text||'');
    state.pendingProposal=null; $('#proposal').hidden=true; say('Rejected. I’ll keep that correction in the local learning history.');
  };

  renderMediaBin();
})();
