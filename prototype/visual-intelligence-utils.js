(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DirectorVisualIntelligence=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const clone=value=>JSON.parse(JSON.stringify(value));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
  const round=(value,digits=3)=>Number((Number(value)||0).toFixed(digits));
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const unique=list=>[...new Set((Array.isArray(list)?list:[]).map(clean).filter(Boolean))];

  function normalizeEntry(raw={},fallback={}){
    const visibleText=unique(raw.visibleText||raw.text||raw.ocr),objects=unique(raw.objects),subjects=unique(raw.subjects),actions=unique(raw.actions),evidence=unique(raw.evidence);
    return{
      id:String(raw.id||fallback.id||`visual-${Math.random().toString(36).slice(2,9)}`),sceneId:String(raw.sceneId||fallback.sceneId||''),sceneIndex:Math.max(0,Math.floor(Number(raw.sceneIndex??fallback.sceneIndex)||0)),
      time:Math.max(0,Number(raw.time??fallback.time)||0),start:Math.max(0,Number(raw.start??fallback.start)||0),end:Math.max(0,Number(raw.end??fallback.end)||0),
      summary:clean(raw.summary),subjects,objects,actions,setting:clean(raw.setting),shotType:clean(raw.shotType),visibleText,evidence,
      confidence:round(clamp(raw.confidence??.5,0,1),3),model:String(raw.model||fallback.model||''),embedding:Array.isArray(raw.embedding)?raw.embedding.map(Number).filter(Number.isFinite):null
    };
  }

  function normalizeIndex(index={}){
    const entries=(index.entries||[]).map((entry,i)=>normalizeEntry(entry,{id:`visual-${String(i+1).padStart(3,'0')}`,sceneIndex:i,model:index.model})).sort((a,b)=>a.time-b.time);
    return{
      version:1,sourceFingerprint:String(index.sourceFingerprint||''),sourcePath:index.sourcePath||null,model:String(index.model||''),analyzedAt:index.analyzedAt||null,
      embeddingModel:clean(index.embeddingModel),embeddingUpdatedAt:index.embeddingUpdatedAt||null,
      entries,warnings:unique(index.warnings),summary:summarize({entries})
    };
  }

  function entryText(entry={}){
    return [entry.summary,entry.subjects?.join(' '),entry.objects?.join(' '),entry.actions?.join(' '),entry.setting,entry.shotType,entry.visibleText?.join(' '),entry.evidence?.join(' ')].filter(Boolean).join(' ').toLowerCase();
  }
  function tokenize(value){return unique(clean(value).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)||[]).filter(token=>token.length>1);}
  function lexicalScore(entry,query){
    const tokens=tokenize(query);if(!tokens.length)return 0;
    const fields=[
      [entry.summary,3],[entry.subjects?.join(' '),2.6],[entry.objects?.join(' '),2.5],[entry.actions?.join(' '),2.2],[entry.setting,1.8],[entry.visibleText?.join(' '),3.4],[entry.evidence?.join(' '),3.2],[entry.shotType,1.2]
    ];
    let score=0,matched=0;
    for(const token of tokens){let best=0;for(const[field,weight]of fields){const text=String(field||'').toLowerCase();if(text.includes(token))best=Math.max(best,weight+(text===token?.toLowerCase()?1:0));}if(best){matched++;score+=best;}}
    return round(score*(.55+.45*matched/tokens.length),4);
  }
  function cosine(a,b){if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length||!a.length)return 0;let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){const x=Number(a[i])||0,y=Number(b[i])||0;dot+=x*y;aa+=x*x;bb+=y*y;}return aa&&bb?dot/Math.sqrt(aa*bb):0;}
  function search(index={},query,{limit=12,queryEmbedding=null}={}){
    const normalized=normalizeIndex(index),q=clean(query);if(!q)return[];
    return normalized.entries.map(entry=>{
      const lexical=lexicalScore(entry,q),semantic=queryEmbedding&&entry.embedding?Math.max(0,cosine(queryEmbedding,entry.embedding)):0;
      return{entry,lexicalScore:lexical,semanticScore:round(semantic,4),score:round(lexical+semantic*5,4)};
    }).filter(result=>result.score>0).sort((a,b)=>b.score-a.score||a.entry.time-b.entry.time).slice(0,Math.max(1,Math.floor(Number(limit)||12)));
  }

  function summarize(index={}){
    const entries=index.entries||[],withText=entries.filter(entry=>(entry.visibleText||[]).length).length,withEvidence=entries.filter(entry=>(entry.evidence||[]).length).length;
    const objects=unique(entries.flatMap(entry=>entry.objects||[])),subjects=unique(entries.flatMap(entry=>entry.subjects||[])),settings=unique(entries.map(entry=>entry.setting));
    return{shots:entries.length,shotsWithText:withText,shotsWithEvidence:withEvidence,objects:objects.slice(0,40),subjects:subjects.slice(0,30),settings:settings.slice(0,20)};
  }

  function compactContext(index={},maxEntries=24){
    const normalized=normalizeIndex(index),entries=normalized.entries.slice(0,Math.max(1,Number(maxEntries)||24)).map(entry=>({sceneId:entry.sceneId,sceneIndex:entry.sceneIndex,time:entry.time,start:entry.start,end:entry.end,summary:entry.summary,subjects:entry.subjects,objects:entry.objects,actions:entry.actions,setting:entry.setting,visibleText:entry.visibleText,evidence:entry.evidence,confidence:entry.confidence}));
    return{version:1,model:normalized.model,summary:normalized.summary,entries};
  }

  function mergeIntoFootage(footage={},index={}){
    const next=clone(footage),normalized=normalizeIndex(index),byScene=new Map(normalized.entries.map(entry=>[entry.sceneId,entry]));
    next.scenes=(next.scenes||[]).map((scene,i)=>({...scene,visual:byScene.get(scene.id||scene.sceneId)||normalized.entries.find(entry=>entry.sceneIndex===i)||scene.visual||null}));
    return next;
  }

  return{clamp,round,clean,unique,normalizeEntry,normalizeIndex,entryText,tokenize,lexicalScore,cosine,search,summarize,compactContext,mergeIntoFootage};
});
