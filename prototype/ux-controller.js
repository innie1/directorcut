// DirectorCut focused-workspace UX layer.
// Keeps the existing editing engine intact while simplifying how users enter and control it.
(() => {
  const overlay = document.querySelector('#welcomeOverlay');
  const policyHelp = document.querySelector('#policyHelp');
  const composerMode = document.querySelector('#composerMode');
  const prompt = document.querySelector('#prompt');

  const policyCopy = {
    Ask: 'Ask: talk, analyze and suggest. Nothing changes until you edit it yourself.',
    'Co-edit': 'Co-edit: Director prepares reversible edits and waits for your approval.',
    Auto: 'Auto: Director can apply reversible timeline edits while you continue working.'
  };

  function syncPolicyUi() {
    const policy = state?.directorPolicy || 'Ask';
    if (policyHelp) policyHelp.textContent = policyCopy[policy] || policyCopy.Ask;
    if (composerMode) composerMode.textContent = policy === 'Ask' ? 'Ask · conversation only' : policy === 'Co-edit' ? 'Co-edit · approval before changes' : 'Auto · reversible edits enabled';
    if (prompt) prompt.placeholder = policy === 'Ask' ? 'Ask anything about your video…' : policy === 'Co-edit' ? 'Ask anything or describe an edit to propose…' : 'Ask anything or tell Director what to change…';
  }

  function hideWelcome() {
    if (overlay) overlay.classList.add('hidden');
  }

  function showWelcome() {
    if (overlay) overlay.classList.remove('hidden');
  }

  // Manual editing is always available. The only AI choice users need is how much
  // permission Director has: Ask, Co-edit, or Auto.
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
  if (welcomeImport) welcomeImport.addEventListener('click', () => document.querySelector('#pickVideo')?.click());
  if (welcomeScript) welcomeScript.addEventListener('click', () => {
    document.querySelector('#pickScript')?.click();
    hideWelcome();
  });
  if (welcomeOpen) welcomeOpen.addEventListener('click', () => document.querySelector('#openProject')?.click());

  // Hide onboarding as soon as a real preview/project becomes active.
  if (typeof setVideoSource === 'function') {
    const originalSetVideoSource = setVideoSource;
    setVideoSource = function (...args) {
      const result = originalSetVideoSource.apply(this, args);
      hideWelcome();
      return result;
    };
  }

  if (typeof loadProjectObject === 'function') {
    const originalLoadProject = loadProjectObject;
    loadProjectObject = function (...args) {
      const result = originalLoadProject.apply(this, args);
      hideWelcome();
      setTimeout(syncPolicyUi, 0);
      return result;
    };
  }

  // If the user deliberately starts working in the timeline, don't keep onboarding over them.
  ['#addMedia','#addVideoTrack','#addAudioTrack','#split','#markScene'].forEach(selector => {
    document.querySelector(selector)?.addEventListener('click', () => {
      if (selector !== '#split' && selector !== '#markScene') hideWelcome();
    });
  });

  // Clicking outside popovers closes them, keeping the workspace visually quiet.
  document.addEventListener('pointerdown', event => {
    for (const details of document.querySelectorAll('.advancedTools[open], .headerMenu[open]')) {
      if (!details.contains(event.target)) details.removeAttribute('open');
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.advancedTools[open], .headerMenu[open], .settingsDrawer[open]').forEach(el => el.removeAttribute('open'));
    }
  });

  // A saved/autorecovered project may already have meaningful content when the shell loads.
  try {
    if (state?.media?.path || state?.script || (state?.timeline?.tracks || []).some(t => (t.clips || []).length)) hideWelcome();
    else showWelcome();
  } catch (_) {
    showWelcome();
  }
})();
