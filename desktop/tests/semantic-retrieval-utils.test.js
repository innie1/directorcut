const assert=require('assert');
const VI=require('../../prototype/visual-intelligence-utils');
const SR=require('../../prototype/semantic-retrieval-utils');

assert.equal(SR.chooseEmbeddingModel([{name:'qwen3-vl:4b'},{name:'all-minilm:latest'},{name:'nomic-embed-text:latest'}]),'nomic-embed-text:latest');
assert.equal(SR.chooseEmbeddingModel([{name:'qwen3-vl:4b'}]),null);
assert(SR.embeddingRank('mxbai-embed-large:latest')>SR.embeddingRank('generic-embed:latest'));

const base=VI.normalizeIndex({model:'vision',entries:[
  {id:'a',time:1,summary:'A person walking outside',objects:['person'],setting:'street'},
  {id:'b',time:2,summary:'Hands preparing ingredients',objects:['bowl','knife'],setting:'kitchen'},
  {id:'c',time:3,summary:'A computer screen showing a chart',objects:['monitor','chart'],setting:'office'}
]});
const embedded=SR.mergeEmbeddings(base,[[1,0,0],[0,1,0],[0,0,1]],'nomic-embed-text:latest');
assert.equal(SR.embeddingCoverage(embedded).percent,100);
assert.equal(embedded.embeddingModel,'nomic-embed-text:latest');

const media=[{libraryId:'m1',name:'Footage',visualIntelligence:embedded}];
let results=SR.searchAcrossMedia(media,'cooking food',{queryEmbeddings:{'nomic-embed-text:latest':[0,.99,.01]}});
assert.equal(results[0].entry.id,'b');
assert.equal(results[0].semantic,true);
assert(results[0].semanticScore>.9);

// Deliberately unrelated words: vector similarity must still find the office/chart shot.
results=SR.searchAcrossMedia(media,'financial performance',{queryEmbeddings:{'nomic-embed-text:latest':[0,0,1]}});
assert.equal(results[0].entry.id,'c');
assert.equal(results[0].lexicalScore,0);
assert(results[0].score>4.9);

const lexical=SR.searchAcrossMedia(media,'knife bowl');
assert.equal(lexical[0].entry.id,'b');
assert.equal(lexical[0].semantic,false);
console.log('semantic retrieval model selection and vector search tests passed');
