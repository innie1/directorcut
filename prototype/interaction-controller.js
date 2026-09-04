// Interaction refinements kept separate from app orchestration so pointer handling can evolve independently.
// Classic scripts share DirectorCut's global lexical environment, so this safely replaces the drag entry point.
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
  state.drag = {
    clipId,
    startX: ev.clientX,
    width: laneWidth,
    total,
    base,
    original: clone(found.clip),
    before: snapshot()
  };
};
