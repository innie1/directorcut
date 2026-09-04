const assert = require('assert');
const { normalizeRanges, keepRanges, wordsToSrt } = require('../media-utils');

assert.deepStrictEqual(
  normalizeRanges([{start:1,end:3},{start:2.5,end:4},{start:-2,end:.5}], 10),
  [{start:0,end:.5},{start:1,end:4}]
);
assert.deepStrictEqual(
  keepRanges([{start:2,end:4},{start:6,end:7}], 10),
  [{start:0,end:2},{start:4,end:6},{start:7,end:10}]
);
const srt = wordsToSrt([
  {text:'Hello',start_ms:0,end_ms:300},
  {text:'world.',start_ms:310,end_ms:800},
  {text:'Again',start_ms:1000,end_ms:1300}
]);
assert(srt.includes('00:00:00,000 --> 00:00:00,800'));
assert(srt.includes('Hello world.'));
console.log('media-utils tests passed');
