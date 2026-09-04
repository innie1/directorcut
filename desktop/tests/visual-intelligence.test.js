const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {runProcess}=require('../media-utils');
const {framePoints,analyzeVisualFootage}=require('../visual-intelligence');
const VI=require('../../prototype/visual-intelligence-utils');

(async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'directorcut-visual-test-'));
  try{
    const source=path.join(temp,'shots.mp4');
    await runProcess('ffmpeg',[
      '-hide_banner','-loglevel','error','-y',
      '-f','lavfi','-i','color=c=red:s=320x180:r=24:d=0.5',
      '-f','lavfi','-i','color=c=green:s=320x180:r=24:d=0.5',
      '-f','lavfi','-i','color=c=blue:s=320x180:r=24:d=0.5',
      '-filter_complex','[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]',
      '-map','[v]','-c:v','libx264','-pix_fmt','yuv420p',source
    ]);
    const footage={sourceFingerprint:'stage6-fingerprint',scenes:[
      {id:'shot-red',start:0,end:.5,representativeTime:.25},
      {id:'shot-green',start:.5,end:1,representativeTime:.75},
      {id:'shot-blue',start:1,end:1.5,representativeTime:1.25}
    ]};
    const points=framePoints({duration:1.5,footageIntelligence:footage,maxFrames:3});
    assert.deepEqual(points.map(point=>point.sceneId),['shot-red','shot-green','shot-blue']);

    const calls=[];
    const describeFrame=async({imageBase64,point,model})=>{
      assert(imageBase64.length>100,'real FFmpeg JPEG frame should be provided to the vision adapter');
      calls.push(point.sceneId);
      const color=point.sceneId.replace('shot-','');
      return{summary:`${color} studio frame`,subjects:[],objects:[`${color} backdrop`],actions:[],setting:'studio',shotType:'static wide shot',visibleText:[],evidence:[],confidence:.99,model};
    };
    const index=await analyzeVisualFootage({sourcePath:source,model:'qwen-vl-stub',footageIntelligence:footage,maxFrames:3,describeFrame});
    assert.deepEqual(calls,['shot-red','shot-green','shot-blue']);
    assert.equal(index.entries.length,3);
    assert.equal(index.sourceFingerprint,'stage6-fingerprint');
    assert.equal(index.entries[0].sceneId,'shot-red');
    assert.equal(index.entries[1].time,.75);
    assert.equal(index.entries[2].objects[0],'blue backdrop');
    assert.equal(index.summary.shots,3);
    assert.equal(index.warnings.length,0);
    const search=VI.search(index,'blue backdrop');
    assert.equal(search[0].entry.sceneId,'shot-blue');

    const evenly=framePoints({duration:16,maxFrames:4});
    assert(evenly.length>=2&&evenly.length<=4);
    assert(evenly.every(point=>point.time>=point.start&&point.time<=point.end));
    console.log('visual intelligence real frame sampling tests passed');
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1);});
