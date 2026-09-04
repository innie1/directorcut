(function(root,factory){
  const VI=root?.DirectorVisualIntelligence||(typeof require==='function'?require('./visual-intelligence-utils'):null),api=factory(VI);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DirectorSemanticRetrieval=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(VI){
  const clean=value=>String(value||'').trim();
  function modelName(model){return clean(model?.name||model?.model||model);}
  function embeddingRank(name=''){
    const value=clean(name).toLowerCase();
    if(!value)return -1;
    if(/nomic-embed-text/.test(value))return 100;
    if(/mxbai-embed-large/.test(value))return 95;
    if(/bge-m3|bge-large|bge-base/.test(value))return 92;
    if(/snowflake.*embed/.test(value))return 90;
    if(/all-minilm|minilm/.test(value))return 88;
    if(/embeddinggemma/.test(value))return 87;
    if(/embed|embedding|e5-/.test(value))return 80;
    return -1;
  }
  function chooseEmbeddingModel(models=[],preferred=''){
    const list=(Array.isArray(models)?models:[]).map(item=>({item,name:modelName(item)})).filter(row=>row.name);
    if(preferred){const exact=list.find(row=>row.name===preferred);if(exact&&embeddingRank(exact.name)>=0)return exact.name;}
    return list.map(row=>({...row,rank:embeddingRank(row.name)})).filter(row=>row.rank>=0).sort((a,b)=>b.rank-a.rank||a.name.localeCompare(b.name))[0]?.name||null;
  }
  function embeddingCoverage(index={}){const entries=index.entries||[],embedded=entries.filter(entry=>Array.isArray(entry.embedding)&&entry.embedding.length).length;return{entries:entries.length,embedded,percent:entries.length?Math.round(embedded/entries.length*100):0,model:clean(index.embeddingModel)};}
  function mergeEmbeddings(index={},vectors=[],model=''){
    if(!VI)throw new Error('DirectorVisualIntelligence is required');
    const normalized=VI.normalizeIndex(index),list=Array.isArray(vectors)?vectors:[];
    normalized.entries=normalized.entries.map((entry,i)=>({...entry,embedding:Array.isArray(list[i])?list[i].map(Number).filter(Number.isFinite):entry.embedding||null}));
    normalized.embeddingModel=clean(model||index.embeddingModel);normalized.embeddingUpdatedAt=new Date().toISOString();normalized.summary=VI.summarize(normalized);return normalized;
  }
  function searchAcrossMedia(mediaList=[],query,{limit=20,queryEmbeddings={}}={}){
    if(!VI)return[];const all=[];
    for(const media of Array.isArray(mediaList)?mediaList:[]){const index=media?.visualIntelligence;if(!index)continue;const model=clean(index.embeddingModel),queryEmbedding=model?queryEmbeddings[model]||null:null;for(const result of VI.search(index,query,{limit,queryEmbedding}))all.push({media,embeddingModel:model||null,semantic:Boolean(queryEmbedding&&result.entry.embedding),...result});}
    return all.sort((a,b)=>b.score-a.score||b.semantic-a.semantic||a.entry.time-b.entry.time).slice(0,Math.max(1,Math.floor(Number(limit)||20)));
  }
  return{modelName,embeddingRank,chooseEmbeddingModel,embeddingCoverage,mergeEmbeddings,searchAcrossMedia};
});
