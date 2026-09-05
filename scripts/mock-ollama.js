// Stand-in Ollama endpoint for testing DirectorCut without downloading model weights.
//
//   node scripts/mock-ollama.js            # serves 127.0.0.1:11434
//
// It speaks the part of the Ollama API the app uses - GET /api/tags and POST
// /api/chat with structured `format` - and answers from a script file so a test can
// decide exactly which operations the "model" returns.
//
// Scripted replies live in /tmp/dc-mock-script.json (re-read per request):
//   [{ "match": "text in the request",
//      "json": { "intent": "edit_task", "response": "...", "operations": [...] } }]
// Use "raw" instead of "json" to return the messier output a small quantized model
// really emits, and check the app copes.
//
// Use this to exercise the pipeline deterministically. To judge how well a real
// model writes operations, run Ollama itself instead - the app prefers whatever is
// listening on 11434.
const http = require('http');
const fs = require('fs');

const MODELS = [
  { name:'llama3.2:1b', model:'llama3.2:1b', size:1321098329, details:{ parameter_size:'1.2B', quantization_level:'Q8_0', family:'llama' }, modified_at:new Date().toISOString() },
  { name:'qwen2.5:3b',  model:'qwen2.5:3b',  size:1929902592, details:{ parameter_size:'3.1B', quantization_level:'Q4_K_M', family:'qwen2' }, modified_at:new Date().toISOString() }
];

// Scripted replies keyed by a substring of the user's request. `raw` lets a scenario
// return the sloppy text a small quantized model really emits.
// Re-read per request so a test can rewrite the script mid-run.
function script() {
  try { return JSON.parse(fs.readFileSync('/tmp/dc-mock-script.json','utf8')); } catch (_) { return []; }
}

const seen = [];
function reply(userContent) {
  let request = '';
  try { request = String(JSON.parse(userContent).request || ''); } catch (_) { request = String(userContent); }
  for (const entry of script()) {
    if (request.toLowerCase().includes(String(entry.match).toLowerCase())) {
      return entry.raw !== undefined ? entry.raw : JSON.stringify(entry.json);
    }
  }
  return JSON.stringify({ intent:'conversation', response:`I read your project. You said: "${request}"`, operations:[] });
}

http.createServer((req, res) => {
  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => {
    if (req.url.startsWith('/api/tags')) {
      res.writeHead(200, {'content-type':'application/json'});
      return res.end(JSON.stringify({ models: MODELS }));
    }
    if (req.url.startsWith('/api/chat')) {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (_) {}
      const msgs = parsed.messages || [];
      const last = msgs[msgs.length - 1];
      // Warm call: empty messages array.
      if (!msgs.length) {
        res.writeHead(200, {'content-type':'application/json'});
        return res.end(JSON.stringify({ model:parsed.model, done_reason:'load', message:{role:'assistant',content:''} }));
      }
      seen.push({
        model: parsed.model, format: !!parsed.format, think: parsed.think,
        keep_alive: parsed.keep_alive, num_ctx: parsed.options?.num_ctx,
        systemChars: String(msgs[0]?.content || '').length,
        historyCount: Math.max(0, msgs.length - 2),
        images: (last?.images || []).length,
        userContent: String(last?.content || '')
      });
      fs.writeFileSync('/tmp/dc-mock-seen.json', JSON.stringify(seen, null, 2));
      const content = reply(last?.content || '');
      res.writeHead(200, {'content-type':'application/json'});
      return res.end(JSON.stringify({
        model: parsed.model, created_at:new Date().toISOString(),
        message:{ role:'assistant', content }, done:true, done_reason:'stop',
        eval_count:128, eval_duration:900000000, load_duration:120000000
      }));
    }
    res.writeHead(404); res.end('{}');
  });
}).listen(11434, '127.0.0.1', () => console.log('mock ollama on 11434'));
