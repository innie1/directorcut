const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const desktop = Boolean(window.directorcut?.desktop);
const video = $('#video');

const state = {
  version: 2,
  name: 'Untitled Project',
  mode: 'Co-edit',
  script: '',
  scenes: [],
  media: null,
  duration: 0,
  transcript: null,
  edits: JSON.parse(localStorage.getItem('directorcut.learning') || '[]'),
  marks: [],
  splitPoints: [],
  removeRanges: [],
  inPoint: null,
  outPoint: null,
  undo: []
};

function tc(t) {
  if (!Number.isFinite(t)) t = 0;
  const ms = Math.floor((t % 1) * 1000);
  const s = Math.floor(t) % 60;
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  return [h,m,s].map(x => String(x).padStart(2,'0')).join(':') + '.' + String(ms).padStart(3,'0');
}
function say(text, type='ai') {
  const d = document.createElement('div');
  d.className = 'message ' + type;
  d.textContent = text;
  $('#activity').appendChild(d);
  $('#activity').scrollTop = 99999;
}
function persistLearning() {
  localStorage.setItem('directorcut.learning', JSON.stringify(state.edits));
}
function status() {
  $('#status').textContent = `${state.scenes.length} scenes · ${state.edits.length} learned decisions · ${state.removeRanges.length} cuts`;
}
function snapshot() {
  return JSON.parse(JSON.stringify({ removeRanges: state.removeRanges, splitPoints: state.splitPoints, marks: state.marks }));
}
function pushUndo() {
  state.undo.push(snapshot());
  if (state.undo.length > 100) state.undo.shift();
}
function restore(s) {
  state.removeRanges = s.removeRanges || [];
  state.splitPoints = s.splitPoints || [];
  state.marks = s.marks || [];
  renderTimeline();
}
function scenePlan(script) {
  const blocks = script.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  return blocks.map((text, i) => {
    const words = text.split(/\s+/).length;
    return {
      n: i + 1,
      text,
      purpose: i === 0 ? 'Hook' : /\d/.test(text) ? 'Evidence' : 'Narrative',
      visual: i === 0 ? 'Presenter / strongest visual' : /\d/.test(text) ? 'Evidence + motion callout' : 'Presenter / semantic B-roll',
      performance: i === 0 ? 'Controlled start, strong final phrase' : 'Natural delivery',
      dur: Math.max(2.5, words / 150 * 60)
    };
  });
}
function projectObject() {
  state.name = $('#projectName').value.trim() || 'Untitled Project';
  return {
    version: 2,
    name: state.name,
    mode: state.mode,
    script: state.script,
    scenes: state.scenes,
    media: state.media,
    transcript: state.transcript,
    marks: state.marks,
    splitPoints: state.splitPoints,
    removeRanges: state.removeRanges,
    learning: state.edits
  };
}
function loadProjectObject(p) {
  state.name = p.name || 'Untitled Project';
  state.mode = p.mode || 'Co-edit';
  state.script = p.script || '';
  state.scenes = p.scenes || [];
  state.media = p.media || null;
  state.duration = Number(p.media?.duration || 0);
  state.transcript = p.transcript || null;
  state.marks = p.marks || [];
  state.splitPoints = p.splitPoints || [];
  state.removeRanges = p.removeRanges || [];
  if (Array.isArray(p.learning)) state.edits = p.learning;
  $('#projectName').value = state.name;
  if (state.media?.url) setVideoSource(state.media.url);
  else if (state.media?.path && desktop) setVideoSource('file://' + state.media.path.replace(/\\/g,'/'));
  renderComposer();
  renderMediaInfo();
  renderTimeline();
  setMode(state.mode);
}
function renderMediaInfo() {
  if (!state.media) { $('#mediaInfo').textContent = 'No media loaded.'; return; }
  const dims = state.media.width ? `${state.media.width}×${state.media.height}` : 'dimensions unknown';
  $('#mediaInfo').textContent = `${state.media.name} · ${tc(state.media.duration)} · ${dims} · ${state.media.videoCodec || 'video'}`;
}
function renderComposer() {
  if (state.transcript?.words?.length) {
    $('#transcriptMode').textContent = `TRANSCRIPT · ${state.transcript.words.length} WORDS`;
    $('#transcript').textContent = state.transcript.text || state.transcript.words.map(w => w.text).join(' ');
  } else {
    $('#transcriptMode').textContent = 'SCRIPT';
    $('#transcript').textContent = state.script || 'Load a script or run local transcription. Word-timestamp transcripts let DirectorCut jump directly to spoken phrases.';
  }
}
function addRemovedOverlay(lane, total) {
  state.removeRanges.forEach(r => {
    const d = document.createElement('div');
    d.className = 'removedRange';
    d.style.left = `${r.start / total * 100}%`;
    d.style.width = `${Math.max(0.4, (r.end-r.start) / total * 100)}%`;
    d.title = `Removed ${tc(r.start)} → ${tc(r.end)}`;
    lane.appendChild(d);
  });
}
function renderTimeline() {
  ['gLane','vLane','aLane','cLane'].forEach(id => $('#'+id).innerHTML = '');
  const total = Math.max(state.duration, state.scenes.reduce((a,s) => a+s.dur,0), 1);
  let cursor = 0;
  state.scenes.forEach(s => {
    const left = cursor / total * 100;
    const width = Math.max(1.2, s.dur / total * 100);
    [['vLane',''],['aLane','audio'],['cLane','caption']].forEach(([id,cl]) => {
      const d = document.createElement('div');
      d.className = 'clip ' + cl;
      d.style.left = left + '%';
      d.style.width = width + '%';
      d.textContent = `S${String(s.n).padStart(2,'0')} ${s.purpose}`;
      d.title = s.text;
      $('#'+id).appendChild(d);
    });
    if (s.purpose === 'Evidence') {
      const g = document.createElement('div');
      g.className = 'clip graphic';
      g.style.left = (left + width * .25) + '%';
      g.style.width = Math.max(1, width * .5) + '%';
      g.textContent = 'Motion callout';
      $('#gLane').appendChild(g);
    }
    cursor += s.dur;
  });
  ['vLane','aLane'].forEach(id => addRemovedOverlay($('#'+id), total));
  state.splitPoints.forEach(p => {
    const line = document.createElement('div');
    line.className = 'splitMarker';
    line.style.left = `${p/total*100}%`;
    $('#vLane').appendChild(line);
  });
  status();
}
function setVideoSource(url) {
  video.src = url;
  $('#emptyMonitor').style.display = 'none';
}
async function acceptBrowserVideo(file) {
  if (!file) return;
  setVideoSource(URL.createObjectURL(file));
  state.media = { name: file.name, path: null, url: null, duration: 0 };
  say(`Imported ${file.name}. Browser mode can preview it; desktop mode is required for FFmpeg export.`);
}
async function acceptDesktopMedia(media) {
  if (!media) return;
  state.media = media;
  state.duration = Number(media.duration || 0);
  setVideoSource(media.url);
  renderMediaInfo();
  renderTimeline();
  say(`Imported ${media.name}. FFmpeg read ${tc(media.duration)} of media locally.`);
}
async function acceptScript(text, name='script') {
  state.script = text;
  state.scenes = scenePlan(text);
  renderComposer();
  renderTimeline();
  say(`${name} analyzed: ${state.scenes.length} scenes. Director created a first scene plan.`);
}
function setMode(mode) {
  state.mode = mode;
  $$('[data-mode]').forEach(x => x.classList.toggle('active', x.dataset.mode === mode));
  $('#modeLabel').textContent = mode.toUpperCase() + ' MODE';
}
function learn(action, context, replacement) {
  state.edits.push({ kind:'director-correction', action, context, replacement, at:new Date().toISOString() });
  persistLearning();
  status();
}
function proposal(text, context='') {
  $('#proposalText').textContent = text;
  $('#proposal').dataset.context = context;
  $('#proposal').hidden = false;
}
function heuristicDirector(q) {
  const low = q.toLowerCase();
  if (low.includes('first') || low.includes('opening') || low.includes('hook')) return 'Tighten the opening: remove dead air, move the strongest evidence earlier, and avoid a decorative transition before the hook.';
  if (low.includes('subtitle') || low.includes('caption')) return 'Regenerate captions in short phrase groups, emphasize key words, and keep them inside safe areas. Exportable SRT is already available after local transcription.';
  if (low.includes('where') || low.includes('say') || low.includes('said')) return 'I can search the local word-timestamp transcript and jump the playhead to the exact phrase. Use Composer search, or tell me the phrase.';
  if (low.includes('cut') || low.includes('remove')) return 'Set an In and Out point around the unwanted section, then apply a reversible Delete In→Out edit. The desktop export will render the kept ranges with FFmpeg.';
  return 'I would analyze the selected scene, compare it with your learned style, and use the smallest reversible timeline operation.';
}
function transcriptFind(phrase) {
  const words = state.transcript?.words;
  if (!words?.length) return null;
  const tokens = phrase.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const norm = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}'’-]+/gu,'');
  for (let i=0;i<=words.length-tokens.length;i++) {
    let ok = true;
    for (let j=0;j<tokens.length;j++) if (norm(words[i+j].text) !== norm(tokens[j])) { ok=false; break; }
    if (ok) return { start: words[i].start_ms/1000, end: words[i+tokens.length-1].end_ms/1000 };
  }
  return null;
}

$('#videoInput').style.display = desktop ? 'none' : 'block';
$('#scriptInput').style.display = desktop ? 'none' : 'block';
$('#pickVideo').style.display = desktop ? 'block' : 'none';
$('#pickScript').style.display = desktop ? 'block' : 'none';
$('#openProject').disabled = !desktop;
$('#saveProject').disabled = !desktop;
$('#exportVideo').disabled = !desktop;
$('#exportSrt').disabled = !desktop;
$('#transcribe').disabled = !desktop;

$('#videoInput').addEventListener('change', e => acceptBrowserVideo(e.target.files[0]));
$('#scriptInput').addEventListener('change', async e => { const f=e.target.files[0]; if(f) acceptScript(await f.text(), f.name); });
$('#pickVideo').onclick = async () => { try { await acceptDesktopMedia(await window.directorcut.pickMedia()); } catch(e) { say(`Import failed: ${e.message}`); } };
$('#pickScript').onclick = async () => { try { const s=await window.directorcut.pickScript(); if(s) acceptScript(s.text,s.name); } catch(e) { say(`Script import failed: ${e.message}`); } };

video.addEventListener('loadedmetadata', () => {
  if (!state.duration) state.duration = video.duration;
  if (state.media) state.media.duration = state.duration;
  renderTimeline();
  renderMediaInfo();
});
video.addEventListener('timeupdate', () => $('#time').textContent = tc(video.currentTime));

$$('[data-mode]').forEach(b => b.onclick = () => { setMode(b.dataset.mode); say(`Mode changed to ${state.mode}.`); });
$('#markScene').onclick = () => { if (!video.src) return; pushUndo(); state.marks.push(video.currentTime); say(`Scene marker added at ${tc(video.currentTime)}.`); renderTimeline(); };
$('#split').onclick = () => { if (!video.src) return; pushUndo(); state.splitPoints.push(video.currentTime); learn('accepted','manual split',`split at ${video.currentTime.toFixed(3)}s`); say(`Split marker recorded at ${tc(video.currentTime)}.`); renderTimeline(); };
$('#setIn').onclick = () => { if(!video.src) return; state.inPoint=video.currentTime; $('#rangeReadout').textContent=`In ${tc(state.inPoint)} / Out ${state.outPoint===null?'—':tc(state.outPoint)}`; };
$('#setOut').onclick = () => { if(!video.src) return; state.outPoint=video.currentTime; $('#rangeReadout').textContent=`In ${state.inPoint===null?'—':tc(state.inPoint)} / Out ${tc(state.outPoint)}`; };
$('#deleteRange').onclick = () => {
  if (state.inPoint === null || state.outPoint === null) return say('Set both In and Out points first.');
  const start=Math.min(state.inPoint,state.outPoint), end=Math.max(state.inPoint,state.outPoint);
  if (end-start < .04) return say('That range is too short to remove.');
  pushUndo();
  state.removeRanges.push({start,end});
  state.removeRanges.sort((a,b)=>a.start-b.start);
  learn('accepted','manual range delete',`${tc(start)} → ${tc(end)}`);
  say(`Removed ${tc(start)} → ${tc(end)} from the export plan. Undo is available.`);
  state.inPoint=state.outPoint=null;
  $('#rangeReadout').textContent='In — / Out —';
  renderTimeline();
};
$('#undoEdit').onclick = () => { const s=state.undo.pop(); if(!s) return say('Nothing to undo.'); restore(s); say('Undid the last manual timeline change.'); };

$('#send').onclick = async () => {
  const p=$('#prompt'); const q=p.value.trim(); if(!q) return;
  say(q,'user'); p.value='';
  let response = null;
  if (desktop) {
    const r = await window.directorcut.askDirector({
      request:q,
      mode:state.mode,
      project:{name:state.name, duration:state.duration, scenes:state.scenes.slice(0,30), removeRanges:state.removeRanges, learned:state.edits.slice(-20)},
      transcript_excerpt:(state.transcript?.text || state.script || '').slice(0,12000)
    });
    if (r.available) { response=r.text; $('#aiStatus').textContent='Director model: local model connected'; }
    else $('#aiStatus').textContent='Director model: offline fallback (start llama-server on port 8080)';
  }
  response ||= heuristicDirector(q);
  if (state.mode === 'Ask') say(response);
  else if (state.mode === 'Auto') { say('Auto: '+response); learn('auto-accepted',q,response); }
  else proposal(response,q);
};
$('#prompt').addEventListener('keydown', e => { if(e.key==='Enter' && !e.shiftKey){e.preventDefault();$('#send').click();} });
$('#approve').onclick = () => { const t=$('#proposalText').textContent; const c=$('#proposal').dataset.context || 'proposal'; learn('accepted',c,t); say('Approved. Director added this decision to local learning history.'); $('#proposal').hidden=true; };
$('#reject').onclick = () => { const t=$('#proposalText').textContent; const c=$('#proposal').dataset.context || 'proposal'; learn('rejected',c,t); say('Rejected. Director recorded the rejection so it can avoid repeating the same choice.'); $('#proposal').hidden=true; };

$('#searchBtn').onclick = () => {
  const q=$('#search').value.trim(); if(!q) return;
  const timed=transcriptFind(q);
  if(timed){ video.currentTime=timed.start; say(`Found “${q}” at ${tc(timed.start)}. Jumped the playhead there.`); return; }
  const text=$('#transcript').innerText.toLowerCase();
  const found=text.includes(q.toLowerCase());
  say(found ? `Found “${q}” in the script, but this text has no word timestamps yet.` : `I couldn't find “${q}”.`);
};

$('#transcribe').onclick = async () => {
  if(!state.media?.path) return say('Load a desktop video first.');
  const model=$('#whisperModel').value;
  say(`Starting local Whisper ${model} transcription. This runs on your computer.`);
  $('#transcribe').disabled=true;
  try {
    state.transcript=await window.directorcut.transcribe(state.media.path,model);
    renderComposer();
    say(`Transcription complete: ${state.transcript.words.length} timestamped words. Phrase search can now jump to exact speech.`);
  } catch(e) {
    say(`Transcription failed: ${e.message}. Install faster-whisper with: python -m pip install faster-whisper`);
  } finally { $('#transcribe').disabled=false; }
};

$('#saveProject').onclick = async () => { try { const r=await window.directorcut.saveProject(projectObject()); if(r) say(`Project saved: ${r.path}`); } catch(e){say(`Save failed: ${e.message}`);} };
$('#openProject').onclick = async () => { try { const p=await window.directorcut.openProject(); if(p){loadProjectObject(p);say('Project opened.');} } catch(e){say(`Open failed: ${e.message}`);} };
$('#exportVideo').onclick = async () => {
  if(!state.media?.path) return say('Load a desktop video first.');
  say('Rendering the edit locally with FFmpeg…');
  $('#exportVideo').disabled=true;
  try { const r=await window.directorcut.exportVideo(projectObject()); if(r) say(`Export complete: ${r.outputPath}`); }
  catch(e){ say(`Export failed: ${e.message}`); }
  finally { $('#exportVideo').disabled=false; }
};
$('#exportSrt').onclick = async () => { try { const r=await window.directorcut.exportSrt(projectObject()); if(r) say(`Caption file exported: ${r.path}`); } catch(e){say(`Caption export failed: ${e.message}`);} };

renderComposer();
renderTimeline();
renderMediaInfo();
status();
