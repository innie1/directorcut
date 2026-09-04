const { spawn } = require('child_process');
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
function outputSchema(){return{type:'object',properties:{intent:{type:'string',enum:['conversation','edit_task','search','analysis']},response:{type:'string'},operations:{type:'array',items:{type:'object',properties:{type:{type:'string',enum:['seek','split_at','remove_range','add_marker','move_clip','add_keyframe']},time:{type:'number'},start:{type:'number'},end:{type:'number'},clipId:{type:'string'},newStart:{type:'number'},property:{type:'string'},value:{type:'number'}},required:['type']}}},required:['intent','response','operations']};}
function safeParseContent(content){if(!content)return null;try{return JSON.parse(content)}catch(_){}const start=content.indexOf('{'),end=content.lastIndexOf('}');if(start>=0&&end>start){try{return JSON.parse(content.slice(start,end+1))}catch(_){}}return null;}
async function chatOllama({baseUrl=DEFAULT_BASE,model,system,messages=[],payload,keepAlive='15m'}){
  if(!model)throw new Error('No Ollama model selected.'); const userContent=typeof payload==='string'?payload:JSON.stringify(payload);
  const body={model,stream:false,keep_alive:keepAlive,format:outputSchema(),options:{temperature:.35,num_ctx:4096},messages:[{role:'system',content:system},...messages.slice(-12).map(m=>({role:m.role,content:String(m.content||'').slice(0,6000)})),{role:'user',content:userContent}]};
  const data=await fetchJson(`${baseUrl}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)},120000); const content=data.message?.content||''; const parsed=safeParseContent(content)||{intent:'conversation',response:content||'No response.',operations:[]};
  return {provider:'ollama',model:data.model||model,intent:['conversation','edit_task','search','analysis'].includes(parsed.intent)?parsed.intent:'conversation',text:String(parsed.response||content||'No response.'),operations:Array.isArray(parsed.operations)?parsed.operations.slice(0,24):[],evalCount:data.eval_count||null,evalDuration:data.eval_duration||null,loadDuration:data.load_duration||null};
}
module.exports={DEFAULT_BASE,detectOllama,warmModel,chatOllama,normalizeModels};
