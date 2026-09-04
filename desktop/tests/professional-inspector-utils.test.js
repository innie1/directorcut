const assert = require('assert');
const IU = require('../../prototype/professional-inspector-utils');

const timeline = {
  tracks:[
    {id:'V1',kind:'video',clips:[{id:'v1',linkedId:'a1',start:2,duration:4,keyframes:{}}]},
    {id:'A1',kind:'audio',clips:[{id:'a1',linkedId:'v1',start:2,duration:4,keyframes:{}}]}
  ]
};

let next = IU.setStatic(timeline,'v1','scale',1.25);
assert.equal(IU.staticValue(IU.findClip(next,'v1').clip,'scale',1),1.25);
next = IU.setKeyframe(next,'v1','opacity',2,.5);
assert.equal(IU.valueAt(IU.findClip(next,'v1').clip,'opacity',1,2),.5);

next = IU.setPlaybackRate(next,'v1',2,{linked:true});
const video = IU.findClip(next,'v1').clip;
const audio = IU.findClip(next,'a1').clip;
assert.equal(IU.playbackRate(video),2);
assert.equal(IU.playbackRate(audio),2);
assert(Math.abs(video.duration-2)<1e-9);
assert(Math.abs(audio.duration-2)<1e-9);

next = IU.setPlaybackRate(next,'v1',.5,{linked:true});
assert(Math.abs(IU.findClip(next,'v1').clip.duration-8)<1e-9);
assert(Math.abs(IU.findClip(next,'a1').clip.duration-8)<1e-9);
console.log('professional inspector utilities test passed');
