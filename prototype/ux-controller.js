// DirectorCut focused-workspace UX layer.
// Keeps the editing engine intact while simplifying the workspace around the active media.
(() => {
  const overlay = document.querySelector('#welcomeOverlay');
  const policyHelp = document.querySelector('#policyHelp');
  const composerMode = document.querySelector('#composerMode');
  const prompt = document.querySelector('#prompt');
  const modeLabel = document.querySelector('#modeLabel');
  const monitor = document.querySelector('.monitor');
  const activity = document.querySelector('#activity');
  const rightPanel = document.querySelector('.right');
  const main = document.querySelector('main');
  const composer = document.querySelector('#floatingComposer');

  const policyCopy = {
    Ask: 'Talk and suggest only. No automatic changes.',
    'Co-edit': 'Director proposes edits and waits for approval.',
    Auto: 'Director may apply reversible edits automatically.'
  };

  function syncPolicyUi() {
    const policy = state?.directorPolicy || 'Ask';
    if (policyHelp) policyHelp.textContent = policyCopy[policy] || policyCopy.Ask;
    if (modeLabel) modeLabel.textContent = policy === 'Ask' ? 'ASK · ADVICE ONLY' : policy === 'Co-edit' ? 'CO-EDIT · APPROVAL' : 'AUTO · REVERSIBLE EDITS';
    if (composerMode) composerMode.textContent = policy === 'Ask' ? 'Ask · conversation only' : policy === 'Co-edit' ? 'Co-edit · approval first' : 'Auto · edits enabled';
    if (prompt) prompt.placeholder = policy === 'Ask' ? 'Ask Director anything…' : policy === 'Co-edit' ? 'Describe an edit to propose…' : 'Tell Director what to change…';
  }

  function syncAspect() {
    if (!monitor) return;
    let width = Number(state?.media?.width || 0);
    let height = Number(state?.media?.height || 0);
    const video = document.querySelector('#video');
    if ((!width || !height) && video?.videoWidth && video?.videoHeight) {
      width = video.videoWidth;
      height = video.videoHeight;
    }
    monitor.classList.remove('portrait', 'square', 'landscape');
    if (!width || !height) return;
    const ratio = width / height;
    if (ratio < 0.82) monitor.classList.add('portrait');
    else if (ratio < 1.18) monitor.classList.add('square');
    else monitor.classList.add('landscape');
  }

  function compactTimeline() {
    const root = document.querySelector('#tracks');
    if (!root || !state?.timeline?.tracks) return;
    const rows = [...root.children];
    state.timeline.tracks.forEach((track, index) => {
      const row = rows[index];
      if (!row) return;
      const decorativeEmpty = (track.kind === 'graphic' || track.kind === 'caption') && !(track.clips || []).length;
      row.classList.toggle('emptyTrack', decorativeEmpty);
    });
  }

  function compactActivity() {
    if (!activity) return;
    [...activity.querySelectorAll('.message.system')].forEach(node => node.remove());
    const messages = [...activity.querySelectorAll('.message')];
    while (messages.length > 6) messages.shift()?.remove();
  }

  function hideWelcome() { overlay?.classList.add('hidden'); }
  function showWelcome() { overlay?.classList.remove('hidden'); }

  // The composer belongs to Director; on laptop screens it must never sit over the timeline.
  if (rightPanel && composer) rightPanel.appendChild(composer);

  // Manual editing is always available. Ask/Co-edit/Auto only controls AI permission.
  try {
    if (typeof setWorkspace === 'function') setWorkspace('Director', false);
    else if (state) state.workspaceMode = 'Director';
    if (typeof setPolicy === 'function') setPolicy('Ask', false);
    else if (state) state.directorPolicy = 'Ask';
  } catch (_) {}
  syncPolicyUi();

  document.querySelectorAll('[data-policy]').forEach(button => {
    button.addEventListener('click', () => setTimeout(syncPolicyUi, 0));
  });

  const welcomeImport = document.querySelector('#welcomeImport');
  const welcomeScript = document.querySelector('#welcomeScript');
  const welcomeOpen = document.querySelector('#welcomeOpen');
  welcomeImport?.addEventListener('click', () => document.querySelector('#pickVideo')?.click());
  welcomeScript?.addEventListener('click', () => { document.querySelector('#pickScript')?.click(); hideWelcome(); });
  welcomeOpen?.addEventListener('click', () => document.querySelector('#openProject')?.click());

  if (typeof setVideoSource === 'function') {
    const originalSetVideoSource = setVideoSource;
    setVideoSource = function (...args) {
      const result = originalSetVideoSource.apply(this, args);
      hideWelcome();
      setTimeout(syncAspect, 0);
      return result;
    };
  }

  const videoEl = document.querySelector('#video');
  videoEl?.addEventListener('loadedmetadata', syncAspect);

  if (typeof loadProjectObject === 'function') {
    const originalLoadProject = loadProjectObject;
    loadProjectObject = function (...args) {
      const result = originalLoadProject.apply(this, args);
      hideWelcome();
      try { if (typeof setWorkspace === 'function') setWorkspace('Director', false); else state.workspaceMode = 'Director'; } catch (_) {}
      setTimeout(() => { syncPolicyUi(); syncAspect(); compactTimeline(); compactActivity(); }, 0);
      return result;
    };
  }

  if (typeof renderTimeline === 'function') {
    const originalRenderTimeline = renderTimeline;
    renderTimeline = function (...args) {
      const result = originalRenderTimeline.apply(this, args);
      compactTimeline();
      return result;
    };
  }

  ['#addMedia','#addVideoTrack','#addAudioTrack','#split','#markScene'].forEach(selector => {
    document.querySelector(selector)?.addEventListener('click', () => {
      if (selector !== '#split' && selector !== '#markScene') hideWelcome();
    });
  });

  // Collapse Director to a slim rail when maximum preview room is needed.
  const directorHead = document.querySelector('.directorHead');
  if (directorHead && main) {
    const collapse = document.createElement('button');
    collapse.className = 'directorCollapse';
    collapse.type = 'button';
    collapse.title = 'Collapse Director';
    collapse.textContent = '›';
    collapse.addEventListener('click', () => {
      main.classList.toggle('directorCollapsed');
      collapse.title = main.classList.contains('directorCollapsed') ? 'Open Director' : 'Collapse Director';
    });
    directorHead.appendChild(collapse);
  }

  // Keep the conversation useful rather than turning it into an event log.
  if (activity) {
    compactActivity();
    new MutationObserver(compactActivity).observe(activity, { childList:true });
  }

  document.addEventListener('pointerdown', event => {
    for (const details of document.querySelectorAll('.advancedTools[open], .headerMenu[open]')) {
      if (!details.contains(event.target)) details.removeAttribute('open');
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.querySelectorAll('.advancedTools[open], .headerMenu[open], .settingsDrawer[open]').forEach(el => el.removeAttribute('open'));
  });

  try {
    if (state?.media?.path || state?.script || (state?.timeline?.tracks || []).some(t => (t.clips || []).length)) hideWelcome();
    else showWelcome();
  } catch (_) { showWelcome(); }

  syncAspect();
  compactTimeline();
  compactActivity();
})();
