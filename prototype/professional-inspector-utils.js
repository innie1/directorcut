(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DirectorInspectorUtils=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const clone=v=>JSON.parse(JSON.stringify(v));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  function clipEnd(c){return Number(c?.start||0)+Number(c?.duration||0)}
  function findClip(timeline,clipId){for(const track of timeline?.tracks||[]){const index=(track.clips||[]).findIndex(c=>c.id===clipId);if(index>=0)return{track,clip:track.clips[index],index}}return null}
  function frames(clip,property){return Array.isArray(clip?.keyframes?.[property])?[...clip.keyframes[property]].sort((a,b)=>Number(a.time)-Number(b.time)):[]}
  function valueAt(clip,property,fallback=0,localTime=0){
    const list=frames(clip,property);if(!list.length)return Number(fallback);
    const t=Math.max(0,Number(localTime)||0);if(t<=Number(list[0].time||0))return Number(list[0].value);
    for(let i=0;i<list.length-1;i++){const a=list[i],b=list[i+1],at=Number(a.time||0),bt=Number(b.time||0);if(t<=bt){const span=Math.max(1e-9,bt-at),p=(t-at)/span;return Number(a.value)+(Number(b.value)-Number(a.value))*p}}
    return Number(list[list.length-1].value);
  }
  function setKeyframe(timelineInput,clipId,property,localTime,value){
    const timeline=clone(timelineInput),found=findClip(timeline,clipId);if(!found)return timeline;
    found.clip.keyframes=found.clip.keyframes||{};const list=frames(found.clip,property);const t=Math.max(0,Math.min(Number(found.clip.duration||0),Number(localTime)||0));
    const eps=1e-4,next=list.filter(k=>Math.abs(Number(k.time)-t)>eps);next.push({time:t,value:Number(value)});next.sort((a,b)=>a.time-b.time);found.clip.keyframes[property]=next;return timeline;
  }
  function setStatic(timelineInput,clipId,property,value){return setKeyframe(timelineInput,clipId,property,0,value)}
  function staticValue(clip,property,fallback=0){return valueAt(clip,property,fallback,0)}
  function playbackRate(clip){return clamp(staticValue(clip,'speed',1),.25,4)}
  function setPlaybackRate(timelineInput,clipId,rate,{linked=true}={}){
    let timeline=clone(timelineInput),found=findClip(timeline,clipId);if(!found)return timeline;
    const target=clamp(rate,.25,4),old=playbackRate(found.clip),sourceSpan=Math.max(.001,Number(found.clip.duration||.001)*old),newDuration=Math.max(.001,sourceSpan/target),linkedId=found.clip.linkedId;
    found.clip.duration=newDuration;found.clip.keyframes=found.clip.keyframes||{};found.clip.keyframes.speed=[{time:0,value:target}];
    if(linked&&linkedId){const linkedFound=findClip(timeline,linkedId);if(linkedFound){const oldLinked=playbackRate(linkedFound.clip),linkedSpan=Math.max(.001,Number(linkedFound.clip.duration||.001)*oldLinked);linkedFound.clip.duration=Math.max(.001,linkedSpan/target);linkedFound.clip.keyframes=linkedFound.clip.keyframes||{};linkedFound.clip.keyframes.speed=[{time:0,value:target}]}}
    return timeline;
  }
  function snapTime(value,fps){const f=Math.max(1,Number(fps)||30);return Math.max(0,Math.round((Number(value)||0)*f)/f)}
  function moveLinked(timelineInput,clipId,newStart,{snapping=true,threshold=.12}={}){
    const timeline=clone(timelineInput),found=findClip(timeline,clipId);if(!found||found.track.locked)return timeline;
    const fps=Math.max(1,Number(timeline.fps)||30),linkedId=found.clip.linkedId,ignored=new Set([clipId,linkedId].filter(Boolean)),duration=Number(found.clip.duration||0),originalStart=Number(found.clip.start||0);
    let target=Math.max(0,Number(newStart)||0);
    if(snapping){const candidates=[0];for(const track of timeline.tracks||[])for(const clip of track.clips||[])if(!ignored.has(clip.id))candidates.push(Number(clip.start||0),clipEnd(clip));let best=target,distance=Math.max(0,Number(threshold)||0);for(const edge of candidates){const d1=Math.abs(edge-target);if(d1<distance){best=edge;distance=d1}const aligned=edge-duration,d2=Math.abs(aligned-target);if(d2<distance){best=aligned;distance=d2}}target=Math.max(0,best)}
    target=snapTime(target,fps);const delta=target-originalStart;found.clip.start=target;found.track.clips.sort((a,b)=>Number(a.start)-Number(b.start));
    if(linkedId){const other=findClip(timeline,linkedId);if(other&&!other.track.locked){other.clip.start=snapTime(Number(other.clip.start||0)+delta,fps);other.track.clips.sort((a,b)=>Number(a.start)-Number(b.start))}}
    return timeline;
  }
  function defaultsFor(kind){return kind==='audio'?{volume:1,speed:1}:{x:0,y:0,scale:1,rotation:0,opacity:1,speed:1}}
  return{clone,clamp,clipEnd,findClip,frames,valueAt,setKeyframe,setStatic,staticValue,playbackRate,setPlaybackRate,snapTime,moveLinked,defaultsFor};
});
