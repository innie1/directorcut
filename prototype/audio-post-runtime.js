// Professional audio Inspector for linked or selected audio clips.
(() => {
  const AP=window.DirectorAudioPost,TL=window.DirectorTimeline;
  const content=document.querySelector('#inspectorContent');
  if(!AP||!TL||!content)return;
  const section=document.createElement('section');section.className='inspectorSection audioPostSection';section.hidden=true;
  section.innerHTML=`
    <div class="effectSectionHead"><h3>Professional Audio</h3><button type="button" id="audioPostReset">Reset</button></div>
    <div class="inspectorRow"><label>Gain</label><input data-audio-post="gainDb" type="number" min="-60" max="24" step="0.5"><span class="effectUnit">dB</span></div>
    <div class="inspectorRow"><label>Pan</label><input data-audio-post="pan" type="number" min="-100" max="100" step="1"><span class="effectUnit">L/R</span></div>
    <div class="inspectorRow"><label>Fade In</label><input data-audio-post="fadeIn" type="number" min="0" max="10" step="0.05"><span class="effectUnit">sec</span></div>
    <div class="inspectorRow"><label>Fade Out</label><input data-audio-post="fadeOut" type="number" min="0" max="10" step="0.05"><span class="effectUnit">sec</span></div>
    <label class="audioToggle"><input data-audio-post="muted" type="checkbox"> Mute clip</label>
    <label class="audioToggle"><input data-audio-post="normalize" type="checkbox"> Normalize voice to broadcast level</label>
    <label class="audioToggle"><input data-audio-post="dialogueEnhance" type="checkbox"> Dialogue enhance</label>
    <small class="inspectorHint">Audio settings attach to the audio clip. Selecting linked video edits its dialogue audio automatically.</small>`;
  const audioBase=[...content.querySelectorAll('.inspectorSection')].find(s=>s.querySelector('h3')?.textContent?.trim()==='Audio');if(audioBase)audioBase.after(section);else content.append(section);
  const sessions=new WeakMap();
  function selectedTarget(){return state?.selectedClipId?AP.target(state.timeline,state.selectedClipId):null}
  function sync(){const target=selectedTarget();section.hidden=!target;if(!target)return;const a=AP.get(state.timeline,state.selectedClipId);section.querySelector('[data-audio-post="gainDb"]').value=a.gainDb.toFixed(1);section.querySelector('[data-audio-post="pan"]').value=Math.round(a.pan*100);section.querySelector('[data-audio-post="fadeIn"]').value=a.fadeIn.toFixed(2);section.querySelector('[data-audio-post="fadeOut"]').value=a.fadeOut.toFixed(2);for(const p of ['muted','normalize','dialogueEnhance'])section.querySelector(`[data-audio-post="${p}"]`).checked=a[p];}
  function valueOf(input){const p=input.dataset.audioPost;if(input.type==='checkbox')return input.checked;if(p==='pan')return (Number(input.value)||0)/100;return Number(input.value)||0}
  function apply(input){if(!state.selectedClipId)return;state.timeline=AP.set(state.timeline,state.selectedClipId,input.dataset.audioPost,valueOf(input));const target=selectedTarget();if(window.DirectorCutProgramMonitor?.active&&target){const a=AP.get(state.timeline,state.selectedClipId);const baseVolume=window.DirectorInspectorUtils?.valueAt(target.clip,'volume',1,0)??1;window.directorcut?.programMonitorSetProperty?.(target.clip.id,'volume',baseVolume*AP.linearGain(a)).catch(()=>{});}}
  section.addEventListener('focusin',e=>{const i=e.target.closest('[data-audio-post]');if(i&&!sessions.has(i)&&typeof snapshot==='function')sessions.set(i,snapshot());});
  section.addEventListener('input',e=>{const i=e.target.closest('input[data-audio-post]');if(!i||i.type==='checkbox')return;apply(i);});
  section.addEventListener('change',e=>{const i=e.target.closest('[data-audio-post]');if(!i)return;if(i.type==='checkbox')apply(i);const before=sessions.get(i);if(before&&typeof pushUndo==='function'){pushUndo(before);sessions.delete(i);}else if(i.type==='checkbox'&&typeof pushUndo==='function')pushUndo();if(typeof learn==='function')learn('accepted',`manual audio ${i.dataset.audioPost}`,state.selectedClipId||'');markDirty();renderTimeline();sync();});
  section.querySelector('#audioPostReset').addEventListener('click',()=>{if(!state.selectedClipId)return;pushUndo();state.timeline=AP.reset(state.timeline,state.selectedClipId);markDirty();renderTimeline();sync();});
  document.addEventListener('click',e=>{if(e.target.closest('.clip[data-clip-id]')||e.target.closest('[data-right-pane="inspector"]'))queueMicrotask(sync);},true);
  window.DirectorCutAudioPostRuntime={sync};sync();
})();