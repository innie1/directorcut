// Final edit-history guard: Undo reverts timeline/editor state only and never rewinds Director chat.
(() => {
  const U = window.DirectorEditUndoUtils;
  const undoButton = document.querySelector('#undoEdit');
  const activity = document.querySelector('#activity');
  if (!U || !undoButton) return;

  function toast(text) {
    if (typeof window.DirectorCutEditorToast === 'function') window.DirectorCutEditorToast(text);
  }

  function undoEdit() {
    // Preserve the visible conversation exactly as the user sees it. The edit restore
    // should not touch it, but this protects against older restore code and future regressions.
    const visibleConversation = activity ? activity.innerHTML : null;
    const result = U.undoEditOnly(state, snapshot => restore(snapshot));
    if (!result.ok) {
      toast('Nothing to undo');
      return false;
    }
    if (activity && visibleConversation !== null) {
      activity.innerHTML = visibleConversation;
      activity.scrollTop = activity.scrollHeight;
    }
    toast('Undo edit');
    return true;
  }

  window.DirectorCutUndoEdit = undoEdit;
  undoButton.onclick = undoEdit;

  // Capture Ctrl/Cmd+Z before legacy handlers can turn it into a chat event.
  document.addEventListener('keydown', event => {
    const typing = event.target?.closest?.('input,textarea,select,[contenteditable="true"]');
    if (typing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      undoEdit();
    }
  }, true);
})();
