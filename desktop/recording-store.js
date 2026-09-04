const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { probeMedia } = require('./media-utils');

const MAX_CHUNK_BYTES = 64 * 1024 * 1024;
const safePart = value => String(value || 'recording').trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'recording';
const extensionForMime = mime => /mp4/i.test(String(mime || '')) ? '.mp4' : /ogg/i.test(String(mime || '')) ? '.ogv' : '.webm';

function bufferFromChunk(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (Array.isArray(data)) return Buffer.from(data);
  throw new Error('Recording chunk is not binary data.');
}

class RecordingStore {
  constructor({ root, probe = probeMedia } = {}) {
    this.root = root;
    this.probe = probe;
    this.active = new Map();
  }

  rootPath() {
    const value = typeof this.root === 'function' ? this.root() : this.root;
    if (!value) throw new Error('Recording storage path is unavailable.');
    fs.mkdirSync(value, { recursive:true });
    return value;
  }

  start(meta = {}) {
    const recordingId = `rec-${crypto.randomBytes(10).toString('hex')}`;
    const session = safePart(meta.sessionId || 'session');
    const scene = safePart(meta.sceneId || 'scene');
    const take = Math.max(1, Math.floor(Number(meta.takeNumber) || 1));
    const directory = path.join(this.rootPath(), safePart(meta.projectName || 'Untitled Project'), session, scene);
    fs.mkdirSync(directory, { recursive:true });
    const ext = extensionForMime(meta.mimeType);
    const filePath = path.join(directory, `take-${String(take).padStart(2, '0')}-${Date.now()}${ext}`);
    fs.writeFileSync(filePath, Buffer.alloc(0));
    this.active.set(recordingId, { recordingId, filePath, mimeType:String(meta.mimeType || ''), bytes:0, startedAt:Date.now(), meta:{ ...meta, takeNumber:take } });
    return { recordingId, path:filePath, mimeType:String(meta.mimeType || ''), takeNumber:take };
  }

  append(recordingId, data) {
    const entry = this.active.get(String(recordingId || ''));
    if (!entry) throw new Error('Recording session is not active.');
    const chunk = bufferFromChunk(data);
    if (!chunk.length) return { ok:true, bytes:entry.bytes };
    if (chunk.length > MAX_CHUNK_BYTES) throw new Error('Recording chunk is too large.');
    fs.appendFileSync(entry.filePath, chunk);
    entry.bytes += chunk.length;
    return { ok:true, bytes:entry.bytes };
  }

  async finish(recordingId) {
    const id = String(recordingId || '');
    const entry = this.active.get(id);
    if (!entry) throw new Error('Recording session is not active.');
    this.active.delete(id);
    const stat = fs.statSync(entry.filePath);
    if (!stat.size) {
      fs.rmSync(entry.filePath, { force:true });
      throw new Error('The recording did not contain any media data.');
    }
    const media = await this.probe(entry.filePath);
    return {
      recordingId:id,
      path:entry.filePath,
      url:pathToFileURL(entry.filePath).toString(),
      mimeType:entry.mimeType,
      bytes:stat.size,
      duration:Number(media.duration || 0),
      media:{ ...media, recordingId:id, mimeType:entry.mimeType, source:'recording', recordedAt:new Date(entry.startedAt).toISOString() }
    };
  }

  cancel(recordingId) {
    const id = String(recordingId || '');
    const entry = this.active.get(id);
    if (!entry) return false;
    this.active.delete(id);
    try { fs.rmSync(entry.filePath, { force:true }); } catch (_) {}
    return true;
  }

  dispose() {
    for (const id of [...this.active.keys()]) this.cancel(id);
  }
}

function attachRecordingStore({ ipcMain, app }) {
  const store = new RecordingStore({ root:() => path.join(app.getPath('userData'), 'recordings') });
  ipcMain.handle('recording:start', (_event, meta) => store.start(meta || {}));
  ipcMain.handle('recording:append', (_event, payload = {}) => store.append(payload.recordingId, payload.data));
  ipcMain.handle('recording:finish', (_event, recordingId) => store.finish(recordingId));
  ipcMain.handle('recording:cancel', (_event, recordingId) => store.cancel(recordingId));
  app.once('before-quit', () => store.dispose());
  return store;
}

module.exports = { RecordingStore, attachRecordingStore, safePart, extensionForMime, bufferFromChunk, MAX_CHUNK_BYTES };
