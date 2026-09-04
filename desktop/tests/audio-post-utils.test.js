const assert=require('assert');
const TL=require('../../prototype/timeline-engine');
const AP=require('../../prototype/audio-post-utils');
const timeline=TL.normalizeTimeline({fps:30,tracks:[
 {id:'V1',kind:'video',clips:[TL.createClip({id:'v',linkedId:'a',duration:4})]},
 {id:'A1',kind:'audio',clips:[TL.createClip({id:'a',kind:'audio',trackId:'A1',linkedId:'v',duration:4})]}
]});
let t=AP.patch(timeline,'v',{gainDb:6,pan:.4,fadeIn:.25,fadeOut:.5,normalize:true,dialogueEnhance:true,noiseReduction:.65});
const a=AP.get(t,'v');assert.equal(a.gainDb,6);assert.equal(a.pan,.4);assert.equal(a.fadeIn,.25);assert.equal(a.fadeOut,.5);assert.equal(a.normalize,true);assert.equal(a.dialogueEnhance,true);assert.equal(a.noiseReduction,.65);assert(Math.abs(AP.linearGain(a)-1.995262)<.00001);
const filters=AP.exportFilters(TL.findClip(t,'a').clip).join(',');assert(filters.includes('afftdn=nr='));assert(filters.includes('highpass=f=80'));assert(filters.includes('acompressor='));assert(filters.includes('loudnorm=I=-16'));assert(filters.includes('volume=1.995262'));assert(filters.includes('pan=stereo'));assert(filters.includes('afade=t=in'));assert(filters.includes('afade=t=out'));
t=AP.set(t,'v','noiseReduction',5);assert.equal(AP.get(t,'v').noiseReduction,1);t=AP.set(t,'v','muted',true);assert.equal(AP.linearGain(AP.get(t,'v')),0);t=AP.reset(t,'v');assert.deepEqual(AP.get(t,'v'),AP.normalize());
const solo=TL.normalizeTimeline({tracks:[{id:'A1',kind:'audio',solo:false,clips:[]},{id:'A2',kind:'audio',solo:true,clips:[]}]});assert.deepEqual(AP.activeAudioTracks(solo).map(x=>x.id),['A2']);
console.log('professional audio tests passed');