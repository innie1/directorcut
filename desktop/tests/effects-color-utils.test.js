const assert=require('assert');
const FX=require('../../prototype/effects-color-utils');

const timeline={tracks:[{id:'V1',kind:'video',clips:[{id:'v1',name:'clip',start:0,duration:4}]}]};

const defaults=FX.normalizeEffects(timeline.tracks[0].clips[0]);
assert.equal(defaults.find(e=>e.type==='color').params.contrast,1);
assert.equal(defaults.find(e=>e.type==='color').params.highlights,0);
assert.equal(defaults.find(e=>e.type==='color').params.shadows,0);
assert.equal(defaults.find(e=>e.type==='blur').enabled,false);
assert.equal(defaults.find(e=>e.type==='motionBlur').enabled,false);
assert.equal(defaults.find(e=>e.type==='lut').enabled,false);

let next=FX.setEffectParam(timeline,'v1','color','exposure',1.5);
let clip=FX.findClip(next,'v1').clip;
assert.equal(FX.getEffect(clip,'color').params.exposure,1.5);
assert.equal(FX.hasVisualEffects(clip),true);

next=FX.setEffectParam(next,'v1','color','contrast',250/100);
next=FX.setEffectParam(next,'v1','color','highlights',80);
next=FX.setEffectParam(next,'v1','color','shadows',-140);
clip=FX.findClip(next,'v1').clip;
assert.equal(FX.getEffect(clip,'color').params.contrast,2.5);
assert.equal(FX.getEffect(clip,'color').params.highlights,80);
assert.equal(FX.getEffect(clip,'color').params.shadows,-100,'shadows clamp to -100');

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

next=FX.setEffectParam(next,'v1','motionBlur','amount',.65);
clip=FX.findClip(next,'v1').clip;
assert.equal(FX.getEffect(clip,'motionBlur').enabled,true);
assert.equal(FX.getEffect(clip,'motionBlur').params.amount,.65);

next=FX.setEffectParam(next,'v1','lut','path','C:\\LUTs\\Cinematic.cube');
clip=FX.findClip(next,'v1').clip;
assert.equal(FX.getEffect(clip,'lut').enabled,true);
assert.equal(FX.getEffect(clip,'lut').params.path,'C:\\LUTs\\Cinematic.cube');
assert.equal(FX.shortPath(FX.getEffect(clip,'lut').params.path),'Cinematic.cube');
assert.ok(FX.effectSummary(clip).some(x=>x.startsWith('Exposure')));
assert.ok(FX.effectSummary(clip).includes('Blur'));
assert.ok(FX.effectSummary(clip).includes('Motion Blur'));
assert.ok(FX.effectSummary(clip).includes('LUT Cinematic.cube'));

next=FX.setEffectEnabled(next,'v1','lut',false);
clip=FX.findClip(next,'v1').clip;
assert.equal(FX.getEffect(clip,'lut').enabled,false);
assert.equal(FX.getEffect(clip,'lut').params.path,'C:\\LUTs\\Cinematic.cube','disabling preserves LUT choice');

next=FX.resetEffect(next,'v1','motionBlur');
clip=FX.findClip(next,'v1').clip;
assert.equal(FX.getEffect(clip,'motionBlur').enabled,false);
assert.equal(FX.getEffect(clip,'motionBlur').params.amount,0);

next=FX.resetClipEffects(next,'v1');
clip=FX.findClip(next,'v1').clip;
assert.equal(FX.getEffect(clip,'color').params.exposure,0);
assert.equal(FX.getEffect(clip,'color').params.highlights,0);
assert.equal(FX.getEffect(clip,'blur').enabled,false);
assert.equal(FX.getEffect(clip,'lut').params.path,'');
assert.equal(FX.hasVisualEffects(clip),false);

const withUnknown={...clip,effects:[...clip.effects,{id:'plugin-1',type:'third-party',enabled:true,params:{mix:.5}}]};
const normalized=FX.normalizeEffects(withUnknown);
assert.equal(normalized.find(e=>e.type==='third-party').params.mix,.5,'unknown future effects survive normalization');

console.log('effects and color utility tests passed');