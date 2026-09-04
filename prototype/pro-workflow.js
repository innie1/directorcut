// DirectorCut professional workflow layer: resizable Director, visible task execution and keyboard-first timeline control.
(() => {
  if (!window.DirectorTimeline) return;
  const TL = window.DirectorTimeline;
  const right = document.querySelector('.right');
  const main = document.querySelector('main');
  const head = document.querySelector('.directorHead');
  const activity = document.querySelector('#activity');
  const send = document.querySelector('#send');
  const prompt = document.querySelector('#prompt');
  const video = document.querySelector('#video');
  const timeLabel = document.querySelector('#time');

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const frameDuration = () => 1 / Math.max(1, Number(TL.parseFps?.(state.timeline?.fps || state.media?.frameRate || 30) || state.timeline?.fps || 30));
  const timelineDuration = () => Math.max(0, Number(TL.duration(state.timeline) || 0), Number(video?.duration || 0));
  const snap = value => typeof frameSnap === 'function' ? frameSnap(value) : Math.max(0, value);

  // ---------- Director panel resizing / focus ----------
  if (right && main) {
    const stored = Number(localStorage.getItem('directorcut.directorWidth') || 0);
    if (stored >= 210 && stored <= 680) document.documentElement.style.setProperty('--dc-right-user', `${stored}px`);

    const handle = document.createElement('div');
    handle.className = 'directorResizeHandle';
    handle.title = 'Drag to resize Director';
    right.prepend(handle);
    let resizing = false;
    handle.addEventListener('pointerdown', event => {
      resizing = true;
      document.body.classList.add('directorResizing');
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    window.addEventListener('pointermove', event => {
      if (!resizing) return;
      const width = Math.max(210, Math.min(680, window.innerWidth - event.clientX));
      document.documentElement.style.setProperty('--dc-right-user', `${width}px`);
      localStorage.setItem('directorcut.directorWidth', String(Math.round(width)));
    });
    window.addEventListener('pointerup', () => {
      resizing = false;
      document.body.classList.remove('directorResizing');
    });

    if (head) {
      const collapse = head.querySelector('.directorCollapse');
      const actions = document.createElement('div');
      actions.className = 'directorActions';
      const expand = document.createElement('button');
      expand.className = 'directorExpand';
      expand.type = 'button';
      expand.textContent = '↔';
      expand.title = 'Expand Director';
      expand.addEventListener('click', () => {
        const enabled = !main.classList.contains('directorExpanded');
        main.classList.toggle('directorExpanded', enabled);
        expand.title = enabled ? 'Restore Director width' : 'Expand Director';
      });
      actions.appendChild(expand);
      if (collapse) actions.appendChild(collapse);
      head.appendChild(actions);
    }
  }

  // ---------- Task progress UI ----------
  let run = null;
  let elapsedTimer = null;
  function ensureRunCard() {
    let card = document.querySelector('#directorRun');
    if (card) return card;
    card = document.createElement('section');
    card.id = 'directorRun';
    card.className = 'directorRun';
    card.hidden = true;
    card.innerHTML = '<div class="runHeader"><strong>Director is working</strong><span class="runElapsed">0.0s</span></div><div class="runProgress"><i></i></div><div class="runSteps"></div>';
    const policyHelp = document.querySelector('#policyHelp');
    if (policyHelp?.parentElement) policyHelp.insertAdjacentElement('afterend', card);
    else right?.insertBefore(card, activity || null);
    return card;
  }
  function startRun(request) {
    const card = ensureRunCard();
    clearInterval(elapsedTimer);
    const started = performance.now();
    run = { card, started, request, stages:[], active:-1, finished:false };
    card.hidden = false;
    card.classList.remove('failed');
    card.querySelector('.runHeader strong').textContent = 'Director is working';
    card.querySelector('.runProgress i').style.width = '4%';
    document.body.classList.add('directorWorking');
    elapsedTimer = setInterval(() => {
      if (!run) return;
      card.querySelector('.runElapsed').textContent = `${((performance.now()-started)/1000).toFixed(1)}s`;
    }, 100);
    return run;
  }
  function setStages(stages, activeIndex = 0) {
    if (!run) return;
    run.stages = stages.map(stage => typeof stage === 'string' ? { label:stage } : stage);
    run.active = activeIndex;
    renderRun();
  }
  function setActive(index, detail = '') {
    if (!run) return;
    run.active = Math.max(0, Math.min(index, run.stages.length - 1));
    if (detail) run.stages[run.active].detail = detail;
    renderRun();
  }
  function renderRun() {
    if (!run) return;
    const root = run.card.querySelector('.runSteps');
    root.innerHTML = '';
    run.stages.forEach((stage, index) => {
      const row = document.createElement('div');
      row.className = `runStep ${index < run.active ? 'done' : index === run.active ? 'active' : ''}`;
      row.innerHTML = `<span class="runDot"></span><span>${stage.label}</span><small>${stage.detail || ''}</small>`;
      root.appendChild(row);
    });
    const denom = Math.max(1, run.stages.length);
    const progress = run.finished ? 100 : Math.max(5, (Math.max(0, run.active) / denom) * 100);
    run.card.querySelector('.runProgress i').style.width = `${progress}%`;
  }
  function finishRun(summary = 'Finished', failed = false) {
    if (!run) return;
    clearInterval(elapsedTimer);
    const elapsed = ((performance.now()-run.started)/1000).toFixed(1);
    run.finished = true;
    run.card.querySelector('.runHeader strong').textContent = failed ? 'Director stopped' : summary;
    run.card.querySelector('.runElapsed').textContent = `${elapsed}s`;
    run.card.querySelector('.runProgress i').style.width = '100%';
    if (failed) run.card.classList.add('failed');
    run.stages.forEach((stage, index) => { if (index <= run.active) stage.done = true; });
    run.active = run.stages.length;
    renderRun();
    document.body.classList.remove('directorWorking');
  }

  function operationName(op) {
    const names = {
      seek:'Move playhead', split_at:'Split clip', remove_range:'Remove selected range', add_marker:'Add marker',
      move_clip:'Move clip', add_keyframe:'Add keyframe', slip_clip:'Slip clip', slide_clip:'Slide clip', roll_boundary:'Roll edit'
    };
    return names[op?.type] || 'Timeline edit';
  }
  function clearOperationHighlight() {
    document.querySelectorAll('.directorTarget').forEach(node => node.classList.remove('directorTarget'));
  }
  function focusOperation(op) {
    clearOperationHighlight();
    const ids = [op?.clipId, op?.leftId, op?.rightId].filter(Boolean).map(String);
    ids.forEach(id => document.querySelector(`.clip[data-clip-id="${CSS.escape(id)}"]`)?.classList.add('directorTarget'));
    let targetTime = null;
    if (op?.type === 'split_at' || op?.type === 'seek' || op?.type === 'add_marker') targetTime = Number(op.time);
    else if (op?.type === 'remove_range') targetTime = Number(op.start);
    else if (op?.clipId) targetTime = Number(TL.findClip(state.timeline, String(op.clipId))?.clip?.start);
    if (Number.isFinite(targetTime) && video) {
      const max = Math.max(0, Number(video.duration || timelineDuration()));
      video.currentTime = Math.max(0, Math.min(max || targetTime, targetTime));
      if (timeLabel) timeLabel.textContent = tc(video.currentTime);
      renderTimeline();
    }
  }

  async function applyOperationsVisibly(ops, context, runPrefix = 2) {
    const editOps = (ops || []).filter(op => op?.type !== 'seek');
    if (editOps.length) pushUndo();
    let changed = 0;
    for (let index = 0; index < ops.length; index++) {
      const op = ops[index];
      const stageIndex = runPrefix + index;
      setActive(stageIndex, `${index+1}/${ops.length}`);
      focusOperation(op);
      await wait(140);
      changed += Number(window.DirectorCutApplyOperations?.([op], context, { recordUndo:false, learn:false }) || 0);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      focusOperation(op);
      await wait(220);
    }
    clearOperationHighlight();
    if (changed) learn('accepted', context, ops.map(operationName).join(', '));
    return changed;
  }

  // ---------- Replace the simple one-shot Director send path ----------
  if (send && prompt) {
    send.onclick = async () => {
      const q = prompt.value.trim();
      if (!q) return;
      say(q, 'user');
      prompt.value = '';
      send.disabled = true;
      startRun(q);
      setStages(['Preparing project context', 'Asking local model', 'Planning response'], 0);
      try {
        const selected = state.selectedClipId ? TL.findClip(state.timeline,state.selectedClipId) : null;
        const payload = {
          request:q, workspaceMode:state.workspaceMode, directorPolicy:state.directorPolicy, model:state.selectedModel,
          history:state.conversation.slice(-12), currentTime:snap(video?.currentTime || 0),
          selection:selected ? { trackId:selected.track.id, clip:selected.clip } : null,
          project:{ name:state.name, duration:Math.max(state.duration,TL.duration(state.timeline)), timeline:state.timeline, learned:state.edits.slice(-24) },
          transcript_excerpt:(state.transcript?.text || state.script || '').slice(0,12000),
          attachments:(state.attachments||[]).map(a=>({name:a.name,kind:a.kind,path:(a.kind==='image'||a.kind==='video')?a.path:null,text:a.text?.slice?.(0,5000)||null}))
        };
        setActive(1, state.selectedModel ? state.selectedModel : 'Ollama');
        let result = desktop ? await window.directorcut.askDirector(payload) : null;
        if (!result?.available) result = window.DirectorCutFallbackIntent?.(q) || {intent:'conversation',text:'I can discuss this edit.',operations:[]};
        const text = result.text || 'Done.';
        const ops = Array.isArray(result.operations) ? result.operations : [];
        setActive(2, result.intent === 'edit_task' ? `${ops.length} operation${ops.length===1?'':'s'}` : 'Conversation');
        await wait(120);

        const canEdit = state.workspaceMode === 'Director' && state.directorPolicy !== 'Ask' && result.intent === 'edit_task' && ops.length;
        if (!canEdit) {
          say(text);
          finishRun('Response ready');
          return;
        }

        const operationStages = ops.map(op => ({label:operationName(op)}));
        if (state.directorPolicy === 'Co-edit') {
          setStages(['Context ready', 'Edit plan ready', ...operationStages, 'Waiting for approval'], 2 + ops.length);
          showProposal(text,ops,q);
          state.pendingProposal={text,ops,context:q,visibleRun:true};
          run.card.querySelector('.runHeader strong').textContent = 'Edit plan ready';
          return;
        }

        setStages(['Context ready', 'Edit plan ready', ...operationStages, 'Finishing'], 2);
        const count = await applyOperationsVisibly(ops,q,2);
        setActive(2 + ops.length, 'Saving changes');
        await wait(120);
        say(count ? `${text}\n\nApplied ${count} reversible timeline operation${count===1?'':'s'}.` : text);
        finishRun(count ? `${count} edit${count===1?'':'s'} completed` : 'Director finished');
      } catch (error) {
        say(`Director error: ${error.message}`);
        finishRun('Director stopped', true);
      } finally {
        send.disabled = false;
      }
    };
  }

  // Co-edit approval uses the same visible step-by-step execution path.
  const approve = document.querySelector('#approve');
  const reject = document.querySelector('#reject');
  if (approve) approve.onclick = async () => {
    const pending = state.pendingProposal;
    if (!pending) return;
    document.querySelector('#proposal').hidden = true;
    if (!run || run.finished) {
      startRun(pending.context || 'Approved edit');
      setStages(['Approved', ...pending.ops.map(op => ({label:operationName(op)})), 'Finishing'], 1);
    } else {
      setStages(['Approved', ...pending.ops.map(op => ({label:operationName(op)})), 'Finishing'], 1);
    }
    try {
      const count = await applyOperationsVisibly(pending.ops,pending.context || 'approved proposal',1);
      setActive(1 + pending.ops.length, 'Saving changes');
      await wait(100);
      say(count ? `Applied ${count} approved operation${count===1?'':'s'}.` : 'There was no valid operation to apply.');
      finishRun(count ? `${count} approved edit${count===1?'':'s'} completed` : 'Director finished');
    } catch (error) {
      say(`Director error: ${error.message}`);
      finishRun('Director stopped', true);
    } finally {
      state.pendingProposal=null;
    }
  };
  if (reject) reject.onclick = () => {
    const pending=state.pendingProposal;
    if (pending) learn('rejected',pending.context||'proposal',pending.text||'');
    state.pendingProposal=null;
    document.querySelector('#proposal').hidden=true;
    say('Rejected. No timeline changes were made.');
    finishRun('Edit rejected');
  };

  // ---------- Keyboard-first playhead and editing tools ----------
  function isTypingTarget(target) {
    return Boolean(target?.closest?.('input,textarea,select,[contenteditable="true"]'));
  }
  function movePlayhead(delta) {
    if (!video) return;
    const end = timelineDuration();
    const next = snap(Math.max(0, Math.min(end || Infinity, Number(video.currentTime || 0) + delta)));
    video.currentTime = next;
    if (timeLabel) timeLabel.textContent = tc(next);
    renderTimeline();
  }
  function setPlayhead(value) {
    if (!video) return;
    const end = timelineDuration();
    const next = snap(Math.max(0, Math.min(end || value, value)));
    video.currentTime = next;
    if (timeLabel) timeLabel.textContent = tc(next);
    renderTimeline();
  }
  function chooseTool(name) {
    const button = document.querySelector(`[data-tool="${name}"]`);
    button?.click();
  }

  document.addEventListener('keydown', event => {
    if (isTypingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    const frame = frameDuration();
    const mod = event.ctrlKey || event.metaKey;
    const handled = () => { event.preventDefault(); event.stopImmediatePropagation(); };

    if (mod && key === 'z') { handled(); document.querySelector('#undoEdit')?.click(); return; }
    if (mod && key === 's') { handled(); document.querySelector('#saveProject')?.click(); return; }
    if (event.key === 'ArrowLeft') { handled(); movePlayhead(-(event.shiftKey ? frame*10 : mod ? 1 : frame)); return; }
    if (event.key === 'ArrowRight') { handled(); movePlayhead(event.shiftKey ? frame*10 : mod ? 1 : frame); return; }
    if (event.key === 'Home') { handled(); setPlayhead(0); return; }
    if (event.key === 'End') { handled(); setPlayhead(TL.duration(state.timeline)); return; }
    if (event.code === 'Space') { handled(); video?.paused ? video.play().catch(()=>{}) : video?.pause(); return; }
    if (key === 'j') { handled(); video?.pause(); movePlayhead(-frame*10); return; }
    if (key === 'k') { handled(); video?.pause(); return; }
    if (key === 'l') { handled(); if (video) { video.playbackRate = event.shiftKey ? 2 : 1; video.play().catch(()=>{}); } return; }
    if (key === 'v') { handled(); chooseTool('select'); return; }
    if (key === 'c') { handled(); document.querySelector('#split')?.click(); return; }
    if (key === 'b') { handled(); chooseTool('ripple'); return; }
    if (key === 'n') { handled(); chooseTool('roll'); return; }
    if (key === 'y') { handled(); chooseTool('slip'); return; }
    if (key === 'u') { handled(); chooseTool('slide'); return; }
    if (key === 'i') { handled(); document.querySelector('#setIn')?.click(); return; }
    if (key === 'o') { handled(); document.querySelector('#setOut')?.click(); return; }
    if (key === 'm') { handled(); document.querySelector('#markScene')?.click(); return; }
    if (event.key === 'Delete' && state.inPoint !== null && state.outPoint !== null) { handled(); document.querySelector('#deleteRange')?.click(); return; }
    if (event.key === '?' || (event.shiftKey && key === '/')) { handled(); toggleShortcutSheet(true); }
  }, true);

  // ---------- Shortcut reference ----------
  function shortcutRows() {
    return [
      ['← / →','Move playhead one frame'],['Shift + ← / →','Move playhead ten frames'],['Ctrl + ← / →','Move playhead one second'],['Home / End','Timeline start / end'],
      ['Space','Play / pause'],['J / K / L','Jog back / pause / play'],['V','Select tool'],['C','Split at playhead'],['B','Ripple tool'],['N','Roll tool'],['Y','Slip tool'],['U','Slide tool'],
      ['I / O','Set In / Out'],['M','Add marker'],['Delete','Delete In → Out'],['Ctrl + Z','Undo'],['Ctrl + S','Save project'],['?','Show shortcuts']
    ];
  }
  function ensureShortcutSheet() {
    let sheet = document.querySelector('#shortcutSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id='shortcutSheet'; sheet.className='shortcutSheet'; sheet.hidden=true;
    const rows = shortcutRows().map(([key,label])=>`<div class="shortcutRow"><kbd>${key}</kbd><span>${label}</span></div>`).join('');
    sheet.innerHTML=`<div class="shortcutCard"><div class="shortcutHead"><h2>Keyboard shortcuts</h2><button type="button" aria-label="Close">×</button></div><div class="shortcutGrid">${rows}</div><div class="shortcutHint">Shortcuts are disabled while you are typing in Director, transcript, project name or other text fields.</div></div>`;
    sheet.querySelector('button').onclick=()=>toggleShortcutSheet(false);
    sheet.addEventListener('pointerdown',event=>{if(event.target===sheet)toggleShortcutSheet(false)});
    document.body.appendChild(sheet);
    return sheet;
  }
  function toggleShortcutSheet(show) { ensureShortcutSheet().hidden = !show; }
  const top = document.querySelector('.timelineTop>div');
  if (top && !document.querySelector('#shortcutButton')) {
    const hint = document.createElement('span'); hint.className='playheadKeyboardHint'; hint.textContent='← → frame'; top.appendChild(hint);
    const button=document.createElement('button'); button.id='shortcutButton'; button.className='shortcutButton'; button.textContent='⌨ Shortcuts'; button.title='Keyboard shortcuts'; button.onclick=()=>toggleShortcutSheet(true); top.appendChild(button);
  }

  // Remove the old plain-S split shortcut from being surprising: the professional Razor shortcut is C.
  document.addEventListener('keyup', event => {
    if (event.key === 'Escape') toggleShortcutSheet(false);
  });
})();
