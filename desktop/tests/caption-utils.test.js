const assert = require('assert');
const CU = require('../../prototype/caption-utils');

const words = [
  {text:'Hello',start_ms:0,end_ms:300},
  {text:'there',start_ms:320,end_ms:600},
  {text:'this',start_ms:650,end_ms:820},
  {text:'is',start_ms:840,end_ms:930},
  {text:'DirectorCut.',start_ms:950,end_ms:1350},
  {text:'New',start_ms:2200,end_ms:2400},
  {text:'sentence',start_ms:2420,end_ms:2750}
];

const segments = CU.segmentWords(words);
assert.equal(segments.length,2);
assert.equal(segments[0].text,'Hello there this is DirectorCut.');
assert.equal(segments[0].start,0);
assert(segments[0].end >= 1.35);
assert.equal(segments[1].text,'New sentence');
assert(segments[1].start >= 2.2);

const clips = CU.clipsFromTranscript({words},'C1');
assert.equal(clips.length,2);
assert.equal(clips[0].kind,'caption');
assert.equal(clips[0].trackId,'C1');
assert.equal(clips[0].name,'Hello there this is DirectorCut.');
assert(clips[0].duration > 0);

const alt = CU.normalizeWord({text:'word',start:1.2,end:1.5});
assert.equal(alt.start,1.2);
assert.equal(alt.end,1.5);

console.log('caption utility tests passed');
