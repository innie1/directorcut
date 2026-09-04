const assert = require('assert');
const TL = require('../../prototype/timeline-engine');
const Gap = require('../../prototype/preview-gap-utils');

const timeline = TL.normalizeTimeline({fps:30,tracks:[
  {id:'V1',kind:'video',clips:[
    TL.createClip({id:'left',trackId:'V1',start:0,duration:2,sourceDuration:8}),
    TL.createClip({id:'right',trackId:'V1',start:5,duration:2,sourceIn:5,sourceDuration:8})
  ]},
  {id:'A1',kind:'audio',clips:[]}
]});

assert(Gap.visibleVideoClipAt(timeline,1));
assert.equal(Gap.visibleVideoClipAt(timeline,3),null);
assert.equal(Gap.isTimelineGap(timeline,3),true);
assert.equal(Gap.isTimelineGap(timeline,5.5),false);

const hidden = TL.normalizeTimeline(timeline);
hidden.tracks[0].hidden = true;
assert.equal(Gap.isTimelineGap(hidden,1),false);

console.log('preview gap utility tests passed');
