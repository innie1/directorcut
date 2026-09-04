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
        transitions:[{id:'tr1',trackId:'V1',fromClipId:'v1',toClipId:'v2',type:'dissolve',duration:.5}],
        tracks:[
          { id:'V1', kind:'video', clips:[
            { id:'v1', linkedId:'a1', sourcePath:a, start:0, duration:1.5, sourceIn:.2, sourceDuration:2.5,
              keyframes:{ scale:[{time:0,value:1},{time:1.4,value:1.15}], opacity:[{time:0,value:1},{time:1.4,value:.8}], x:[{time:0,value:8}], y:[{time:0,value:-4}], rotation:[{time:0,value:3}], speed:[{time:0,value:1.2}] },
              effects:[
                {id:'color',type:'color',enabled:true,params:{exposure:.8,contrast:1.15,saturation:1.2,temperature:25,tint:-12}},
                {id:'blur',type:'blur',enabled:true,params:{radius:1}},
                {id:'sharpen',type:'sharpen',enabled:true,params:{amount:.35}},
                {id:'vignette',type:'vignette',enabled:true,params:{amount:.25}}
              ] },
            { id:'v2', linkedId:'a2', sourcePath:b, start:1.0, duration:1.5, sourceIn:.1, sourceDuration:2.5, keyframes:{} }
          ] },
          { id:'V2', kind:'video', clips:[
            { id:'overlay', sourcePath:b, start:.5, duration:.6, sourceIn:.3, sourceDuration:2.5, keyframes:{ opacity:[{time:0,value:.45},{time:.6,value:.15}] } }
          ] },
          { id:'A1', kind:'audio', clips:[
            { id:'a1', linkedId:'v1', sourcePath:a, start:0, duration:1.5, sourceIn:.2, sourceDuration:2.5, keyframes:{ volume:[{time:0,value:.4},{time:1.4,value:.8}], speed:[{time:0,value:1.2}] } },
            { id:'a2', linkedId:'v2', sourcePath:b, start:1.0, duration:1.5, sourceIn:.1, sourceDuration:2.5, keyframes:{} }
          ] }
        ]
      }
    };

    const plan = buildRenderPlan(project);
    assert.equal(plan.videoClips.length, 3);
    assert.equal(plan.audioClips.length, 2);
    assert.equal(plan.transitions.length, 1);
    assert(Math.abs(plan.duration - 2.5) < .01);

    const shortened = JSON.parse(JSON.stringify(project));
    shortened.media.duration = 60;
    shortened.duration = 60;
    shortened.timeline.transitions=[];
    shortened.timeline.tracks = [
      { id:'V1', kind:'video', clips:[{ id:'short-v', sourcePath:a, start:0, duration:1.2, sourceIn:.2, sourceDuration:2.5, keyframes:{} }] },
      { id:'A1', kind:'audio', clips:[{ id:'short-a', sourcePath:a, start:0, duration:1.2, sourceIn:.2, sourceDuration:2.5, keyframes:{} }] }
    ];
    const shortenedPlan = buildRenderPlan(shortened);
    assert(Math.abs(shortenedPlan.duration - 1.2) < .01, `shortened timeline inherited stale project/media duration: ${shortenedPlan.duration}`);

    const graph = buildFilterGraph(plan).graph;
    assert(graph.includes('split=2'));
    assert(graph.includes('[0:a]anull') && graph.includes('[1:a]anull'));
    assert(graph.includes('eq=brightness='));
    assert(graph.includes('colorchannelmixer='));
    assert(graph.includes('gblur=sigma='));
    assert(graph.includes('unsharp=5:5:'));
    assert(graph.includes('vignette=angle='));
    assert(graph.includes('zoompan'));
    assert(graph.includes('geq='));
    assert(graph.includes('rotate=angle='));
    assert(graph.includes('crop=320:180'));
    assert(graph.includes('setpts=(PTS-STARTPTS)/1.200000'));
    assert(graph.includes('atempo=1.200000'));
    assert(graph.includes('fade=t=in:st=0:d=0.500000:alpha=1'));
    assert(graph.includes('afade=t=out:st=1.000000:d=0.500000'));
    assert(graph.includes('afade=t=in:st=0:d=0.500000'));
    assert(graph.includes('amix=inputs=2'));

    const slideProject=JSON.parse(JSON.stringify(project));
    slideProject.timeline.transitions[0].type='slide-left';
    const slideGraph=buildFilterGraph(buildRenderPlan(slideProject)).graph;
    assert(slideGraph.includes("main_w*(1-(min(1,max(0,(t-1.000000)/0.500000))))"));

    process.env.DIRECTORCUT_VIDEO_ENCODER = 'libx264';
    const rendered = await renderTimelineProject({ project, outputPath:out });
    assert.equal(rendered.videoClips, 3);
    assert.equal(rendered.audioClips, 2);
    assert.equal(rendered.transitions, 1);
    assert(fs.existsSync(out));
    const media = await probeMedia(out);
    assert.equal(media.width, 320);
    assert.equal(media.height, 180);
    assert(media.hasAudio);
    assert(media.duration > 2.3 && media.duration < 2.7, `unexpected duration ${media.duration}`);
    console.log('timeline renderer transition smoke test passed');
  } finally {
    delete process.env.DIRECTORCUT_VIDEO_ENCODER;
    fs.rmSync(temp, { recursive:true, force:true });
  }
})().catch(error => { console.error(error); process.exit(1); });