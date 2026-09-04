const fs = require('fs');
const os = require('os');
const path = require('path');
const { runProcess, parseFps } = require('./media-utils');

const n = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const even = v => Math.max(2, Math.round(n(v, 2) / 2) * 2);
const clipEnd = c => n(c.start) + n(c.duration);

function timelineDuration(timeline = {}) {
  let end = 0;
  for (const track of timeline.tracks || []) for (const clip of track.clips || []) end = Math.max(end, clipEnd(clip));
  return end;
}
function trackNumber(id = '') { const m = String(id).match(/(\d+)/); return m ? Number(m[1]) : 0; }
function normalizedKeyframes(clip, property, defaultValue) {
  const duration = Math.max(0.001, n(clip.duration, 1));
  const list = Array.isArray(clip.keyframes?.[property]) ? clip.keyframes[property] : [];
  const dedup = new Map();
  for (const k of list) { const time = Math.max(0, Math.min(duration, n(k.time))); dedup.set(time.toFixed(6), { time, value:n(k.value, defaultValue) }); }
  const out = [...dedup.values()].sort((a,b)=>a.time-b.time);
  if (!out.length) return [];
  if (out[0].time > .000001) out.unshift({time:0,value:defaultValue});
  if (out[out.length-1].time < duration-.000001) out.push({time:duration,value:out[out.length-1].value});
  return out;
}
function piecewiseExpression(keyframes, defaultValue, variable='T') {
  if (!keyframes.length) return String(defaultValue);
  if (keyframes.length===1) return String(keyframes[0].value);
  let expr=String(keyframes[keyframes.length-1].value);
  for(let i=keyframes.length-2;i>=0;i--){const a=keyframes[i],b=keyframes[i+1],span=Math.max(.000001,b.time-a.time),interp=`(${a.value}+(${b.value}-${a.value})*(${variable}-${a.time})/${span})`;expr=`if(lt(${variable},${b.time}),${interp},${expr})`;}
  return expr;
}
function buildRenderPlan(project={}) {
  const timeline=project.timeline||{tracks:[]},fps=parseFps(project.media?.frameRate||timeline.fps||30),width=even(project.media?.width||1920),height=even(project.media?.height||1080);
  const videoTracks=(timeline.tracks||[]).filter(t=>t.kind==='video'&&!t.hidden).sort((a,b)=>trackNumber(a.id)-trackNumber(b.id)),audioTracks=(timeline.tracks||[]).filter(t=>t.kind==='audio'&&!t.muted);
  const videoClips=videoTracks.flatMap(t=>(t.clips||[]).map(c=>({...c,_track:t.id}))).filter(c=>c.sourcePath&&n(c.duration)>0),audioClips=audioTracks.flatMap(t=>(t.clips||[]).map(c=>({...c,_track:t.id}))).filter(c=>c.sourcePath&&n(c.duration)>0);
  if(!videoClips.length)throw new Error('The timeline has no renderable video clips.');
  const duration=Math.max(1/fps,...videoClips.map(clipEnd),...audioClips.map(clipEnd));
  const sources=[],sourceIndex=new Map();for(const clip of [...videoClips,...audioClips]){const p=path.resolve(clip.sourcePath);if(!sourceIndex.has(p)){sourceIndex.set(p,sources.length);sources.push(p);}}
  return{fps,width,height,duration,videoClips,audioClips,sources,sourceIndex};
}
function allocateSourcePads(plan){const videoCounts=new Map(),audioCounts=new Map();for(const clip of plan.videoClips){const idx=plan.sourceIndex.get(path.resolve(clip.sourcePath));videoCounts.set(idx,(videoCounts.get(idx)||0)+1);}for(const clip of plan.audioClips){const idx=plan.sourceIndex.get(path.resolve(clip.sourcePath));audioCounts.set(idx,(audioCounts.get(idx)||0)+1);}const lines=[],videoQueues=new Map(),audioQueues=new Map();for(const[idx,count]of videoCounts){const labels=Array.from({length:count},(_,i)=>`vsrc${idx}_${i}`);lines.push(count===1?`[${idx}:v]null[${labels[0]}]`:`[${idx}:v]split=${count}${labels.map(x=>`[${x}]`).join('')}`);videoQueues.set(idx,labels);}for(const[idx,count]of audioCounts){const labels=Array.from({length:count},(_,i)=>`asrc${idx}_${i}`);lines.push(count===1?`[${idx}:a]anull[${labels[0]}]`:`[${idx}:a]asplit=${count}${labels.map(x=>`[${x}]`).join('')}`);audioQueues.set(idx,labels);}return{lines,nextVideo(clip){const idx=plan.sourceIndex.get(path.resolve(clip.sourcePath));return videoQueues.get(idx).shift();},nextAudio(clip){const idx=plan.sourceIndex.get(path.resolve(clip.sourcePath));return audioQueues.get(idx).shift();}};}
function videoFilterForClip(clip,sourceLabel,label,width,height,fps){const sourceIn=Math.max(0,n(clip.sourceIn)),duration=Math.max(1/fps,n(clip.duration,1)),start=Math.max(0,n(clip.start)),filters=[`[${sourceLabel}]trim=start=${sourceIn.toFixed(6)}:duration=${duration.toFixed(6)}`,'setpts=PTS-STARTPTS',`scale=${width}:${height}:force_original_aspect_ratio=decrease`,`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0`];const scaleKeys=normalizedKeyframes(clip,'scale',1).map(k=>({...k,value:Math.max(1,Math.min(8,k.value))}));if(scaleKeys.length){const z=piecewiseExpression(scaleKeys,1,`on/${fps}`);filters.push(`zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`);}const opacityKeys=normalizedKeyframes(clip,'opacity',1).map(k=>({...k,value:Math.max(0,Math.min(1,k.value))}));if(opacityKeys.length){const alpha=piecewiseExpression(opacityKeys,1,'T');filters.push('format=rgba');filters.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${alpha})'`);}filters.push(`setpts=PTS+${start.toFixed(6)}/TB[${label}]`);return filters.join(',');}
function audioFilterForClip(clip,sourceLabel,label){const sourceIn=Math.max(0,n(clip.sourceIn)),duration=Math.max(.001,n(clip.duration,1)),startMs=Math.max(0,Math.round(n(clip.start)*1000)),filters=[`[${sourceLabel}]atrim=start=${sourceIn.toFixed(6)}:duration=${duration.toFixed(6)}`,'asetpts=PTS-STARTPTS'];const volumeKeys=normalizedKeyframes(clip,'volume',1).map(k=>({...k,value:Math.max(0,Math.min(8,k.value))}));if(volumeKeys.length)filters.push(`volume='${piecewiseExpression(volumeKeys,1,'t')}':eval=frame`);if(startMs>0)filters.push(`adelay=${startMs}:all=1`);return `${filters.join(',')}[${label}]`;}
function buildFilterGraph(plan){const{width,height,fps,duration,videoClips,audioClips}=plan,pads=allocateSourcePads(plan),lines=[...pads.lines,`color=c=black:s=${width}x${height}:r=${fps}:d=${duration.toFixed(6)}[base0]`];let composite='base0';videoClips.forEach((clip,i)=>{const label=`vc${i}`;lines.push(videoFilterForClip(clip,pads.nextVideo(clip),label,width,height,fps));const next=`vcomp${i}`;lines.push(`[${composite}][${label}]overlay=eof_action=pass:shortest=0:format=auto[${next}]`);composite=next;});lines.push(`[${composite}]trim=duration=${duration.toFixed(6)},setpts=PTS-STARTPTS,format=yuv420p[vout]`);audioClips.forEach((clip,i)=>lines.push(audioFilterForClip(clip,pads.nextAudio(clip),`ac${i}`)));if(audioClips.length===1)lines.push(`[ac0]atrim=duration=${duration.toFixed(6)},asetpts=PTS-STARTPTS[aout]`);else if(audioClips.length>1){const inputs=audioClips.map((_,i)=>`[ac${i}]`).join('');lines.push(`${inputs}amix=inputs=${audioClips.length}:normalize=0:dropout_transition=0,atrim=duration=${duration.toFixed(6)},asetpts=PTS-STARTPTS[aout]`);}return{graph:lines.join(';\n'),hasAudio:audioClips.length>0};}
async function availableEncoders(){try{const result=await runProcess('ffmpeg',['-hide_banner','-encoders']);return`${result.stdout}\n${result.stderr}`;}catch(_){return'';}}
async function selectVideoEncoder(){const forced=process.env.DIRECTORCUT_VIDEO_ENCODER;if(forced)return{name:forced,args:['-c:v',forced]};const text=await availableEncoders(),candidates=process.platform==='darwin'?[['h264_videotoolbox',['-c:v','h264_videotoolbox','-b:v','10M']]]:process.platform==='win32'?[['h264_nvenc',['-c:v','h264_nvenc','-preset','p4','-cq','20']],['h264_qsv',['-c:v','h264_qsv','-global_quality','20']],['h264_amf',['-c:v','h264_amf','-quality','balanced','-b:v','10M']]]:[['h264_nvenc',['-c:v','h264_nvenc','-preset','p4','-cq','20']],['h264_qsv',['-c:v','h264_qsv','-global_quality','20']]];for(const[name,args]of candidates)if(new RegExp(`\\b${name}\\b`).test(text))return{name,args};return{name:'libx264',args:['-c:v','libx264','-preset','veryfast','-crf','18']};}
function filterGraphOptionUnsupported(error, option){const text=String(error?.message||error||'').toLowerCase();const needle=option.toLowerCase().replace(/^-/, '');return(text.includes('unrecognized option')||text.includes('option not found')||text.includes('error splitting the argument list'))&&(text.includes(needle)||text.includes('filter_complex'));}
function makeRenderArgs(plan,graphFile,hasAudio,filterOption,encoderArgs,outputPath){const args=['-y'];for(const source of plan.sources)args.push('-i',source);args.push(filterOption,graphFile,'-map','[vout]');if(hasAudio)args.push('-map','[aout]');args.push(...encoderArgs,'-pix_fmt','yuv420p','-r',String(plan.fps));if(hasAudio)args.push('-c:a','aac','-b:a','192k');else args.push('-an');args.push('-t',plan.duration.toFixed(6),'-movflags','+faststart',outputPath);return args;}
async function renderTimelineProject({project,outputPath}){
  if(!project?.timeline)throw new Error('This project has no timeline.');
  const plan=buildRenderPlan(project),{graph,hasAudio}=buildFilterGraph(plan),temp=fs.mkdtempSync(path.join(os.tmpdir(),'directorcut-render-')),graphFile=path.join(temp,'filter.txt');
  fs.writeFileSync(graphFile,graph,'utf8');
  try{
    const encoder=await selectVideoEncoder();
    const software=['-c:v','libx264','-preset','veryfast','-crf','18'];
    const filterOptions=['-/filter_complex','-filter_complex_script'];
    let lastError=null;
    for(const filterOption of filterOptions){
      const hwArgs=makeRenderArgs(plan,graphFile,hasAudio,filterOption,encoder.args,outputPath);
      try{
        await runProcess('ffmpeg',hwArgs);
        return{outputPath,duration:plan.duration,width:plan.width,height:plan.height,videoClips:plan.videoClips.length,audioClips:plan.audioClips.length,encoder:encoder.name,filterOption};
      }catch(error){
        lastError=error;
        if(filterGraphOptionUnsupported(error,filterOption))continue;
        if(encoder.name==='libx264')throw error;
        const swArgs=makeRenderArgs(plan,graphFile,hasAudio,filterOption,software,outputPath);
        try{
          await runProcess('ffmpeg',swArgs);
          return{outputPath,duration:plan.duration,width:plan.width,height:plan.height,videoClips:plan.videoClips.length,audioClips:plan.audioClips.length,encoder:'libx264',hardwareFallback:true,filterOption};
        }catch(swError){
          lastError=swError;
          if(filterGraphOptionUnsupported(swError,filterOption))continue;
          throw swError;
        }
      }
    }
    throw lastError||new Error('FFmpeg does not support a compatible filter graph file option.');
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
module.exports={timelineDuration,normalizedKeyframes,piecewiseExpression,buildRenderPlan,buildFilterGraph,selectVideoEncoder,renderTimelineProject};
