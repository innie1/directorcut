const assert=require('assert');
const VI=require('../../prototype/visual-intelligence-utils');
const {embedVisualIndex,embedQuery}=require('../semantic-retrieval');

(async()=>{
  const calls=[];
  const fakeEmbed=async({model,input})=>{
    calls.push({model,input:[...input]});
    return input.map((text,index)=>{
      const lower=String(text).toLowerCase();
      if(lower.includes('kitchen')||lower.includes('food'))return[0,1,0];
      if(lower.includes('office')||lower.includes('chart')||lower.includes('finance'))return[0,0,1];
      return[1,0,0];
    });
  };
  const index=VI.normalizeIndex({entries:[
    {id:'a',time:1,summary:'Street scene',setting:'street'},
    {id:'b',time:2,summary:'Chef prepares food',setting:'kitchen'},
    {id:'c',time:3,summary:'Chart on a monitor',setting:'office'}
  ]});
  const embedded=await embedVisualIndex({index,model:'embed-test',embed:fakeEmbed});
  assert.equal(calls.length,1);
  assert.equal(calls[0].input.length,3);
  assert.equal(embedded.entries[1].embedding[1],1);
  assert.equal(embedded.embeddingModel,'embed-test');
  const query=await embedQuery({query:'finance results',model:'embed-test',embed:fakeEmbed});
  assert.deepEqual(query,[0,0,1]);
  assert.equal(calls.length,2);
  assert.deepEqual(await embedQuery({query:'   ',model:'embed-test',embed:fakeEmbed}),[]);
  console.log('semantic embedding pipeline tests passed');
})().catch(error=>{console.error(error);process.exit(1);});
