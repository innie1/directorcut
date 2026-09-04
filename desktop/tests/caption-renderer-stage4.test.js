const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {runProcess,probeMedia}=require('../media-utils');
const {buildStage4Graph,renderTimelineProject}=require('../timeline-renderer-stage4');

(async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'directorcut-caption-test-')),src=path.join(temp,'src.mp4'),out=path.join(temp,'captioned.mp4'),texts=path.join(temp,'texts');fs.mkdirSync(texts);
  try{
    await runProcess('ffmpeg',['-y','-f','lavfi','-i','color=c=navy:s=320x180:r=30:d=2','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',src]);
    const project={media:{path:src,width:320,height:180,frameRate:'30/1',duration:2},timeline:{fps:30,tracks:[
      {id:'C1',kind:'caption',clips:[{id:'c1',kind:'caption',trackId:'C1',name:"We're: 100% ready, yes!",start:.2,duration:1.45,text:{content:"We're: 100% ready, yes!\nSecond line",style:{fontFamily:'Sans',fontSize:28,fontWeight:700,bold:true,italic:false,align:'center',color:'#ffffff',outlineColor:'#000000',outlineWidth:2,backgroundColor:'#202020',backgroundOpacity:.55},position:{x:.5,y:.78},maxWidth:.8}}]},
      {id:'V1',kind:'video',clips:[{id:'v1',sourcePath:src,start:0,duration:2,sourceIn:0,sourceDuration:2,keyframes:{}}]},
      {id:'A1',kind:'audio',clips:[{id:'a1',sourcePath:src,start:0,duration:2,sourceIn:0,sourceDuration:2,keyframes:{}}]}
    ]}};
    const built=buildStage4Graph(project,texts);assert.equal(built.captions.length,1);assert(built.graph.includes('drawtext=textfile='));assert(built.graph.includes('expansion=none'));assert(built.graph.includes("enable='between(t,0.200000,1.650000)'"));assert(built.graph.includes('borderw=2.00'));assert(built.graph.includes('box=1:boxcolor=0x202020@0.550'));assert(fs.readFileSync(built.textFiles[0],'utf8').includes("We're: 100% ready"));
    process.env.DIRECTORCUT_VIDEO_ENCODER='libx264';const result=await renderTimelineProject({project,outputPath:out});assert.equal(result.captionClips,1);assert(fs.existsSync(out));const media=await probeMedia(out);assert.equal(media.width,320);assert.equal(media.height,180);assert(media.hasAudio);assert(media.duration>1.8&&media.duration<2.2,`unexpected duration ${media.duration}`);console.log('Stage 4 real caption burn-in render passed');
  }finally{delete process.env.DIRECTORCUT_VIDEO_ENCODER;fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1);});
