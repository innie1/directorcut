// Interaction refinements kept separate from app orchestration so pointer handling can evolve independently.
// Classic scripts share DirectorCut's global lexical environment, so these refinements operate on the same project state.
startClipDrag = function(ev, clipId, lane, total) {
  if (ev.button !== 0) return;
  const laneWidth = Math.max(1, lane.getBoundingClientRect().width);
  ev.preventDefault();
  state.selectedClipId = clipId;
  $$('.clip').forEach(el => el.classList.toggle('selected', el.dataset.clipId === clipId));
  renderSelectedClip();
  const base = clone(state.timeline);
  const found = TL.findClip(base, clipId);
  if (!found) return;
  state.drag = { clipId, startX: ev.clientX, width: laneWidth, total, base, original: clone(found.clip), before: snapshot() };
};

// A split is a real edit: every unlocked clip intersecting the playhead is divided into two source-aware clips.
$('#split').onclick = () => {
  if (!video.src) return;
  const t = frameSnap(video.currentTime);
  pushUndo();
  state.timeline = TL.splitAt(state.timeline, t);
  state.splitPoints.push(t);
  learn('accepted', 'manual split', `split at ${t.toFixed(6)}s`);
  markDirty();
  say(`Split clips at ${tc(t)}. Roll, slip and slide can now work on the resulting edits.`);
  renderTimeline();
};

// Replace the first v0.3 dispatcher so Director split_at uses the same real timeline primitive as manual editing.
applyOperations = function(ops, source = 'Director') {
  const operations = Array.isArray(ops) ? ops : [];
  const mutating = operations.some(o => o.type !== 'seek');
  if (mutating) pushUndo();
  let applied = 0;
  for (const op of operations) {
    if (op.type === 'seek') {
      video.currentTime = frameSnap(op.time); applied++;
    } else if (op.type === 'split_at') {
      const t = frameSnap(op.time);
      state.timeline = TL.splitAt(state.timeline, t);
      state.splitPoints.push(t); applied++;
    } else if (op.type === 'add_marker') {
      state.marks.push(frameSnap(op.time)); applied++;
    } else if (op.type === 'remove_range') {
      const start = frameSnap(Math.min(op.start, op.end)), end = frameSnap(Math.max(op.start, op.end));
      if (end > start) {
        state.removeRanges.push({ start, end });
        state.removeRanges.sort((a, b) => a.start - b.start);
        state.timeline = TL.rippleDelete(state.timeline, start, end); applied++;
      }
    } else if (op.type === 'move_clip') {
      state.timeline = TL.moveClip(state.timeline, op.clipId, op.newStart); applied++;
    } else if (op.type === 'add_keyframe') {
      state.timeline = TL.addKeyframe(state.timeline, op.clipId, op.property, op.time, op.value); applied++;
    }
  }
  if (mutating && applied) {
    learn('accepted', source, operations);
    markDirty();
    renderTimeline();
  }
  return applied;
};
