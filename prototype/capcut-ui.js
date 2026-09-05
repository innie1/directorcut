// UI pass companion: the few touches that need a DOM node rather than CSS.
// Kept deliberately small - everything else in this pass is styling.
(() => {
  if (window.DirectorCutUiPass) return;

  const transport = document.querySelector('.simplifiedTransport');
  const timeLabel = document.querySelector('#time');
  const video = document.querySelector('#video');
  const TL = window.DirectorTimeline;
  if (!transport || !timeLabel || !video || !TL) return;

  // #time is written from several modules as just the playhead position. Rather than
  // teach each of them about duration, show the total in its own node beside it, so
  // the transport reads "01.500 / 06.000" the way an editor expects.
  let total = document.querySelector('#timeTotal');
  if (!total) {
    total = document.createElement('span');
    total.id = 'timeTotal';
    total.title = 'Total timeline duration';
    timeLabel.insertAdjacentElement('afterend', total);
  }

  const format = seconds => (typeof tc === 'function' ? tc(seconds) : `${Number(seconds || 0).toFixed(3)}s`);

  function syncTotal() {
    const timeline = Number(TL.duration(state.timeline) || 0);
    const seconds = Math.max(timeline, Number(state.duration || 0), 0);
    const text = `/ ${format(seconds)}`;
    if (total.textContent !== text) total.textContent = text;
  }

  ['loadedmetadata','durationchange','timeupdate'].forEach(name => video.addEventListener(name, syncTotal));
  if (typeof renderTimeline === 'function') {
    const base = renderTimeline;
    renderTimeline = function (...args) { const result = base.apply(this, args); syncTotal(); return result; };
  }
  syncTotal();

  // ---- Full-screen preview -------------------------------------------------
  // Hides every panel so the program monitor fills the window, keeping only the
  // transport. Esc leaves; there is no OS fullscreen involved, so it stays inside
  // the app and the timeline state is untouched.
  const FULL = 'previewFullscreen';
  const isFull = () => document.body.classList.contains(FULL);

  let toggle = document.querySelector('#previewFullscreen');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.id = 'previewFullscreen';
    toggle.type = 'button';
    toggle.className = 'fullscreenToggle';
    const advanced = transport.querySelector('.advancedTools');
    if (advanced) transport.insertBefore(toggle, advanced); else transport.appendChild(toggle);
  }

  function setFull(on) {
    document.body.classList.toggle(FULL, Boolean(on));
    toggle.textContent = on ? '⤡  Exit full screen' : '⛶  Full screen';
    toggle.title = on ? 'Leave full-screen preview (Esc)' : 'Fill the window with the preview';
    // Modules size the monitor from its box, so let them re-measure.
    window.dispatchEvent(new Event('resize'));
    if (typeof renderTimeline === 'function' && !on) renderTimeline();
  }
  toggle.onclick = () => setFull(!isFull());
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isFull()) return;
    if (event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setFull(false);
  }, true);
  setFull(false);

  window.DirectorCutUiPass = { syncTotal, setFullscreen:setFull, isFullscreen:isFull };
})();
