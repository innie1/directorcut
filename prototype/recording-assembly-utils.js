(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DirectorRecordingAssembly=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const clone=value=>JSON.parse(JSON.stringify(value));
  const hash=value=>{let h=2166136261;for(const c of String(value||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');};

  function acceptedTake(scene={}){
    const takes=Array.isArray(scene.takes)?scene.takes:[];
    return takes.find(take=>take?.id===scene.acceptedTakeId)||takes.find(take=>take?.status==='accepted')||null;
  }

  function alignment(session={}){
    const rows=[];
    for(const [index,scene] of (session.scenes||[]).entries()){
      const take=acceptedTake(scene);
      rows.push({
        sceneId:String(scene.sceneId||`scene-${index+1}`),sceneIndex:index,sceneNumber:index+1,
        scriptText:String(scene.text||''),purpose:String(scene.purpose||'Scene'),performance:String(scene.performance||''),visual:String(scene.visual||''),
        sceneStatus:String(scene.status||'pending'),takeId:take?.id||null,takeNumber:take?Math.max(1,Number(take.takeNumber)||1):null,
        takeStatus:take?.status||null,duration:take?Math.max(0,Number(take.duration||take.media?.duration||0)):0,
        media:take?.media?clone(take.media):null,path:take?.path||take?.media?.path||null
      });
    }
    return rows;
  }

  function acceptedRows(session={}){return alignment(session).filter(row=>row.takeId&&row.media?.path&&row.duration>0);}

  function fingerprint(session={}){
    return hash(JSON.stringify(acceptedRows(session).map(row=>[row.sceneId,row.takeId,row.duration,row.scriptText])));
  }

  function plan(session={},start=0){
    let cursor=Math.max(0,Number(start)||0);
    const items=acceptedRows(session).map(row=>{
      const item={...row,start:cursor,end:cursor+row.duration};
      cursor=item.end;
      return item;
    });
    const missing=alignment(session).filter(row=>row.sceneStatus!=='skipped'&&!row.takeId).map(row=>row.sceneNumber);
    return{
      version:1,sessionId:String(session.id||''),fingerprint:fingerprint(session),start:Math.max(0,Number(start)||0),end:cursor,duration:Math.max(0,cursor-Math.max(0,Number(start)||0)),
      items,accepted:items.length,skipped:(session.scenes||[]).filter(scene=>scene.status==='skipped').length,missing
    };
  }

  function alignedMedia(item={},session={}){
    if(!item.media)return null;
    return{
      ...clone(item.media),
      source:'recording',
      recording:{...(item.media.recording||{}),sessionId:String(session.id||item.media.recording?.sessionId||''),sceneId:item.sceneId,takeId:item.takeId,takeNumber:item.takeNumber,accepted:true},
      recordingAlignment:{
        version:1,sessionId:String(session.id||''),sceneId:item.sceneId,sceneIndex:item.sceneIndex,sceneNumber:item.sceneNumber,
        scriptText:item.scriptText,purpose:item.purpose,performance:item.performance,visual:item.visual,takeId:item.takeId,takeNumber:item.takeNumber
      }
    };
  }

  function clipAlignment(item={},session={}){
    return{version:1,sessionId:String(session.id||''),sceneId:item.sceneId,sceneIndex:item.sceneIndex,sceneNumber:item.sceneNumber,scriptText:item.scriptText,purpose:item.purpose,performance:item.performance,visual:item.visual,takeId:item.takeId,takeNumber:item.takeNumber};
  }

  function summary(session={}){
    const rows=alignment(session),accepted=rows.filter(row=>row.takeId).length,skipped=rows.filter(row=>row.sceneStatus==='skipped').length,missing=rows.length-accepted-skipped;
    return{scenes:rows.length,accepted,skipped,missing,ready:accepted>0&&missing===0,fingerprint:fingerprint(session)};
  }

  return{acceptedTake,alignment,acceptedRows,fingerprint,plan,alignedMedia,clipAlignment,summary};
});
