const VI=require('../prototype/visual-intelligence-utils');
const SR=require('../prototype/semantic-retrieval-utils');
const DEFAULT_OLLAMA=process.env.DIRECTORCUT_OLLAMA_URL||'http://127.0.0.1:11434';

async function ollamaEmbed({model,input,baseUrl=DEFAULT_OLLAMA}={}){
  if(!model)throw new Error('No local embedding model is selected.');
  const values=Array.isArray(input)?input:[input];if(!values.length)return[];
  const response=await fetch(`${baseUrl}/api/embed`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,input:values}),signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error(`Local embedding model HTTP ${response.status}`);
  const data=await response.json(),vectors=data.embeddings||[];
  if(!Array.isArray(vectors)||vectors.length!==values.length)throw new Error('The local embedding model returned an unexpected embedding count.');
  return vectors.map(vector=>Array.isArray(vector)?vector.map(Number).filter(Number.isFinite):[]);
}

async function embedVisualIndex({index,model,baseUrl=DEFAULT_OLLAMA,embed=ollamaEmbed}={}){
  const normalized=VI.normalizeIndex(index||{});if(!normalized.entries.length)return{...normalized,embeddingModel:model||null};
  const texts=normalized.entries.map(entry=>VI.entryText(entry)||entry.summary||`shot at ${entry.time} seconds`),vectors=await embed({model,input:texts,baseUrl});
  if(!vectors.every(vector=>Array.isArray(vector)&&vector.length))throw new Error('The local embedding model did not return usable vectors.');
  return SR.mergeEmbeddings(normalized,vectors,model);
}
async function embedQuery({query,model,baseUrl=DEFAULT_OLLAMA,embed=ollamaEmbed}={}){
  const text=String(query||'').trim();if(!text)return[];const vectors=await embed({model,input:[text],baseUrl});return vectors[0]||[];
}
module.exports={DEFAULT_OLLAMA,ollamaEmbed,embedVisualIndex,embedQuery};
