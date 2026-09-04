const assert = require('assert');
const RS = require('../../prototype/recording-director-utils');

const scenes = [
  { text:'Open with the strongest line.', purpose:'Hook', performance:'Direct, controlled delivery', dur:4 },
  { text:'Explain the evidence clearly.', purpose:'Evidence', performance:'Natural pace', dur:7 },
  { text:'End with the call to action.', purpose:'CTA', performance:'Confident close', dur:3 }
];

let session = RS.createSession({ projectName:'Stage 7 Test', scenes });
assert.equal(session.scenes.length, 3);
assert.equal(session.activeSceneIndex, 0);
assert.equal(RS.progress(session).percent, 0);
assert.equal(RS.activeScene(session).purpose, 'Hook');

const firstId = session.scenes[0].sceneId;
session = RS.addTake(session, firstId, { id:'take-1', path:'/tmp/take-1.webm', duration:3.8, media:{ path:'/tmp/take-1.webm', duration:3.8 } });
assert.equal(session.scenes[0].takes.length, 1);
assert.equal(session.scenes[0].takes[0].status, 'candidate');
session = RS.rejectTake(session, firstId, 'take-1');
assert.equal(session.scenes[0].takes[0].status, 'rejected');

session = RS.addTake(session, firstId, { id:'take-2', path:'/tmp/take-2.webm', duration:4.1, media:{ path:'/tmp/take-2.webm', duration:4.1 } });
session = RS.acceptTake(session, firstId, 'take-2');
assert.equal(session.scenes[0].status, 'complete');
assert.equal(session.scenes[0].acceptedTakeId, 'take-2');
assert.equal(session.activeSceneIndex, 1);
assert.equal(RS.progress(session).complete, 1);

const secondId = session.scenes[1].sceneId;
session = RS.skipScene(session, secondId);
assert.equal(session.scenes[1].status, 'skipped');
assert.equal(session.activeSceneIndex, 2);
assert.equal(RS.progress(session).percent, 67);

session = RS.pause(session);
assert.equal(session.status, 'paused');
session = RS.resume(session);
assert.equal(session.status, 'active');
assert.equal(session.activeSceneIndex, 2);

const thirdId = session.scenes[2].sceneId;
session = RS.addTake(session, thirdId, { id:'take-3', duration:3.2, media:{ path:'/tmp/take-3.webm', duration:3.2 } });
session = RS.acceptTake(session, thirdId, 'take-3');
assert.equal(session.status, 'complete');
assert.equal(RS.progress(session).percent, 100);

const resumed = RS.createSession({ projectName:'Stage 7 Test', scenes, previous:session });
assert.equal(resumed.scenes[0].acceptedTakeId, 'take-2');
assert.equal(resumed.scenes[2].acceptedTakeId, 'take-3');
assert.equal(resumed.status, 'complete');

const changed = RS.createSession({ projectName:'Stage 7 Test', scenes:[...scenes, { text:'A new ending.', purpose:'Alt ending' }], previous:session });
assert.equal(changed.scenes.length, 4);
assert.equal(changed.scenes[0].takes.length, 0, 'script changes must start a fresh recording session');
assert.notEqual(changed.id, session.id);

const fromScript = RS.createSession({ projectName:'Script only', script:'First paragraph.\n\nSecond paragraph.' });
assert.equal(fromScript.scenes.length, 2);
assert.equal(fromScript.scenes[0].text, 'First paragraph.');

console.log('recording director session tests passed');
