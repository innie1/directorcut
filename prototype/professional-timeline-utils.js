(function(root,factory){
  const api=factory(root?.DirectorTimeline||(typeof require==='function'?require('./timeline-engine'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;else root.DirectorProfessionalTimeline=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(TL){
  if(!TL)throw new Error('DirectorTimeline is required');
  const clone=v=>JSON.parse(JSON.stringify(v));
  const uniq=values=>[...new Set((values||[]).filter(Boolean).map(String))];

  function existingIds(timeline,ids){return uniq(ids).filter(id=>Boolean(TL.findClip(timeline,id)));}
  function toggleSelection(current,clipId,additive=false){
    const ids=uniq(current);if(!clipId)return additive?ids:[];
    if(!additive)return[clipId];
    return ids.includes(clipId)?ids.filter(id=>id!==clipId):[...ids,clipId];
  }
  function expandLinked(timeline,ids){
    const out=new Set(existingIds(timeline,ids));
    let changed=true;
    while(changed){changed=false;for(const id of [...out]){const found=TL.findClip(timeline,id),linked=found?.clip?.linkedId;if(linked&&TL.findClip(timeline,linked)&&!out.has(linked)){out.add(linked);changed=true;}}}
    return[...out];
  }
  function selectedKinds(timeline,ids){return existingIds(timeline,ids).map(id=>TL.findClip(timeline,id)).filter(Boolean);}
  function canLink(timeline,ids){const found=selectedKinds(timeline,ids);return found.length===2&&found.filter(x=>x.track.kind==='video').length===1&&found.filter(x=>x.track.kind==='audio').length===1;}
  function unlinkClip(timeline,clipId){const found=TL.findClip(timeline,clipId);if(!found)return;const linkedId=found.clip.linkedId;found.clip.linkedId=null;if(linkedId){const other=TL.findClip(timeline,linkedId);if(other?.clip?.linkedId===clipId)other.clip.linkedId=null;}}
  function unlinkSelection(timelineInput,ids){const timeline=TL.normalizeTimeline(timelineInput);for(const id of existingIds(timeline,ids))unlinkClip(timeline,id);return timeline;}
  function linkSelection(timelineInput,ids){
    const timeline=TL.normalizeTimeline(timelineInput),found=selectedKinds(timeline,ids);if(!canLink(timeline,ids))return timeline;
    const video=found.find(x=>x.track.kind==='video'),audio=found.find(x=>x.track.kind==='audio');
    unlinkClip(timeline,video.clip.id);unlinkClip(timeline,audio.clip.id);
    video.clip.linkedId=audio.clip.id;audio.clip.linkedId=video.clip.id;return timeline;
  }
  function snapGroupDelta(timeline,movingIds,rawDelta,threshold=.12){
    const ids=new Set(movingIds),moving=movingIds.map(id=>TL.findClip(timeline,id)?.clip).filter(Boolean);if(!moving.length)return 0;
    const minStart=Math.min(...moving.map(c=>Number(c.start)||0)),clamped=Math.max(-minStart,Number(rawDelta)||0),frameDelta=TL.snapDelta(clamped,timeline.fps);
    if(timeline.snapping===false)return frameDelta;
    const anchors=[];for(const track of timeline.tracks||[])for(const clip of track.clips||[])if(!ids.has(clip.id))anchors.push(Number(clip.start)||0,TL.clipEnd(clip));anchors.push(0);
    let best=frameDelta,dist=threshold+1e-9;
    for(const clip of moving){const start=(Number(clip.start)||0)+frameDelta,end=TL.clipEnd(clip)+frameDelta;for(const anchor of anchors){for(const edge of [start,end]){const d=anchor-edge;if(Math.abs(d)<dist){best=frameDelta+d;dist=Math.abs(d);}}}}
    return TL.snapDelta(Math.max(-minStart,best),timeline.fps);
  }
  function moveSelection(timelineInput,ids,delta,options={}){
    const timeline=TL.normalizeTimeline(timelineInput),moving=options.includeLinked===false?existingIds(timeline,ids):expandLinked(timeline,ids);if(!moving.length)return timeline;
    const d=options.snap===false?TL.snapDelta(Math.max(-Math.min(...moving.map(id=>TL.findClip(timeline,id).clip.start)),Number(delta)||0),timeline.fps):snapGroupDelta(timeline,moving,delta,options.threshold||.12);
    for(const id of moving){const found=TL.findClip(timeline,id);if(!found||found.track.locked)continue;found.clip.start=TL.snapTime(Math.max(0,found.clip.start+d),timeline.fps);}
    for(const track of timeline.tracks||[])track.clips.sort((a,b)=>a.start-b.start);return timeline;
  }
  function removeSelection(timelineInput,ids,{includeLinked=true}={}){
    const timeline=TL.normalizeTimeline(timelineInput),remove=new Set(includeLinked?expandLinked(timeline,ids):existingIds(timeline,ids));
    for(const track of timeline.tracks||[]){if(track.locked)continue;track.clips=(track.clips||[]).filter(c=>!remove.has(c.id));}
    for(const track of timeline.tracks||[])for(const clip of track.clips||[])if(clip.linkedId&&remove.has(clip.linkedId))clip.linkedId=null;
    return timeline;
  }
  return{existingIds,toggleSelection,expandLinked,selectedKinds,canLink,linkSelection,unlinkSelection,snapGroupDelta,moveSelection,removeSelection};
});