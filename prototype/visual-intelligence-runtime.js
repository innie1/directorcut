// Stage 8 Visual Intelligence UI: enrich local media with structured vision-model
// descriptions and search those shot descriptions without changing the timeline.
(() => {
  if (window.DirectorCutVisualIntelligenceRuntime) return;
  const VI=window.DirectorVisualIntelligence,bin=document.querySelector('#mediaBin'),video=document.querySelector('#video');
  if(!VI||!bin)return;
  const section=bin.closest('.librarySection');
  const running=new Set();
  const toast=text=>window.DirectorCutEditorToast?.(text);

  const searchBox=document.createElement('div');
  searchBox.className='visualSearchBox';
  searchBox.innerHTML='<div class="visualSearchInput"><span>⌕</span><input type="search" placeholder="Search analyzed visuals…" aria-label="Search analyzed visuals"><button type="button" title="Clear visual search">×</button></div><div class="visualSearchResults" hidden></div>';
  section?.insertBefore(searchBox,bin);
  const input=searchBox.querySelector('input'),resultsRoot=searchBox.querySelector('.visualSearchResults');

  const findMedia=id=>(state?.mediaLibrary||[]).find(media=>media.libraryId===id)||null;
  const summaryText=media=>{const summary=media?.visualIntelligence?.summary;if(!summary)return'';return`Vision ${summary.shots||0} shot${summary.shots===1?'':'s'}${summary.shotsWithText?` · ${summary.shotsWithText} text`:''}${summary.shotsWithEvidence?` · ${summary.shotsWithEvidence} evidence`:''}`;};

  function decorateCards(){
    for(const card of bin.querySelectorAll('.mediaLibraryItem[data-media-id]')){
      const media=findMedia(card.dataset.mediaId),actions=card.querySelector('.mediaLibraryActions'),text=card.querySelector('.mediaLibraryText');
      if(!media||!actions)continue;
      let button=actions.querySelector('[data-media-action="visual"]');
      if(!button){button=document.createElement('button');button.type='button';button.dataset.mediaAction='visual';button.title='Describe sampled shots with the selected local vision model';actions.appendChild(button);}
      button.textContent=running.has(media.libraryId)?'Vision…':media.visualIntelligence?'Re-visualize':'Visual';
      button.disabled=running.has(media.libraryId)||!media.path;
      button.onclick=event=>{event.stopPropagation();runVisual(media);};
      let label=text?.querySelector('.visualIntelMeta');
      if(media.visualIntelligence&&text&&!label){label=document.createElement('small');label.className='visualIntelMeta';text.appendChild(label);}
      if(label){label.textContent=`✦ ${summaryText(media)}`;label.hidden=!media.visualIntelligence;}
    }
  }

  async function runVisual(media){
    if(!media?.path||running.has(media.libraryId))return;
    const model=String(state?.selectedModel||'').trim();
    if(!model){toast?.('Choose an image-capable local AI model first, such as Qwen-VL.');return;}
    if(typeof window.directorcut?.analyzeVisualMedia!=='function'){toast?.('Visual Intelligence desktop bridge is unavailable.');return;}
    running.add(media.libraryId);decorateCards();toast?.(`Visual Intelligence · analyzing ${media.name} with ${model}…`);
    try{
      const index=await window.directorcut.analyzeVisualMedia({sourcePath:media.path,model,footageIntelligence:media.intelligence||null,maxFrames:12,maxWidth:768});
      media.visualIntelligence=VI.normalizeIndex(index);
      if(state.media?.libraryId===media.libraryId||state.media?.path===media.path)state.media.visualIntelligence=media.visualIntelligence;
      if(typeof markDirty==='function')markDirty();
      toast?.(`Visual Intelligence ready · ${summaryText(media)}`);
      renderSearch();
    }catch(error){
      const message=String(error?.message||error);toast?.(`Visual Intelligence failed: ${message}`);
    }finally{running.delete(media.libraryId);decorateCards();}
  }

  function allResults(query){
    const rows=[];
    for(const media of state?.mediaLibrary||[]){
      if(!media.visualIntelligence)continue;
      for(const result of VI.search(media.visualIntelligence,query,{limit:8}))rows.push({media,...result});
    }
    return rows.sort((a,b)=>b.score-a.score||a.entry.time-b.entry.time).slice(0,16);
  }

  function jumpTo(media,time){
    const runtime=window.DirectorCutMediaLibraryRuntime;
    runtime?.setActiveSource?.(media,true);
    const seek=()=>{try{video.currentTime=Math.max(0,Number(time)||0);}catch(_){} video.removeEventListener('loadedmetadata',seek);};
    if(video?.readyState>=1)seek();else video?.addEventListener('loadedmetadata',seek,{once:true});
  }

  function renderSearch(){
    const query=input.value.trim();resultsRoot.innerHTML='';
    if(!query){resultsRoot.hidden=true;return;}
    const results=allResults(query);resultsRoot.hidden=false;
    if(!results.length){resultsRoot.innerHTML='<div class="visualSearchEmpty">No analyzed shot matches. Run Visual on media first, or try different words.</div>';return;}
    for(const result of results){
      const row=document.createElement('button');row.type='button';row.className='visualSearchResult';
      const time=Number(result.entry.time||0),label=typeof tc==='function'?tc(time):`${time.toFixed(1)}s`;
      row.innerHTML='<span class="visualResultTime"></span><div><b></b><small></small></div><i>↗</i>';
      row.querySelector('.visualResultTime').textContent=label;
      row.querySelector('b').textContent=result.entry.summary||result.entry.objects?.join(', ')||'Visual match';
      row.querySelector('small').textContent=`${result.media.name||'Media'} · ${[...result.entry.objects||[],...result.entry.visibleText||[]].slice(0,4).join(' · ')}`;
      row.onclick=()=>jumpTo(result.media,time);
      resultsRoot.appendChild(row);
    }
  }

  function compactMedia(media){
    if(!media?.visualIntelligence)return null;
    return{libraryId:media.libraryId||null,name:media.name||'Untitled media',path:media.path||null,visualIntelligence:VI.compactContext(media.visualIntelligence,24)};
  }
  function directorContext(){
    const media=(state?.mediaLibrary||[]).map(compactMedia).filter(Boolean).slice(0,8);if(!media.length)return null;
    const value={type:'directorcut-visual-intelligence-v1',description:'Grounded local vision-model descriptions tied to source timestamps. Treat descriptions and visibleText as visual evidence with the supplied confidence; do not invent details beyond them.',media};
    let text=JSON.stringify(value);if(text.length>11800)text=JSON.stringify({...value,media:media.map(item=>({...item,visualIntelligence:{...item.visualIntelligence,entries:item.visualIntelligence.entries.slice(0,12)}}))});if(text.length>11800)text=text.slice(0,11800);
    return{name:'DirectorCut visual intelligence.json',kind:'document',path:null,size:text.length,text};
  }

  if(typeof attachmentPayload==='function'){
    const base=attachmentPayload;
    attachmentPayload=function(...args){const items=base.apply(this,args)||[],context=directorContext();return context?[...items,context]:items;};
  }

  input.addEventListener('input',renderSearch);
  searchBox.querySelector('button').onclick=()=>{input.value='';renderSearch();input.focus();};
  new MutationObserver(decorateCards).observe(bin,{childList:true,subtree:true});
  decorateCards();
  window.DirectorCutVisualIntelligenceRuntime={runVisual,allResults,renderSearch,jumpTo,directorContext,decorateCards};
})();
