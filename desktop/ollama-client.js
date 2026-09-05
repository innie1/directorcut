const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runProcess, probeMedia } = require('./media-utils');
const DEFAULT_BASE = process.env.DIRECTORCUT_OLLAMA_URL || 'http://127.0.0.1:11434';

async function fetchJson(url, options = {}, timeoutMs = 1200) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function normalizeModels(models = []) {
  return models.map(m => ({
    name: m.name || m.model,
    model: m.model || m.name,
    size: Number(m.size || 0),
    parameterSize: m.details?.parameter_size || null,
    quantization: m.details?.quantization_level || null,
    family: m.details?.family || null,
    modifiedAt: m.modified_at || null
  })).filter(m => m.name);
}

function cliVersion() {
  return new Promise(resolve => {
    const child = spawn(process.platform === 'win32' ? 'ollama.exe' : 'ollama', ['--version'], { windowsHide:true });
    let out = '';
    child.stdout?.on('data', d => out += d.toString());
    child.stderr?.on('data', d => out += d.toString());
    child.on('error', () => resolve(null));
    child.on('close', code => resolve(code === 0 ? out.trim() : null));
  });
}

async function detectOllama(baseUrl = DEFAULT_BASE) {
  try {
    const data = await fetchJson(`${baseUrl}/api/tags`, {}, 900);
    return { installed:true, running:true, baseUrl, models:normalizeModels(data.models || []) };
  } catch (error) {
    const version = await cliVersion();
    return { installed:Boolean(version), running:false, baseUrl, models:[], version, error:String(error.message || error) };
  }
}

async function warmModel(model, baseUrl = DEFAULT_BASE) {
  if (!model) return { ok:false };
  const data = await fetchJson(`${baseUrl}/api/chat`, {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({ model, messages:[], stream:false, keep_alive:'15m' })
  }, 120000);
  return { ok:true, model:data.model || model, doneReason:data.done_reason || null };
}

function outputSchema() {
  return {
    type:'object',
    properties:{
      intent:{ type:'string', enum:['conversation','edit_task','search','analysis'] },
      response:{ type:'string' },
      operations:{
        type:'array',
        items:{
          type:'object',
          properties:{
            type:{ type:'string', enum:[
              'seek','split_at','remove_range','add_marker','move_clip','slip_clip','slide_clip','roll_boundary','add_keyframe',
              'add_clip','add_caption','add_title','add_motion','add_transition','assemble_from_script'] },
            time:{type:'number'}, start:{type:'number'}, end:{type:'number'}, clipId:{type:'string'}, newStart:{type:'number'}, delta:{type:'number'},
            leftId:{type:'string'}, rightId:{type:'string'}, property:{type:'string',enum:['opacity','scale','volume']}, value:{type:'number'},
            media:{type:'string'}, mode:{type:'string',enum:['append','insert','overwrite']}, text:{type:'string'},
            duration:{type:'number'}, x:{type:'number'}, y:{type:'number'},
            preset:{type:'string'}, transition:{type:'string'}, captions:{type:'boolean'}
          },
          required:['type']
        }
      }
    },
    required:['intent','response','operations']
  };
}

function safeParseContent(content) {
  if (!content) return null;
  try { return JSON.parse(content); } catch (_) {}
  const start = content.indexOf('{'), end = content.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(content.slice(start, end + 1)); } catch (_) {}
  }
  return null;
}

async function visualImages(attachments = []) {
  const images = [];
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'directorcut-vision-'));
  try {
    for (const attachment of attachments) {
      if (images.length >= 8) break;
      if (!attachment?.path) continue;

      if (attachment.kind === 'image') {
        try {
          const stat = fs.statSync(attachment.path);
          if (stat.isFile() && stat.size <= 20 * 1024 * 1024) images.push(fs.readFileSync(attachment.path).toString('base64'));
        } catch (_) {}
        continue;
      }

      if (attachment.kind === 'video') {
        try {
          const media = await probeMedia(attachment.path);
          const duration = Math.max(.5, Number(media.duration || 1));
          const times = [duration * .25, duration * .7];
          for (let i = 0; i < times.length && images.length < 8; i++) {
            const out = path.join(temp, `frame-${images.length}-${i}.jpg`);
            await runProcess('ffmpeg', [
              '-y','-ss',times[i].toFixed(3),'-i',attachment.path,'-frames:v','1',
              '-vf',"scale='min(768,iw)':-2",'-q:v','4',out
            ]);
            if (fs.existsSync(out)) images.push(fs.readFileSync(out).toString('base64'));
          }
        } catch (_) {}
      }
    }
    return images;
  } finally {
    try { fs.rmSync(temp, { recursive:true, force:true }); } catch (_) {}
  }
}

async function postChat(baseUrl, body) {
  return fetchJson(`${baseUrl}/api/chat`, {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)
  }, 120000);
}

async function chatOllama({ baseUrl=DEFAULT_BASE, model, system, messages=[], payload, keepAlive='15m' }) {
  if (!model) throw new Error('No Ollama model selected.');
  const userContent = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const images = await visualImages(payload?.attachments || []);
  const schema = outputSchema();
  const history = messages.slice(-10).map(m => ({ role:m.role, content:String(m.content || '').slice(0,5000) }));
  const userMessage = { role:'user', content:userContent };
  if (images.length) userMessage.images = images;
  const body = {
    model, stream:false, think:false, keep_alive:keepAlive, format:schema,
    options:{ temperature:.2, num_ctx:Number(process.env.DIRECTORCUT_NUM_CTX || 4096) },
    messages:[
      { role:'system', content:`${system}\n\nReturn JSON matching this schema exactly:\n${JSON.stringify(schema)}` },
      ...history,
      userMessage
    ]
  };

  let data;
  let visionFallback = false;
  try {
    data = await postChat(baseUrl, body);
  } catch (error) {
    if (!images.length) throw error;
    delete userMessage.images;
    data = await postChat(baseUrl, body);
    visionFallback = true;
  }

  const content = data.message?.content || '';
  const parsed = safeParseContent(content) || { intent:'conversation', response:content || 'No response.', operations:[] };
  return {
    provider:'ollama', model:data.model || model,
    intent:['conversation','edit_task','search','analysis'].includes(parsed.intent) ? parsed.intent : 'conversation',
    text:String(parsed.response || content || 'No response.'),
    operations:Array.isArray(parsed.operations) ? parsed.operations.slice(0,32) : [],
    evalCount:data.eval_count || null, evalDuration:data.eval_duration || null, loadDuration:data.load_duration || null, visionFallback
  };
}

module.exports = { DEFAULT_BASE, detectOllama, warmModel, chatOllama, normalizeModels };
