const assert=require('assert');
const FI=require('../../prototype/footage-intelligence-utils');

const scenes=FI.makeScenes([1,2,2.001],3,.05);
assert.equal(scenes.length,3);assert.equal(scenes[0].start,0);assert.equal(scenes[0].end,1);assert.equal(scenes[2].end,3);

const silence=FI.normalizeRanges([{start:1,end:1.5},{start:1.49,end:2}],3);
assert.equal(silence.length,1);assert.equal(silence[0].start,1);assert.equal(silence[0].end,2);
const speech=FI.complementRanges(silence,3);
assert.deepEqual(speech.map(r=>[r.start,r.end]),[[0,1],[2,3]]);

const red='ff0000:ffffffffffffffff',redNear='fa0404:fffffffffffffffe',blue='0000ff:ffffffffffffffff';
let classified=FI.classifyDuplicates([
  {...scenes[0],signature:red,quality:{score:50,flags:['low-contrast']}},
  {...scenes[1],signature:blue,quality:{score:70,flags:[]}},
  {...scenes[2],signature:redNear,quality:{score:52,flags:['soft']}}
]);
assert.equal(classified[2].duplicateOf,'scene-001');assert(['duplicate','near-duplicate'].includes(classified[2].duplicateKind));
assert.equal(FI.signatureDistance(red,blue).color,170);
assert.equal(FI.hammingHex('f0','e0'),1);

const analysis=FI.normalizeAnalysis({duration:3,scenes:classified,silence,speech});
assert.equal(analysis.summary.sceneCount,3);assert.equal(analysis.summary.silenceSeconds,1);assert.equal(analysis.summary.speechSeconds,2);assert.equal(analysis.summary.sampledScenes,3);assert.equal(analysis.summary.flaggedScenes,2);assert.equal(analysis.summary.duplicateScenes+analysis.summary.nearDuplicateScenes,1);
console.log('Stage 6 footage intelligence model tests passed');