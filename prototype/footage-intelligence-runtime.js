// Makes analyzed footage available to Director as compact context without polluting
// the visible conversation, script, or timeline state.
(() => {
  if(window.DirectorCutFootageIntelligenceRuntime)return;

  function compactMedia(media){
    const analysis=media?.intelligence;if(!analysis)return null;
    return{
      libraryId:media.libraryId||null,
      name:media.name||'Untitled media',
      path:media.path||null,
      duration:Number(media.duration||analysis.duration||0),
      analyzedAt:analysis.analyzedAt||null,
      summary:analysis.summary||null,
      silence:(analysis.silence||[]).slice(0,40).map(r=>({start:r.start,end:r.end,duration:r.duration})),
      speech:(analysis.speech||[]).slice(0,40).map(r=>({start:r.start,end:r.end,duration:r.duration})),
      scenes:(analysis.scenes||[]).slice(0,64).map(scene=>({
        id:scene.id,start:scene.start,end:scene.end,duration:scene.duration,
        duplicateOf:scene.duplicateOf||null,duplicateKind:scene.duplicateKind||null,
        quality:scene.quality?{score:scene.quality.score,flags:scene.quality.flags||[],lumaMean:scene.quality.lumaMean,contrast:scene.quality.contrast,sharpness:scene.quality.sharpness}:null
      }))
    };
  }

  function directorContext(){
    const analyzed=(state?.mediaLibrary||[]).map(compactMedia).filter(Boolean).slice(0,8);
    if(!analyzed.length&&state?.media?.intelligence){const single=compactMedia(state.media);if(single)analyzed.push(single);}
    if(!analyzed.length)return null;
    const value={type:'directorcut-footage-intelligence-v1',description:'Measured local footage analysis. Use timings and quality/duplicate/silence signals as evidence, not guesses.',media:analyzed};
    let text=JSON.stringify(value);if(text.length>11800)text=JSON.stringify({...value,media:analyzed.map(item=>({...item,scenes:item.scenes.slice(0,32),silence:item.silence.slice(0,20),speech:item.speech.slice(0,20)}))});
    if(text.length>11800)text=text.slice(0,11800);
    return{name:'DirectorCut footage intelligence.json',kind:'document',path:null,size:text.length,text};
  }

  if(typeof attachmentPayload==='function'){
    const baseAttachmentPayload=attachmentPayload;
    attachmentPayload=function(...args){const items=baseAttachmentPayload.apply(this,args)||[],context=directorContext();return context?[...items,context]:items;};
  }

  window.DirectorCutFootageIntelligenceRuntime={compactMedia,directorContext};
})();