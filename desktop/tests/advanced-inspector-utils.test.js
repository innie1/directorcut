const assert=require('assert');
const TL=require('../../prototype/timeline-engine');
const IU=require('../../prototype/professional-inspector-utils');
const AU=require('../../prototype/advanced-inspector-utils');

const timeline=TL.normalizeTimeline({fps:30,tracks:[
  {id:'V1',kind:'video',clips:[{id:'v1',linkedId:'a1',start:2,duration:4,sourceIn:1,keyframes:{opacity:[{time:0,value:1},{time:2,value:.5},{time:3,value:.8}]}}]},
  {id:'A1',kind:'audio',clips:[{id:'a1',linkedId:'v1',start:2,duration:4,sourceIn:1,keyframes:{speed:[{time:0,value:1.5}]}}]}
]});
let t=AU.setCrop(timeline,'v1','left',.2);t=AU.setCrop(t,'v1','right',.1);assert.deepEqual(AU.getCrop(t,'v1'),{left:.2,top:0,right:.1,bottom:0});
t=AU.setCrop(t,'v1','right',.9);const crop=AU.getCrop(t,'v1');assert(crop.left+crop.right<=.950001);
t=AU.setReverse(t,'v1',true,{linked:true});assert.equal(TL.findClip(t,'v1').clip.reverse,true);assert.equal(TL.findClip(t,'a1').clip.reverse,true);
t=IU.setPlaybackRate(t,'v1',1.5,{linked:true});t=AU.freezeAt(t,'v1',1);const frozen=TL.findClip(t,'v1').clip;assert.equal(AU.isFrozen(frozen),true);assert(Math.abs(frozen.freezeFrame.sourceTime-3.5)<.0001); // sourceIn 1 + preserved source span 4 - 1.5 seconds of source travel
t=AU.clearFreeze(t,'v1');assert.equal(AU.isFrozen(TL.findClip(t,'v1').clip),false);
assert.equal(AU.neighborKeyframeTime(TL.findClip(t,'v1').clip,'opacity',2.2,-1),2);assert.equal(AU.neighborKeyframeTime(TL.findClip(t,'v1').clip,'opacity',2.2,1),3);
t=AU.removeKeyframe(t,'v1','opacity',2.001,.02);assert.deepEqual(IU.frames(TL.findClip(t,'v1').clip,'opacity').map(k=>k.time),[0,3]);
t=AU.resetCrop(t,'v1');assert.deepEqual(AU.getCrop(t,'v1'),{left:0,top:0,right:0,bottom:0});
console.log('advanced inspector utilities test passed');
