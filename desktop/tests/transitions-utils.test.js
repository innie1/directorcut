const assert=require('assert');
const TL=require('../../prototype/timeline-engine');
const TR=require('../../prototype/transitions-utils');

const base=TL.normalizeTimeline({fps:30,tracks:[
  {id:'V1',kind:'video',clips:[
    TL.createClip({id:'v1',trackId:'V1',start:0,duration:4,sourceDuration:8,linkedId:'a1'}),
    TL.createClip({id:'v2',trackId:'V1',start:4,duration:4,sourceDuration:8,linkedId:'a2'})
  ]},
  {id:'A1',kind:'audio',clips:[
    TL.createClip({id:'a1',trackId:'A1',kind:'audio',start:0,duration:4,sourceDuration:8,linkedId:'v1'}),
    TL.createClip({id:'a2',trackId:'A1',kind:'audio',start:4,duration:4,sourceDuration:8,linkedId:'v2'})
  ]}
]});

const added=TR.add(base,'v1','v2','dissolve',.6);
assert.equal(added.transitions.length,1);
const t=added.transitions[0];
assert.equal(t.type,'dissolve');
assert(Math.abs(t.duration-.6)<.04);
assert(Math.abs(TL.findClip(added,'v2').clip.start-3.4)<.04);
assert(Math.abs(TL.findClip(added,'a2').clip.start-3.4)<.04);
const b=TR.bounds(added,t);
assert(Math.abs(b.start-3.4)<.04&&Math.abs(b.end-4)<.04);

const updated=TR.update(added,t.id,{type:'slide-left',duration:1});
assert.equal(updated.transitions[0].type,'slide-left');
assert(Math.abs(TL.findClip(updated,'v2').clip.start-3)<.04);
assert(Math.abs(TL.findClip(updated,'a2').clip.start-3)<.04);
assert.equal(TR.nativeSafe(updated),false);

const removed=TR.remove(updated,t.id);
assert.equal(removed.transitions.length,0);
assert(Math.abs(TL.findClip(removed,'v2').clip.start-4)<.04);
assert(Math.abs(TL.findClip(removed,'a2').clip.start-4)<.04);

const effects=TL.normalizeTimeline({fps:30,tracks:[{id:'V1',kind:'video',clips:[TL.createClip({id:'fx',effects:[{id:'color',type:'color',enabled:true,params:{exposure:1}}],audio:{pan:.2},text:{value:'hello'},motion:{preset:'pop'}})]}]});
const moved=TL.moveClip(effects,'fx',2,{snap:false});
const clip=TL.findClip(moved,'fx').clip;
assert.equal(clip.effects[0].params.exposure,1);
assert.equal(clip.audio.pan,.2);
assert.equal(clip.text.value,'hello');
assert.equal(clip.motion.preset,'pop');
console.log('transition and extensible clip tests passed');