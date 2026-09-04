// Stage 1 completion: multi-select, link/unlink, overwrite, per-track heights and readable ruler.
(() => {
  const PT=window.DirectorProfessionalTimeline,TL=window.DirectorTimeline;
  const timelineEl=document.querySelector('.timeline'),tracksEl=document.querySelector('#tracks'),ruler=document.querySelector('#ruler'),bin=document.querySelector('#mediaBin');
  if(!PT||!TL||!timelineEl||!tracksEl)return;
  const toast=text=>window.DirectorCutEditorToast?.(text);
  state.selectedClipIds=PT.existingIds(state.timeline,state.selectedClipIds?.length?state.selectedClipIds:(state.selectedClipId?[state.selectedClipId]:[]));
  state.multiDrag=null;state.trackHeightDrag=null;

  function setSelection(ids,{primary=true}={}){
    state.selectedClipIds=PT.existingIds(state.timeline,ids);
    state.selectedClipId=primary&&state.selectedClipIds.length===1?state.selectedClipIds[0]:null;
    renderTimeline();
  }
  function selectedIds(){return PT.existingIds(state.timeline,state.selectedClipIds||[])}
  function selectionLabel(){const ids=selectedIds();return ids.length>1?`${ids.length} clips selected`:ids.length===1?(TL.findClip(state.timeline,ids[0])?.clip?.name||'1 clip selected'):'No clips selected'}

  if(typeof selectClip==='function'){
    const baseSelectClip=selectClip;
    selectClip=function(id){state.selectedClipIds=id?[id]:[];return baseSelectClip.call(this,id)};
  }

  function decorateSelection(){
    const ids=new Set(selectedIds());
    document.querySelectorAll('.clip[data-clip-id]').forEach(el=>{const on=ids.has(el.dataset.clipId);el.classList.toggle('multiSelected',on&&ids.size>1);if(on)el.classList.add('selected');else if(state.selectedClipId!==el.dataset.clipId)el.classList.remove('selected');});
    const badge=document.querySelector('#timelineSelectionCount');if(badge)badge.textContent=ids.size>1?`${ids.size} selected`:'';
    syncLinkButtons();
  }

  function addToolbar(){
    const top=document.querySelector('.timelineTop>div');if(!top||document.querySelector('#timelineLink'))return;
    const group=document.createElement('span');group.className='timelineLinkGroup';group.innerHTML='<button type="button" id="timelineLink" title="Link exactly one selected video clip and one selected audio clip">🔗 Link</button><button type="button" id="timelineUnlink" title="Unlink selected audio/video clips">⛓ Unlink</button><span id="timelineSelectionCount"></span>';
    top.appendChild(group);
    group.querySelector('#timelineLink').onclick=()=>{const ids=selectedIds();if(!PT.canLink(state.timeline,ids))return toast?.('Select exactly one video clip and one audio clip');pushUndo();state.timeline=PT.linkSelection(state.timeline,ids);markDirty();renderTimeline();toast?.('Linked video and audio')};
    group.querySelector('#timelineUnlink').onclick=()=>{const ids=selectedIds();if(!ids.some(id=>TL.findClip(state.timeline,id)?.clip?.linkedId))return toast?.('Selected clips are not linked');pushUndo();state.timeline=PT.unlinkSelection(state.timeline,ids);markDirty();renderTimeline();toast?.('Unlinked selected clips')};
  }
  function syncLinkButtons(){
    const ids=selectedIds(),link=document.querySelector('#timelineLink'),unlink=document.querySelector('#timelineUnlink');
    if(link)link.disabled=!PT.canLink(state.timeline,ids);
    if(unlink)unlink.disabled=!ids.some(id=>Boolean(TL.findClip(state.timeline,id)?.clip?.linkedId));
  }

  function decorateTrackHeights(){
    [...tracksEl.querySelectorAll('.track')].forEach((row,index)=>{
      const track=state.timeline.tracks[index];if(!track)return;
      const height=Math.max(40,Math.min(180,Number(track.height)||52));row.style.height=`${height}px`;row.dataset.trackId=track.id;
      row.querySelector('.clip')?.style.setProperty('--track-clip-height',`${Math.max(24,height-12)}px`);
      if(!row.querySelector('.trackHeightHandle')){const h=document.createElement('div');h.className='trackHeightHandle';h.title='Drag to resize this track';h.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();state.trackHeightDrag={trackId:track.id,startY:e.clientY,startHeight:height,before:typeof snapshot==='function'?snapshot():null};};row.appendChild(h);}
    });
  }

  function niceStep(raw){const p=Math.pow(10,Math.floor(Math.log10(Math.max(.001,raw)))),n=raw/p;return(n<=1?1:n<=2?2:n<=5?5:10)*p}
  function formatRulerTime(seconds){if(seconds>=3600)return typeof tc==='function'?tc(seconds).slice(0,8):`${(seconds/3600).toFixed(1)}h`;if(seconds>=60){const m=Math.floor(seconds/60),s=Math.round(seconds%60);return`${m}:${String(s).padStart(2,'0')}`;}if(seconds>=10)return`${Math.round(seconds)}s`;return`${seconds.toFixed(seconds<2?1:0)}s`;}
  function renderRulerLabels(){
    if(!ruler)return;let layer=ruler.querySelector('.rulerLabels');if(!layer){layer=document.createElement('div');layer.className='rulerLabels';ruler.appendChild(layer);}layer.innerHTML='';
    const total=Math.max(Number(TL.duration(state.timeline)||0),Number(state.duration||0),1),width=Math.max(480,ruler.getBoundingClientRect().width||900),targetSeconds=total/(width/90),step=niceStep(targetSeconds);
    for(let t=0;t<=total+step*.25;t+=step){const tick=document.createElement('span');tick.className='rulerTick';tick.style.left=`${Math.min(100,t/total*100)}%`;tick.innerHTML=`<i></i><b>${formatRulerTime(t)}</b>`;layer.appendChild(tick);}
  }

  function decorateOverwriteButtons(){
    if(!bin)return;bin.querySelectorAll('.mediaLibraryItem').forEach(card=>{const actions=card.querySelector('.mediaLibraryActions');if(!actions||actions.querySelector('[data-media-action="overwrite"]'))return;const button=document.createElement('button');button.type='button';button.dataset.mediaAction='overwrite';button.title='Overwrite at playhead without moving later clips';button.textContent='Overwrite';button.onclick=e=>{e.preventDefault();e.stopPropagation();const media=(state.mediaLibrary||[]).find(x=>x.libraryId===card.dataset.mediaId);if(!media)return;pushUndo();state.timeline=PT.overwriteMedia(state.timeline,media,Number(document.querySelector('#video')?.currentTime||0));if(!state.media)state.media=media;markDirty();renderTimeline();toast?.(`Overwrote timeline with ${media.name}`);};actions.insertBefore(button,actions.querySelector('[data-media-action="preview"]'));});
  }

  const baseRender=renderTimeline;
  renderTimeline=function(...args){const result=baseRender.apply(this,args);decorateSelection();decorateTrackHeights();renderRulerLabels();decorateOverwriteButtons();return result;};
  addToolbar();

  document.addEventListener('pointerdown',event=>{
    const clipEl=event.target.closest?.('.clip[data-clip-id]');if(!clipEl)return;
    const id=clipEl.dataset.clipId,additive=event.ctrlKey||event.metaKey||event.shiftKey;
    if(additive){event.preventDefault();event.stopImmediatePropagation();setSelection(PT.toggleSelection(selectedIds(),id,true),{primary:false});return;}
    const ids=selectedIds();
    if(ids.length>1&&ids.includes(id)){
      const lane=clipEl.closest('.lane');if(!lane)return;event.preventDefault();event.stopImmediatePropagation();state.multiDrag={ids:[...ids],startX:event.clientX,width:Math.max(1,lane.getBoundingClientRect().width),total:Math.max(Number(TL.duration(state.timeline)||0),Number(state.duration||0),1),base:JSON.parse(JSON.stringify(state.timeline)),before:typeof snapshot==='function'?snapshot():null,moved:false};
    }else if(ids.length>1){state.selectedClipIds=[id];state.selectedClipId=id;}
  },true);

  window.addEventListener('pointermove',event=>{
    const td=state.trackHeightDrag;if(td){const track=state.timeline.tracks.find(t=>t.id===td.trackId);if(track){track.height=Math.max(40,Math.min(180,td.startHeight+(event.clientY-td.startY)));const row=tracksEl.querySelector(`.track[data-track-id="${CSS.escape(td.trackId)}"]`);if(row)row.style.height=`${track.height}px`;}event.preventDefault();event.stopImmediatePropagation();return;}
    const d=state.multiDrag;if(!d)return;const delta=(event.clientX-d.startX)/d.width*d.total;state.timeline=PT.moveSelection(d.base,d.ids,delta,{includeLinked:true});d.moved=d.moved||Math.abs(delta)>.001;decorateSelection();renderTimeline();event.preventDefault();event.stopImmediatePropagation();
  },true);

  window.addEventListener('pointerup',event=>{
    if(state.trackHeightDrag){const d=state.trackHeightDrag;state.trackHeightDrag=null;if(d.before)pushUndo(d.before);markDirty();renderTimeline();toast?.('Track height updated');event.stopImmediatePropagation();return;}
    if(!state.multiDrag)return;const d=state.multiDrag;state.multiDrag=null;if(d.before&&d.moved)pushUndo(d.before);if(d.moved){learn?.('accepted','manual multi-clip move',d.ids);markDirty();renderTimeline();toast?.(`Moved ${d.ids.length} selected clips`);}event.stopImmediatePropagation();
  },true);

  window.addEventListener('keydown',event=>{
    if(event.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    const ids=selectedIds();
    if((event.key==='Delete'||event.key==='Backspace')&&ids.length>1){event.preventDefault();event.stopImmediatePropagation();pushUndo();state.timeline=PT.removeSelection(state.timeline,ids,{includeLinked:true});state.selectedClipIds=[];state.selectedClipId=null;markDirty();renderTimeline();toast?.(`Deleted ${ids.length} selected clips · gaps preserved`);}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'&&document.activeElement?.tagName!=='INPUT'){const all=[];for(const track of state.timeline.tracks||[])if(!track.locked)for(const clip of track.clips||[])all.push(clip.id);if(all.length){event.preventDefault();event.stopImmediatePropagation();setSelection(all,{primary:false});}}
    if(event.key==='Escape'&&ids.length){event.preventDefault();setSelection([],{primary:false});}
  },true);

  if(bin)new MutationObserver(()=>decorateOverwriteButtons()).observe(bin,{childList:true,subtree:true});
  window.addEventListener('resize',renderRulerLabels);
  renderTimeline();
  window.DirectorCutProfessionalTimeline={setSelection,selectedIds,selectionLabel,renderRulerLabels};
})();