const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runProcess, probeMedia } = require('../media-utils');
const { buildRenderPlan, buildFilterGraph, renderTimelineProject } = require('../timeline-renderer');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'directorcut-render-test-'));
  const a = path.join(temp, 'a.mp4'), b = path.join(temp, 'b.mp4'), out = path.join(temp, 'out.mp4');
  try {
    await runProcess('ffmpeg', ['-y','-f','lavfi','-i','color=c=red:s=320x180:r=30:d=2.5','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2.5','-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',a]);
    await runProcess('ffmpeg', ['-y','-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=2.5','-f','lavfi','-i','sine=frequency=660:sample_rate=48000:duration=2.5','-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',b]);

    const project = {
      media: { path:a, width:320, height:180, frameRate:'30/1', duration:2.5 },
      timeline: {
        fps:30,
        tracks:[
          { id:'V1', kind:'video', clips:[
            { id:'v1', sourcePath:a, start:0, duration:1.5, sourceIn:.2, sourceDuration:2.5, keyframes:{ scale:[{time:0,value:1},{time:1.4,value:1.15}], opacity:[{time:0,value:1},{time:1.4,value:.8}] } },
            { id:'v2', sourcePath:b, start:1.5, duration:1.5, sourceIn:.1, sourceDuration:2.5, keyframes:{} }
          ] },
          { id:'V2', kind:'video', clips:[
            { id:'overlay', sourcePath:b, start:.5, duration:.6, sourceIn:.3, sourceDuration:2.5, keyframes:{ opacity:[{time:0,value:.45},{time:.6,value:.15}] } }
          ] },
          { id:'A1', kind:'audio', clips:[
            { id:'a1', sourcePath:a, start:0, duration:1.5, sourceIn:.2, sourceDuration:2.5, keyframes:{ volume:[{time:0,value:.4},{time:1.4,value:.8}] } },
            { id:'a2', sourcePath:b, start:1.5, duration:1.5, sourceIn:.1, sourceDuration:2.5, keyframes:{} }
          ] }
        ]
      }
    };

    const plan = buildRenderPlan(project);
    assert.equal(plan.videoClips.length, 3);
    assert.equal(plan.audioClips.length, 2);
    assert(Math.abs(plan.duration - 3) < .01);

    const shortened = JSON.parse(JSON.stringify(project));
    shortened.media.duration = 60;
    shortened.duration = 60;
    shortened.timeline.tracks = [
      { id:'V1', kind:'video', clips:[{ id:'short-v', sourcePath:a, start:0, duration:1.2, sourceIn:.2, sourceDuration:2.5, keyframes:{} }] },
      { id:'A1', kind:'audio', clips:[{ id:'short-a', sourcePath:a, start:0, duration:1.2, sourceIn:.2, sourceDuration:2.5, keyframes:{} }] }
    ];
    const shortenedPlan = buildRenderPlan(shortened);
    assert(Math.abs(shortenedPlan.duration - 1.2) < .01, `shortened timeline inherited stale project/media duration: ${shortenedPlan.duration}`);

    const graph = buildFilterGraph(plan).graph;
    assert(graph.includes('split=2')); // source B is used by two video clips
    assert(graph.includes('[0:a]anull') && graph.includes('[1:a]anull')); // audio clips come from distinct sources
    assert(graph.includes('zoompan'));
    assert(graph.includes('geq='));
    assert(graph.includes('amix=inputs=2'));

    process.env.DIRECTORCUT_VIDEO_ENCODER = 'libx264';
    const rendered = await renderTimelineProject({ project, outputPath:out });
    assert.equal(rendered.videoClips, 3);
    assert.equal(rendered.audioClips, 2);
    assert(fs.existsSync(out));
    const media = await probeMedia(out);
    assert.equal(media.width, 320);
    assert.equal(media.height, 180);
    assert(media.hasAudio);
    assert(media.duration > 2.8 && media.duration < 3.2, `unexpected duration ${media.duration}`);
    console.log('timeline renderer smoke test passed');
  } finally {
    delete process.env.DIRECTORCUT_VIDEO_ENCODER;
    fs.rmSync(temp, { recursive:true, force:true });
  }
})().catch(error => { console.error(error); process.exit(1); });
