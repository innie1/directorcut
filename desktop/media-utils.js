const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

function runProcess(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...opts });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', d => stdout += d.toString());
    child.stderr?.on('data', d => stderr += d.toString());
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr || `${command} exited ${code}`)));
  });
}

async function probeMedia(mediaPath) {
  const { stdout } = await runProcess('ffprobe', [
    '-v', 'error', '-show_entries',
    'format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels',
    '-of', 'json', mediaPath
  ]);
  const data = JSON.parse(stdout);
  const video = (data.streams || []).find(s => s.codec_type === 'video') || {};
  const audio = (data.streams || []).find(s => s.codec_type === 'audio') || {};
  return {
    path: mediaPath,
    name: path.basename(mediaPath),
    url: pathToFileURL(mediaPath).toString(),
    duration: Number(data.format?.duration || 0),
    width: video.width || 0,
    height: video.height || 0,
    videoCodec: video.codec_name || null,
    audioCodec: audio.codec_name || null,
    frameRate: video.r_frame_rate || null,
    sampleRate: audio.sample_rate ? Number(audio.sample_rate) : null,
    channels: audio.channels || null
  };
}

function normalizeRanges(ranges, duration) {
  const clean = (ranges || [])
    .map(r => ({ start: Math.max(0, Number(r.start) || 0), end: Math.min(duration, Number(r.end) || 0) }))
    .filter(r => r.end - r.start > 0.025)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of clean) {
    const prev = merged[merged.length - 1];
    if (prev && r.start <= prev.end + 0.001) prev.end = Math.max(prev.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

function keepRanges(removeRanges, duration) {
  const removed = normalizeRanges(removeRanges, duration);
  const keep = [];
  let cursor = 0;
  for (const r of removed) {
    if (r.start > cursor) keep.push({ start: cursor, end: r.start });
    cursor = Math.max(cursor, r.end);
  }
  if (cursor < duration) keep.push({ start: cursor, end: duration });
  return keep.filter(r => r.end - r.start > 0.04);
}

async function renderCuts({ sourcePath, duration, removeRanges, outputPath }) {
  if (!sourcePath) throw new Error('No source video is loaded.');
  const keep = keepRanges(removeRanges, duration);
  if (!keep.length) throw new Error('The edit removes the entire video.');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'directorcut-'));
  try {
    const segments = [];
    for (let i = 0; i < keep.length; i++) {
      const r = keep[i];
      const seg = path.join(temp, `segment-${String(i).padStart(4, '0')}.mp4`);
      await runProcess('ffmpeg', [
        '-y', '-ss', r.start.toFixed(3), '-i', sourcePath,
        '-t', (r.end - r.start).toFixed(3),
        '-map', '0:v:0?', '-map', '0:a:0?',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart', seg
      ]);
      segments.push(seg);
    }
    if (segments.length === 1) {
      fs.copyFileSync(segments[0], outputPath);
    } else {
      const list = path.join(temp, 'concat.txt');
      fs.writeFileSync(list, segments.map(s => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
      await runProcess('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', outputPath]);
    }
    return { outputPath, keptSegments: keep.length, removedRanges: normalizeRanges(removeRanges, duration).length };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function msToSrt(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const z = Math.floor(ms % 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(z).padStart(3,'0')}`;
}

function wordsToSrt(words) {
  const groups = [];
  let current = [];
  for (const w of words || []) {
    current.push(w);
    const punctuation = /[.!?]$/.test(w.text || '');
    const span = current.length ? current[current.length - 1].end_ms - current[0].start_ms : 0;
    if (current.length >= 7 || punctuation || span >= 3200) {
      groups.push(current); current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups.map((g, i) => `${i+1}\n${msToSrt(g[0].start_ms)} --> ${msToSrt(g[g.length-1].end_ms)}\n${g.map(w => w.text).join(' ')}\n`).join('\n');
}

module.exports = { runProcess, probeMedia, normalizeRanges, keepRanges, renderCuts, msToSrt, wordsToSrt };
