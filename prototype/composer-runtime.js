// Keeps the Director composer immediately interactive while local AI warms in the background.
(() => {
  const composer = document.querySelector('#floatingComposer');
  const prompt = document.querySelector('#prompt');
  const send = document.querySelector('#send');
  const footer = composer?.querySelector('.composerFooter');
  if (!composer || !prompt || !send) return;

  let warmedModel = '';
  let warmingModel = '';
  let warmTimer = null;

  const aiState = document.createElement('span');
  aiState.id = 'composerAiState';
  aiState.textContent = 'AI readying…';
  if (footer && !footer.querySelector('#composerAiState')) {
    const autosave = footer.querySelector('#autosaveState');
    if (autosave) footer.insertBefore(aiState, autosave);
    else footer.appendChild(aiState);
  }

  function setAiState(text, mode='') { aiState.textContent = text; aiState.dataset.mode = mode; }
  function ensureInteractive() { prompt.disabled = false; prompt.readOnly = false; prompt.setAttribute('aria-disabled','false'); }

  async function warmSelectedModel() {
    if (!window.directorcut?.desktop || typeof window.directorcut.warmModel !== 'function') { setAiState('Local AI unavailable','offline'); return; }
    const model = String(state?.selectedModel || '').trim();
    if (!model || model === warmedModel || model === warmingModel) return;
    warmingModel = model; setAiState('Starting local AI…','warming'); composer.classList.add('aiWarming');
    try {
      const result = await window.directorcut.warmModel(model);
      if (warmingModel !== model) return;
      if (result?.ok === false) setAiState('AI starts on send','idle');
      else { warmedModel = model; setAiState('AI ready','ready'); }
    } catch (_) { setAiState('AI starts on send','idle'); }
    finally { if (warmingModel === model) warmingModel = ''; composer.classList.remove('aiWarming'); ensureInteractive(); }
  }

  function syncWorkingUi() {
    ensureInteractive();
    const working = document.body.classList.contains('directorWorking') || send.disabled;
    composer.classList.toggle('composerBusy', working);
    if (working) { send.textContent = '…'; send.title = 'Director is working'; if (warmingModel || !warmedModel) setAiState('Working · local AI','working'); else setAiState('Director working…','working'); }
    else { send.textContent = '↑'; send.title = 'Send'; if (warmedModel) setAiState('AI ready','ready'); else if (!warmingModel) setAiState('AI readying…','idle'); }
  }

  composer.addEventListener('pointerdown', event => { if (event.target.closest('button,input,select')) return; requestAnimationFrame(() => { ensureInteractive(); prompt.focus({ preventScroll:true }); }); }, true);
  prompt.addEventListener('focus', () => { ensureInteractive(); if (!warmedModel) warmSelectedModel(); });
  send.addEventListener('pointerdown', () => { ensureInteractive(); if (!warmedModel) { setAiState('Starting local AI…','warming'); warmSelectedModel(); } }, true);
  new MutationObserver(syncWorkingUi).observe(send,{attributes:true,attributeFilter:['disabled']});
  new MutationObserver(syncWorkingUi).observe(document.body,{attributes:true,attributeFilter:['class']});
  warmTimer = setInterval(() => { ensureInteractive(); if (state?.selectedModel && state.selectedModel !== warmedModel && state.selectedModel !== warmingModel) warmSelectedModel(); }, 700);
  setTimeout(warmSelectedModel,250);
  window.addEventListener('beforeunload',()=>clearInterval(warmTimer));
  ensureInteractive(); syncWorkingUi();
})();

// Load final runtime layers after the legacy editor handlers are installed.
(() => {
  function load(src, done) {
    if (document.querySelector(`script[data-runtime="${src}"]`)) { done?.(); return; }
    const script = document.createElement('script'); script.src = src; script.dataset.runtime = src; script.onload = () => done?.(); document.body.appendChild(script);
  }
  const loadUndoRuntime = () => load('edit-undo-runtime.js');
  if (window.DirectorEditUndoUtils) loadUndoRuntime(); else load('edit-undo-utils.js', loadUndoRuntime);
  load('home-dashboard.js');
  const loadCaptionInspector=()=>load('caption-inspector.js');
  if(window.DirectorCaptionEditor)loadCaptionInspector();else load('caption-editor-utils.js',loadCaptionInspector);
  const loadFootageRuntime=()=>load('footage-intelligence-runtime.js');
  if(window.DirectorFootageIntelligence)loadFootageRuntime();else load('footage-intelligence-utils.js',loadFootageRuntime);
})();