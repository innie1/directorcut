// Stage 7 Recording Director: scene-by-scene local camera/microphone capture with
// streamed chunks, persistent takes and a teleprompter. Recording is deliberately
// separate from the timeline; accepted takes enter the Media Library first.
(() => {
  const RS = window.DirectorRecordingSession;
  const openButton = document.querySelector('#recordDirector');
  if (!RS || !openButton) return;

  const desktop = Boolean(window.directorcut?.desktop);
  let mediaStream = null;
  let recorder = null;
  let activeRecording = null;
  let chunkQueue = Promise.resolve();
  let chunkError = null;
  let countdownToken = 0;
  let scrollFrame = 0;
  let scrollLast = 0;
  let programMonitorWasActive = false;
  let lastCandidate = null;

  state.recordingSession = state.recordingSession || null;

  const overlay = document.createElement('div');
  overlay.id = 'recordingDirectorOverlay';
  overlay.className = 'recordingDirectorOverlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="recordingDirectorShell" role="dialog" aria-modal="true" aria-label="Recording Director">
      <header class="recordingDirectorHead">
        <div><small>PRODUCTION</small><h2>Recording Director</h2></div>
        <div class="recordingProgress"><span id="recordingProgressText">0 / 0 scenes</span><div><i id="recordingProgressBar"></i></div></div>
        <button type="button" id="recordingDirectorClose" class="recordingClose" aria-label="Close Recording Director">×</button>
      </header>
      <div class="recordingDirectorGrid">
        <aside class="recordingSceneRail">
          <div class="recordingRailHead"><b>Scenes</b><small>Choose any scene to record or review</small></div>
          <div id="recordingSceneList" class="recordingSceneList"></div>
        </aside>

        <main class="recordingCaptureColumn">
          <div class="recordingCameraCard">
            <video id="recordingCameraPreview" autoplay muted playsinline></video>
            <div id="recordingCameraEmpty" class="recordingCameraEmpty"><b>Camera preview</b><span>Allow camera and microphone access to begin.</span><button type="button" id="recordingRetryCamera">Start camera</button></div>
            <div id="recordingCountdown" class="recordingCountdown" hidden>3</div>
            <div id="recordingLiveBadge" class="recordingLiveBadge" hidden><i></i> REC <span id="recordingTimer">00:00</span></div>
          </div>
          <div class="recordingDevices">
            <label>Camera<select id="recordingCameraSelect"></select></label>
            <label>Microphone<select id="recordingMicSelect"></select></label>
            <label class="recordingCheck"><input id="recordingMirror" type="checkbox" checked> Mirror preview</label>
          </div>
          <div id="recordingStatus" class="recordingStatus">Camera is not started.</div>
          <div class="recordingTransport">
            <button type="button" id="recordingRecord" class="recordingRecord">● Record</button>
            <button type="button" id="recordingStop" class="recordingStop" hidden>■ Stop</button>
            <button type="button" id="recordingAccept" class="recordingAccept" disabled>Accept & Next</button>
            <button type="button" id="recordingRetake" disabled>Retake</button>
            <button type="button" id="recordingReject" disabled>Reject</button>
          </div>

          <section class="recordingReview">
            <div class="recordingReviewHead"><b>Take review</b><small id="recordingReviewLabel">No take recorded for this scene yet.</small></div>
            <video id="recordingTakePreview" controls playsinline hidden></video>
            <div id="recordingTakeList" class="recordingTakeList"></div>
          </section>
        </main>

        <section class="recordingPromptColumn">
          <div class="recordingSceneMeta"><small id="recordingSceneNumber">SCENE 1</small><h3 id="recordingScenePurpose">Scene</h3><p id="recordingPerformance">Natural delivery</p></div>
          <div id="recordingPromptScroller" class="recordingPromptScroller"><div id="recordingPromptText" class="recordingPromptText">Free recording</div></div>
          <div class="recordingPromptTools">
            <label class="recordingCheck"><input id="recordingAutoScroll" type="checkbox" checked> Auto-scroll while recording</label>
            <label>Speed <input id="recordingScrollSpeed" type="range" min="0" max="100" value="38"></label>
          </div>
          <div class="recordingSceneNav">
            <button type="button" id="recordingPrevScene">← Previous</button>
            <button type="button" id="recordingSkipScene">Skip scene</button>
            <button type="button" id="recordingNextScene">Next →</button>
          </div>
          <div class="recordingSessionNote">Closing this workspace stops the camera but keeps the recording session and completed takes. Reopen Recording Director to continue.</div>
        </section>
      </div>
    </section>`;
  document.body.appendChild(overlay);

  const $ = selector => overlay.querySelector(selector);
  const cameraPreview = $('#recordingCameraPreview');
  const cameraEmpty = $('#recordingCameraEmpty');
  const cameraSelect = $('#recordingCameraSelect');
  const micSelect = $('#recordingMicSelect');
  const recordButton = $('#recordingRecord');
  const stopButton = $('#recordingStop');
  const acceptButton = $('#recordingAccept');
  const retakeButton = $('#recordingRetake');
  const rejectButton = $('#recordingReject');
  const takePreview = $('#recordingTakePreview');
  const promptScroller = $('#recordingPromptScroller');
  const promptText = $('#recordingPromptText');
  const statusEl = $('#recordingStatus');

  const toast = text => window.DirectorCutEditorToast?.(text);
  const clone = value => JSON.parse(JSON.stringify(value));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const currentScene = () => RS.activeScene(state.recordingSession);
  const sceneIndex = sceneId => state.recordingSession?.scenes?.findIndex(scene => scene.sceneId === sceneId) ?? -1;
  const candidateForScene = scene => {
    if (!scene) return null;
    if (lastCandidate?.sceneId === scene.sceneId) {
      const match = scene.takes.find(take => take.id === lastCandidate.takeId && take.status === 'candidate');
      if (match) return match;
    }
    return [...(scene.takes || [])].reverse().find(take => take.status === 'candidate') || null;
  };

  function setStatus(text, kind = '') {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
  }

  function chooseMimeType() {
    const types = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];
    return types.find(type => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)) || '';
  }

  function stopTracks() {
    if (mediaStream) for (const track of mediaStream.getTracks()) track.stop();
    mediaStream = null;
    cameraPreview.srcObject = null;
    cameraEmpty.hidden = false;
  }

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const previousCamera = cameraSelect.value, previousMic = micSelect.value;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(device => device.kind === 'videoinput');
    const mics = devices.filter(device => device.kind === 'audioinput');
    cameraSelect.innerHTML = '';
    micSelect.innerHTML = '<option value="">No microphone</option>';
    cameras.forEach((device, index) => {
      const option = document.createElement('option'); option.value = device.deviceId; option.textContent = device.label || `Camera ${index + 1}`; cameraSelect.appendChild(option);
    });
    mics.forEach((device, index) => {
      const option = document.createElement('option'); option.value = device.deviceId; option.textContent = device.label || `Microphone ${index + 1}`; micSelect.appendChild(option);
    });
    if ([...cameraSelect.options].some(option => option.value === previousCamera)) cameraSelect.value = previousCamera;
    if ([...micSelect.options].some(option => option.value === previousMic)) micSelect.value = previousMic;
    else if (mics.length) micSelect.value = mics[0].deviceId;
  }

  async function startCamera() {
    if (!desktop || !navigator.mediaDevices?.getUserMedia) {
      setStatus('Recording Director requires the DirectorCut desktop app.', 'error');
      return false;
    }
    if (recorder?.state === 'recording') return true;
    stopTracks();
    const videoConstraint = cameraSelect.value ? { deviceId:{ exact:cameraSelect.value }, width:{ ideal:1920 }, height:{ ideal:1080 }, frameRate:{ ideal:30 } } : { width:{ ideal:1920 }, height:{ ideal:1080 }, frameRate:{ ideal:30 } };
    const audioConstraint = micSelect.value ? { deviceId:{ exact:micSelect.value }, echoCancellation:true, noiseSuppression:true, autoGainControl:true } : true;
    try {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video:videoConstraint, audio:audioConstraint });
      } catch (firstError) {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video:videoConstraint, audio:false });
        setStatus(`Camera ready · microphone unavailable (${firstError.name || 'permission/device error'})`, 'warning');
      }
      cameraPreview.srcObject = mediaStream;
      cameraPreview.muted = true;
      await cameraPreview.play().catch(() => {});
      cameraEmpty.hidden = true;
      if (!statusEl.dataset.kind || statusEl.dataset.kind === 'error') setStatus('Camera and microphone ready.', 'ready');
      await refreshDevices().catch(() => {});
      return true;
    } catch (error) {
      stopTracks();
      const hint = error?.name === 'NotAllowedError' ? 'Camera/microphone access was denied. Check Windows privacy settings and try again.' : `Camera could not start: ${error.message || error}`;
      setStatus(hint, 'error');
      cameraEmpty.hidden = false;
      return false;
    }
  }

  function startPromptScroll() {
    cancelAnimationFrame(scrollFrame);
    scrollLast = performance.now();
    const tick = now => {
      const dt = Math.max(0, Math.min(100, now - scrollLast)); scrollLast = now;
      if ($('#recordingAutoScroll').checked && recorder?.state === 'recording') {
        const speed = Number($('#recordingScrollSpeed').value || 0);
        promptScroller.scrollTop += (12 + speed * 1.35) * dt / 1000;
      }
      if (recorder?.state === 'recording') scrollFrame = requestAnimationFrame(tick);
    };
    scrollFrame = requestAnimationFrame(tick);
  }

  function stopPromptScroll() {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
  }

  async function countIn() {
    const token = ++countdownToken;
    const count = $('#recordingCountdown');
    count.hidden = false;
    for (let value = 3; value >= 1; value--) {
      if (token !== countdownToken || overlay.hidden) { count.hidden = true; return false; }
      count.textContent = String(value);
      await sleep(800);
    }
    if (token !== countdownToken || overlay.hidden) { count.hidden = true; return false; }
    count.textContent = 'GO';
    await sleep(300);
    count.hidden = true;
    return token === countdownToken;
  }

  function updateTimer() {
    if (!activeRecording || recorder?.state !== 'recording') return;
    const elapsed = Math.max(0, Date.now() - activeRecording.startedAt), seconds = Math.floor(elapsed / 1000);
    $('#recordingTimer').textContent = `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
    activeRecording.timer = setTimeout(updateTimer, 250);
  }

  function setRecordingUi(isRecording, isBusy = false) {
    recordButton.hidden = isRecording;
    stopButton.hidden = !isRecording;
    recordButton.disabled = isBusy;
    stopButton.disabled = isBusy;
    cameraSelect.disabled = isRecording || isBusy;
    micSelect.disabled = isRecording || isBusy;
    $('#recordingRetryCamera').disabled = isRecording || isBusy;
    $('#recordingLiveBadge').hidden = !isRecording;
    $('#recordingDirectorClose').disabled = isBusy;
  }

  async function startRecording() {
    if (recorder?.state === 'recording' || activeRecording) return;
    const scene = currentScene();
    if (!scene) return;
    if (!desktop || !window.directorcut?.recordingStart) return setStatus('Desktop recording bridge is unavailable.', 'error');
    if (!mediaStream?.active && !(await startCamera())) return;
    setRecordingUi(false, true);
    setStatus('Get ready… 3 second count-in.', 'busy');
    promptScroller.scrollTop = 0;
    if (!(await countIn())) { setRecordingUi(false, false); return; }

    const mimeType = chooseMimeType();
    let createdRecorder;
    try { createdRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined); }
    catch (error) { setRecordingUi(false, false); setStatus(`Recorder could not start: ${error.message || error}`, 'error'); return; }

    const takeId = `take-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    const takeNumber = (scene.takes?.length || 0) + 1;
    let storeEntry;
    try {
      storeEntry = await window.directorcut.recordingStart({
        projectName:state.name || document.querySelector('#projectName')?.value || 'Untitled Project',
        sessionId:state.recordingSession.id, sceneId:scene.sceneId, takeNumber,
        mimeType:createdRecorder.mimeType || mimeType || 'video/webm'
      });
    } catch (error) {
      setRecordingUi(false, false); setStatus(`Recording storage could not start: ${error.message || error}`, 'error'); return;
    }

    recorder = createdRecorder;
    chunkQueue = Promise.resolve(); chunkError = null;
    activeRecording = { ...storeEntry, sceneId:scene.sceneId, takeId, takeNumber, mimeType:createdRecorder.mimeType || mimeType, startedAt:Date.now(), timer:null };
    recorder.addEventListener('dataavailable', event => {
      if (!event.data?.size || !activeRecording) return;
      const recordingId = activeRecording.recordingId;
      chunkQueue = chunkQueue.then(async () => {
        const data = await event.data.arrayBuffer();
        await window.directorcut.recordingAppend(recordingId, data);
      }).catch(error => { chunkError = chunkError || error; });
    });
    recorder.addEventListener('error', event => { chunkError = chunkError || event.error || new Error('MediaRecorder failed.'); });
    recorder.start(1000);
    setRecordingUi(true, false);
    setStatus(`Recording Scene ${scene.index + 1} · Take ${takeNumber}`, 'recording');
    startPromptScroll(); updateTimer();
  }

  async function stopRecording() {
    if (!recorder || !activeRecording) return null;
    const currentRecorder = recorder, active = activeRecording;
    setRecordingUi(true, true);
    setStatus('Finishing take…', 'busy');
    stopPromptScroll();
    if (active.timer) clearTimeout(active.timer);
    const stopped = new Promise(resolve => currentRecorder.addEventListener('stop', resolve, { once:true }));
    if (currentRecorder.state !== 'inactive') {
      try { currentRecorder.requestData(); } catch (_) {}
      currentRecorder.stop();
    }
    await stopped;
    await chunkQueue;
    recorder = null;
    activeRecording = null;
    setRecordingUi(false, false);

    if (chunkError) {
      await window.directorcut.recordingCancel(active.recordingId).catch(() => false);
      setStatus(`Take failed: ${chunkError.message || chunkError}`, 'error');
      chunkError = null;
      return null;
    }

    try {
      const result = await window.directorcut.recordingFinish(active.recordingId);
      const scene = state.recordingSession.scenes.find(item => item.sceneId === active.sceneId);
      const media = { ...result.media, name:`${state.name || 'DirectorCut'} · Scene ${(scene?.index || 0) + 1} Take ${active.takeNumber}`, source:'recording', recording:{ sessionId:state.recordingSession.id, sceneId:active.sceneId, takeId:active.takeId, takeNumber:active.takeNumber } };
      state.recordingSession = RS.addTake(state.recordingSession, active.sceneId, {
        id:active.takeId, takeNumber:active.takeNumber, status:'candidate', recordedAt:new Date(active.startedAt).toISOString(),
        path:result.path, media, mimeType:active.mimeType || result.mimeType, duration:Number(result.duration || media.duration || 0)
      });
      lastCandidate = { sceneId:active.sceneId, takeId:active.takeId };
      if (typeof markDirty === 'function') markDirty();
      setStatus(`Take ${active.takeNumber} ready for review.`, 'ready');
      renderSession();
      previewTake(active.sceneId, active.takeId);
      return active.takeId;
    } catch (error) {
      setStatus(`Could not finalize take: ${error.message || error}`, 'error');
      return null;
    }
  }

  function previewTake(sceneId, takeId) {
    const scene = state.recordingSession?.scenes?.find(item => item.sceneId === sceneId);
    const take = scene?.takes?.find(item => item.id === takeId);
    if (!take?.media?.url) return;
    takePreview.src = take.media.url;
    takePreview.hidden = false;
    $('#recordingReviewLabel').textContent = `Scene ${scene.index + 1} · Take ${take.takeNumber} · ${take.status}`;
    takePreview.currentTime = 0;
  }

  function addAcceptedToLibrary(scene, take) {
    if (!take?.media) return;
    const runtime = window.DirectorCutMediaLibraryRuntime;
    const media = { ...take.media, source:'recording', recording:{ ...(take.media.recording || {}), accepted:true } };
    runtime?.addLibraryItems?.([media], { select:true, preview:false });
  }

  function acceptTake(sceneId, takeId, advance = true) {
    const before = state.recordingSession?.scenes?.find(scene => scene.sceneId === sceneId);
    const take = before?.takes?.find(item => item.id === takeId);
    if (!before || !take) return;
    addAcceptedToLibrary(before, take);
    state.recordingSession = RS.acceptTake(state.recordingSession, sceneId, takeId, { advance });
    lastCandidate = null;
    promptScroller.scrollTop = 0;
    if (typeof markDirty === 'function') markDirty();
    renderSession();
    toast?.(`Accepted Scene ${before.index + 1} Take ${take.takeNumber} · added to Media Library`);
  }

  function rejectTake(sceneId, takeId) {
    state.recordingSession = RS.rejectTake(state.recordingSession, sceneId, takeId);
    if (lastCandidate?.takeId === takeId) lastCandidate = null;
    if (typeof markDirty === 'function') markDirty();
    renderSession();
  }

  async function retakeCurrent() {
    const scene = currentScene(), candidate = candidateForScene(scene);
    if (candidate) rejectTake(scene.sceneId, candidate.id);
    await startRecording();
  }

  function renderSceneList() {
    const root = $('#recordingSceneList'); root.innerHTML = '';
    state.recordingSession.scenes.forEach((scene, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `recordingSceneItem${index === state.recordingSession.activeSceneIndex ? ' active' : ''} ${scene.status}`;
      const status = scene.status === 'complete' ? '✓' : scene.status === 'skipped' ? '–' : String(index + 1);
      button.innerHTML = `<span>${status}</span><div><b></b><small></small></div>`;
      button.querySelector('b').textContent = scene.purpose || `Scene ${index + 1}`;
      button.querySelector('small').textContent = `${scene.takes.length} take${scene.takes.length === 1 ? '' : 's'}${scene.acceptedTakeId ? ' · accepted' : ''}`;
      button.onclick = () => {
        if (recorder?.state === 'recording') return;
        state.recordingSession = RS.setActiveScene(state.recordingSession, index);
        lastCandidate = null; promptScroller.scrollTop = 0; renderSession();
      };
      root.appendChild(button);
    });
  }

  function renderTakeList(scene) {
    const root = $('#recordingTakeList'); root.innerHTML = '';
    for (const take of [...(scene?.takes || [])].reverse()) {
      const row = document.createElement('div');
      row.className = `recordingTakeRow ${take.status}`;
      row.innerHTML = `<div><b>Take ${take.takeNumber}</b><small></small></div><div class="recordingTakeActions"><button type="button" data-action="preview">Preview</button><button type="button" data-action="accept">Use</button><button type="button" data-action="reject">Reject</button></div>`;
      row.querySelector('small').textContent = `${take.duration ? `${take.duration.toFixed(1)}s · ` : ''}${take.status}`;
      row.querySelector('[data-action="preview"]').onclick = () => previewTake(scene.sceneId, take.id);
      row.querySelector('[data-action="accept"]').onclick = () => acceptTake(scene.sceneId, take.id, false);
      row.querySelector('[data-action="reject"]').onclick = () => rejectTake(scene.sceneId, take.id);
      if (take.status === 'accepted') row.querySelector('[data-action="accept"]').textContent = 'Accepted';
      root.appendChild(row);
    }
  }

  function renderSession() {
    if (!state.recordingSession) return;
    const scene = currentScene(), progress = RS.progress(state.recordingSession);
    $('#recordingProgressText').textContent = `${progress.complete + progress.skipped} / ${progress.total} scenes · ${progress.percent}%`;
    $('#recordingProgressBar').style.width = `${progress.percent}%`;
    renderSceneList();
    if (!scene) return;
    $('#recordingSceneNumber').textContent = `SCENE ${scene.index + 1} OF ${state.recordingSession.scenes.length}`;
    $('#recordingScenePurpose').textContent = scene.purpose || `Scene ${scene.index + 1}`;
    $('#recordingPerformance').textContent = scene.performance || 'Natural delivery';
    promptText.textContent = scene.text || 'Free recording';
    $('#recordingPrevScene').disabled = scene.index <= 0 || recorder?.state === 'recording';
    $('#recordingNextScene').disabled = scene.index >= state.recordingSession.scenes.length - 1 || recorder?.state === 'recording';
    $('#recordingSkipScene').disabled = Boolean(scene.acceptedTakeId) || recorder?.state === 'recording';
    renderTakeList(scene);
    const candidate = candidateForScene(scene);
    acceptButton.disabled = !candidate || recorder?.state === 'recording';
    retakeButton.disabled = recorder?.state === 'recording';
    rejectButton.disabled = !candidate || recorder?.state === 'recording';
    if (candidate) {
      $('#recordingReviewLabel').textContent = `Take ${candidate.takeNumber} is waiting for approval.`;
      lastCandidate = { sceneId:scene.sceneId, takeId:candidate.id };
    } else if (scene.acceptedTakeId) {
      const accepted = scene.takes.find(take => take.id === scene.acceptedTakeId);
      $('#recordingReviewLabel').textContent = accepted ? `Take ${accepted.takeNumber} accepted for this scene.` : 'Scene complete.';
    } else $('#recordingReviewLabel').textContent = 'No candidate take waiting for approval.';
  }

  async function openRecordingDirector() {
    if (!desktop) return toast?.('Recording Director requires the desktop app.');
    if (typeof MediaRecorder === 'undefined') return toast?.('This Chromium build does not expose MediaRecorder.');
    state.name = document.querySelector('#projectName')?.value?.trim() || state.name || 'Untitled Project';
    state.recordingSession = RS.createSession({ projectName:state.name, scenes:state.scenes, script:state.script, previous:state.recordingSession });
    if (state.recordingSession.status === 'paused') state.recordingSession = RS.resume(state.recordingSession);
    overlay.hidden = false;
    document.body.classList.add('recordingDirectorOpen');
    programMonitorWasActive = Boolean(window.DirectorCutProgramMonitor?.active);
    if (programMonitorWasActive) await window.directorcut?.programMonitorVisible?.(false).catch(() => false);
    renderSession();
    await startCamera();
  }

  async function closeRecordingDirector() {
    countdownToken++;
    if (recorder && activeRecording) await stopRecording();
    stopPromptScroll(); stopTracks();
    takePreview.pause();
    if (state.recordingSession && state.recordingSession.status !== 'complete') state.recordingSession = RS.pause(state.recordingSession);
    overlay.hidden = true;
    document.body.classList.remove('recordingDirectorOpen');
    if (programMonitorWasActive) await window.directorcut?.programMonitorVisible?.(true).catch(() => false);
    programMonitorWasActive = false;
    if (typeof markDirty === 'function') markDirty();
  }

  openButton.onclick = openRecordingDirector;
  $('#recordingDirectorClose').onclick = closeRecordingDirector;
  $('#recordingRetryCamera').onclick = startCamera;
  cameraSelect.onchange = () => startCamera();
  micSelect.onchange = () => startCamera();
  $('#recordingMirror').onchange = event => cameraPreview.classList.toggle('unmirrored', !event.target.checked);
  recordButton.onclick = startRecording;
  stopButton.onclick = stopRecording;
  acceptButton.onclick = () => { const scene=currentScene(),candidate=candidateForScene(scene);if(candidate)acceptTake(scene.sceneId,candidate.id,true); };
  retakeButton.onclick = retakeCurrent;
  rejectButton.onclick = () => { const scene=currentScene(),candidate=candidateForScene(scene);if(candidate)rejectTake(scene.sceneId,candidate.id); };
  $('#recordingPrevScene').onclick = () => { const scene=currentScene();if(scene) { state.recordingSession=RS.setActiveScene(state.recordingSession,scene.index-1);lastCandidate=null;promptScroller.scrollTop=0;renderSession(); } };
  $('#recordingNextScene').onclick = () => { const scene=currentScene();if(scene) { state.recordingSession=RS.setActiveScene(state.recordingSession,scene.index+1);lastCandidate=null;promptScroller.scrollTop=0;renderSession(); } };
  $('#recordingSkipScene').onclick = () => { const scene=currentScene();if(scene){state.recordingSession=RS.skipScene(state.recordingSession,scene.sceneId);lastCandidate=null;promptScroller.scrollTop=0;if(typeof markDirty==='function')markDirty();renderSession();} };
  overlay.addEventListener('keydown', event => { if (event.key === 'Escape' && recorder?.state !== 'recording') closeRecordingDirector(); });

  if (typeof projectObject === 'function') {
    const baseProjectObject = projectObject;
    projectObject = function (...args) {
      const project = baseProjectObject.apply(this, args);
      project.recordingSession = state.recordingSession ? clone(state.recordingSession) : null;
      return project;
    };
  }
  if (typeof loadProjectObject === 'function') {
    const baseLoadProject = loadProjectObject;
    loadProjectObject = function (project, ...rest) {
      const result = baseLoadProject.call(this, project, ...rest);
      state.recordingSession = project?.recordingSession ? RS.normalizeSession(project.recordingSession, { projectName:project.name, scenes:state.scenes, script:state.script }) : null;
      return result;
    };
  }

  window.addEventListener('beforeunload', () => {
    countdownToken++;
    stopPromptScroll(); stopTracks();
    if (activeRecording?.recordingId) window.directorcut?.recordingCancel?.(activeRecording.recordingId).catch?.(() => false);
  });

  if (!desktop) openButton.disabled = true;
  window.DirectorCutRecordingDirector = { open:openRecordingDirector, close:closeRecordingDirector, startCamera, startRecording, stopRecording, renderSession };
})();
