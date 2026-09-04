const assert = require('assert');
const TL = require('../../prototype/timeline-engine');
const SA = require('../../prototype/selection-actions');

const linked = TL.normalizeTimeline({fps:30,tracks:[
  {id:'V1',kind:'video',clips:[
    TL.createClip({id:'v1',trackId:'V1',start:0,duration:2,sourceDuration:8,linkedId:'a1'}),
    TL.createClip({id:'v2',trackId:'V1',start:2,duration:3,sourceIn:2,sourceDuration:8,linkedId:'a2'}),
    TL.createClip({id:'v3',trackId:'V1',start:5,duration:2,sourceIn:5,sourceDuration:8,linkedId:'a3'})
  ]},
  {id:'A1',kind:'audio',clips:[
    TL.createClip({id:'a1',trackId:'A1',kind:'audio',start:0,duration:2,sourceDuration:8,linkedId:'v1'}),
    TL.createClip({id:'a2',trackId:'A1',kind:'audio',start:2,duration:3,sourceIn:2,sourceDuration:8,linkedId:'v2'}),
    TL.createClip({id:'a3',trackId:'A1',kind:'audio',start:5,duration:2,sourceIn:5,sourceDuration:8,linkedId:'v3'})
  ]}
]});

const removed = SA.removeSelectedClip(linked,'v2');
assert.equal(TL.findClip(removed,'v2'),null);
assert.equal(TL.findClip(removed,'a2'),null);
assert.equal(TL.findClip(removed,'v3').clip.start,5);
assert.equal(TL.findClip(removed,'a3').clip.start,5);

const rippled = SA.rippleDeleteSelectedClip(linked,'v2');
assert.equal(TL.findClip(rippled,'v2'),null);
assert.equal(TL.findClip(rippled,'a2'),null);
assert.equal(TL.findClip(rippled,'v3').clip.start,2);
assert.equal(TL.findClip(rippled,'a3').clip.start,2);
assert.equal(TL.duration(rippled),4);

const locked = TL.normalizeTimeline(linked);
locked.tracks.find(t=>t.id==='V1').locked = true;
const unchanged = SA.rippleDeleteSelectedClip(locked,'v2');
assert(TL.findClip(unchanged,'v2'));
assert(TL.findClip(unchanged,'a2'));

console.log('selection action tests passed');
