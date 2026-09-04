(function(root,factory){
  const TL=root?.DirectorTimeline||(typeof require==='function'?require('./timeline-engine'):null);
  const IU=root?.DirectorInspectorUtils||(typeof require==='function'?require('./professional-inspector-utils'):null);
  const api=factory(TL,IU);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.DirectorAdvancedInspector=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(TL,IU){
  const clone=v=>JSON.parse(JSON.stringify(v));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const CROP_DEFAULT=Object.freeze({left:0,top:0,right:0,bottom:0});
  function normalizeCrop(crop={}){
    let left=clamp(crop.left??0,0,.95),right=clamp(crop.right??0,0,.95),top=clamp(crop.top??0,0,.95),bottom=clamp(crop.bottom??0,0,.95);
    if(left+right>.95){const s=.95/(left+right);left*=s;right*=s}
    if(top+bottom>.95){const s=.95/(top+bottom);top*=s;bottom*=s}
    return{left,top,right,bottom};
  }
  function findVideo(timeline,clipId){const found=TL.findClip(timeline,clipId);return found?.track?.kind==='video'?found:null}
  function getCrop(timeline,clipId){const found=findVideo(timeline,clipId);return normalizeCrop(found?.clip?.crop)}
  function setCrop(timelineInput,clipId,side,value){
    const timeline=TL.normalizeTimeline(timelineInput),found=findVideo(timeline,clipId);if(!found||found.track.locked||!(side in CROP_DEFAULT))return timeline;
    const next=normalizeCrop(found.clip.crop),v=clamp(value,0,.95);next[side]=v;
    if(side==='left'&&next.left+next.right>.95)next.right=.95-next.left;
    if(side==='right'&&next.left+next.right>.95)next.left=.95-next.right;
    if(side==='top'&&next.top+next.bottom>.95)next.bottom=.95-next.top;
    if(side==='bottom'&&next.top+next.bottom>.95)next.top=.95-next.bottom;
    found.clip.crop=normalizeCrop(next);return timeline;
  }
  function resetCrop(timelineInput,clipId){const timeline=TL.normalizeTimeline(timelineInput),found=findVideo(timeline,clipId);if(found&&!found.track.locked)delete found.clip.crop;return timeline}
  function setReverse(timelineInput,clipId,enabled,{linked=true}={}){
    const timeline=TL.normalizeTimeline(timelineInput),found=TL.findClip(timeline,clipId);if(!found||found.track.locked)return timeline;found.clip.reverse=Boolean(enabled);
    if(linked&&found.clip.linkedId){const other=TL.findClip(timeline,found.clip.linkedId);if(other&&!other.track.locked)other.clip.reverse=Boolean(enabled)}
    return timeline;
  }
  function isFrozen(clip){return Boolean(clip?.freezeFrame?.enabled&&Number.isFinite(Number(clip.freezeFrame.sourceTime)))}
  function freezeAt(timelineInput,clipId,localTime){
    const timeline=TL.normalizeTimeline(timelineInput),found=findVideo(timeline,clipId);if(!found||found.track.locked)return timeline;
    const rate=IU.playbackRate(found.clip),duration=Math.max(.001,Number(found.clip.duration)||.001),sourceIn=Math.max(0,Number(found.clip.sourceIn)||0),sourceSpan=duration*rate,local=clamp(localTime,0,duration);
    const sourceOffset=found.clip.reverse?Math.max(0,sourceSpan-local*rate):Math.min(sourceSpan,local*rate);
    found.clip.freezeFrame={enabled:true,sourceTime:sourceIn+sourceOffset};return timeline;
  }
  function clearFreeze(timelineInput,clipId){const timeline=TL.normalizeTimeline(timelineInput),found=findVideo(timeline,clipId);if(found&&!found.track.locked)delete found.clip.freezeFrame;return timeline}
  function removeKeyframe(timelineInput,clipId,property,localTime,tolerance=.025){
    const timeline=TL.normalizeTimeline(timelineInput),found=TL.findClip(timeline,clipId);if(!found||found.track.locked)return timeline;const list=IU.frames(found.clip,property);if(!list.length)return timeline;
    const t=Math.max(0,Number(localTime)||0),tol=Math.max(.0001,Number(tolerance)||.025);let best=-1,distance=Infinity;for(let i=0;i<list.length;i++){const d=Math.abs(Number(list[i].time)-t);if(d<distance){best=i;distance=d}}
    if(best>=0&&distance<=tol){const next=list.filter((_,i)=>i!==best);found.clip.keyframes=found.clip.keyframes||{};if(next.length)found.clip.keyframes[property]=next;else delete found.clip.keyframes[property]}
    return timeline;
  }
  function neighborKeyframeTime(clip,property,localTime,direction){
    const list=IU.frames(clip,property),t=Math.max(0,Number(localTime)||0),eps=1e-5;if(!list.length)return null;
    if(direction<0){for(let i=list.length-1;i>=0;i--)if(Number(list[i].time)<t-eps)return Number(list[i].time);return Number(list[0].time)}
    for(const k of list)if(Number(k.time)>t+eps)return Number(k.time);return Number(list[list.length-1].time);
  }
  return{clone,clamp,CROP_DEFAULT,normalizeCrop,getCrop,setCrop,resetCrop,setReverse,isFrozen,freezeAt,clearFreeze,removeKeyframe,neighborKeyframeTime};
});
