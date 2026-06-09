// Smaller chunks are more reliable across browsers/network conditions for long WebRTC transfers.
export const CHUNK_SIZE = 256 * 1024; // 256 KB

export function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function getTotalChunks(fileSize) {
  return Math.ceil(fileSize / CHUNK_SIZE);
}

export function getFileIcon(name = '') {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼', svg: '🖼',
    mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬',
    mp3: '🎵', wav: '🎵', aac: '🎵', flac: '🎵',
    zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
    ppt: '📋', pptx: '📋', txt: '📃',
  };
  return map[ext] || '📁';
}

export function getMimeType(name = '') {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    pdf: 'application/pdf',
    zip: 'application/zip', gz: 'application/gzip',
    mp4: 'video/mp4', mp3: 'audio/mpeg',
    txt: 'text/plain',
  };
  return map[ext] || 'application/octet-stream';
}

export function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// SHA-256 hash of an ArrayBuffer chunk
export async function sha256(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Save received chunks to IndexedDB (browser) for resume support
export class ChunkStore {
  constructor(transferId) {
    this.transferId = transferId;
    this.db = null;
    this.openPromise = null;
  }

  async open() {
    if (this.db) return;
    if (this.openPromise) return this.openPromise;

    this.openPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(`swiftshare_${this.transferId}`, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('chunks')) {
          db.createObjectStore('chunks', { keyPath: 'chunkId' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        this.openPromise = null;
        resolve();
      };
      req.onerror = () => {
        this.openPromise = null;
        reject(req.error);
      };
    });

    return this.openPromise;
  }

  async saveChunk(chunkId, data) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('chunks', 'readwrite');
      tx.objectStore('chunks').put({ chunkId, data });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async getChunk(chunkId) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('chunks', 'readonly');
      const req = tx.objectStore('chunks').get(chunkId);
      req.onsuccess = () => resolve(req.result?.data || null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllChunkIds() {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('chunks', 'readonly');
      const req = tx.objectStore('chunks').getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async saveMeta(key, value) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ key, value });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async getMeta(key) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('meta', 'readonly');
      const req = tx.objectStore('meta').get(key);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async destroy() {
    if (this.db) this.db.close();
    this.db = null;
    this.openPromise = null;
    indexedDB.deleteDatabase(`swiftshare_${this.transferId}`);
  }
}

// Assemble chunks in order and trigger browser download
export function assembleAndDownload(chunks, totalChunks, fileName, mimeType) {
  const orderedChunks = [];
  for (let i = 0; i < totalChunks; i++) {
    if (chunks[i]) orderedChunks.push(chunks[i]);
  }
  const blob = new Blob(orderedChunks, { type: mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 1500);
}
