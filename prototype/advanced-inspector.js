// Stage 3 Inspector: crop, reverse, freeze frame, professional audio and keyframe navigation.
(() => {
  const TL=window.DirectorTimeline,IU=window.DirectorInspectorUtils,AU=window.DirectorAdvancedInspector,AP=window.DirectorAudioPost;
  const video=document.querySelector('#video'),pane=document.querySelector('.inspectorPane'),content=pane?.querySelector('#inspectorContent');
  if(!TL||!IU||!AU||!AP||!video||!pane||!content)return;
  const sessions=new WeakMap();
  const notice=text=>window.DirectorCutEditorToast?.(text);
  const now=()=>Number(window.DirectorCutTimelineClock?.now?.()??video.currentTime??0)||0;
  const seek=time=>window.DirectorCutTimelineClock?.seek?.(time)??(()=>{try{video.currentTime=time}catch(_){}})();
  const selected=()=>state.selectedClipId?TL.findClip(state.timeline,state.selectedClipId):null;
  const linked=found=>found?.clip?.linkedId?TL.findClip(state.timeline,found.clip.linkedId):null;
  const localTime=clip=>Math.max(0,Math.min(Number(clip?.duration||0),now()-Number(clip?.start||0)));
  const snapshotNow=()=>typeof snapshot==='function'?snapshot():null;
  function push(before){if(typeof pushUndo==='function'){if(before)pushUndo(before);else pushUndo()}}
  function dirty(message){if(typeof markDirty==='function')markDirty();if(typeof renderTimeline==='function')renderTimeline();window.DirectorCutProfessionalInspector?.syncInspector?.();sync();applyCropPreview();if(message)notice(message)}
  function audioTarget(found){if(!found)return null;if(found.track.kind==='audio')return found;if(found.track.kind==='video')return linked(found)?.track?.kind==='audio'?linked(found):null;return null}

  const videoSection=content.querySelector('#inspectorVideoSection');
  const timingSection=[...content.querySelectorAll('.inspectorSection')].find(s=>s.querySelector('h3')?.textContent.trim()==='Timing');
  const audioSection=content.querySelector('#inspectorAudioSection');

  const crop=document.createElement('div');crop.className='advancedCrop';crop.innerHTML=`
    <div class="inspectorDivider"></div><h3>Crop</h3>
    <div class="inspectorSubgrid">
      <div class="inspectorRow"><label>Left %</label><input data-adv-crop="left" type="number" min="0" max="95" step="1"></div>
      <div class="inspectorRow"><label>Right %</label><input data-adv-crop="right" type="number" min="0" max="95" step="1"></div>
      <div class="inspectorRow"><label>Top %</label><input data-adv-crop="top" type="number" min="0" max="95" step="1"></div>
      <div class="inspectorRow"><label>Bottom %</label><input data-adv-crop="bottom" type="number" min="0" max="95" step="1"></div>
    </div><div class="inspectorToggleRow"><button type="button" id="resetCrop" class="inspectorAction">Reset crop</button></div>`;
  videoSection?.appendChild(crop);

  const timing=document.createElement('div');timing.className='advancedTiming';timing.innerHTML=`
    <div class="inspectorDivider"></div>
    <div class="inspectorToggleRow"><label class="inspectorToggle"><input id="reverseClip" type="checkbox"> Reverse</label><button type="button" id="freezeFrame" class="inspectorAction">Freeze at playhead</button><button type="button" id="clearFreeze" class="inspectorAction">Clear freeze</button><span id="freezeStatus" class="freezeStatus">Live</span></div>
    <small class="advancedInspectorNote">Reverse and Freeze are non-destructive. Freeze stores the exact source frame chosen at the playhead.</small>`;
  timingSection?.appendChild(timing);

  const advancedAudio=document.createElement('div');advancedAudio.id='advancedAudio';advancedAudio.innerHTML=`
    <div class="inspectorDivider"></div><h3>Professional audio</h3>
    <div class="inspectorRow"><label>Gain dB</label><input data-audio-prop="gainDb" type="number" min="-60" max="24" step="0.5"><span></span></div>
    <div class="inspectorRow"><label>Pan</label><input data-audio-prop="pan" type="number" min="-100" max="100" step="1"><span></span></div>
    <div class="inspectorRow"><label>Fade in</label><input data-audio-prop="fadeIn" type="number" min="0" max="10" step="0.05"><span>s</span></div>
    <div class="inspectorRow"><label>Fade out</label><input data-audio-prop="fadeOut" type="number" min="0" max="10" step="0.05"><span>s</span></div>
    <div class="inspectorRow"><label>Noise reduction</label><input data-audio-prop="noiseReduction" type="number" min="0" max="100" step="1"><span>%</span></div>
    <div class="advancedAudioChecks">
      <label class="inspectorToggle"><input data-audio-check="muted" type="checkbox"> Mute</label>
      <label class="inspectorToggle"><input data-audio-check="normalize" type="checkbox"> Normalize</label>
      <label class="inspectorToggle"><input data-audio-check="dialogueEnhance" type="checkbox"> Dialogue enhance</label>
    </div>`;
  audioSection?.appendChild(advancedAudio);

  const keySection=document.createElement('section');keySection.className='inspectorSection';keySection.id='advancedKeyframes';keySection.innerHTML=`
    <h3>Keyframes</h3>
    <div class="keyframeNavigator"><select id="keyframeNavProperty"></select><button id="prevKeyframe" title="Previous keyframe">◀</button><button id="addNavKeyframe" title="Add/update keyframe">◆</button><button id="nextKeyframe" title="Next keyframe">▶</button><button id="deleteNavKeyframe" class="danger" title="Delete keyframe at playhead">×</button></div>
    <div class="keyframeStatus"><span id="keyframeCount">0 keyframes</span><b id="keyframeAtPlayhead">No keyframe at playhead</b></div>
    <small class="advancedInspectorNote">Use ◀ / ▶ to jump between keyframes. ◆ adds or updates one at the current playhead; × removes the keyframe at the playhead.</small>`;
  content.appendChild(keySection);

  const cropFields=[...content.querySelectorAll('[data-adv-crop]')],audioFields=[...content.querySelectorAll('[data-audio-prop]')],audioChecks=[...content.querySelectorAll('[data-audio-check]')];
  const keySelect=content.querySelector('#keyframeNavProperty');
  const valueConversions={x:v=>Number(v)||0,y:v=>Number(v)||0,scale:v=>AU.clamp(Number(v)/100,.01,8),rotation:v=>AU.clamp(Number(v),-360,360),opacity:v=>AU.clamp(Number(v)/100,0,1),volume:v=>AU.clamp(Number(v)/100,0,8)};
  function selectedKeyTarget(found,property){if(property==='volume')return audioTarget(found);return found?.track?.kind==='video'?found:null}
  function availableKeyProperties(found){const out=[];if(found?.track?.kind==='video')out.push('x','y','scale','rotation','opacity');if(audioTarget(found))out.push('volume');return out}
  function propertyField(property){return content.querySelector(`input[data-inspector-prop="${property}"]`)}
  function ensureKeyOptions(found){const props=availableKeyProperties(found),current=keySelect.value;keySelect.innerHTML=props.map(p=>`<option value="${p}">${p[0].toUpperCase()+p.slice(1)}</option>`).join('');if(props.includes(current))keySelect.value=current;}

  function sync(){
    const found=selected();if(!found)return;
    if(found.track.kind==='video'){
      const c=AU.getCrop(state.timeline,found.clip.id);for(const input of cropFields)if(document.activeElement!==input)input.value=(c[input.dataset.advCrop]*100).toFixed(0);
      const reverse=content.querySelector('#reverseClip');if(reverse)reverse.checked=Boolean(found.clip.reverse);
      const frozen=AU.isFrozen(found.clip),status=content.querySelector('#freezeStatus');if(status){status.textContent=frozen?`Frozen @ ${Number(found.clip.freezeFrame.sourceTime).toFixed(2)}s`:'Live';status.classList.toggle('active',frozen)}
      const clear=content.querySelector('#clearFreeze');if(clear)clear.disabled=!frozen;
    }
    const audio=audioTarget(found);if(audio){
      const settings=AP.get(state.timeline,found.clip.id);for(const input of audioFields){if(document.activeElement===input)continue;const prop=input.dataset.audioProp;let value=settings[prop];if(prop==='pan')value*=100;if(prop==='noiseReduction')value*=100;input.value=Number(value).toFixed(prop==='gainDb'?1:prop==='fadeIn'||prop==='fadeOut'?2:0)}for(const check of audioChecks)check.checked=Boolean(settings[check.dataset.audioCheck]);
    }
    ensureKeyOptions(found);syncKeyStatus(found);
  }
  function syncKeyStatus(found=selected()){
    const property=keySelect.value,target=selectedKeyTarget(found,property),list=target?IU.frames(target.clip,property):[],t=target?localTime(target.clip):0,tol=TL.frameDuration(state.timeline.fps)*.55,at=list.some(k=>Math.abs(Number(k.time)-t)<=tol);content.querySelector('#keyframeCount').textContent=`${list.length} keyframe${list.length===1?'':'s'}`;content.querySelector('#keyframeAtPlayhead').textContent=at?'◆ Keyframe at playhead':'No keyframe at playhead';
  }
  function commitSession(input,label){const before=sessions.get(input);if(before)push(before);sessions.delete(input);dirty(label)}
  for(const input of [...cropFields,...audioFields])input.addEventListener('focus',()=>{if(!sessions.has(input))sessions.set(input,snapshotNow())});
  for(const input of cropFields){
    input.addEventListener('input',()=>{const found=selected();if(!found||found.track.kind!=='video'||input.value==='')return;state.timeline=AU.setCrop(state.timeline,found.clip.id,input.dataset.advCrop,Number(input.value)/100);if(typeof renderTimeline==='function')renderTimeline();applyCropPreview()});
    input.addEventListener('change',()=>commitSession(input,'Crop updated'));
  }
  for(const input of audioFields){
    input.addEventListener('input',()=>{const found=selected();if(!audioTarget(found)||input.value==='')return;const prop=input.dataset.audioProp;let value=Number(input.value);if(prop==='pan'||prop==='noiseReduction')value/=100;state.timeline=AP.set(state.timeline,found.clip.id,prop,value)});
    input.addEventListener('change',()=>commitSession(input,'Audio updated'));
  }
  for(const check of audioChecks)check.addEventListener('change',()=>{const found=selected();if(!audioTarget(found))return;push();state.timeline=AP.set(state.timeline,found.clip.id,check.dataset.audioCheck,check.checked);dirty('Audio updated')});
  content.querySelector('#reverseClip')?.addEventListener('change',event=>{const found=selected();if(!found||found.track.kind!=='video')return;push();state.timeline=AU.setReverse(state.timeline,found.clip.id,event.target.checked,{linked:true});dirty(event.target.checked?'Reverse enabled':'Reverse disabled')});
  content.querySelector('#freezeFrame')?.addEventListener('click',()=>{const found=selected();if(!found||found.track.kind!=='video')return;push();state.timeline=AU.freezeAt(state.timeline,found.clip.id,localTime(found.clip));dirty('Freeze frame set at playhead')});
  content.querySelector('#clearFreeze')?.addEventListener('click',()=>{const found=selected();if(!found||found.track.kind!=='video')return;push();state.timeline=AU.clearFreeze(state.timeline,found.clip.id);dirty('Freeze frame cleared')});
  content.querySelector('#resetCrop')?.addEventListener('click',()=>{const found=selected();if(!found||found.track.kind!=='video')return;push();state.timeline=AU.resetCrop(state.timeline,found.clip.id);dirty('Crop reset')});

  function keyframeValue(property){const input=propertyField(property);return input?valueConversions[property](input.value):0}
  content.querySelector('#addNavKeyframe')?.addEventListener('click',()=>{const found=selected(),property=keySelect.value,target=selectedKeyTarget(found,property);if(!target)return;push();state.timeline=IU.setKeyframe(state.timeline,target.clip.id,property,localTime(target.clip),keyframeValue(property));dirty(`${property} keyframe added`)});
  content.querySelector('#deleteNavKeyframe')?.addEventListener('click',()=>{const found=selected(),property=keySelect.value,target=selectedKeyTarget(found,property);if(!target)return;push();state.timeline=AU.removeKeyframe(state.timeline,target.clip.id,property,localTime(target.clip),TL.frameDuration(state.timeline.fps)*.6);dirty(`${property} keyframe removed`)});
  for(const [id,direction] of [['prevKeyframe',-1],['nextKeyframe',1]])content.querySelector(`#${id}`)?.addEventListener('click',()=>{const found=selected(),property=keySelect.value,target=selectedKeyTarget(found,property);if(!target)return;const t=AU.neighborKeyframeTime(target.clip,property,localTime(target.clip),direction);if(t===null)return;seek(Number(target.clip.start||0)+t);setTimeout(sync,0)});
  keySelect.addEventListener('change',()=>syncKeyStatus());

  function activeVideoAt(time){let active=null;for(const track of state.timeline?.tracks||[])if(track.kind==='video'&&!track.hidden)for(const clip of track.clips||[])if(time>=Number(clip.start||0)-1e-6&&time<TL.clipEnd(clip)-1e-6)active={track,clip};return active}
  function applyCropPreview(){if(window.DirectorCutProgramMonitor?.active){video.style.clipPath='';return}const active=activeVideoAt(now());if(!active){video.style.clipPath='';return}const c=AU.normalizeCrop(active.clip.crop);video.style.clipPath=(c.left||c.right||c.top||c.bottom)?`inset(${c.top*100}% ${c.right*100}% ${c.bottom*100}% ${c.left*100}%)`:'';}
  video.addEventListener('timeupdate',()=>{syncKeyStatus();applyCropPreview()});
  document.addEventListener('click',event=>{if(event.target.closest('.clip[data-clip-id]'))setTimeout(sync,0)},true);
  if(typeof renderTimeline==='function'){const base=renderTimeline;renderTimeline=function(...args){const result=base.apply(this,args);setTimeout(()=>{sync();applyCropPreview()},0);return result;};}
  if(typeof renderSelectedClip==='function'){const base=renderSelectedClip;renderSelectedClip=function(...args){const result=base.apply(this,args);setTimeout(sync,0);return result;};}
  window.DirectorCutAdvancedInspectorRuntime={sync,applyCropPreview};sync();applyCropPreview();
})();
