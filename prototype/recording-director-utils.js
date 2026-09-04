(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DirectorRecordingSession=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const clone=value=>JSON.parse(JSON.stringify(value));
  const now=()=>new Date().toISOString();
  const textHash=value=>{let h=2166136261;for(const c of String(value||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');};

  function inputScenes(scenes=[],script=''){
    let items=Array.isArray(scenes)?scenes.filter(scene=>scene&&String(scene.text||'').trim()):[];
    if(!items.length&&String(script||'').trim())items=String(script).split(/\n\s*\n/).map(text=>({text:text.trim()})).filter(scene=>scene.text);
    if(!items.length)items=[{text:'Free recording',purpose:'Free take',performance:'Record naturally.'}];
    return items.map((scene,index)=>({
      sceneId:String(scene.sceneId||`record-scene-${String(index+1).padStart(3,'0')}`),index,
      text:String(scene.text||'').trim(),purpose:String(scene.purpose||'Scene'),visual:String(scene.visual||''),
      performance:String(scene.performance||'Natural delivery'),estimatedDuration:Math.max(0,Number(scene.dur||scene.duration||0)),
      status:'pending',acceptedTakeId:null,takes:[]
    }));
  }

  function sceneFingerprint(scenes=[],script=''){return textHash(JSON.stringify(inputScenes(scenes,script).map(scene=>[scene.text,scene.purpose,scene.performance])));}

  function createSession({projectName='Untitled Project',scenes=[],script='',previous=null}={}){
    const normalized=inputScenes(scenes,script),fingerprint=sceneFingerprint(scenes,script);
    if(previous&&previous.scriptFingerprint===fingerprint)return normalizeSession(previous,{projectName,scenes,script});
    return{version:1,id:`recording-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,projectName:String(projectName||'Untitled Project'),createdAt:now(),updatedAt:now(),scriptFingerprint:fingerprint,status:'active',activeSceneIndex:0,scenes:normalized};
  }

  function normalizeTake(take={}){return{id:String(take.id||`take-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`),takeNumber:Math.max(1,Number(take.takeNumber)||1),sceneId:String(take.sceneId||''),status:['candidate','accepted','rejected'].includes(take.status)?take.status:'candidate',recordedAt:take.recordedAt||now(),path:take.path||null,media:take.media?clone(take.media):null,mimeType:take.mimeType||null,duration:Math.max(0,Number(take.duration||take.media?.duration||0))};}

  function normalizeSession(session={},fallback={}){
    const baseScenes=inputScenes(fallback.scenes||[],fallback.script||''),byId=new Map((session.scenes||[]).map(scene=>[scene.sceneId,scene])),scenes=baseScenes.map((base,index)=>{const saved=byId.get(base.sceneId)||session.scenes?.[index]||{};const takes=(saved.takes||[]).map(normalizeTake),accepted=takes.find(take=>take.status==='accepted'||take.id===saved.acceptedTakeId);return{...base,...saved,index,takes,acceptedTakeId:accepted?.id||saved.acceptedTakeId||null,status:accepted?'complete':saved.status==='skipped'?'skipped':'pending'};});
    const firstPending=scenes.findIndex(scene=>scene.status!=='complete'&&scene.status!=='skipped'),active=Math.max(0,Math.min(scenes.length-1,Number(session.activeSceneIndex)||0));
    return{version:1,id:session.id||`recording-${Date.now().toString(36)}`,projectName:String(session.projectName||fallback.projectName||'Untitled Project'),createdAt:session.createdAt||now(),updatedAt:session.updatedAt||now(),scriptFingerprint:session.scriptFingerprint||sceneFingerprint(fallback.scenes||[],fallback.script||''),status:firstPending<0?'complete':session.status==='paused'?'paused':'active',activeSceneIndex:firstPending<0?scenes.length-1:active,scenes};
  }

  function findScene(session,sceneId){return(session?.scenes||[]).find(scene=>scene.sceneId===sceneId)||null;}
  function activeScene(session){return session?.scenes?.[Math.max(0,Math.min((session.scenes?.length||1)-1,Number(session.activeSceneIndex)||0))]||null;}
  function update(session,fn){const next=clone(session);fn(next);next.updatedAt=now();const pending=next.scenes.findIndex(scene=>scene.status!=='complete'&&scene.status!=='skipped');next.status=pending<0?'complete':next.status==='paused'?'paused':'active';return next;}

  function addTake(session,sceneId,take){return update(session,next=>{const scene=findScene(next,sceneId);if(!scene)return;const normalized=normalizeTake({...take,sceneId,takeNumber:take.takeNumber||scene.takes.length+1});scene.takes.push(normalized);});}
  function setTakeStatus(session,sceneId,takeId,status){return update(session,next=>{const scene=findScene(next,sceneId);if(!scene)return;const take=scene.takes.find(item=>item.id===takeId);if(!take)return;take.status=status;if(status==='accepted'){for(const other of scene.takes)if(other.id!==take.id&&other.status==='accepted')other.status='candidate';scene.acceptedTakeId=take.id;scene.status='complete';}else if(scene.acceptedTakeId===take.id){scene.acceptedTakeId=null;scene.status='pending';}});}
  function acceptTake(session,sceneId,takeId,{advance=true}={}){let next=setTakeStatus(session,sceneId,takeId,'accepted');if(advance){const index=next.scenes.findIndex(scene=>scene.sceneId===sceneId),following=next.scenes.findIndex((scene,i)=>i>index&&scene.status!=='complete'&&scene.status!=='skipped');if(following>=0)next=update(next,value=>{value.activeSceneIndex=following;value.status='active';});else{const pending=next.scenes.findIndex(scene=>scene.status!=='complete'&&scene.status!=='skipped');if(pending>=0)next=update(next,value=>{value.activeSceneIndex=pending;value.status='active';});}}return next;}
  function rejectTake(session,sceneId,takeId){return setTakeStatus(session,sceneId,takeId,'rejected');}
  function skipScene(session,sceneId){return update(session,next=>{const scene=findScene(next,sceneId);if(scene&&!scene.acceptedTakeId)scene.status='skipped';const current=next.scenes.findIndex(s=>s.sceneId===sceneId),following=next.scenes.findIndex((s,i)=>i>current&&s.status!=='complete'&&s.status!=='skipped');if(following>=0)next.activeSceneIndex=following;});}
  function setActiveScene(session,index){return update(session,next=>{next.activeSceneIndex=Math.max(0,Math.min(next.scenes.length-1,Number(index)||0));next.status='active';});}
  function pause(session){return update(session,next=>{if(next.status!=='complete')next.status='paused';});}
  function resume(session){return update(session,next=>{if(next.status!=='complete'){const pending=next.scenes.findIndex(scene=>scene.status!=='complete'&&scene.status!=='skipped');if(pending>=0&&next.scenes[next.activeSceneIndex]?.status==='complete')next.activeSceneIndex=pending;next.status='active';}});}
  function progress(session){const scenes=session?.scenes||[],complete=scenes.filter(scene=>scene.status==='complete').length,skipped=scenes.filter(scene=>scene.status==='skipped').length;return{total:scenes.length,complete,skipped,pending:Math.max(0,scenes.length-complete-skipped),percent:scenes.length?Math.round((complete+skipped)/scenes.length*100):0};}

  return{textHash,inputScenes,sceneFingerprint,createSession,normalizeTake,normalizeSession,findScene,activeScene,addTake,setTakeStatus,acceptTake,rejectTake,skipScene,setActiveScene,pause,resume,progress};
});