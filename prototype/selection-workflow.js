// Selected-clip workflow: direct timeline actions with non-ripple delete by default.
(() => {
  const TL = window.DirectorTimeline;
  const SA = window.DirectorSelectionActions;
  if (!TL || !SA) return;

  const video = document.querySelector('#video');
  const timelineTop = document.querySelector('.timelineTop > div');
  const isTyping = target => Boolean(target?.closest?.('input,textarea,select,[contenteditable="true"]'));
  const notice = text => window.DirectorCutEditorToast?.(text);

  function selected() {
    return state.selectedClipId ? TL.findClip(state.timeline, state.selectedClipId) : null;
  }

  function linkedTrackIds(found) {
    const ids = [found.track.id];
    if (found.clip.linkedId) {
      const linked = TL.findClip(state.timeline, found.clip.linkedId);
      if (linked && !ids.includes(linked.track.id)) ids.push(linked.track.id);
    }
    return ids;
  }

  function ensureQuickActions() {
    let bar = document.querySelector('#clipQuickActions');
    if (bar || !timelineTop) return bar;
    bar = document.createElement('span');
    bar.id = 'clipQuickActions';
    bar.className = 'clipQuickActions';
    bar.hidden = true;
    bar.innerHTML = [
      '<span class="clipQuickLabel">Selected</span>',
      '<button type="button" data-quick="split" title="Split selected clip at the playhead (C or Ctrl+B)">✂ <span>Split</span></button>',
      '<button type="button" data-quick="delete" class="quickDelete" title="Delete selected clip and leave a gap (Delete / Backspace)">⌫ <span>Delete</span></button>',
      '<button type="button" data-quick="ripple" title="Delete selected clip and close the gap">⇤ <span>Ripple delete</span></button>',
      '<button type="button" data-quick="undo" title="Undo last edit (Ctrl+Z)">↶ <span>Undo</span></button>',
      '<small id="clipQuickHint"></small>'
    ].join('');
    timelineTop.appendChild(bar);
    bar.querySelector('[data-quick="split"]').onclick = splitSelected;
    bar.querySelector('[data-quick="delete"]').onclick = () => deleteSelected(false);
    bar.querySelector('[data-quick="ripple"]').onclick = () => deleteSelected(true);
    bar.querySelector('[data-quick="undo"]').onclick = () => document.querySelector('#undoEdit')?.click();
    return bar;
  }

  let hintTimer = null;
  function flashHint(text) {
    const hint = ensureQuickActions()?.querySelector('#clipQuickHint');
    if (!hint) return;
    clearTimeout(hintTimer);
    hint.textContent = text;
    hintTimer = setTimeout(() => { hint.textContent = ''; }, 1600);
  }

  function syncQuickActions() {
    const bar = ensureQuickActions();
    if (!bar) return;
    const found = selected();
    bar.hidden = !found;
    if (!found) return;
    const locked = Boolean(found.track.locked);
    bar.classList.toggle('locked', locked);
    for (const action of ['delete','ripple','split']) {
      const button = bar.querySelector(`[data-quick="${action}"]`);
      if (button) button.disabled = locked;
    }
    const label = bar.querySelector('.clipQuickLabel');
    if (label) label.textContent = found.clip.name || 'Selected clip';
  }

  function deleteSelected(ripple = false) {
    const found = selected();
    if (!found) return false;
    if (found.track.locked) { flashHint('Track is locked'); return false; }
    const clipId = found.clip.id;
    const start = found.clip.start;
    const end = TL.clipEnd(found.clip);
    const videoSelection = found.track.kind === 'video';
    pushUndo();
    state.timeline = ripple ? SA.rippleDeleteSelectedClip(state.timeline, clipId) : SA.removeSelectedClip(state.timeline, clipId);
    if (videoSelection) window.DirectorCutCaptions?.removeInRange?.(start, end, { ripple });
    state.selectedClipId = null;
    learn('accepted', ripple ? 'manual ripple delete selected clip' : 'manual delete selected clip', clipId);
    markDirty();
    renderTimeline();
    notice?.(ripple ? 'Ripple deleted clip' : 'Deleted clip · gap preserved');
    return true;
  }

  function splitSelected() {
    const found = selected();
    if (!found) return false;
    if (found.track.locked) { flashHint('Track is locked'); return false; }
    const frame = TL.frameDuration(state.timeline.fps);
    const t = frameSnap(Number(video?.currentTime || 0));
    const start = found.clip.start, end = TL.clipEnd(found.clip);
    if (t <= start + frame * 0.5 || t >= end - frame * 0.5) {
      flashHint('Move the playhead inside this clip');
      return false;
    }
    pushUndo();
    state.timeline = TL.splitAt(state.timeline, t, linkedTrackIds(found));
    state.splitPoints.push(t);
    const sameTrack = state.timeline.tracks.find(track => track.id === found.track.id);
    const right = sameTrack?.clips?.find(clip => Math.abs(clip.start - t) <= frame * 0.51);
    state.selectedClipId = right?.id || found.clip.id;
    learn('accepted', 'manual split selected clip', `split at ${t.toFixed(6)}s`);
    markDirty();
    renderTimeline();
    notice?.('Split clip');
    return true;
  }

  const baseRenderTimeline = renderTimeline;
  renderTimeline = function (...args) {
    const result = baseRenderTimeline.apply(this, args);
    syncQuickActions();
    return result;
  };

  // Window capture runs before older document-level shortcut handlers.
  window.addEventListener('keydown', event => {
    if (isTyping(event.target)) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedClipId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      deleteSelected(false);
    }
  }, true);

  function patchShortcutSheet() {
    const sheet = document.querySelector('#shortcutSheet');
    if (!sheet) return;
    const rows = [...sheet.querySelectorAll('.shortcutRow')];
    const deleteRow = rows.find(row => row.querySelector('kbd')?.textContent.trim() === 'Delete');
    if (deleteRow) {
      deleteRow.querySelector('kbd').textContent = 'Delete / Backspace';
      deleteRow.querySelector('span').textContent = 'Delete selected clip · leave gap';
    }
    if (!sheet.querySelector('[data-range-delete-help]')) {
      const grid = sheet.querySelector('.shortcutGrid');
      const row = document.createElement('div');
      row.className = 'shortcutRow';
      row.dataset.rangeDeleteHelp = 'true';
      row.innerHTML = '<kbd>I / O + Delete</kbd><span>Delete a marked range and leave a gap when no clip is selected</span>';
      grid?.appendChild(row);
    }
  }

  document.querySelector('#shortcutButton')?.addEventListener('click', () => setTimeout(patchShortcutSheet, 0));
  window.addEventListener('keydown', event => {
    if (event.key === '?' || (event.shiftKey && event.key === '/')) setTimeout(patchShortcutSheet, 0);
  }, true);

  window.DirectorCutSelectionWorkflow = { deleteSelected, splitSelected, syncQuickActions };
  syncQuickActions();
})();
