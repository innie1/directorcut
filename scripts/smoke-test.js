// End-to-end smoke test: launches the real app, drives it like a user, and fails
// loudly if anything breaks. This is the check the unit tests cannot make - both
// freezes that made the editor unusable were load-time faults that every syntax
// check and unit test passed straight through.
//
//   npm --prefix desktop run smoke          # from the repo root
//
// Needs ffmpeg on PATH. On a headless machine put xvfb-run in front. It stubs the
// file dialogs so no clicking is required, and talks to whatever is listening on
// 11434 - scripts/mock-ollama.js, or a real Ollama.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { app, dialog } = require('electron');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'directorcut-smoke-'));
const CLIP_A = path.join(TMP, 'clip-a.mp4');
const CLIP_B = path.join(TMP, 'clip-b.mp4');
const EXPORT = path.join(TMP, 'export.mp4');

const results = [];
const consoleErrors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok:Boolean(ok), detail }); };
const wait = ms => new Promise(r => setTimeout(r, ms));

function makeClip(file, pattern, seconds) {
  const out = spawnSync('ffmpeg', ['-hide_banner','-loglevel','error','-y',
    '-f','lavfi','-i',`${pattern}=size=640x360:rate=30`,
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000',
    '-t',String(seconds),'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',file]);
  if (out.error || out.status !== 0) {
    console.error('\nCould not create test footage. Is ffmpeg on your PATH?');
    process.exit(2);
  }
}

let picks = 0;
dialog.showOpenDialog = async () => ({ canceled:false, filePaths:[picks++ === 0 ? CLIP_A : CLIP_B] });
dialog.showSaveDialog = async () => ({ canceled:false, filePath:EXPORT });

app.on('browser-window-created', (_event, win) => {
  const wc = win.webContents;
  wc.on('console-message', (...args) => {
    const first = args[0];
    const level = first && typeof first === 'object' ? String(first.level) : String(args[1]);
    const message = first && typeof first === 'object' ? first.message : args[2];
    if (level === 'error' || level === '3') consoleErrors.push(String(message).slice(0, 200));
  });
  wc.on('render-process-gone', (_e, details) => { consoleErrors.push('renderer gone: ' + JSON.stringify(details)); });

  wc.on('did-finish-load', () => setTimeout(() => run(wc), 6000));
});

async function run(wc) {
  // Every eval is short and synchronous; waiting happens here, so a wedged renderer
  // shows up as a timeout on one step rather than a hung test.
  const ev = async (js, ms = 25000) => {
    try {
      return await Promise.race([ wc.executeJavaScript(js),
        new Promise((_r, rej) => setTimeout(() => rej(new Error('renderer did not respond')), ms)) ]);
    } catch (error) { return { __err:error.message }; }
  };
  const until = async (js, tries = 60, gap = 500) => {
    for (let i = 0; i < tries; i++) { const r = await ev(js); if (r === true) return true; await wait(gap); }
    return false;
  };

  try {
    check('app window loads', true);

    await ev(`document.querySelector('#welcomeOverlay').classList.add('hidden')`);
    await wait(400);

    // 1. Import - the flow that used to freeze the whole app.
    await ev(`document.querySelector('#pickVideo').click()`);
    check('imports a video', await until(`!!state.media`));
    await wait(2500);
    check('first import lands on the timeline',
      (await ev(`state.timeline.tracks.find(t=>t.kind==='video').clips.length`)) >= 1);

    await ev(`document.querySelector('#pickVideo').click()`);
    await wait(3000);
    const bin = await ev(`(state.mediaLibrary||[]).length`);
    check('second import waits in the bin', bin === 2, `bin has ${bin}`);
    check('media cards render a real frame',
      (await ev(`document.querySelectorAll('.mediaThumbFrame').length`)) >= 2);

    // 2. Local model discovery.
    await ev(`refreshLocalAI()`);
    await wait(2500);
    const ai = await ev(`({ running:document.querySelector('#aiDot').classList.contains('online'),
                            models:[...document.querySelector('#topModel').options].map(o=>o.value).filter(Boolean).length })`);
    check('finds a local model over the Ollama API', ai && ai.models > 0,
      ai && ai.models ? `${ai.models} model(s)` : 'nothing on 127.0.0.1:11434 - start Ollama or scripts/mock-ollama.js');

    // 3. Manual editing still works.
    const before = await ev(`state.timeline.tracks.find(t=>t.kind==='video').clips.length`);
    await ev(`(function(){ var v=document.querySelector('#video'); v.currentTime=1; state.selectedClipId=state.timeline.tracks.find(t=>t.kind==='video').clips[0].id; })()`);
    await wait(600);
    await ev(`window.DirectorCutSelectionWorkflow&&window.DirectorCutSelectionWorkflow.splitSelected&&window.DirectorCutSelectionWorkflow.splitSelected()`);
    await wait(1200);
    const afterSplit = await ev(`state.timeline.tracks.find(t=>t.kind==='video').clips.length`);
    check('manual split cuts a clip', afterSplit > before, `${before} -> ${afterSplit}`);
    await ev(`document.querySelector('#undoEdit').click()`);
    await wait(1200);
    check('undo restores the timeline',
      (await ev(`state.timeline.tracks.find(t=>t.kind==='video').clips.length`)) === before);

    // 4. Full-screen preview.
    await ev(`document.querySelector('#previewFullscreen').click()`);
    await wait(800);
    check('full-screen preview hides the panels',
      (await ev(`document.body.classList.contains('previewFullscreen') && document.querySelector('.left').offsetParent===null`)) === true);
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await wait(800);
    check('Escape leaves full screen',
      (await ev(`!document.body.classList.contains('previewFullscreen')`)) === true);

    // 5. The Director must not touch the timeline in Ask.
    await ev(`(function(){
      state.scenes=[{text:'Scene one.',dur:2},{text:'Scene two.',dur:2}];
      state.script='Scene one.\\n\\nScene two.';
      var w=[...document.querySelectorAll('[data-workspace]')].find(x=>/Director/i.test(x.textContent)); if(w)w.click();
      var p=[...document.querySelectorAll('[data-policy]')].find(x=>/Ask/i.test(x.textContent)); if(p)p.click();
    })()`);
    await wait(500);
    const askBefore = await ev(`window.DirectorTimeline.duration(state.timeline)`);
    await ev(`(function(){document.querySelector('#prompt').value='remove one second from the start';document.querySelector('#send').click();})()`);
    await wait(7000);
    check('Ask never mutates the timeline',
      Math.abs((await ev(`window.DirectorTimeline.duration(state.timeline)`)) - askBefore) < 0.001);

    // 6. Script -> whole rough cut.
    await ev(`(function(){ state.timeline.tracks.forEach(t=>t.clips=[]); state.timeline.transitions=[]; renderTimeline();
      var p=[...document.querySelectorAll('[data-policy]')].find(x=>/Auto/i.test(x.textContent)); if(p)p.click(); })()`);
    await wait(600);
    await ev(`(function(){document.querySelector('#prompt').value='build the video from my script';document.querySelector('#send').click();})()`);
    await wait(13000);
    const built = await ev(`({ clips:state.timeline.tracks.find(t=>t.kind==='video').clips.length,
                               captions:state.timeline.tracks.find(t=>t.kind==='caption').clips.length,
                               dur:window.DirectorTimeline.duration(state.timeline) })`);
    check('Director builds a cut from the script', built && built.clips >= 2 && built.dur > 1,
      built ? `${built.clips} clips, ${built.captions} captions, ${Number(built.dur).toFixed(1)}s` : 'no result');

    // 7. Export.
    await ev(`document.querySelector('#exportVideo').click()`);
    for (let i = 0; i < 60 && !fs.existsSync(EXPORT); i++) await wait(1000);
    const bytes = fs.existsSync(EXPORT) ? fs.statSync(EXPORT).size : 0;
    check('exports a playable MP4', bytes > 10000, `${Math.round(bytes/1024)}KB`);

    check('no renderer console errors', consoleErrors.length === 0, consoleErrors.slice(0,3).join(' | '));
  } catch (error) {
    check('smoke run completed', false, error.message);
  }
  report();
}

function report() {
  const pass = results.filter(r => r.ok).length;
  console.log('\nDirectorCut smoke test\n' + '-'.repeat(56));
  for (const r of results) console.log(`${r.ok ? ' PASS ' : ' FAIL '} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  console.log('-'.repeat(56));
  console.log(`${pass}/${results.length} passed\n`);
  try { fs.rmSync(TMP, { recursive:true, force:true }); } catch (_) {}
  const failed = results.length - pass;
  app.exit(failed ? 1 : 0);
}

makeClip(CLIP_A, 'testsrc', 6);
makeClip(CLIP_B, 'smptebars', 5);
setTimeout(() => { check('smoke run finished in time', false, 'timed out after 4 minutes'); report(); }, 240000);
require(path.join(ROOT, 'desktop', 'main-v04.js'));
