const assert = require('assert');
const TL = require('../../prototype/timeline-engine.js');
const MU = require('../../prototype/media-library-utils.js');

const empty = TL.normalizeTimeline({ fps:30, tracks:[
  { id:'V1', name:'V1 Video', kind:'video', clips:[] },
  { id:'A1', name:'A1 Audio', kind:'audio', clips:[] }
]});

const a = { libraryId:'a', name:'A.mp4', path:'/tmp/a.mp4', duration:4, hasAudio:true };
const b = { libraryId:'b', name:'B.mp4', path:'/tmp/b.mp4', duration:3, hasAudio:true };

const library = MU.mergeLibrary([a],[b,a]);
assert.strictEqual(library.length,2,'library keeps multiple unique imports without replacing the first');
assert.strictEqual(library[0].name,'A.mp4');
assert.strictEqual(library[1].name,'B.mp4');

let timeline = MU.appendMedia(empty,a,{idSeed:'a1'});
timeline = MU.appendMedia(timeline,b,{idSeed:'b1'});
const v = timeline.tracks.find(t=>t.kind==='video').clips;
const aud = timeline.tracks.find(t=>t.kind==='audio').clips;
assert.strictEqual(v.length,2,'append preserves existing video clip');
assert.strictEqual(aud.length,2,'append preserves existing linked audio clip');
assert.strictEqual(v[0].sourcePath,'/tmp/a.mp4');
assert.strictEqual(v[1].sourcePath,'/tmp/b.mp4');
assert(Math.abs(v[1].start - 4) < 1e-6,'second clip appends after first clip');
assert.strictEqual(v[0].linkedId,aud[0].id);
assert.strictEqual(v[1].linkedId,aud[1].id);

const c = { libraryId:'c', name:'C.mp4', path:'/tmp/c.mp4', duration:2, hasAudio:true };
const inserted = MU.insertMedia(timeline,c,2,{idSeed:'c1'});
const iv = inserted.tracks.find(t=>t.kind==='video').clips;
assert.strictEqual(iv.length,4,'insert splits the clip under playhead and adds new media');
const insertedClip = iv.find(clip=>clip.sourcePath==='/tmp/c.mp4');
assert(insertedClip,'inserted media exists');
assert(Math.abs(insertedClip.start-2)<1e-6,'inserted clip begins at playhead');
const tailOfA = iv.find(clip=>clip.sourcePath==='/tmp/a.mp4' && clip.sourceIn > 0);
assert(tailOfA,'original clip tail is preserved after insertion');
assert(tailOfA.start >= 4-1e-6,'existing tail moves right instead of being overwritten');
const bAfter = iv.find(clip=>clip.sourcePath==='/tmp/b.mp4');
assert(bAfter.start >= 6-1e-6,'later media moves right on insert');

console.log('media library utilities ok');
