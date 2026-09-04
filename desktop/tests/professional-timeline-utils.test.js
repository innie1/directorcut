const assert=require('assert');
const TL=require('../../prototype/timeline-engine');
const PT=require('../../prototype/professional-timeline-utils');

function clip(id,trackId,kind,start,duration,linkedId=null,sourceIn=0,sourceDuration=20){return TL.createClip({id,trackId,kind,name:id,sourcePath:`/${id}.mp4`,start,duration,sourceIn,sourceDuration,linkedId});}
function base(){return TL.normalizeTimeline({fps:30,tracks:[
  {id:'V1',kind:'video',height:76,clips:[clip('v1','V1','video',0,3,'a1'),clip('v2','V1','video',5,2,'a2')]},
  {id:'A1',kind:'audio',clips:[clip('a1','A1','audio',0,3,'v1'),clip('a2','A1','audio',5,2,'v2')]}
]});}

{
  const timeline=base();
  assert.equal(timeline.tracks[0].height,76,'track height should survive normalization');
  assert.deepEqual(PT.toggleSelection([], 'v1', false),['v1']);
  assert.deepEqual(PT.toggleSelection(['v1'],'a1',true),['v1','a1']);
  assert.deepEqual(PT.toggleSelection(['v1','a1'],'v1',true),['a1']);
}
{
  let timeline=base();
  timeline=PT.unlinkSelection(timeline,['v1']);
  assert.equal(TL.findClip(timeline,'v1').clip.linkedId,null);
  assert.equal(TL.findClip(timeline,'a1').clip.linkedId,null);
  timeline=PT.linkSelection(timeline,['v1','a1']);
  assert.equal(TL.findClip(timeline,'v1').clip.linkedId,'a1');
  assert.equal(TL.findClip(timeline,'a1').clip.linkedId,'v1');
  assert(PT.canLink(timeline,['v2','a2']));
  assert(!PT.canLink(timeline,['v1','v2']));
}
{
  const timeline=PT.moveSelection(base(),['v1'],1,{includeLinked:true,snap:false});
  assert.equal(TL.findClip(timeline,'v1').clip.start,1);
  assert.equal(TL.findClip(timeline,'a1').clip.start,1,'linked audio should move with video');
  assert.equal(TL.findClip(timeline,'v2').clip.start,5,'unselected clip should stay put');
}
{
  const timeline=PT.moveSelection(base(),['v1','v2'],.5,{includeLinked:true,snap:false});
  assert.equal(TL.findClip(timeline,'v1').clip.start,.5);
  assert.equal(TL.findClip(timeline,'a1').clip.start,.5);
  assert.equal(TL.findClip(timeline,'v2').clip.start,5.5);
  assert.equal(TL.findClip(timeline,'a2').clip.start,5.5);
}
{
  const timeline=PT.removeSelection(base(),['v1']);
  assert(!TL.findClip(timeline,'v1'));
  assert(!TL.findClip(timeline,'a1'),'linked audio should be removed with selected video');
  assert(TL.findClip(timeline,'v2'));
}
{
  const media={name:'replacement.mp4',path:'/replacement.mp4',duration:2,hasAudio:true};
  const timeline=PT.overwriteMedia(base(),media,2,{idSeed:'ow'});
  const video=timeline.tracks.find(t=>t.id==='V1'),audio=timeline.tracks.find(t=>t.id==='A1');
  const replacement=TL.findClip(timeline,'ow-v').clip,replacementAudio=TL.findClip(timeline,'ow-a').clip;
  assert.equal(replacement.start,2);assert.equal(replacement.duration,2);assert.equal(replacement.linkedId,'ow-a');assert.equal(replacementAudio.linkedId,'ow-v');
  const left=video.clips.find(c=>c.id==='v1');assert(left,'left side of overwritten clip should remain');assert.equal(left.duration,2);
  const later=video.clips.find(c=>c.id==='v2');assert.equal(later.start,5,'overwrite must not shift later video');
  const laterAudio=audio.clips.find(c=>c.id==='a2');assert.equal(laterAudio.start,5,'overwrite must not shift later audio');
}
{
  const noAudio={name:'silent.mp4',path:'/silent.mp4',duration:1,hasAudio:false};
  const timeline=PT.overwriteMedia(base(),noAudio,1,{idSeed:'silent'});
  assert(TL.findClip(timeline,'silent-v'));
  assert(!TL.findClip(timeline,'silent-a'));
  assert(TL.findClip(timeline,'a1'),'video-only overwrite should preserve existing audio');
}
console.log('professional timeline completion tests passed');
