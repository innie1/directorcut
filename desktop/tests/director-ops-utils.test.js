const assert=require('assert');
const TL=require('../../prototype/timeline-engine');
const D=require('../../prototype/director-ops-utils');

const empty=()=>TL.normalizeTimeline({fps:30,tracks:[
  {id:'V1',kind:'video',clips:[]},{id:'A1',kind:'audio',clips:[]},{id:'C1',kind:'caption',clips:[]}
]});
const library=[
  {libraryId:'m1',name:'intro.mp4',path:'/tmp/intro.mp4',url:'file:///tmp/intro.mp4',duration:6,hasAudio:true},
  {libraryId:'m2',name:'city b-roll.mp4',path:'/tmp/city.mp4',url:'file:///tmp/city.mp4',duration:5,hasAudio:true}
];
const videoClips=t=>t.tracks.find(x=>x.kind==='video').clips;
const captionClips=t=>t.tracks.find(x=>x.kind==='caption').clips;

// --- resolving media the way a small local model would name it ---------------
assert.equal(D.resolveMedia(library,'m2').libraryId,'m2','resolves by id');
assert.equal(D.resolveMedia(library,'intro.mp4').libraryId,'m1','resolves by exact name');
assert.equal(D.resolveMedia(library,'city').libraryId,'m2','resolves by partial name');
assert.equal(D.resolveMedia(library,'use the intro.mp4 clip').libraryId,'m1','resolves inside a phrase');
assert.equal(D.resolveMedia(library,'').libraryId,'m1','empty reference falls back to the first item');
assert.equal(D.resolveMedia([],'m1'),null,'empty library resolves to nothing');

// --- add_clip ---------------------------------------------------------------
let t=D.addClip(empty(),library[0],{mode:'append'});
assert.equal(videoClips(t).length,1,'append places a video clip');
assert.equal(t.tracks.find(x=>x.kind==='audio').clips.length,1,'append places the linked audio');
assert(Math.abs(TL.duration(t)-6)<.05,'timeline is as long as the placed clip');

t=D.addClip(t,library[1],{mode:'append'});
assert.equal(videoClips(t).length,2,'second append adds after the first');
assert(Math.abs(TL.duration(t)-11)<.05,'appends are sequential, not stacked');
assert(Math.abs(videoClips(t).sort((a,b)=>a.start-b.start)[1].start-6)<.05,'second clip starts where the first ends');

const inserted=D.addClip(t,library[0],{mode:'insert',time:2});
assert(TL.duration(inserted)>TL.duration(t),'insert lengthens the timeline');

// --- captions and titles ----------------------------------------------------
t=D.addCaption(t,{text:'Hello Lagos',start:1,duration:2});
assert.equal(captionClips(t).length,1,'caption lands on the caption track');
assert.equal(captionClips(t)[0].text.content,'Hello Lagos','caption keeps its text');
assert(Math.abs(captionClips(t)[0].start-1)<1e-6,'caption starts where asked');

const titled=D.addTitle(empty(),{text:'Opening Title',start:0,duration:3,motion:'pop-in'});
const title=captionClips(titled)[0];
assert.equal(title.text.content,'Opening Title','title is a caption clip');
assert(title.keyframes&&title.keyframes.scale&&title.keyframes.scale.length>=3,'title carries its motion keyframes');
assert(title.keyframes.opacity.length>=2,'title fades in');

// --- motion presets ---------------------------------------------------------
assert(D.MOTION_PRESETS.includes('ken-burns')&&D.MOTION_PRESETS.length>=10,'a useful preset library ships');
let m=D.addClip(empty(),library[0],{mode:'append'});
const clipId=videoClips(m)[0].id;
for(const preset of D.MOTION_PRESETS){
  const out=D.applyMotion(m,clipId,preset);
  const kf=TL.findClip(out,clipId).clip.keyframes||{};
  const total=Object.values(kf).reduce((n,list)=>n+list.length,0);
  assert(total>=2,`${preset} writes keyframes`);
}
const kb=D.applyMotion(m,clipId,'ken-burns');
const kbClip=TL.findClip(kb,clipId).clip;
assert(kbClip.keyframes.scale.length===2&&kbClip.keyframes.x.length===2,'ken-burns animates scale and position');
const last=kbClip.keyframes.scale[kbClip.keyframes.scale.length-1];
assert(Math.abs(last.time-6)<.2,'motion spans the whole clip by default');
const half=D.applyMotion(m,clipId,'fade-in',{duration:1});
const halfKf=TL.findClip(half,clipId).clip.keyframes.opacity;
assert(Math.abs(halfKf[halfKf.length-1].time-1)<.05,'an explicit duration shortens the animation');
assert.deepEqual(D.applyMotion(m,'nope','fade-in'),m,'unknown clip is a no-op');
assert.deepEqual(D.applyMotion(m,clipId,'not-a-preset'),m,'unknown preset is a no-op');

// --- transitions ------------------------------------------------------------
let two=D.addClip(D.addClip(empty(),library[0],{mode:'append'}),library[1],{mode:'append'});
const pairs=D.videoPairs(two);
assert.equal(pairs.length,1,'two clips make one boundary');
const withT=D.addTransition(two,pairs[0][0],pairs[0][1],'dissolve',.6);
assert.equal(withT.transitions.length,1,'transition is recorded');
assert.equal(withT.transitions[0].type,'dissolve','transition type is kept');

let three=D.addClip(two,library[0],{mode:'append'});
const allT=D.addTransitionsBetweenAll(three,'dip-black',.4);
assert.equal(allT.transitions.length,2,'every boundary gets a transition');
assert.deepEqual(D.addTransition(two,'', 'x'),two,'missing ids are a no-op');

// --- end to end: script -> full rough cut ------------------------------------
const scenes=[
  {text:'We open on the market at dawn.',dur:3},
  {text:'A trader lays out the day’s stock.',dur:2},
  {text:'Cut to the street coming alive.',dur:3}
];
const built=D.assembleFromScript(empty(),{scenes,library,captions:true,transition:'dissolve',transitionDuration:.4});
assert.equal(built.placed,3,'one clip per scene');
assert.equal(built.captioned,3,'one caption per scene');
assert.equal(built.transitions,2,'dissolves between the three scenes');
assert.equal(videoClips(built.timeline).length,3,'three video clips on the timeline');
assert.equal(captionClips(built.timeline).length,3,'three captions on the timeline');
assert(TL.duration(built.timeline)>4,'the assembled cut has real length');
assert.equal(captionClips(built.timeline)[0].text.content,scenes[0].text,'captions carry the script lines');
// scene durations are honoured
const ordered=videoClips(built.timeline).sort((a,b)=>a.start-b.start);
assert(Math.abs(ordered[0].duration-3)<.1,'scene duration trims the placed clip');
assert(Math.abs(ordered[1].duration-2)<.1,'second scene duration honoured');
// media cycles when there are fewer clips than scenes
assert(new Set(ordered.map(c=>c.name)).size<=library.length,'media is reused across scenes');

const noMedia=D.assembleFromScript(empty(),{scenes,library:[]});
assert.equal(noMedia.placed,0,'no media means nothing is assembled');
assert.deepEqual(noMedia.timeline,empty(),'and the timeline is untouched');
const noScenes=D.assembleFromScript(empty(),{scenes:[],library});
assert.equal(noScenes.placed,0,'no scenes means nothing is assembled');

console.log('director-ops-utils: all assertions passed');
