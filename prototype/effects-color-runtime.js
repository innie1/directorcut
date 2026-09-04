// Professional color + effects Inspector layer. Effects are stored as typed clip data
// so manual editing, Director operations, native preview and export can share one model.
(() => {
  const FX=window.DirectorEffectsColor;
  const TL=window.DirectorTimeline;
  const video=document.querySelector('#video');
  const content=document.querySelector('#inspectorContent');
  const monitor=document.querySelector('.monitor');
  if(!FX||!TL||!video||!content||!monitor)return;

  const sessions=new WeakMap();
  const notice=text=>window.DirectorCutEditorToast?.(text);

  const colorSection=document.createElement('section');
  colorSection.className='inspectorSection effectsColorSection';
  colorSection.id='inspectorColorSection';
  colorSection.innerHTML=`
    <div class="effectSectionHead"><label class="effectMasterToggle"><input type="checkbox" data-effect-toggle="color"> <h3>Color</h3></label><button type="button" data-reset-effect="color">Reset</button></div>
    <div class="inspectorRow"><label>Exposure</label><input data-effect-type="color" data-effect-param="exposure" type="number" step="0.1" min="-4" max="4"><span class="effectUnit">EV</span></div>
    <div class="inspectorRow"><label>Contrast</label><input data-effect-type="color" data-effect-param="contrast" type="number" step="1" min="25" max="400"><span class="effectUnit">%</span></div>
    <div class="inspectorRow"><label>Highlights</label><input data-effect-type="color" data-effect-param="highlights" type="number" step="1" min="-100" max="100"><span class="effectUnit">%</span></div>
    <div class="inspectorRow"><label>Shadows</label><input data-effect-type="color" data-effect-param="shadows" type="number" step="1" min="-100" max="100"><span class="effectUnit">%</span></div>
    <div class="inspectorRow"><label>Saturation</label><input data-effect-type="color" data-effect-param="saturation" type="number" step="1" min="0" max="400"><span class="effectUnit">%</span></div>
    <div class="inspectorRow"><label>Temperature</label><input data-effect-type="color" data-effect-param="temperature" type="number" step="1" min="-100" max="100"><span class="effectUnit">K</span></div>
    <div class="inspectorRow"><label>Tint</label><input data-effect-type="color" data-effect-param="tint" type="number" step="1" min="-100" max="100"><span class="effectUnit">↔</span></div>
    <small class="inspectorHint">Color corrections are non-destructive. Highlights and Shadows use a tonal curve in final render.</small>`;

  const effectsSection=document.createElement('section');
  effectsSection.className='inspectorSection effectsColorSection';
  effectsSection.id='inspectorEffectsSection';
  effectsSection.innerHTML=`
    <div class="effectSectionHead"><h3>Effects</h3><button type="button" data-reset-effects="all">Reset all</button></div>
    <div class="effectControlRow"><label><input type="checkbox" data-effect-toggle="blur"> Blur</label><input data-effect-type="blur" data-effect-param="radius" type="number" step="0.5" min="0" max="50"><span class="effectUnit">px</span><button type="button" data-reset-effect="blur" title="Reset Blur">↺</button></div>
    <div class="effectControlRow"><label><input type="checkbox" data-effect-toggle="sharpen"> Sharpen</label><input data-effect-type="sharpen" data-effect-param="amount" type="number" step="5" min="0" max="300"><span class="effectUnit">%</span><button type="button" data-reset-effect="sharpen" title="Reset Sharpen">↺</button></div>
    <div class="effectControlRow"><label><input type="checkbox" data-effect-toggle="vignette"> Vignette</label><input data-effect-type="vignette" data-effect-param="amount" type="number" step="1" min="0" max="100"><span class="effectUnit">%</span><button type="button" data-reset-effect="vignette" title="Reset Vignette">↺</button></div>
    <div class="effectControlRow"><label><input type="checkbox" data-effect-toggle="motionBlur"> Motion blur</label><input data-effect-type="motionBlur" data-effect-param="amount" type="number" step="1" min="0" max="100"><span class="effectUnit">%</span><button type="button" data-reset-effect="motionBlur" title="Reset Motion Blur">↺</button></div>
    <div class="lutControlRow">
      <label><input type="checkbox" data-effect-toggle="lut"> LUT</label>
      <span class="lutFileName" data-lut-name>No LUT selected</span>
      <button type="button" data-pick-lut>Browse…</button>
      <button type="button" data-reset-effect="lut" title="Clear LUT">Clear</button>
    </div>
    <small class="inspectorHint">Blur has lightweight live preview. Motion Blur and arbitrary .cube/.3dl LUTs are rendered exactly by FFmpeg; native preview remains conservative when the platform has no equivalent effect.</small>`;

  const sections=[...content.querySelectorAll('.inspectorSection')];
  const timing=sections.find(section=>section.querySelector('h3')?.textContent?.trim()==='Timing');
  if(timing)timing.before(colorSection,effectsSection);else content.append(colorSection,effectsSection);

  const overlay=document.createElement('div');
  overlay.className='effectsPreviewOverlay';
  monitor.appendChild(overlay);

  const conversions={
    'color.exposure':{toField:v=>v,fromField:v=>Number(v)||0},
    'color.contrast':{toField:v=>v*100,fromField:v=>FX.clamp((Number(v)||0)/100,.25,4)},
    'color.highlights':{toField:v=>v,fromField:v=>FX.clamp(Number(v)||0,-100,100)},
    'color.shadows':{toField:v=>v,fromField:v=>FX.clamp(Number(v)||0,-100,100)},
    'color.saturation':{toField:v=>v*100,fromField:v=>FX.clamp((Number(v)||0)/100,0,4)},
    'color.temperature':{toField:v=>v,fromField:v=>FX.clamp(Number(v)||0,-100,100)},
    'color.tint':{toField:v=>v,fromField:v=>FX.clamp(Number(v)||0,-100,100)},
    'blur.radius':{toField:v=>v,fromField:v=>FX.clamp(Number(v)||0,0,50)},
    'sharpen.amount':{toField:v=>v*100,fromField:v=>FX.clamp((Number(v)||0)/100,0,3)},
    'vignette.amount':{toField:v=>v*100,fromField:v=>FX.clamp((Number(v)||0)/100,0,1)},
    'motionBlur.amount':{toField:v=>v*100,fromField:v=>FX.clamp((Number(v)||0)/100,0,1)}
  };

  function selectedVideo(){
    if(!state?.selectedClipId)return null;
    const found=TL.findClip(state.timeline,state.selectedClipId);
    return found?.track?.kind==='video'?found:null;
  }

  function activeVideoClipAt(time){
    let active=null;
    for(const track of state?.timeline?.tracks||[]){
      if(track.kind!=='video'||track.hidden)continue;
      for(const clip of track.clips||[]){
        if(time>=Number(clip.start||0)-1e-6&&time<Number(clip.start||0)+Number(clip.duration||0)-1e-6)active={track,clip};
      }
    }
    return active;
  }

  function sync(){
    const found=selectedVideo();
    colorSection.hidden=!found;
    effectsSection.hidden=!found;
    if(!found)return;
    for(const input of content.querySelectorAll('input[data-effect-type][data-effect-param]')){
      if(document.activeElement===input)continue;
      const type=input.dataset.effectType,param=input.dataset.effectParam,key=`${type}.${param}`;
      const effect=FX.getEffect(found.clip,type),value=effect?.params?.[param]??FX.SPECS[type]?.params?.[param]??0;
      input.value=Number((conversions[key]?.toField(value)??value).toFixed(2));
      input.disabled=effect?.enabled===false;
    }
    for(const toggle of content.querySelectorAll('input[data-effect-toggle]')){
      const effect=FX.getEffect(found.clip,toggle.dataset.effectToggle);
      toggle.checked=Boolean(effect?.enabled);
    }
    const lut=FX.getEffect(found.clip,'lut'),label=content.querySelector('[data-lut-name]');
    if(label){label.textContent=lut?.params?.path?FX.shortPath(lut.params.path):'No LUT selected';label.title=lut?.params?.path||'';}
  }

  function applyInput(input){
    const found=selectedVideo();
    if(!found)return null;
    const type=input.dataset.effectType,param=input.dataset.effectParam,key=`${type}.${param}`,convert=conversions[key];
    if(!convert||input.value==='')return null;
    const value=convert.fromField(input.value);
    state.timeline=FX.setEffectParam(state.timeline,found.clip.id,type,param,value,{enabled:true});
    return{clipId:found.clip.id,type,param,value};
  }

  function sendNativeEffect(change){
    if(!change||!window.DirectorCutProgramMonitor?.active||!window.directorcut?.programMonitorSetProperty)return;
    if(change.type!=='color'&&change.type!=='blur')return;
    window.directorcut.programMonitorSetProperty(change.clipId,`effect.${change.type}.${change.param}`,change.value).catch(()=>false);
  }

  function commit(input){
    const before=sessions.get(input);
    if(before){
      if(typeof pushUndo==='function')pushUndo(before);
      sessions.delete(input);
      if(typeof learn==='function')learn('accepted',`manual ${input.dataset.effectType} ${input.dataset.effectParam}`,state.selectedClipId||'');
    }
    if(typeof markDirty==='function')markDirty();
    if(typeof renderTimeline==='function')renderTimeline();
    sync();
    applyPreview();
  }

  function displayedVideoRect(){
    const box=video.getBoundingClientRect(),parent=monitor.getBoundingClientRect();
    let width=box.width,height=box.height,left=box.left-parent.left,top=box.top-parent.top;
    const naturalW=video.videoWidth||0,naturalH=video.videoHeight||0;
    if(naturalW&&naturalH&&box.width&&box.height){
      const mediaRatio=naturalW/naturalH,boxRatio=box.width/box.height;
      if(mediaRatio>boxRatio){height=box.width/mediaRatio;top+=(box.height-height)/2;}
      else{width=box.height*mediaRatio;left+=(box.width-width)/2;}
    }
    return{left,top,width,height};
  }

  function resetPreview(){
    video.style.filter='';
    overlay.style.display='none';
    overlay.style.background='';
  }

  function applyPreview(){
    if(window.DirectorCutProgramMonitor?.active){resetPreview();return;}
    const active=activeVideoClipAt(Number(video.currentTime||0));
    if(!active){resetPreview();return;}
    const color=FX.getEffect(active.clip,'color'),blur=FX.getEffect(active.clip,'blur'),vignette=FX.getEffect(active.clip,'vignette');
    const exposure=color?.enabled?color.params.exposure:0,contrast=color?.enabled?color.params.contrast:1,saturation=color?.enabled?color.params.saturation:1;
    const highlights=color?.enabled?color.params.highlights:0,shadows=color?.enabled?color.params.shadows:0;
    const tonalBrightness=1+(shadows/100)*.10+(highlights/100)*.04;
    const tonalContrast=Math.max(.4,1+(highlights/100)*.10-(shadows/100)*.08);
    const blurRadius=blur?.enabled?blur.params.radius:0;
    video.style.filter=`brightness(${(Math.pow(2,exposure)*tonalBrightness).toFixed(4)}) contrast(${(contrast*tonalContrast).toFixed(4)}) saturate(${saturation.toFixed(4)}) blur(${blurRadius.toFixed(2)}px)`;

    const temp=color?.enabled?color.params.temperature:0,tint=color?.enabled?color.params.tint:0,vignetteAmount=vignette?.enabled?vignette.params.amount:0;
    const rect=displayedVideoRect();
    overlay.style.left=`${rect.left}px`;overlay.style.top=`${rect.top}px`;overlay.style.width=`${rect.width}px`;overlay.style.height=`${rect.height}px`;
    const warm=temp>=0?`rgba(255,126,36,${Math.abs(temp)/100*.16})`:`rgba(45,132,255,${Math.abs(temp)/100*.16})`;
    const tintColor=tint>=0?`rgba(255,56,175,${Math.abs(tint)/100*.11})`:`rgba(46,210,112,${Math.abs(tint)/100*.11})`;
    const edge=Math.max(0,Math.min(.85,vignetteAmount*.82));
    overlay.style.background=`radial-gradient(circle at center, transparent 48%, rgba(0,0,0,${edge}) 100%),linear-gradient(${tintColor},${tintColor}),linear-gradient(${warm},${warm})`;
    overlay.style.display=(Math.abs(temp)>1e-6||Math.abs(tint)>1e-6||vignetteAmount>1e-6)?'block':'none';
  }

  function finalizeEdit(label){
    if(typeof markDirty==='function')markDirty();
    if(typeof renderTimeline==='function')renderTimeline();
    sync();applyPreview();if(label)notice?.(label);
  }

  content.addEventListener('focusin',event=>{
    const input=event.target.closest('input[data-effect-type][data-effect-param]');
    if(input&&!sessions.has(input)&&typeof snapshot==='function')sessions.set(input,snapshot());
  });
  content.addEventListener('input',event=>{
    const input=event.target.closest('input[data-effect-type][data-effect-param]');
    if(!input)return;
    const change=applyInput(input);
    if(change){sendNativeEffect(change);applyPreview();}
  });
  content.addEventListener('change',event=>{
    const input=event.target.closest('input[data-effect-type][data-effect-param]');
    if(input){commit(input);return;}
    const toggle=event.target.closest('input[data-effect-toggle]');
    if(!toggle)return;
    const found=selectedVideo();if(!found)return;
    if(typeof pushUndo==='function')pushUndo();
    state.timeline=FX.setEffectEnabled(state.timeline,found.clip.id,toggle.dataset.effectToggle,toggle.checked);
    finalizeEdit(`${toggle.checked?'Enabled':'Disabled'} ${toggle.dataset.effectToggle==='motionBlur'?'Motion Blur':toggle.dataset.effectToggle}`);
  });
  content.addEventListener('click',async event=>{
    const pick=event.target.closest('[data-pick-lut]');
    if(pick){
      const found=selectedVideo();if(!found)return;
      if(!window.directorcut?.pickLut){notice?.('LUT picker is unavailable in this build.');return;}
      const result=await window.directorcut.pickLut().catch(()=>null),filePath=typeof result==='string'?result:result?.path;
      if(!filePath)return;
      if(typeof pushUndo==='function')pushUndo();
      state.timeline=FX.setEffectParam(state.timeline,found.clip.id,'lut','path',filePath,{enabled:true});
      finalizeEdit(`LUT ${FX.shortPath(filePath)} selected`);return;
    }
    const reset=event.target.closest('[data-reset-effect]');
    if(reset){
      const found=selectedVideo();if(!found)return;
      if(typeof pushUndo==='function')pushUndo();
      state.timeline=FX.resetEffect(state.timeline,found.clip.id,reset.dataset.resetEffect);
      finalizeEdit(`Reset ${reset.dataset.resetEffect==='motionBlur'?'Motion Blur':reset.dataset.resetEffect}`);return;
    }
    const resetAll=event.target.closest('[data-reset-effects="all"]');
    if(!resetAll)return;
    const found=selectedVideo();if(!found)return;
    if(typeof pushUndo==='function')pushUndo();
    state.timeline=FX.resetClipEffects(state.timeline,found.clip.id);
    finalizeEdit('Reset color and effects');
  });

  document.addEventListener('click',event=>{if(event.target.closest('.clip[data-clip-id]')||event.target.closest('[data-right-pane="inspector"]'))queueMicrotask(sync);},true);
  video.addEventListener('timeupdate',applyPreview);
  video.addEventListener('seeked',()=>{sync();applyPreview();});
  video.addEventListener('loadedmetadata',applyPreview);
  window.addEventListener('resize',applyPreview);

  sync();
  applyPreview();
  window.DirectorCutEffectsColorRuntime={sync,applyPreview,resetPreview,sendNativeEffect};
})();