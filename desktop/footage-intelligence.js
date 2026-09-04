const crypto=require('crypto');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {runProcess,probeMedia,parseFps}=require('./media-utils');
const FI=require('../prototype/footage-intelligence-utils');

function sourceFingerprint(sourcePath,media={}){
  const stat=fs.statSync(sourcePath);
  return crypto.createHash('sha1').update(`${path.resolve(sourcePath)}|${stat.size}|${stat.mtimeMs}|${Number(media.duration||0).toFixed(3)}`).digest('hex');
}

function parseSceneTimes(log=''){
  const out=[];const pattern=/showinfo[^\n\r]*?pts_time:\s*([0-9]+(?:\.[0-9]+)?)/gi;let match;
  while((match=pattern.exec(String(log)))){const value=Number(match[1]);if(Number.isFinite(value)&&value>0)out.push(value);}
  return [...new Set(out.map(value=>FI.round(value,6)))].sort((a,b)=>a-b);
}

async function detectScenes(sourcePath,{threshold=.3}={}){
  const value=FI.clamp(threshold,.05,.95);
  const result=await runProcess('ffmpeg',['-hide_banner','-nostats','-i',sourcePath,'-vf',`select='gt(scene,${value.toFixed(4)})',showinfo`,'-an','-f','null','-']);
  return parseSceneTimes(`${result.stdout}\n${result.stderr}`);
}

function parseSilenceLog(log='',duration=0){
  const events=[];const pattern=/silence_(start|end):\s*(-?[0-9]+(?:\.[0-9]+)?)/gi;let match;
  while((match=pattern.exec(String(log))))events.push({type:match[1].toLowerCase(),time:Math.max(0,Number(match[2])||0)});
  const ranges=[];let open=null;
  for(const event of events){if(event.type==='start'){if(open===null)open=event.time;}else if(open!==null){ranges.push({start:open,end:event.time});open=null;}}
  if(open!==null&&Number(duration)>open)ranges.push({start:open,end:Number(duration)});
  return FI.normalizeRanges(ranges,duration,.03);
}

async function detectSilence(sourcePath,{duration=0,noiseDb=-35,minSilence=.35}={}){
  const result=await runProcess('ffmpeg',['-hide_banner','-nostats','-i',sourcePath,'-af',`silencedetect=noise=${Number(noiseDb)||-35}dB:d=${Math.max(.08,Number(minSilence)||.35).toFixed(3)}`,'-vn','-f','null','-']);
  return parseSilenceLog(`${result.stdout}\n${result.stderr}`,duration);
}

function rgbToLuma(r,g,b){return .2126*r+.7152*g+.0722*b;}
function hexByte(value){return Math.max(0,Math.min(255,Math.round(value))).toString(16).padStart(2,'0');}
function bitsToHex(bits){let out='';for(let i=0;i<bits.length;i+=4){let nibble=0;for(let j=0;j<4;j++)nibble=(nibble<<1)|(bits[i+j]?1:0);out+=nibble.toString(16);}return out;}

function frameFeatures(buffer,size=16){
  const expected=size*size*3;if(!Buffer.isBuffer(buffer)||buffer.length<expected)throw new Error(`Representative frame is incomplete (${buffer?.length||0}/${expected} bytes).`);
  const luma=new Float64Array(size*size);let rSum=0,gSum=0,bSum=0,sum=0,dark=0,bright=0;
  for(let i=0,p=0;i<size*size;i++,p+=3){const r=buffer[p],g=buffer[p+1],b=buffer[p+2],y=rgbToLuma(r,g,b);rSum+=r;gSum+=g;bSum+=b;sum+=y;luma[i]=y;if(y<24)dark++;if(y>232)bright++;}
  const pixels=size*size,mean=sum/pixels;let variance=0,edgeSum=0,edgeCount=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*size+x,value=luma[i];variance+=(value-mean)**2;if(x+1<size){edgeSum+=Math.abs(value-luma[i+1]);edgeCount++;}if(y+1<size){edgeSum+=Math.abs(value-luma[i+size]);edgeCount++;}}
  const contrast=Math.sqrt(variance/pixels),sharpness=edgeCount?edgeSum/edgeCount:0,meanRgb=[rSum/pixels,gSum/pixels,bSum/pixels],darkPct=dark/pixels,brightPct=bright/pixels;
  const blocks=8,blockSize=Math.max(1,Math.floor(size/blocks)),blockValues=[];
  for(let by=0;by<blocks;by++)for(let bx=0;bx<blocks;bx++){let blockSum=0,count=0;for(let y=by*blockSize;y<Math.min(size,(by+1)*blockSize);y++)for(let x=bx*blockSize;x<Math.min(size,(bx+1)*blockSize);x++){blockSum+=luma[y*size+x];count++;}blockValues.push(count?blockSum/count:mean);}
  const blockMean=blockValues.reduce((a,b)=>a+b,0)/blockValues.length,hash=bitsToHex(blockValues.map(value=>value>=blockMean)),signature=`${meanRgb.map(hexByte).join('')}:${hash}`;
  const brightnessScore=FI.clamp(1-Math.abs(mean-128)/128,0,1),contrastScore=FI.clamp(contrast/55,0,1),sharpnessScore=FI.clamp(sharpness/28,0,1),exposurePenalty=FI.clamp(Math.max(darkPct,brightPct)-.25,0,.75)/.75;
  const score=Math.round(FI.clamp((brightnessScore*.25+contrastScore*.30+sharpnessScore*.45)*(1-exposurePenalty*.45),0,1)*100),flags=[];
  if(mean<45||darkPct>.6)flags.push('too-dark');if(mean>210||brightPct>.6)flags.push('too-bright');if(contrast<16)flags.push('low-contrast');if(sharpness<7)flags.push('soft');
  return{signature,quality:{score,lumaMean:FI.round(mean,2),contrast:FI.round(contrast,2),sharpness:FI.round(sharpness,2),darkPercent:FI.round(darkPct*100,1),brightPercent:FI.round(brightPct*100,1),meanRgb:meanRgb.map(value=>Math.round(value)),flags}};
}

async function sampleRepresentativeFrame(sourcePath,time,tempDir,index,size=16){
  const safeSize=Math.max(8,Math.min(64,Math.round(Number(size)||16))),aligned=Math.max(8,Math.round(safeSize/8)*8),target=path.join(tempDir,`frame-${String(index).padStart(4,'0')}.rgb`);
  await runProcess('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',Math.max(0,Number(time)||0).toFixed(6),'-i',sourcePath,'-frames:v','1','-vf',`scale=${aligned}:${aligned}:flags=bilinear,format=rgb24`,'-f','rawvideo',target]);
  return frameFeatures(fs.readFileSync(target),aligned);
}

function sampleSceneIndices(count,maxSamples=32){
  const total=Math.max(0,Math.floor(Number(count)||0)),max=Math.max(1,Math.floor(Number(maxSamples)||32));if(total<=max)return Array.from({length:total},(_,i)=>i);if(max===1)return[Math.floor((total-1)/2)];const set=new Set();for(let i=0;i<max;i++)set.add(Math.round(i*(total-1)/(max-1)));return[...set].sort((a,b)=>a-b);
}

async function analyzeFootage({sourcePath,sceneThreshold=.3,noiseDb=-35,minSilence=.35,maxQualitySamples=32,sampleSize=16}={}){
  if(!sourcePath)throw new Error('No source media path was provided for footage analysis.');
  const absolute=path.resolve(sourcePath);if(!fs.existsSync(absolute))throw new Error(`Source media not found: ${absolute}`);
  const media=await probeMedia(absolute),duration=Math.max(0,Number(media.duration)||0);if(duration<=0)throw new Error('Footage analysis requires media with a measurable duration.');
  const warnings=[];let boundaries=[],silence=[];
  try{boundaries=await detectScenes(absolute,{threshold:sceneThreshold});}catch(error){warnings.push(`Scene detection unavailable: ${String(error.message||error).split('\n')[0]}`);}
  if(media.hasAudio){try{silence=await detectSilence(absolute,{duration,noiseDb,minSilence});}catch(error){warnings.push(`Silence detection unavailable: ${String(error.message||error).split('\n')[0]}`);}}
  let scenes=FI.makeScenes(boundaries,duration),speech=media.hasAudio?FI.complementRanges(silence,duration,.05):[];
  const indices=sampleSceneIndices(scenes.length,maxQualitySamples),temp=fs.mkdtempSync(path.join(os.tmpdir(),'directorcut-intelligence-'));
  try{
    for(const index of indices){try{const features=await sampleRepresentativeFrame(absolute,scenes[index].representativeTime,temp,index,sampleSize);scenes[index]={...scenes[index],sampled:true,...features};}catch(error){scenes[index]={...scenes[index],sampled:false,sampleError:String(error.message||error).split('\n')[0]};}}
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
  scenes=FI.classifyDuplicates(scenes);
  const analysis={version:1,sourceFingerprint:sourceFingerprint(absolute,media),sourcePath:absolute,duration,analyzedAt:new Date().toISOString(),settings:{sceneThreshold:FI.clamp(sceneThreshold,.05,.95),noiseDb:Number(noiseDb)||-35,minSilence:Math.max(.08,Number(minSilence)||.35),maxQualitySamples:Math.max(1,Math.floor(Number(maxQualitySamples)||32)),sampleSize:Math.max(8,Math.round(Number(sampleSize)||16))},scenes,silence,speech,warnings,media:{width:media.width,height:media.height,frameRate:media.frameRate,fps:parseFps(media.frameRate),hasAudio:media.hasAudio}};
  analysis.summary=FI.summarize(analysis);return analysis;
}

module.exports={sourceFingerprint,parseSceneTimes,detectScenes,parseSilenceLog,detectSilence,frameFeatures,sampleRepresentativeFrame,sampleSceneIndices,analyzeFootage};