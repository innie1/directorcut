const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {runProcess,probeMedia}=require('../media-utils');
const Base=require('../timeline-renderer');
const {renderTimelineProject}=require('../timeline-renderer-stage4');

const IDENTITY_CUBE=`TITLE "DirectorCut Identity"
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`;

(async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'directorcut-stage5-'));
  const src=path.join(temp,'source.mp4'),lutDir=path.join(temp,'lut files'),lut=path.join(lutDir,'identity look.cube'),out=path.join(temp,'stage5.mp4');
  fs.mkdirSync(lutDir,{recursive:true});
  fs.writeFileSync(lut,IDENTITY_CUBE,'utf8');
  try{
    await runProcess('ffmpeg',['-y','-f','lavfi','-i','testsrc2=size=320x180:rate=30:duration=2','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',src]);
    const project={media:{path:src,width:320,height:180,frameRate:'30/1',duration:2},timeline:{fps:30,tracks:[
      {id:'V1',kind:'video',clips:[{id:'v1',sourcePath:src,start:0,duration:2,sourceIn:0,sourceDuration:2,keyframes:{},effects:[
        {id:'color',type:'color',enabled:true,params:{exposure:.35,contrast:1.08,saturation:1.12,temperature:12,tint:-7,highlights:55,shadows:-35}},
        {id:'lut',type:'lut',enabled:true,params:{path:lut}},
        {id:'blur',type:'blur',enabled:true,params:{radius:1}},
        {id:'sharpen',type:'sharpen',enabled:true,params:{amount:.2}},
        {id:'vignette',type:'vignette',enabled:true,params:{amount:.15}},
        {id:'motion-blur',type:'motionBlur',enabled:true,params:{amount:.45}}
      ]}]},
      {id:'A1',kind:'audio',clips:[{id:'a1',sourcePath:src,start:0,duration:2,sourceIn:0,sourceDuration:2,keyframes:{}}]}
    ]}};
    const plan=Base.buildRenderPlan(project),built=Base.buildFilterGraph(plan),graph=built.graph;
    assert(graph.includes("curves=all='0/0 0.25/"),'highlights/shadows must use tonal curves');
    assert(graph.includes('lut3d=file='),'LUT must be in final filter graph');
    assert(graph.includes('identity look.cube'),'LUT path with spaces must survive graph construction');
    assert(graph.includes('tmix=frames='),'motion blur must use temporal mixing');
    assert(graph.includes('gblur=sigma='));
    assert(graph.includes('unsharp='));
    assert(graph.includes('vignette=angle='));
    process.env.DIRECTORCUT_VIDEO_ENCODER='libx264';
    const result=await renderTimelineProject({project,outputPath:out});
    assert(fs.existsSync(out),'Stage 5 render did not create output');
    const media=await probeMedia(out);
    assert.equal(media.width,320);assert.equal(media.height,180);assert(media.hasAudio);
    assert(media.duration>1.8&&media.duration<2.2,`unexpected Stage 5 duration ${media.duration}`);
    assert.equal(result.videoClips,1);assert.equal(result.audioClips,1);
    console.log('Stage 5 real highlights/LUT/motion blur render passed');
  }finally{
    delete process.env.DIRECTORCUT_VIDEO_ENCODER;
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exit(1);});