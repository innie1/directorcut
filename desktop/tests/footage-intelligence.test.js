const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {runProcess}=require('../media-utils');
const {analyzeFootage,parseSceneTimes,parseSilenceLog,frameFeatures}=require('../footage-intelligence');

(async()=>{
  assert.deepEqual(parseSceneTimes('[Parsed_showinfo_0] n: 1 pts: 10 pts_time:1.25 pos:0\n[Parsed_showinfo_0] n:2 pts_time:2.5'),[1.25,2.5]);
  assert.deepEqual(parseSilenceLog('silence_start: 1.0\nsilence_end: 2.0 | silence_duration: 1',3).map(r=>[r.start,r.end]),[[1,2]]);
  const pixels=Buffer.alloc(8*8*3);for(let i=0;i<pixels.length;i+=3){pixels[i]=255;pixels[i+1]=0;pixels[i+2]=0;}const features=frameFeatures(pixels,8);assert(features.signature.startsWith('ff0000:'));assert(features.quality.flags.includes('low-contrast'));

  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'directorcut-intelligence-test-')),source=path.join(temp,'synthetic.mp4');
  try{
    await runProcess('ffmpeg',['-y',
      '-f','lavfi','-i','color=c=red:s=160x90:r=10:d=1',
      '-f','lavfi','-i','color=c=blue:s=160x90:r=10:d=1',
      '-f','lavfi','-i','color=c=red:s=160x90:r=10:d=1',
      '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1',
      '-f','lavfi','-i','anullsrc=r=48000:cl=mono:d=1',
      '-f','lavfi','-i','sine=frequency=660:sample_rate=48000:duration=1',
      '-filter_complex','[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[3:a][4:a][5:a]concat=n=3:v=0:a=1[a]',
      '-map','[v]','-map','[a]','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-t','3',source
    ]);
    const analysis=await analyzeFootage({sourcePath:source,sceneThreshold:.08,noiseDb:-35,minSilence:.25,maxQualitySamples:12,sampleSize:16});
    assert.equal(analysis.version,1);assert(analysis.sourceFingerprint.length>=32);assert(analysis.duration>2.8&&analysis.duration<3.2,`unexpected duration ${analysis.duration}`);
    assert(analysis.scenes.length>=3,`expected at least 3 scenes, got ${analysis.scenes.length}`);
    assert(analysis.silence.some(r=>r.start<1.2&&r.end>1.8),`expected middle silence, got ${JSON.stringify(analysis.silence)}`);
    assert(analysis.speech.length>=2,`expected speech around silence, got ${JSON.stringify(analysis.speech)}`);
    const sampled=analysis.scenes.filter(scene=>scene.signature);assert(sampled.length>=3,'representative frames were not sampled');
    const first=sampled[0],last=sampled[sampled.length-1];assert(first.signature.slice(0,6).startsWith('f')||first.quality.meanRgb[0]>200,'first shot is not red');assert(last.quality.meanRgb[0]>200,'last shot is not red');
    assert(analysis.scenes.some(scene=>scene.duplicateOf),`expected red shot duplicate, got ${JSON.stringify(analysis.scenes.map(s=>({id:s.id,signature:s.signature,duplicateOf:s.duplicateOf,kind:s.duplicateKind})))}`);
    assert.equal(analysis.summary.sceneCount,analysis.scenes.length);assert(analysis.summary.silenceSeconds>.5);assert(analysis.summary.sampledScenes>=3);
    console.log('Stage 6 real footage intelligence analysis passed');
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1);});