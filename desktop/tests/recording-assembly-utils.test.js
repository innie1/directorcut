const assert = require('assert');
const RA = require('../../prototype/recording-assembly-utils');
const TL = require('../../prototype/timeline-engine');
const MU = require('../../prototype/media-library-utils');

const session = {
  id:'session-assembly',
  scenes:[
    { sceneId:'s1', text:'Opening line', purpose:'Hook', performance:'Strong', status:'complete', acceptedTakeId:'t1', takes:[{id:'t1',takeNumber:2,status:'accepted',duration:4,media:{path:'/tmp/a.webm',duration:4,name:'A',hasAudio:true}}] },
    { sceneId:'s2', text:'Optional bridge', purpose:'Bridge', status:'skipped', takes:[] },
    { sceneId:'s3', text:'Closing line', purpose:'CTA', performance:'Confident', status:'complete', acceptedTakeId:'t3', takes:[{id:'t3',takeNumber:1,status:'accepted',duration:3.5,media:{path:'/tmp/c.webm',duration:3.5,name:'C',hasAudio:true}}] }
  ]
};

const aligned=RA.alignment(session);
assert.equal(aligned.length,3);
assert.equal(aligned[0].sceneNumber,1);
assert.equal(aligned[0].takeId,'t1');
assert.equal(aligned[1].sceneStatus,'skipped');
assert.equal(aligned[2].scriptText,'Closing line');

const accepted=RA.acceptedRows(session);
assert.deepEqual(accepted.map(row=>row.takeId),['t1','t3']);
const summary=RA.summary(session);
assert.equal(summary.accepted,2);
assert.equal(summary.skipped,1);
assert.equal(summary.missing,0);
assert.equal(summary.ready,true);

const plan=RA.plan(session,10);
assert.equal(plan.start,10);
assert.equal(plan.items.length,2);
assert.equal(plan.items[0].start,10);
assert.equal(plan.items[0].end,14);
assert.equal(plan.items[1].start,14);
assert.equal(plan.items[1].end,17.5);
assert.equal(plan.duration,7.5);
assert.deepEqual(plan.missing,[]);

const media=RA.alignedMedia(plan.items[0],session);
assert.equal(media.recordingAlignment.sceneId,'s1');
assert.equal(media.recordingAlignment.scriptText,'Opening line');
assert.equal(media.recordingAlignment.takeNumber,2);
assert.equal(media.recording.accepted,true);
const clip=RA.clipAlignment(plan.items[1],session);
assert.equal(clip.sceneNumber,3);
assert.equal(clip.takeId,'t3');

const emptyTimeline=TL.normalizeTimeline({fps:30,tracks:[
  {id:'V1',name:'V1 Video',kind:'video',clips:[]},
  {id:'A1',name:'A1 Dialogue',kind:'audio',clips:[]}
]});
const assembled=RA.assembleTimeline(emptyTimeline,session,{mediaLibraryUtils:MU,timelineUtils:TL,assemblyId:'rough-1'});
assert.equal(assembled.plan.items.length,2);
assert.equal(assembled.media.length,2);
assert.equal(TL.duration(assembled.timeline),7.5);
const videoTrack=assembled.timeline.tracks.find(track=>track.kind==='video');
const audioTrack=assembled.timeline.tracks.find(track=>track.kind==='audio');
assert.equal(videoTrack.clips.length,2);
assert.equal(audioTrack.clips.length,2);
assert.equal(videoTrack.clips[0].start,0);
assert.equal(videoTrack.clips[0].duration,4);
assert.equal(videoTrack.clips[1].start,4);
assert.equal(videoTrack.clips[1].duration,3.5);
assert.equal(videoTrack.clips[0].linkedId,audioTrack.clips[0].id);
assert.equal(audioTrack.clips[0].linkedId,videoTrack.clips[0].id);
assert.equal(videoTrack.clips[0].recordingAlignment.scriptText,'Opening line');
assert.equal(videoTrack.clips[1].recordingAlignment.sceneNumber,3);
assert.equal(videoTrack.clips[1].assemblyId,'rough-1');
assert.deepEqual(assembled.clipIds,['rough-1-001-t1-v','rough-1-001-t1-a','rough-1-003-t3-v','rough-1-003-t3-a']);

const baseWithExisting=MU.appendMedia(emptyTimeline,{path:'/tmp/existing.webm',name:'Existing',duration:2,hasAudio:true},{idSeed:'existing'});
const appended=RA.assembleTimeline(baseWithExisting,session,{mediaLibraryUtils:MU,timelineUtils:TL,assemblyId:'rough-2'});
const appendedVideo=appended.timeline.tracks.find(track=>track.kind==='video').clips;
assert.equal(appendedVideo.find(item=>item.id==='rough-2-001-t1-v').start,2,'assembly must append after existing edit');
assert.equal(appendedVideo.find(item=>item.id==='rough-2-003-t3-v').start,6);
assert.equal(TL.duration(appended.timeline),9.5);

const fingerprint1=RA.fingerprint(session);
const changed=JSON.parse(JSON.stringify(session));
changed.scenes[2].takes.push({id:'t4',takeNumber:2,status:'accepted',duration:3.4,media:{path:'/tmp/d.webm',duration:3.4}});
changed.scenes[2].acceptedTakeId='t4';
changed.scenes[2].takes[0].status='candidate';
const fingerprint2=RA.fingerprint(changed);
assert.notEqual(fingerprint2,fingerprint1,'changing the accepted take must produce a new assembly version');

const incomplete=JSON.parse(JSON.stringify(session));
incomplete.scenes[2].status='pending';
incomplete.scenes[2].acceptedTakeId=null;
incomplete.scenes[2].takes[0].status='candidate';
const incompleteSummary=RA.summary(incomplete);
assert.equal(incompleteSummary.ready,false);
assert.equal(incompleteSummary.missing,1);
assert.deepEqual(RA.plan(incomplete,0).missing,[3]);
assert.throws(()=>RA.assembleTimeline(emptyTimeline,incomplete,{mediaLibraryUtils:MU,timelineUtils:TL,assemblyId:'bad'}),/missing accepted takes/i);

console.log('recording assembly alignment and timeline tests passed');
