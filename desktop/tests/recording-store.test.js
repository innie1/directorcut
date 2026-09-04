const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runProcess } = require('../media-utils');
const { RecordingStore, extensionForMime, safePart, bufferFromChunk } = require('../recording-store');

(async () => {
  assert.equal(extensionForMime('video/webm;codecs=vp9,opus'), '.webm');
  assert.equal(extensionForMime('video/mp4'), '.mp4');
  assert.equal(safePart('My Project / Scene #1'), 'My-Project-Scene-1');
  assert.equal(bufferFromChunk(new Uint8Array([1,2,3])).length, 3);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'directorcut-recording-store-test-'));
  try {
    const source = path.join(temp, 'source.webm');
    await runProcess('ffmpeg', [
      '-hide_banner','-loglevel','error','-y',
      '-f','lavfi','-i','testsrc=size=320x180:rate=24',
      '-f','lavfi','-i','sine=frequency=520:sample_rate=48000',
      '-t','0.9','-c:v','libvpx','-deadline','realtime','-cpu-used','8','-c:a','libvorbis',source
    ]);
    const sourceBytes = fs.readFileSync(source);
    assert(sourceBytes.length > 1000);

    const store = new RecordingStore({ root:path.join(temp, 'recordings') });
    const started = store.start({ projectName:'My Project', sessionId:'session-1', sceneId:'scene-1', takeNumber:2, mimeType:'video/webm;codecs=vp8,opus' });
    assert(started.recordingId.startsWith('rec-'));
    assert(started.path.endsWith('.webm'));

    let offset = 0;
    const chunkSizes = [97, 4096, 12345, 6553, 271];
    let chunkIndex = 0;
    while (offset < sourceBytes.length) {
      const size = chunkSizes[chunkIndex++ % chunkSizes.length];
      const end = Math.min(sourceBytes.length, offset + size);
      const slice = sourceBytes.subarray(offset, end);
      const payload = new Uint8Array(slice.length);
      payload.set(slice);
      store.append(started.recordingId, payload);
      offset = end;
    }

    const finished = await store.finish(started.recordingId);
    assert.equal(finished.bytes, sourceBytes.length);
    assert(fs.existsSync(finished.path));
    assert(finished.media.duration > 0.6, `expected a playable recording, got ${finished.media.duration}s`);
    assert.equal(finished.media.source, 'recording');
    assert.equal(finished.media.path, finished.path);

    const reconstructed = fs.readFileSync(finished.path);
    assert.equal(Buffer.compare(reconstructed, sourceBytes), 0, 'streamed chunks must reconstruct the exact MediaRecorder byte stream');

    const canceled = store.start({ projectName:'My Project', sessionId:'session-1', sceneId:'scene-2', takeNumber:1, mimeType:'video/webm' });
    store.append(canceled.recordingId, Buffer.from([1,2,3,4]));
    const canceledPath = canceled.path;
    assert.equal(store.cancel(canceled.recordingId), true);
    assert.equal(fs.existsSync(canceledPath), false);
    store.dispose();

    console.log('recording store real WebM tests passed');
  } finally {
    fs.rmSync(temp, { recursive:true, force:true });
  }
})().catch(error => { console.error(error); process.exit(1); });
