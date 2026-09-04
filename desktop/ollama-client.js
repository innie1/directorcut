const { spawn } = require('child_process');
const fs = require('fs');
const DEFAULT_BASE = process.env.DIRECTORCUT_OLLAMA_URL || 'http://127.0.0.1:11434';

async function fetchJson(url, options = {}, timeoutMs = 1200) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function normalizeModels(models = []) {
  return models.map(m => ({ name:m.name||m.model, model:m.model||m.name, size:Number(m.size||0), parameterSize:m.details?.parameter_size||null, quantization:m.details?.quantization_level||null, family:m.details?.family||null, modifiedAt:m.modified_at||null })).filter(m=>m.name);
}
function cliVersion() {
  return new Promise(resolve => {
    const child = spawn(process.platform === 'win32' ? 'ollama.exe' : 'ollama', ['--version'], { windowsHide:true }); let out='';
    child.stdout?.on('data',d=>out+=d.toString()); child.stderr?.on('data',d=>out+=d.toString()); child.on('error',()=>resolve(null)); child.on('close',code=>resolve(code===0?out.trim():null));
  });
}
async function detectOllama(baseUrl = DEFAULT_BASE) {
  try { const data=await fetchJson(`${baseUrl}/api/tags`,{},900); return {installed:true,running:true,baseUrl,models:normalizeModels(data.models||[])}; }
  catch(error){ const version=await cliVersion(); return {installed:Boolean(version),running:false,baseUrl,models:[],version,error:String(error.message||error)}; }
}
async function warmModel(model, baseUrl = DEFAULT_BASE) {
  if(!model)return{ok:false}; const data=await fetchJson(`${baseUrl}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages:[],stream:false,keep_alive:'15m'})},120000); return {ok:true,model:data.model||model,doneReason:data.done_reason||null};
}
function outputSchema(){return{type:'object',properties:{intent:{type:'string',enum:['conversation','edit_task','search','analysis']},response:{type:'string'},operations:{type:'array',items:{type:'object',properties:{type:{type:'string',enum:['seek','split_at','remove_range','add_marker','move_clip','slip_clip','slide_clip','roll_boundary','add_keyframe']},time:{type:'number'},start:{type:'number'},end:{type:'number'},clipId:{type:'string'},newStart:{type:'number'},delta:{type:'number'},leftId:{type:'string'},rightId:{type:'string'},property:{type:'string',enum:['opacity','scale','volume']},value:{type:'number'}},required:['type']}}},required:['intent','response','operations']};}
function safeParseContent(content){if(!content)return null;try{return JSON.parse(content)}catch(_){}const start=content.indexOf('{'),end=content.lastIndexOf('}');if(start>=0&&end>start){try{return JSON.parse(content.slice(start,end+1))}catch(_){}}return null;}
function imagePayload(attachments=[]){const images=[];for(const a of attachments){if(a?.kind!=='image'||!a.path)continue;try{const stat=fs.statSync(a.path);if(stat.isFile()&&stat.size<=20*1024*1024)images.push(fs.readFileSync(a.path).toString('base64'));}catch(_){}}return images.slice(0,8);}
async function postChat(baseUrl, body){return fetchJson(`${baseUrl}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)},120000);}
async function chatOllama({baseUrl=DEFAULT_BASE,model,system,messages=[],payload,keepAlive='15m'}){
  if(!model)throw new Error('No Ollama model selected.');
  const userContent=typeof payload==='string'?payload:JSON.stringify(payload),images=imagePayload(payload?.attachments||[]);
  const schema=outputSchema();
  const history=messages.slice(-10).map(m=>({role:m.role,content:String(m.content||'').slice(0,5000)}));
  const userMessage={role:'user',content:userContent};if(images.length)userMessage.images=images;
  const body={model,stream:false,think:false,keep_alive:keepAlive,format:schema,options:{temperature:.2,num_ctx:Number(process.env.DIRECTORCUT_NUM_CTX||4096)},messages:[{role:'system',content:`${system}\n\nReturn JSON matching this schema exactly:\n${JSON.stringify(schema)}`},...history,userMessage]};
  let data;
  try{data=await postChat(baseUrl,body)}catch(error){if(!images.length)throw error;delete userMessage.images;data=await postChat(baseUrl,body);data.directorcutVisionFallback=true;}
  const content=data.message?.content||'',parsed=safeParseContent(content)||{intent:'conversation',response:content||'No response.',operations:[]};
  return {provider:'ollama',model:data.model||model,intent:['conversation','edit_task','search','analysis'].includes(parsed.intent)?parsed.intent:'conversation',text:String(parsed.response||content||'No response.'),operations:Array.isArray(parsed.operations)?parsed.operations.slice(0,32):[],evalCount:data.eval_count||null,evalDuration:data.eval_duration||null,loadDuration:data.load_duration||null,visionFallback:Boolean(data.directorcutVisionFallback)};
}
module.exports={DEFAULT_BASE,detectOllama,warmModel,chatOllama,normalizeModels};
