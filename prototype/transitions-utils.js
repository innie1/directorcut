(function(root,factory){const api=factory(root?.DirectorTimeline||(typeof require==='function'?require('./timeline-engine'):null));if(typeof module==='object'&&module.exports)module.exports=api;else root.DirectorTransitions=api;})(typeof globalThis!=='undefined'?globalThis:this,function(TL){
  const TYPES={
    dissolve:{label:'Cross Dissolve'},
    'dip-black':{label:'Dip to Black'},
    'dip-white':{label:'Dip to White'},
    'slide-left':{label:'Slide Left'},
    'slide-right':{label:'Slide Right'},
    'slide-up':{label:'Slide Up'},
    'slide-down':{label:'Slide Down'}
  };
  const clone=v=>JSON.parse(JSON.stringify(v));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const uid=()=>`transition-${Math.random().toString(36).slice(2,10)}`;
  function transitions(timeline){return Array.isArray(timeline?.transitions)?timeline.transitions:[]}
  function find(timeline,id){return transitions(timeline).find(t=>t.id===id)||null}
  function pair(timeline,fromClipId,toClipId){
    const from=TL.findClip(timeline,fromClipId),to=TL.findClip(timeline,toClipId);
    if(!from||!to||from.track.id!==to.track.id||from.track.kind!=='video'||to.track.kind!=='video')return null;
    return{from,to};
  }
  function maxDuration(timeline,from,to){
    const frame=TL.frameDuration(timeline.fps),limit=Math.min(Number(from.clip.duration)||0,Number(to.clip.duration)||0,2);
    return Math.max(frame*2,TL.snapTime(Math.max(frame*2,limit*.8),timeline.fps));
  }
  function normalizedDuration(timeline,from,to,value){
    const frame=TL.frameDuration(timeline.fps),max=maxDuration(timeline,from,to);
    return TL.snapTime(clamp(value,frame*2,max),timeline.fps);
  }
  function moveLinkedBy(timeline,clip,delta){
    if(!clip?.linkedId||Math.abs(delta)<1e-9)return;
    const linked=TL.findClip(timeline,clip.linkedId);
    if(linked&&!linked.track.locked)linked.clip.start=TL.snapTime(Math.max(0,Number(linked.clip.start||0)+delta),timeline.fps);
  }
  function prune(timelineInput){
    const timeline=TL.normalizeTimeline(timelineInput);
    const seen=new Set();
    timeline.transitions=transitions(timeline).filter(raw=>{
      if(!raw?.id||seen.has(raw.id))return false;
      const p=pair(timeline,raw.fromClipId,raw.toClipId);if(!p)return false;
      seen.add(raw.id);return true;
    }).map(raw=>{
      const p=pair(timeline,raw.fromClipId,raw.toClipId);
      return{...clone(raw),type:TYPES[raw.type]?raw.type:'dissolve',duration:normalizedDuration(timeline,p.from,p.to,raw.duration||.5),trackId:p.from.track.id};
    });
    return timeline;
  }
  function add(timelineInput,fromClipId,toClipId,type='dissolve',duration=.5){
    let timeline=prune(timelineInput);const p=pair(timeline,fromClipId,toClipId);if(!p)return timeline;
    const track=p.from.track,indexFrom=track.clips.findIndex(c=>c.id===fromClipId),indexTo=track.clips.findIndex(c=>c.id===toClipId);
    if(indexFrom<0||indexTo!==indexFrom+1)return timeline;
    const existing=transitions(timeline).find(t=>t.fromClipId===fromClipId&&t.toClipId===toClipId);
    if(existing)return update(timeline,existing.id,{type,duration});
    const d=normalizedDuration(timeline,p.from,p.to,duration),cut=TL.clipEnd(p.from.clip),target=TL.snapTime(Math.max(0,cut-d),timeline.fps),delta=target-p.to.clip.start;
    p.to.clip.start=target;moveLinkedBy(timeline,p.to.clip,delta);
    timeline.transitions.push({id:uid(),trackId:track.id,fromClipId,toClipId,type:TYPES[type]?type:'dissolve',duration:d,createdAt:new Date().toISOString()});
    track.clips.sort((a,b)=>a.start-b.start);
    return timeline;
  }
  function update(timelineInput,id,patch={}){
    let timeline=prune(timelineInput);const tr=find(timeline,id);if(!tr)return timeline;const p=pair(timeline,tr.fromClipId,tr.toClipId);if(!p)return timeline;
    if(patch.type&&TYPES[patch.type])tr.type=patch.type;
    if(patch.duration!==undefined){const d=normalizedDuration(timeline,p.from,p.to,patch.duration),cut=TL.clipEnd(p.from.clip),target=TL.snapTime(Math.max(0,cut-d),timeline.fps),delta=target-p.to.clip.start;p.to.clip.start=target;moveLinkedBy(timeline,p.to.clip,delta);tr.duration=d;p.to.track.clips.sort((a,b)=>a.start-b.start);}
    return timeline;
  }
  function remove(timelineInput,id,{restoreCut=true}={}){
    let timeline=prune(timelineInput);const tr=find(timeline,id);if(!tr)return timeline;const p=pair(timeline,tr.fromClipId,tr.toClipId);
    if(restoreCut&&p){const target=TL.snapTime(TL.clipEnd(p.from.clip),timeline.fps),delta=target-p.to.clip.start;p.to.clip.start=target;moveLinkedBy(timeline,p.to.clip,delta);p.to.track.clips.sort((a,b)=>a.start-b.start);}
    timeline.transitions=transitions(timeline).filter(t=>t.id!==id);return timeline;
  }
  function forIncoming(timeline,clipId){return transitions(timeline).find(t=>t.toClipId===clipId)||null}
  function forOutgoing(timeline,clipId){return transitions(timeline).find(t=>t.fromClipId===clipId)||null}
  function bounds(timeline,tr){const p=pair(timeline,tr.fromClipId,tr.toClipId);if(!p)return null;const end=TL.clipEnd(p.from.clip),start=Math.max(p.to.clip.start,end-tr.duration);return{start,end,duration:Math.max(0,end-start)};}
  function nativeSafe(timeline){return transitions(timeline).every(t=>t.type==='dissolve');}
  return{TYPES,transitions,find,pair,prune,add,update,remove,forIncoming,forOutgoing,bounds,nativeSafe};
});