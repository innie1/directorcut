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
    <div class="effectSectionHead"><h3>Color</h3><button type="button" data-reset-effects="color">Reset</button></div>
    <div class="inspectorRow"><label>Exposure</label><input data-effect-type="color" data-effect-param="exposure" type="number" step="0.1" min="-4" max="4"><span class="effectUnit">EV</span></div>
    <div class="inspectorRow"><label>Contrast</label><input data-effect-type="color" data-effect-param="contrast" type="number" step="1" min="25" max="400"><span class="effectUnit">%</span></div>
    <div class="inspectorRow"><label>Saturation</label><input data-effect-type="color" data-effect-param="saturation" type="number" step="1" min="0" max="400"><span class="effectUnit">%</span></div>
    <div class="inspectorRow"><label>Temperature</label><input data-effect-type="color" data-effect-param="temperature" type="number" step="1" min="-100" max="100"><span class="effectUnit">K</span></div>
    <div class="inspectorRow"><label>Tint</label><input data-effect-type="color" data-effect-param="tint" type="number" step="1" min="-100" max="100"><span class="effectUnit">↔</span></div>
    <small class="inspectorHint">Neutral values are Exposure 0, Contrast 100, Saturation 100, Temperature 0 and Tint 0.</small>`;

  const effectsSection=document.createElement('section');
  effectsSection.className='inspectorSection effectsColorSection';
  effectsSection.id='inspectorEffectsSection';
  effectsSection.innerHTML=`
    <div class="effectSectionHead"><h3>Effects</h3><button type="button" data-reset-effects="all">Reset</button></div>
    <div class="inspectorRow"><label>Blur</label><input data-effect-type="blur" data-effect-param="radius" type="number" step="0.5" min="0" max="50"><span class="effectUnit">px</span></div>
    <div class="inspectorRow"><label>Sharpen</label><input data-effect-type="sharpen" data-effect-param="amount" type="number" step="5" min="0" max="300"><span class="effectUnit">%</span></div>
    <div class="inspectorRow"><label>Vignette</label><input data-effect-type="vignette" data-effect-param="amount" type="number" step="1" min="0" max="100"><span class="effectUnit">%</span></div>
    <small class="inspectorHint">0 disables an effect. Effects stay attached to the clip through moves, trims, saves and export.</small>`;

  const sections=[...content.querySelectorAll('.inspectorSection')];
  const timing=sections.find(section=>section.querySelector('h3')?.textContent?.trim()==='Timing');
  if(timing)timing.before(colorSection,effectsSection);else content.append(colorSection,effectsSection);

  const overlay=document.createElement('div');
  overlay.className='effectsPreviewOverlay';
  monitor.appendChild(overlay);

  const conversions={
    'color.exposure':{toField:v=>v,fromField:v=>Number(v)||0},
    'color.contrast':{toField:v=>v*100,fromField:v=>FX.clamp((Number(v)||0)/100,.25,4)},
    'color.saturation':{toField:v=>v*100,fromField:v=>FX.clamp((Number(v)||0)/100,0,4)},
    'color.temperature':{toField:v=>v,fromField:v=>FX.clamp(Number(v)||0,-100,100)},
    'color.tint':{toField:v=>v,fromField:v=>FX.clamp(Number(v)||0,-100,100)},
    'blur.radius':{toField:v=>v,fromField:v=>FX.clamp(Number(v)||0,0,50)},
    'sharpen.amount':{toField:v=>v*100,fromField:v=>FX.clamp((Number(v)||0)/100,0,3)},
    'vignette.amount':{toField:v=>v*100,fromField:v=>FX.clamp((Number(v)||0)/100,0,1)}
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
    }
  }

  function applyInput(input){
    const found=selectedVideo();
    if(!found)return null;
    const type=input.dataset.effectType,param=input.dataset.effectParam,key=`${type}.${param}`,convert=conversions[key];
    if(!convert||input.value==='')return null;
    const value=convert.fromField(input.value);
    state.timeline=FX.setEffectParam(state.timeline,found.clip.id,type,param,value);
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
    const blurRadius=blur?.enabled?blur.params.radius:0;
    video.style.filter=`brightness(${Math.pow(2,exposure).toFixed(4)}) contrast(${contrast.toFixed(4)}) saturate(${saturation.toFixed(4)}) blur(${blurRadius.toFixed(2)}px)`;

    const temp=color?.enabled?color.params.temperature:0,tint=color?.enabled?color.params.tint:0,vignetteAmount=vignette?.enabled?vignette.params.amount:0;
    const rect=displayedVideoRect();
    overlay.style.left=`${rect.left}px`;overlay.style.top=`${rect.top}px`;overlay.style.width=`${rect.width}px`;overlay.style.height=`${rect.height}px`;
    const warm=temp>=0?`rgba(255,126,36,${Math.abs(temp)/100*.16})`:`rgba(45,132,255,${Math.abs(temp)/100*.16})`;
    const tintColor=tint>=0?`rgba(255,56,175,${Math.abs(tint)/100*.11})`:`rgba(46,210,112,${Math.abs(tint)/100*.11})`;
    const edge=Math.max(0,Math.min(.85,vignetteAmount*.82));
    overlay.style.background=`radial-gradient(circle at center, transparent 48%, rgba(0,0,0,${edge}) 100%),linear-gradient(${tintColor},${tintColor}),linear-gradient(${warm},${warm})`;
    overlay.style.display=(Math.abs(temp)>1e-6||Math.abs(tint)>1e-6||vignetteAmount>1e-6)?'block':'none';
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
    if(input)commit(input);
  });
  content.addEventListener('click',event=>{
    const reset=event.target.closest('[data-reset-effects]');
    if(!reset)return;
    const found=selectedVideo();if(!found)return;
    if(typeof pushUndo==='function')pushUndo();
    if(reset.dataset.resetEffects==='color'){
      for(const [param,value] of Object.entries(FX.SPECS.color.params))state.timeline=FX.setEffectParam(state.timeline,found.clip.id,'color',param,value);
    }else state.timeline=FX.resetClipEffects(state.timeline,found.clip.id);
    if(typeof markDirty==='function')markDirty();
    if(typeof renderTimeline==='function')renderTimeline();
    sync();applyPreview();notice?.(reset.dataset.resetEffects==='color'?'Reset color':'Reset color and effects');
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
