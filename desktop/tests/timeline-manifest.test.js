const assert = require('assert');
const { buildTimelineManifest, ns } = require('../timeline-manifest');

const project = {
  media:{ frameRate:24 },
  timeline:{ fps:24, tracks:[
    { id:'V1', kind:'video', hidden:false, clips:[{ id:'v1', sourcePath:'./sample one.mp4', start:0, sourceIn:1.25, duration:2.5 }] },
    { id:'A1', kind:'audio', muted:false, clips:[{ id:'a1', sourcePath:'./sample one.mp4', start:0, sourceIn:1.25, duration:2.5 }] },
    { id:'V2', kind:'video', hidden:true, clips:[{ id:'hidden', sourcePath:'./hidden.mp4', start:0, sourceIn:0, duration:5 }] }
  ]}
};

const result = buildTimelineManifest(project);
assert.equal(result.fps, 24);
assert.equal(result.clips, 2);
assert.equal(result.duration, 2.5);
assert.ok(result.text.startsWith('DIRECTORCUT_TIMELINE_V1\n'));
assert.ok(result.text.includes(`\t${ns(1.25)}\t${ns(2.5)}\t`));
assert.ok(result.text.includes('sample%20one.mp4'));
assert.ok(!result.text.includes('hidden.mp4'));
const clipLines = result.text.split('\n').filter(line => line.startsWith('clip\t'));
assert.equal(clipLines.length, 2);
assert.notEqual(clipLines[0].split('\t')[2], clipLines[1].split('\t')[2], 'video and audio editor tracks must map to distinct GES layers');
console.log('timeline manifest tests passed');
