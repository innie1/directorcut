const assert=require('assert');
const FX=require('../../prototype/effects-color-utils');

const timeline={tracks:[{id:'V1',kind:'video',clips:[{id:'v1',name:'clip',start:0,duration:4}]}]};

const defaults=FX.normalizeEffects(timeline.tracks[0].clips[0]);
assert.equal(defaults.find(e=>e.type==='color').params.contrast,1);
assert.equal(defaults.find(e=>e.type==='blur').enabled,false);

let next=FX.setEffectParam(timeline,'v1','color','exposure',1.5);
let clip=FX.findClip(next,'v1').clip;
assert.equal(FX.getEffect(clip,'color').params.exposure,1.5);
assert.equal(FX.hasVisualEffects(clip),true);

next=FX.setEffectParam(next,'v1','color','contrast',250/100);
clip=FX.findClip(next,'v1').clip;
assert.equal(FX.getEffect(clip,'color').params.contrast,2.5);

next=FX.setEffectParam(next,'v1','blur','radius',12);
clip=FX.findClip(next,'v1').clip;
assert.equal(FX.getEffect(clip,'blur').params.radius,12);
assert.equal(FX.getEffect(clip,'blur').enabled,true);

next=FX.setEffectParam(next,'v1','sharpen','amount',9);
clip=FX.findClip(next,'v1').clip;
assert.equal(FX.getEffect(clip,'sharpen').params.amount,3,'sharpen clamps to 300%');

next=FX.setEffectParam(next,'v1','vignette','amount',2);
clip=FX.findClip(next,'v1').clip;
assert.equal(FX.getEffect(clip,'vignette').params.amount,1,'vignette clamps to 100%');
assert.ok(FX.effectSummary(clip).some(x=>x.startsWith('Exposure')));
assert.ok(FX.effectSummary(clip).includes('Blur'));

next=FX.resetClipEffects(next,'v1');
clip=FX.findClip(next,'v1').clip;
assert.equal(FX.getEffect(clip,'color').params.exposure,0);
assert.equal(FX.getEffect(clip,'blur').enabled,false);
assert.equal(FX.hasVisualEffects(clip),false);

const withUnknown={...clip,effects:[...clip.effects,{id:'plugin-1',type:'third-party',enabled:true,params:{mix:.5}}]};
const normalized=FX.normalizeEffects(withUnknown);
assert.equal(normalized.find(e=>e.type==='third-party').params.mix,.5,'unknown future effects survive normalization');

console.log('effects and color utility tests passed');
