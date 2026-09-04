// Professional transition UI/runtime. Transition state lives on timeline.transitions.
(() => {
  const TR=window.DirectorTransitions,TL=window.DirectorTimeline;
  const content=document.querySelector('#inspectorContent');
  if(!TR||!TL||!content)return;
  if(state.selectedTransitionId===undefined)state.selectedTransitionId=null;

  const section=document.createElement('section');
  section.className='inspectorSection transitionInspectorSection';
  section.hidden=true;
  section.innerHTML=`
    <div class="effectSectionHead"><h3>Transition</h3><button type="button" id="transitionRemove">Remove</button></div>
    <div class="inspectorRow"><label>Type</label><select id="transitionType"></select><span class="effectUnit">↔</span></div>
    <div class="inspectorRow"><label>Duration</label><input id="transitionDuration" type="number" step="0.05" min="0.07" max="2"><span class="effectUnit">sec</span></div>
    <small class="inspectorHint">Transitions overlap neighboring clips and keep linked audio aligned. Cross Dissolve is native-GES safe; other styles remain export-authoritative.</small>`;
  const timing=[...content.querySelectorAll('.inspectorSection')].find(s=>s.querySelector('h3')?.textContent?.trim()==='Timing');
  if(timing)timing.before(section);else content.append(section);
  const typeSelect=section.querySelector('#transitionType');
  for(const [value,info] of Object.entries(TR.TYPES)){const option=document.createElement('option');option.value=value;option.textContent=info.label;typeSelect.appendChild(option);}
  const durationInput=section.querySelector('#transitionDuration');

  const totalDuration=()=>Math.max(Number(state.duration||0),Number(TL.duration(state.timeline)||0),1);
  const selectedTransition=()=>state.selectedTransitionId?TR.find(state.timeline,state.selectedTransitionId):null;

  function openInspector(){document.querySelector('[data-right-pane="inspector"]')?.click();}
  function syncInspector(){
    const tr=selectedTransition();section.hidden=!tr;if(!tr)return;
    typeSelect.value=tr.type;durationInput.value=Number(tr.duration||.5).toFixed(2);
  }

  function cleanMarkers(){document.querySelectorAll('.transitionBadge,.transitionAdd').forEach(el=>el.remove());}
  function renderTransitionMarkers(){
    cleanMarkers();
    const total=totalDuration(),frame=TL.frameDuration(state.timeline.fps);
    for(const track of state.timeline.tracks||[]){
      if(track.kind!=='video')continue;
      const lane=document.querySelector(`.lane[data-track-id="${CSS.escape(track.id)}"]`);if(!lane)continue;
      const clips=[...(track.clips||[])].sort((a,b)=>a.start-b.start);
      for(let i=0;i<clips.length-1;i++){
        const from=clips[i],to=clips[i+1];
        const tr=TR.transitions(state.timeline).find(t=>t.fromClipId===from.id&&t.toClipId===to.id);
        if(tr){
          const b=TR.bounds(state.timeline,tr);if(!b)continue;
          const badge=document.createElement('button');badge.type='button';badge.className=`transitionBadge${state.selectedTransitionId===tr.id?' selected':''}`;badge.dataset.transitionId=tr.id;
          badge.style.left=`${b.start/total*100}%`;badge.style.width=`${Math.max(.7,b.duration/total*100)}%`;
          badge.textContent=TR.TYPES[tr.type]?.label||'Transition';badge.title=`${TR.TYPES[tr.type]?.label||tr.type} · ${Number(tr.duration).toFixed(2)}s`;
          lane.appendChild(badge);
        }else{
          const gap=Number(to.start||0)-TL.clipEnd(from);
          if(Math.abs(gap)<=frame*.65){
            const add=document.createElement('button');add.type='button';add.className='transitionAdd';add.dataset.fromClip=from.id;add.dataset.toClip=to.id;
            add.style.left=`${TL.clipEnd(from)/total*100}%`;add.textContent='+';add.title='Add transition';lane.appendChild(add);
          }
        }
      }
    }
    syncInspector();
  }

  const baseRender=renderTimeline;
  renderTimeline=function(...args){const result=baseRender.apply(this,args);queueMicrotask(renderTransitionMarkers);return result;};

  document.addEventListener('click',event=>{
    const add=event.target.closest('.transitionAdd');
    if(add){
      event.preventDefault();event.stopPropagation();pushUndo();
      state.timeline=TR.add(state.timeline,add.dataset.fromClip,add.dataset.toClip,'dissolve',.5);
      const created=TR.transitions(state.timeline).find(t=>t.fromClipId===add.dataset.fromClip&&t.toClipId===add.dataset.toClip);
      state.selectedTransitionId=created?.id||null;
      if(created)state.selectedClipId=created.toClipId;
      markDirty();renderTimeline();openInspector();return;
    }
    const badge=event.target.closest('.transitionBadge');
    if(badge){
      event.preventDefault();event.stopPropagation();state.selectedTransitionId=badge.dataset.transitionId;
      const tr=selectedTransition();if(tr)state.selectedClipId=tr.toClipId;
      renderTimeline();openInspector();return;
    }
    if(event.target.closest('.clip[data-clip-id]')){state.selectedTransitionId=null;queueMicrotask(syncInspector);}
  },true);

  typeSelect.addEventListener('change',()=>{
    const tr=selectedTransition();if(!tr)return;pushUndo();state.timeline=TR.update(state.timeline,tr.id,{type:typeSelect.value});markDirty();renderTimeline();
  });
  durationInput.addEventListener('change',()=>{
    const tr=selectedTransition();if(!tr)return;pushUndo();state.timeline=TR.update(state.timeline,tr.id,{duration:Number(durationInput.value)||.5});markDirty();renderTimeline();
  });
  section.querySelector('#transitionRemove').addEventListener('click',()=>{
    const tr=selectedTransition();if(!tr)return;pushUndo();state.timeline=TR.remove(state.timeline,tr.id);state.selectedTransitionId=null;markDirty();renderTimeline();
  });

  window.DirectorCutTransitionsRuntime={render:renderTransitionMarkers,sync:syncInspector};
  queueMicrotask(renderTransitionMarkers);
})();