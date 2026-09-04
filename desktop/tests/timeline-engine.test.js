const assert = require('assert');
const TL = require('../../prototype/timeline-engine');

const base = TL.normalizeTimeline({
  fps:'30/1',
  tracks:[
    { id:'V1',kind:'video',clips:[
      TL.createClip({id:'a',trackId:'V1',start:0,duration:5,sourceDuration:10,keyframes:{opacity:[{time:1,value:.5},{time:4,value:1}]}}),
      TL.createClip({id:'b',trackId:'V1',start:5,duration:5,sourceIn:2,sourceDuration:12}),
      TL.createClip({id:'c',trackId:'V1',start:10,duration:5,sourceIn:2,sourceDuration:12})
    ]},
    { id:'V2',kind:'video',clips:[] }
  ]
});

assert.equal(TL.snapDelta(-1.02,30),-1.0333333333333334);
const split = TL.splitAt(base,2);
assert.equal(split.tracks[0].clips.length,4);
assert.equal(split.tracks[0].clips[0].duration,2);
assert.equal(split.tracks[0].clips[1].start,2);
assert.equal(split.tracks[0].clips[1].sourceIn,2);
assert.equal(split.tracks[0].clips[1].keyframes.opacity[0].time,2);

const slipped = TL.slipClip(base,'b',-1);
assert.equal(TL.findClip(slipped,'b').clip.sourceIn,1);
const slideL = TL.slideClip(base,'b',-1);
assert.equal(TL.findClip(slideL,'b').clip.start,4);
assert.equal(TL.findClip(slideL,'c').clip.sourceIn,1);
const slideR = TL.slideClip(base,'b',1);
assert.equal(TL.findClip(slideR,'b').clip.start,6);
assert.equal(TL.findClip(slideR,'c').clip.start,11);
const rollL = TL.rollBoundary(base,'a','b',-1);
assert.equal(TL.findClip(rollL,'a').clip.duration,4);
assert.equal(TL.findClip(rollL,'b').clip.sourceIn,1);

const ripple = TL.rippleDelete(base,2,4);
const rippleTrack = ripple.tracks.find(t=>t.id==='V1');
assert.equal(rippleTrack.clips.length,4);
assert.equal(TL.findClip(ripple,'a').clip.duration,2);
const tail = rippleTrack.clips.find(c=>c.id.startsWith('a-rd-'));
assert(tail);
assert.equal(tail.start,2);
assert.equal(tail.sourceIn,4);
assert.equal(tail.duration,1);
assert.equal(TL.findClip(ripple,'b').clip.start,3);

const keyed = TL.addKeyframe(base,'b','opacity',6,.5);
assert.equal(TL.findClip(keyed,'b').clip.keyframes.opacity[0].time,1);
const cross = TL.moveClipToTrack(base,'b','V2',7,{snap:false});
assert.equal(TL.findClip(cross,'b').track.id,'V2');
assert.equal(TL.findClip(cross,'b').clip.start,7);

const linked = TL.normalizeTimeline({fps:30,tracks:[
  {id:'V1',kind:'video',clips:[TL.createClip({id:'v',trackId:'V1',start:1,duration:4,sourceIn:1,sourceDuration:10,linkedId:'aud'})]},
  {id:'A1',kind:'audio',clips:[TL.createClip({id:'aud',trackId:'A1',kind:'audio',start:1,duration:4,sourceIn:1,sourceDuration:10,linkedId:'v'})]}
]});
const movedLinked = TL.moveClipLinked(linked,'v',3,{snap:false});
assert.equal(TL.findClip(movedLinked,'v').clip.start,3);
assert.equal(TL.findClip(movedLinked,'aud').clip.start,3);
const slippedLinked = TL.slipClipLinked(linked,'v',2);
assert.equal(TL.findClip(slippedLinked,'v').clip.sourceIn,3);
assert.equal(TL.findClip(slippedLinked,'aud').clip.sourceIn,3);
const splitLinked = TL.splitAt(linked,3);
assert.equal(splitLinked.tracks.find(t=>t.id==='V1').clips.length,2);
assert.equal(splitLinked.tracks.find(t=>t.id==='A1').clips.length,2);
const rightV = splitLinked.tracks.find(t=>t.id==='V1').clips[1];
const rightA = splitLinked.tracks.find(t=>t.id==='A1').clips[1];
assert.equal(rightV.linkedId,rightA.id);
assert.equal(rightA.linkedId,rightV.id);

console.log('timeline engine tests passed');
