(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DirectorFootageIntelligence=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const clone=value=>JSON.parse(JSON.stringify(value));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):min));
  const round=(value,places=3)=>{const p=10**places;return Math.round((Number(value)||0)*p)/p;};

  function normalizeRanges(ranges=[],duration=Infinity,minDuration=.001){
    const limit=Number.isFinite(Number(duration))?Math.max(0,Number(duration)):Infinity;
    const clean=(Array.isArray(ranges)?ranges:[]).map(range=>{
      const a=clamp(range?.start,0,limit),b=clamp(range?.end,0,limit);
      return{start:Math.min(a,b),end:Math.max(a,b)};
    }).filter(range=>range.end-range.start>=minDuration).sort((a,b)=>a.start-b.start),out=[];
    for(const range of clean){const prev=out[out.length-1];if(prev&&range.start<=prev.end+.001)prev.end=Math.max(prev.end,range.end);else out.push({...range});}
    return out.map(range=>({start:round(range.start,6),end:round(range.end,6),duration:round(range.end-range.start,6)}));
  }

  function complementRanges(ranges=[],duration=0,minDuration=.05){
    const end=Math.max(0,Number(duration)||0),blocked=normalizeRanges(ranges,end),out=[];let cursor=0;
    for(const range of blocked){if(range.start-cursor>=minDuration)out.push({start:cursor,end:range.start});cursor=Math.max(cursor,range.end);}
    if(end-cursor>=minDuration)out.push({start:cursor,end});
    return normalizeRanges(out,end,minDuration);
  }

  function makeScenes(boundaries=[],duration=0,minDuration=.08){
    const end=Math.max(0,Number(duration)||0);if(end<=0)return[];
    const points=[0,...(Array.isArray(boundaries)?boundaries:[]).map(Number).filter(Number.isFinite).map(value=>clamp(value,0,end)),end].sort((a,b)=>a-b),dedup=[];
    for(const point of points)if(!dedup.length||point-dedup[dedup.length-1]>=minDuration)dedup.push(point);else if(Math.abs(point-end)<1e-6)dedup[dedup.length-1]=end;
    if(dedup[dedup.length-1]<end-.001)dedup.push(end);
    const scenes=[];for(let i=0;i+1<dedup.length;i++){const start=dedup[i],finish=dedup[i+1];if(finish-start<minDuration)continue;scenes.push({id:`scene-${String(scenes.length+1).padStart(3,'0')}`,index:scenes.length,start:round(start,6),end:round(finish,6),duration:round(finish-start,6),representativeTime:round(start+(finish-start)/2,6)});}
    return scenes;
  }

  const NIBBLE_BITS=[0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4];
  function parseSignature(signature){const match=String(signature||'').match(/^([0-9a-f]{6}):([0-9a-f]+)$/i);if(!match)return null;return{rgb:[0,2,4].map(i=>parseInt(match[1].slice(i,i+2),16)),hash:match[2].toLowerCase()};}
  function hammingHex(a,b){const left=String(a||''),right=String(b||'');if(!left||left.length!==right.length)return Infinity;let d=0;for(let i=0;i<left.length;i++){const x=parseInt(left[i],16),y=parseInt(right[i],16);if(!Number.isFinite(x)||!Number.isFinite(y))return Infinity;d+=NIBBLE_BITS[x^y];}return d;}
  function signatureDistance(a,b){const left=parseSignature(a),right=parseSignature(b);if(!left||!right)return{hamming:Infinity,color:Infinity,score:Infinity};const hamming=hammingHex(left.hash,right.hash),color=left.rgb.reduce((sum,value,i)=>sum+Math.abs(value-right.rgb[i]),0)/3;return{hamming,color:round(color,3),score:round(hamming+color/8,3)};}

  function classifyDuplicates(scenes=[],options={}){
    const exactHamming=Number(options.exactHamming??2),nearHamming=Number(options.nearHamming??8),exactColor=Number(options.exactColor??10),nearColor=Number(options.nearColor??28),out=clone(scenes||[]);
    for(let i=0;i<out.length;i++){
      if(!out[i].signature)continue;let best=null;
      for(let j=0;j<i;j++){
        if(!out[j].signature)continue;const distance=signatureDistance(out[i].signature,out[j].signature);const kind=distance.hamming<=exactHamming&&distance.color<=exactColor?'duplicate':distance.hamming<=nearHamming&&distance.color<=nearColor?'near-duplicate':null;if(!kind)continue;if(!best||distance.score<best.distance.score)best={scene:out[j],distance,kind};
      }
      if(best){out[i].duplicateOf=best.scene.id;out[i].duplicateKind=best.kind;out[i].duplicateDistance=best.distance;}
    }
    return out;
  }

  function durationOf(ranges=[]){return round((ranges||[]).reduce((sum,range)=>sum+Math.max(0,Number(range.duration??(range.end-range.start))||0),0),6);}
  function summarize(analysis={}){
    const scenes=analysis.scenes||[],silence=analysis.silence||[],speech=analysis.speech||[],sampled=scenes.filter(scene=>scene.quality),duplicates=scenes.filter(scene=>scene.duplicateKind==='duplicate'),near=scenes.filter(scene=>scene.duplicateKind==='near-duplicate'),lowQuality=scenes.filter(scene=>scene.quality?.flags?.length);
    const averageQuality=sampled.length?Math.round(sampled.reduce((sum,scene)=>sum+Number(scene.quality.score||0),0)/sampled.length):null;
    return{sceneCount:scenes.length,sampledScenes:sampled.length,silenceSeconds:durationOf(silence),speechSeconds:durationOf(speech),duplicateScenes:duplicates.length,nearDuplicateScenes:near.length,flaggedScenes:lowQuality.length,averageQuality};
  }

  function normalizeAnalysis(raw={}){
    const duration=Math.max(0,Number(raw.duration)||0),silence=normalizeRanges(raw.silence||[],duration),speech=normalizeRanges(raw.speech?.length?raw.speech:complementRanges(silence,duration),duration),scenes=classifyDuplicates((raw.scenes||[]).map((scene,index)=>({...scene,id:scene.id||`scene-${String(index+1).padStart(3,'0')}`,index,start:round(scene.start,6),end:round(scene.end,6),duration:round(scene.duration??(scene.end-scene.start),6)})));
    const analysis={version:Number(raw.version)||1,sourceFingerprint:String(raw.sourceFingerprint||''),sourcePath:raw.sourcePath||null,duration,analyzedAt:raw.analyzedAt||null,settings:{...(raw.settings||{})},scenes,silence,speech};analysis.summary=summarize(analysis);return analysis;
  }

  return{clamp,round,normalizeRanges,complementRanges,makeScenes,parseSignature,hammingHex,signatureDistance,classifyDuplicates,durationOf,summarize,normalizeAnalysis};
});