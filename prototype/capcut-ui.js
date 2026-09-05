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

  window.DirectorCutUiPass = { syncTotal };
})();
