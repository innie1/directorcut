const assert = require('assert');
const { buildTimelineManifest, ns, titleFields, visualLayerMap } = require('../timeline-manifest');

const project = {
  media:{ frameRate:24, width:1280, height:720 },
  timeline:{ fps:24, tracks:[
    { id:'C1', kind:'caption', clips:[{ id:'c1', name:'Hello world', start:.25, duration:1.5, text:{content:'Hello world',style:{fontFamily:'Arial',fontSize:42,color:'#ffeecc'},position:{x:.5,y:.82}} }] },
    { id:'V2', kind:'graphic', clips:[{ id:'g1', name:'Graphic overlay', sourcePath:'./graphic.mp4', start:.5, sourceIn:0, duration:1 }] },
    { id:'V1', kind:'video', hidden:false, clips:[{ id:'v1', sourcePath:'./sample one.mp4', start:0, sourceIn:1.25, duration:2.5, keyframes:{
      x:[{time:0,value:12},{time:1,value:30}], scale:[{time:0,value:1.1}], rotation:[{time:0,value:5}], opacity:[{time:0,value:.8},{time:1,value:.5}], speed:[{time:0,value:1.25}]
    }, effects:[
      {id:'color',type:'color',enabled:true,params:{exposure:1.2,contrast:1.1,saturation:1.3,temperature:20,tint:-10}},
      {id:'blur',type:'blur',enabled:true,params:{radius:4}}, {id:'sharpen',type:'sharpen',enabled:true,params:{amount:.5}}, {id:'vignette',type:'vignette',enabled:true,params:{amount:.25}}
    ] }] },
    { id:'A1', kind:'audio', muted:false, clips:[{ id:'a1', sourcePath:'./sample one.mp4', start:0, sourceIn:1.25, duration:2.5, keyframes:{ volume:[{time:0,value:.7}] } }] },
    { id:'V3', kind:'video', hidden:true, clips:[{ id:'hidden', sourcePath:'./hidden.mp4', start:0, sourceIn:0, duration:5 }] }
  ]}
};

const result = buildTimelineManifest(project);
assert.equal(result.fps,24);assert.equal(result.clips,3);assert.equal(result.videoClips,2);assert.equal(result.audioClips,1);assert.equal(result.titleClips,1);assert.equal(result.graphicClips,1);assert.equal(result.transitions,0);assert.equal(result.nativeTransitionSafe,true);
assert.equal(result.duration,2.5);assert.equal(result.canvasWidth,1280);assert.equal(result.canvasHeight,720);
assert.ok(result.text.startsWith('DIRECTORCUT_TIMELINE_V5\n'));assert.ok(result.text.includes('auto-transition\t0'));assert.ok(result.text.includes('canvas\t1280\t720'));
assert.ok(result.text.includes(`\t${ns(1.25)}\t${ns(2.5)}\t`));assert.ok(result.text.includes('sample%20one.mp4'));assert.ok(!result.text.includes('hidden.mp4'));
const clipLines=result.text.split('\n').filter(line=>line.startsWith('clip\t')),titleLines=result.text.split('\n').filter(line=>line.startsWith('title\t'));assert.equal(clipLines.length,3);assert.equal(titleLines.length,1);
const graphicLine=clipLines.find(line=>line.includes('graphic.mp4')),videoLine=clipLines.find(line=>line.includes('sample%20one.mp4')&&line.startsWith('clip\tvideo')),audioLine=clipLines.find(line=>line.startsWith('clip\taudio'));
assert(graphicLine&&videoLine&&audioLine);assert(Number(titleLines[0].split('\t')[1])<Number(graphicLine.split('\t')[2]),'captions must be above graphics');assert(Number(graphicLine.split('\t')[2])<Number(videoLine.split('\t')[2]),'graphics must be above primary video');
const videoFields=videoLine.split('\t'),audioFields=audioLine.split('\t');assert.equal(videoFields.length,24);assert(videoFields[9].includes(`${ns(0)}%3A12`)||decodeURIComponent(videoFields[9]).includes(`${ns(0)}:12`));assert.equal(decodeURIComponent(videoFields[11]),`${ns(0)}:1.1`);assert.equal(decodeURIComponent(videoFields[12]),`${ns(0)}:5`);assert.equal(decodeURIComponent(videoFields[14]),`${ns(0)}:1.25`);assert.equal(decodeURIComponent(audioFields[15]),`${ns(0)}:0.7`);assert.equal(Number(videoFields[16]),1.2);assert.equal(Number(videoFields[17]),1.1);assert.equal(Number(videoFields[18]),1.3);assert.equal(Number(videoFields[19]),20);assert.equal(Number(videoFields[20]),-10);assert.equal(Number(videoFields[21]),4);assert.equal(Number(videoFields[22]),.5);assert.equal(Number(videoFields[23]),.25);
const tf=titleLines[0].split('\t');assert.equal(decodeURIComponent(tf[5]),'Hello world');assert(decodeURIComponent(tf[6]).includes('Arial'));assert.equal(Number(tf[9]),.5);assert.equal(Number(tf[10]),.82);
assert.equal(titleFields({name:'Caption'},'caption').y,.86);const map=visualLayerMap(project.timeline);assert.equal(map.get('C1'),0);assert(map.get('V2')<map.get('V1'));

const dissolve={media:{width:640,height:360,frameRate:30},timeline:{fps:30,transitions:[{id:'tr',trackId:'V1',fromClipId:'a',toClipId:'b',type:'dissolve',duration:.5}],tracks:[{id:'V1',kind:'video',clips:[{id:'a',sourcePath:'./a.mp4',start:0,duration:2},{id:'b',sourcePath:'./b.mp4',start:1.5,duration:2}]}]}};
const dissolveManifest=buildTimelineManifest(dissolve);assert.equal(dissolveManifest.transitions,1);assert.equal(dissolveManifest.nativeTransitionSafe,true);assert.ok(dissolveManifest.text.includes('auto-transition\t1'));assert.ok(dissolveManifest.text.includes('transition\ttr\tV1\ta\tb\tdissolve'));
const slide=JSON.parse(JSON.stringify(dissolve));slide.timeline.transitions[0].type='slide-left';const slideManifest=buildTimelineManifest(slide);assert.equal(slideManifest.nativeTransitionSafe,false);assert.ok(slideManifest.text.includes('auto-transition\t0'));
console.log('timeline manifest V5 caption/graphic tests passed');
