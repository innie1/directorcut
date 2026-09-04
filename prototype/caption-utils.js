(function (root, factory) {
  const api = factory(root?.DirectorCaptionEditor || (typeof require==='function' ? require('./caption-editor-utils') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DirectorCaptionUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CE) {
  const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function normalizeWord(word) {
    if (!word) return null;
    const text = String(word.text ?? word.word ?? '').trim();
    if (!text) return null;
    const start = Number.isFinite(Number(word.start_ms)) ? n(word.start_ms) / 1000 : n(word.start);
    const end = Number.isFinite(Number(word.end_ms)) ? n(word.end_ms) / 1000 : n(word.end, start + 0.2);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return { text, start:Math.max(0,start), end:Math.max(start + 0.04,end) };
  }

  function segmentWords(words, options = {}) {
    const maxWords = Math.max(2, n(options.maxWords, 7));
    const maxChars = Math.max(16, n(options.maxChars, 42));
    const maxDuration = Math.max(0.8, n(options.maxDuration, 2.4));
    const pauseBreak = Math.max(0.15, n(options.pauseBreak, 0.6));
    const minDuration = Math.max(0.18, n(options.minDuration, 0.34));
    const list = (words || []).map(normalizeWord).filter(Boolean).sort((a,b) => a.start - b.start);
    const result = [];
    let current = [];
    function flush() {
      if (!current.length) return;
      const start = current[0].start, last = current[current.length - 1];
      const text = current.map(item => item.text).join(' ').replace(/\s+([,.!?;:])/g, '$1').trim();
      result.push({ start, end:Math.max(start + minDuration,last.end), text });
      current = [];
    }
    for (const word of list) {
      if (!current.length) { current.push(word); continue; }
      const previous = current[current.length - 1];
      const candidateText = [...current, word].map(item => item.text).join(' ');
      const candidateDuration = word.end - current[0].start;
      const pause = word.start - previous.end;
      if (pause >= pauseBreak || current.length >= maxWords || candidateText.length > maxChars || candidateDuration > maxDuration) flush();
      current.push(word);
      if (/[.!?]$/.test(word.text) && current.length >= 3) flush();
    }
    flush();
    return result;
  }

  function clipsFromTranscript(transcript, trackId = 'C1', options = {}) {
    const segments = segmentWords(transcript?.words || [], options);
    const style = CE?.normalizeStyle ? CE.normalizeStyle(options.style || {}) : {fontFamily:'Sans',fontSize:34,fontWeight:700,bold:true,italic:false,align:'center',color:'#ffffff',outlineColor:'#000000',outlineWidth:2,backgroundColor:'#000000',backgroundOpacity:0,halign:'position',valign:'position'};
    return segments.map((segment,index) => {
      const duration = Math.max(0.2, segment.end - segment.start);
      return {
        id:`caption-auto-${Math.round(segment.start * 1000)}-${index}`, trackId, kind:'caption', name:segment.text,
        start:segment.start, duration, sourceIn:0, sourceDuration:duration, linkedId:null, keyframes:{},
        text:{content:segment.text,style:{...style},position:{x:.5,y:.86},maxWidth:.9}
      };
    });
  }

  return { normalizeWord, segmentWords, clipsFromTranscript };
});
