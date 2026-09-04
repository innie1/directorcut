const assert = require('assert');
const { buildTimelineManifest, ns } = require('../timeline-manifest');

const project = {
  media:{ frameRate:24, width:1280, height:720 },
  timeline:{ fps:24, tracks:[
    { id:'V1', kind:'video', hidden:false, clips:[{ id:'v1', sourcePath:'./sample one.mp4', start:0, sourceIn:1.25, duration:2.5, keyframes:{
      x:[{time:0,value:12},{time:1,value:30}],
      scale:[{time:0,value:1.1}],
      rotation:[{time:0,value:5}],
      opacity:[{time:0,value:.8},{time:1,value:.5}],
      speed:[{time:0,value:1.25}]
    } }] },
    { id:'A1', kind:'audio', muted:false, clips:[{ id:'a1', sourcePath:'./sample one.mp4', start:0, sourceIn:1.25, duration:2.5, keyframes:{ volume:[{time:0,value:.7}] } }] },
    { id:'V2', kind:'video', hidden:true, clips:[{ id:'hidden', sourcePath:'./hidden.mp4', start:0, sourceIn:0, duration:5 }] }
  ]}
};

const result = buildTimelineManifest(project);
assert.equal(result.fps, 24);
assert.equal(result.clips, 2);
assert.equal(result.duration, 2.5);
assert.equal(result.canvasWidth, 1280);
assert.equal(result.canvasHeight, 720);
assert.ok(result.text.startsWith('DIRECTORCUT_TIMELINE_V2\n'));
assert.ok(result.text.includes('canvas\t1280\t720'));
assert.ok(result.text.includes(`\t${ns(1.25)}\t${ns(2.5)}\t`));
assert.ok(result.text.includes('sample%20one.mp4'));
assert.ok(!result.text.includes('hidden.mp4'));
const clipLines = result.text.split('\n').filter(line => line.startsWith('clip\t'));
assert.equal(clipLines.length, 2);
assert.notEqual(clipLines[0].split('\t')[2], clipLines[1].split('\t')[2], 'video and audio editor tracks must map to distinct GES layers');
const videoFields = clipLines[0].split('\t');
const audioFields = clipLines[1].split('\t');
assert.equal(videoFields.length, 16);
assert(videoFields[9].includes(`${ns(0)}%3A12`) || decodeURIComponent(videoFields[9]).includes(`${ns(0)}:12`));
assert.equal(decodeURIComponent(videoFields[11]), `${ns(0)}:1.1`);
assert.equal(decodeURIComponent(videoFields[12]), `${ns(0)}:5`);
assert.equal(decodeURIComponent(videoFields[14]), `${ns(0)}:1.25`);
assert.equal(decodeURIComponent(audioFields[15]), `${ns(0)}:0.7`);
console.log('timeline manifest tests passed');
