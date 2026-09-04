const assert=require('assert');
const VI=require('../../prototype/visual-intelligence-utils');

const index=VI.normalizeIndex({model:'qwen-vl-test',entries:[
  {id:'v1',sceneId:'s1',sceneIndex:0,time:1,start:0,end:2,summary:'Woman speaking beside a washing machine',subjects:['woman'],objects:['washing machine','laundry basket'],actions:['speaking'],setting:'laundry shop',visibleText:['WASHLIE'],evidence:['store sign WASHLIE'],confidence:.92},
  {id:'v2',sceneId:'s2',sceneIndex:1,time:3,start:2,end:4,summary:'Close view of a printed receipt with totals',subjects:[],objects:['receipt','pen'],actions:['document shown'],setting:'counter',visibleText:['TOTAL 4500','PAID'],evidence:['receipt total 4500','PAID label'],confidence:.88},
  {id:'v3',sceneId:'s3',sceneIndex:2,time:5,start:4,end:6,summary:'Blue delivery van moving on a road',subjects:[],objects:['blue van','road'],actions:['driving'],setting:'street',visibleText:[],evidence:[],confidence:.8}
]});

assert.equal(index.entries.length,3);
assert.equal(index.summary.shots,3);
assert.equal(index.summary.shotsWithText,2);
assert.equal(index.summary.shotsWithEvidence,2);
assert(index.summary.objects.includes('receipt'));

let results=VI.search(index,'receipt total paid',{limit:5});
assert.equal(results[0].entry.id,'v2');
assert(results[0].score>results[1]?.score||results.length===1);
results=VI.search(index,'laundry washing machine');
assert.equal(results[0].entry.id,'v1');
results=VI.search(index,'delivery van road');
assert.equal(results[0].entry.id,'v3');
assert.deepEqual(VI.search(index,'zzzz-unmatched'),[]);

assert.equal(VI.tokenize('A blue-blue van, VAN!').includes('van'),true);
assert(VI.lexicalScore(index.entries[1],'4500 receipt')>0);
assert(Math.abs(VI.cosine([1,0],[1,0])-1)<1e-9);
assert.equal(VI.cosine([1,0],[0,1]),0);

const context=VI.compactContext(index,2);
assert.equal(context.entries.length,2);
assert.equal(context.entries[1].visibleText[0],'TOTAL 4500');
assert.equal(context.entries[0].summary,'Woman speaking beside a washing machine');

const footage={scenes:[{id:'s1',start:0,end:2},{id:'s2',start:2,end:4},{id:'s3',start:4,end:6}]};
const merged=VI.mergeIntoFootage(footage,index);
assert.equal(merged.scenes[0].visual.id,'v1');
assert.equal(merged.scenes[2].visual.objects[0],'blue van');

const sanitized=VI.normalizeEntry({summary:'  lots   of   spaces ',objects:['phone','phone',''],visibleText:[' ABC ','ABC'],confidence:2},{time:3});
assert.equal(sanitized.summary,'lots of spaces');
assert.deepEqual(sanitized.objects,['phone']);
assert.deepEqual(sanitized.visibleText,['ABC']);
assert.equal(sanitized.confidence,1);

console.log('visual intelligence index and retrieval tests passed');
