// Stage 8 Visual Intelligence UI: enrich local media with structured vision-model
// descriptions and retrieve shots lexically or with local semantic embeddings.
(() => {
  if (window.DirectorCutVisualIntelligenceRuntime) return;
  const VI=window.DirectorVisualIntelligence,bin=document.querySelector('#mediaBin'),video=document.querySelector('#video');
  let SR=window.DirectorSemanticRetrieval,semanticLoader=null;
  if(!VI||!bin)return;
  const section=bin.closest('.librarySection');
  const running=new Set(),embeddingJobs=new Map();
  const toast=text=>window.DirectorCutEditorToast?.(text);
  let embeddingProbe=null,embeddingModel=null,embeddingError='',searchRevision=0,searchTimer=null;

  const searchBox=document.createElement('div');
  searchBox.className='visualSearchBox';
  searchBox.innerHTML='<div class="visualSearchInput"><span>⌕</span><input type="search" placeholder="Search analyzed visuals…" aria-label="Search analyzed visuals"><button type="button" title="Clear visual search">×</button></div><small class="visualSearchMode">Visual search · checking semantic model…</small><div class="visualSearchResults" hidden></div>';
  section?.insertBefore(searchBox,bin);
  const input=searchBox.querySelector('input'),resultsRoot=searchBox.querySelector('.visualSearchResults'),modeRoot=searchBox.querySelector('.visualSearchMode');

  async function loadSemanticApi(){
    if(SR)return SR;
    if(semanticLoader)return semanticLoader;
    semanticLoader=new Promise(resolve=>{
      const existing=document.querySelector('script[data-runtime="semantic-retrieval-utils.js"],script[src$="semantic-retrieval-utils.js"]');
      const done=()=>{SR=window.DirectorSemanticRetrieval||null;resolve(SR);};
      if(existing){if(window.DirectorSemanticRetrieval)return done();existing.addEventListener('load',done,{once:true});existing.addEventListener('error',()=>resolve(null),{once:true});return;}
      const script=document.createElement('script');script.src='semantic-retrieval-utils.js';script.dataset.runtime='semantic-retrieval-utils.js';script.onload=done;script.onerror=()=>resolve(null);document.body.appendChild(script);
    });
    return semanticLoader;
  }

  const findMedia=id=>(state?.mediaLibrary||[]).find(media=>media.libraryId===id)||null;
  const embeddingCoverage=media=>SR?.embeddingCoverage?.(media?.visualIntelligence||{})||{entries:media?.visualIntelligence?.entries?.length||0,embedded:0,percent:0,model:''};
  const summaryText=media=>{
    const summary=media?.visualIntelligence?.summary;if(!summary)return'';
    const coverage=embeddingCoverage(media),semantic=coverage.entries&&coverage.percent===100&&coverage.model?' · semantic':'';
    return`Vision ${summary.shots||0} shot${summary.shots===1?'':'s'}${summary.shotsWithText?` · ${summary.shotsWithText} text`:''}${summary.shotsWithEvidence?` · ${summary.shotsWithEvidence} evidence`:''}${semantic}`;
  };
  function setSearchMode(text,kind=''){if(!modeRoot)return;modeRoot.textContent=text;modeRoot.dataset.kind=kind;}

  async function resolveEmbeddingModel(force=false){
    const semantic=await loadSemanticApi();
    if(!semantic||typeof window.directorcut?.localAIStatus!=='function'||typeof window.directorcut?.embedVisualIndex!=='function'){
      setSearchMode('Visual search · lexical fallback','lexical');return null;
    }
    SR=semantic;
    if(force){embeddingProbe=null;embeddingModel=null;embeddingError='';}
    if(embeddingProbe)return embeddingProbe;
    embeddingProbe=(async()=>{
      try{
        const status=await window.directorcut.localAIStatus(),models=status?.ollama?.models||[];
        embeddingModel=SR.chooseEmbeddingModel(models,embeddingModel||'');
        embeddingError='';
        if(embeddingModel)setSearchMode(`Visual search · semantic · ${embeddingModel}`,'semantic');
        else setSearchMode('Visual search · lexical fallback · install a local embedding model for semantic retrieval','lexical');
        return embeddingModel;
      }catch(error){
        embeddingError=String(error?.message||error);embeddingModel=null;
        setSearchMode('Visual search · lexical fallback · local embedding service unavailable','lexical');return null;
      }
    })();
    return embeddingProbe;
  }

  function syncVisualIndex(media,index){
    media.visualIntelligence=VI.normalizeIndex(index);
    if(state.media?.libraryId===media.libraryId||state.media?.path===media.path)state.media.visualIntelligence=media.visualIntelligence;
    if(typeof markDirty==='function')markDirty();
  }

  async function ensureSemanticIndex(media,{notify=false}={}){
    if(!media?.visualIntelligence?.entries?.length)return null;
    const semantic=await loadSemanticApi();if(!semantic)return null;SR=semantic;
    const model=await resolveEmbeddingModel();if(!model)return null;
    const coverage=embeddingCoverage(media);
    if(coverage.percent===100&&coverage.model===model)return model;
    if(embeddingJobs.has(media.libraryId))return embeddingJobs.get(media.libraryId);
    const job=(async()=>{
      try{
        const embedded=await window.directorcut.embedVisualIndex({index:media.visualIntelligence,model});
        syncVisualIndex(media,embedded);decorateCards();
        if(notify)toast?.(`Semantic visual index ready · ${media.name}`);
        return model;
      }catch(error){
        embeddingError=String(error?.message||error);
        if(notify)toast?.(`Visual descriptions are ready, but semantic indexing failed: ${embeddingError}`);
        return null;
      }finally{embeddingJobs.delete(media.libraryId);}
    })();
    embeddingJobs.set(media.libraryId,job);return job;
  }

  async function upgradeLegacyVisualIndexes(){
    const model=await resolveEmbeddingModel();if(!model)return null;
    for(const media of state?.mediaLibrary||[]){
      if(!media?.visualIntelligence?.entries?.length)continue;
      const coverage=embeddingCoverage(media);
      if(coverage.percent===100&&coverage.model===model)continue;
      await ensureSemanticIndex(media);
    }
    return model;
  }

  // Assigning textContent replaces the node's children, which is a childList
  // mutation inside `bin` - the very thing cardObserver watches to call this
  // function. Writing unconditionally therefore re-queued the observer forever and
  // starved the event loop the moment the media bin had its first card. Guard every
  // write on a real change, and pause the observer while decorating, so decoration
  // can never re-trigger itself.
  let cardObserver = null;
  const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
  function decorateCards(){
    cardObserver?.disconnect();
    try {
      for(const card of bin.querySelectorAll('.mediaLibraryItem[data-media-id]')){
        const media=findMedia(card.dataset.mediaId),actions=card.querySelector('.mediaLibraryActions'),text=card.querySelector('.mediaLibraryText');
        if(!media||!actions)continue;
        let button=actions.querySelector('[data-media-action="visual"]');
        if(!button){button=document.createElement('button');button.type='button';button.dataset.mediaAction='visual';button.title='Describe sampled shots with the selected local vision model';actions.appendChild(button);}
        setText(button,running.has(media.libraryId)?'Vision…':media.visualIntelligence?'Re-visualize':'Visual');
        button.disabled=running.has(media.libraryId)||!media.path;
        button.onclick=event=>{event.stopPropagation();runVisual(media);};
        let label=text?.querySelector('.visualIntelMeta');
        if(media.visualIntelligence&&text&&!label){label=document.createElement('small');label.className='visualIntelMeta';text.appendChild(label);}
        if(label){setText(label,`✦ ${summaryText(media)}`);label.hidden=!media.visualIntelligence;}
      }
    } finally {
      if (bin.isConnected) cardObserver?.observe(bin,{childList:true,subtree:true});
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
      syncVisualIndex(media,index);
      const semanticModel=await ensureSemanticIndex(media);
      toast?.(semanticModel?`Visual Intelligence ready · ${summaryText(media)}`:`Visual Intelligence ready · ${summaryText(media)} · lexical search fallback`);
      renderSearch();
    }catch(error){
      const message=String(error?.message||error);toast?.(`Visual Intelligence failed: ${message}`);
    }finally{running.delete(media.libraryId);decorateCards();}
  }

  function lexicalResults(query){
    if(SR)return SR.searchAcrossMedia(state?.mediaLibrary||[],query,{limit:16});
    const rows=[];
    for(const media of state?.mediaLibrary||[]){
      if(!media.visualIntelligence)continue;
      for(const result of VI.search(media.visualIntelligence,query,{limit:8}))rows.push({media,semantic:false,...result});
    }
    return rows.sort((a,b)=>b.score-a.score||a.entry.time-b.entry.time).slice(0,16);
  }

  async function semanticResults(query){
    const semanticApi=await loadSemanticApi();
    if(!semanticApi||typeof window.directorcut?.embedVisualQuery!=='function')return{results:lexicalResults(query),semantic:false};
    SR=semanticApi;
    await upgradeLegacyVisualIndexes();
    const models=[...new Set((state?.mediaLibrary||[]).map(media=>embeddingCoverage(media).model).filter(Boolean))];
    if(!models.length)return{results:lexicalResults(query),semantic:false};
    const queryEmbeddings={};
    for(const model of models){
      try{const vector=await window.directorcut.embedVisualQuery({query,model});if(Array.isArray(vector)&&vector.length)queryEmbeddings[model]=vector;}
      catch(error){embeddingError=String(error?.message||error);}
    }
    const semantic=Object.keys(queryEmbeddings).length>0;
    return{results:SR.searchAcrossMedia(state?.mediaLibrary||[],query,{limit:16,queryEmbeddings}),semantic};
  }

  function jumpTo(media,time){
    const runtime=window.DirectorCutMediaLibraryRuntime;
    runtime?.setActiveSource?.(media,true);
    const seek=()=>{try{video.currentTime=Math.max(0,Number(time)||0);}catch(_){} video.removeEventListener('loadedmetadata',seek);};
    if(video?.readyState>=1)seek();else video?.addEventListener('loadedmetadata',seek,{once:true});
  }

  function renderRows(results,{semantic=false}={}){
    resultsRoot.innerHTML='';resultsRoot.hidden=false;
    if(!results.length){resultsRoot.innerHTML='<div class="visualSearchEmpty">No analyzed shot matches. Run Visual on media first, or try different words.</div>';return;}
    for(const result of results){
      const row=document.createElement('button');row.type='button';row.className='visualSearchResult';
      const time=Number(result.entry.time||0),label=typeof tc==='function'?tc(time):`${time.toFixed(1)}s`,method=result.semantic?'semantic':result.lexicalScore>0?'text':'visual';
      row.innerHTML='<span class="visualResultTime"></span><div><b></b><small></small></div><i>↗</i>';
      row.querySelector('.visualResultTime').textContent=label;
      row.querySelector('b').textContent=result.entry.summary||result.entry.objects?.join(', ')||'Visual match';
      const evidence=[...(result.entry.objects||[]),...(result.entry.visibleText||[])].slice(0,4).join(' · ');
      row.querySelector('small').textContent=`${result.media.name||'Media'} · ${method}${result.semanticScore?` ${(result.semanticScore*100).toFixed(0)}%`:''}${evidence?` · ${evidence}`:''}`;
      row.onclick=()=>jumpTo(result.media,time);
      resultsRoot.appendChild(row);
    }
    if(semantic)setSearchMode(`Visual search · semantic · ${embeddingModel||'local embeddings'}`,'semantic');
    else if(!embeddingModel)setSearchMode(embeddingError?'Visual search · lexical fallback · semantic model unavailable':'Visual search · lexical fallback','lexical');
  }

  async function renderSearch(){
    const revision=++searchRevision,query=input.value.trim();resultsRoot.innerHTML='';
    if(!query){resultsRoot.hidden=true;return;}
    const initial=lexicalResults(query);renderRows(initial,{semantic:false});
    setSearchMode(embeddingModel?'Visual search · semantic search preparing…':'Visual search · checking semantic retrieval…','busy');
    const resolved=await semanticResults(query);
    if(revision!==searchRevision||query!==input.value.trim())return;
    renderRows(resolved.results,{semantic:resolved.semantic});
  }

  function scheduleSearch(){clearTimeout(searchTimer);searchTimer=setTimeout(renderSearch,180);}

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

  input.addEventListener('input',scheduleSearch);
  searchBox.querySelector('button').onclick=()=>{searchRevision++;clearTimeout(searchTimer);input.value='';resultsRoot.innerHTML='';resultsRoot.hidden=true;input.focus();};
  cardObserver = new MutationObserver(decorateCards);
  cardObserver.observe(bin,{childList:true,subtree:true});
  decorateCards();resolveEmbeddingModel();
  window.DirectorCutVisualIntelligenceRuntime={runVisual,renderSearch,jumpTo,directorContext,decorateCards,resolveEmbeddingModel,ensureSemanticIndex,semanticResults,lexicalResults,loadSemanticApi};
})();
