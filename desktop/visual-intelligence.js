const fs=require('fs');
const os=require('os');
const path=require('path');
const {runProcess,probeMedia}=require('./media-utils');
const VI=require('../prototype/visual-intelligence-utils');
const {sampleSceneIndices}=require('./footage-intelligence');

const DEFAULT_OLLAMA=process.env.DIRECTORCUT_OLLAMA_URL||'http://127.0.0.1:11434';

function safeParse(content=''){
  if(content&&typeof content==='object')return content;
  const text=String(content||'').trim();if(!text)return null;
  try{return JSON.parse(text);}catch(_){}
  const start=text.indexOf('{'),end=text.lastIndexOf('}');if(start>=0&&end>start){try{return JSON.parse(text.slice(start,end+1));}catch(_){}}
  return null;
}

function visualSchema(){return{type:'object',properties:{summary:{type:'string'},subjects:{type:'array',items:{type:'string'}},objects:{type:'array',items:{type:'string'}},actions:{type:'array',items:{type:'string'}},setting:{type:'string'},shotType:{type:'string'},visibleText:{type:'array',items:{type:'string'}},evidence:{type:'array',items:{type:'string'}},confidence:{type:'number'}},required:['summary','subjects','objects','actions','setting','shotType','visibleText','evidence','confidence']};}

function framePoints({duration=0,footageIntelligence=null,maxFrames=12}={}){
  const d=Math.max(.001,Number(duration)||0),max=Math.max(1,Math.min(48,Math.floor(Number(maxFrames)||12))),scenes=Array.isArray(footageIntelligence?.scenes)?footageIntelligence.scenes:[];
  if(scenes.length){
    const indices=sampleSceneIndices(scenes.length,max);
    return indices.map(index=>{const scene=scenes[index]||{},start=Math.max(0,Number(scene.start)||0),end=Math.max(start,Number(scene.end)||start),time=Math.max(start,Math.min(end,Number(scene.representativeTime??((start+end)/2))||0));return{sceneId:String(scene.id||scene.sceneId||`scene-${index+1}`),sceneIndex:index,start,end,time};});
  }
  const count=Math.min(max,Math.max(1,Math.ceil(d/8))),points=[];
  for(let i=0;i<count;i++){const start=i*d/count,end=(i+1)*d/count;points.push({sceneId:`visual-scene-${i+1}`,sceneIndex:i,start,end,time:(start+end)/2});}
  return points;
}

async function extractJpeg(sourcePath,time,tempDir,index,{maxWidth=768}={}){
  const target=path.join(tempDir,`vision-${String(index).padStart(4,'0')}.jpg`);
  await runProcess('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',Math.max(0,Number(time)||0).toFixed(6),'-i',sourcePath,'-frames:v','1','-vf',`scale='min(${Math.max(256,Math.min(1280,Math.round(Number(maxWidth)||768)))},iw)':-2`,'-q:v','3',target]);
  if(!fs.existsSync(target)||!fs.statSync(target).size)throw new Error(`Could not extract visual frame at ${Number(time).toFixed(2)}s.`);
  return target;
}

async function ollamaDescribeFrame({model,imageBase64,point,baseUrl=DEFAULT_OLLAMA}={}){
  if(!model)throw new Error('Choose a local vision model before running Visual Intelligence.');
  const schema=visualSchema(),prompt=`Analyze this single video frame at ${Number(point.time).toFixed(3)} seconds. Report only what is visibly supported by the image. Do not identify a person by name and do not infer hidden facts. Use short concrete phrases. visibleText must contain only text you can actually read. evidence is for visible documents, screenshots, signs, charts, labels, receipts, interfaces, numbers or other potentially useful on-screen proof; otherwise use an empty array. confidence is 0 to 1. Return JSON matching the supplied schema.`;
  const response=await fetch(`${baseUrl}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,stream:false,think:false,format:schema,options:{temperature:.05,num_ctx:4096},messages:[{role:'user',content:prompt,images:[imageBase64]}]}),signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error(`Local vision model HTTP ${response.status}`);
  const data=await response.json(),parsed=safeParse(data.message?.content);
  if(!parsed)throw new Error('The selected local model did not return structured visual analysis. Use an image-capable model such as Qwen-VL.');
  return{...parsed,model:data.model||model};
}

async function analyzeVisualFootage({sourcePath,model,footageIntelligence=null,maxFrames=12,maxWidth=768,baseUrl=DEFAULT_OLLAMA,describeFrame=null}={}){
  if(!sourcePath)throw new Error('No source media was provided for Visual Intelligence.');
  const absolute=path.resolve(sourcePath);if(!fs.existsSync(absolute))throw new Error(`Source media not found: ${absolute}`);
  const media=await probeMedia(absolute),duration=Math.max(0,Number(media.duration)||0);if(!duration)throw new Error('Visual Intelligence requires media with measurable duration.');
  const points=framePoints({duration,footageIntelligence,maxFrames}),temp=fs.mkdtempSync(path.join(os.tmpdir(),'directorcut-vision-index-')),entries=[],warnings=[],describe=describeFrame||ollamaDescribeFrame;
  try{
    for(let index=0;index<points.length;index++){
      const point=points[index];
      try{
        const jpeg=await extractJpeg(absolute,point.time,temp,index,{maxWidth}),imageBase64=fs.readFileSync(jpeg).toString('base64'),raw=await describe({model,imageBase64,point,baseUrl,sourcePath:absolute});
        entries.push(VI.normalizeEntry(raw,{id:`visual-${String(index+1).padStart(3,'0')}`,sceneId:point.sceneId,sceneIndex:point.sceneIndex,time:point.time,start:point.start,end:point.end,model}));
      }catch(error){warnings.push(`Scene ${point.sceneIndex+1}: ${String(error.message||error).split('\n')[0]}`);}
    }
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
  if(!entries.length)throw new Error(warnings[0]||'Visual Intelligence could not analyze any sampled frame.');
  return VI.normalizeIndex({version:1,sourceFingerprint:String(footageIntelligence?.sourceFingerprint||''),sourcePath:absolute,model,analyzedAt:new Date().toISOString(),entries,warnings});
}

module.exports={DEFAULT_OLLAMA,safeParse,visualSchema,framePoints,extractJpeg,ollamaDescribeFrame,analyzeVisualFootage};
