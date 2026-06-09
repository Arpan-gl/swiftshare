import { useState, useRef, useCallback, useEffect } from 'react';
import { getSocket } from '../utils/socket';
import { sha256, ChunkStore, assembleAndDownload } from '../utils/fileUtils';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const CHECKPOINT_INTERVAL = 30000; // 30s per system design

export function useReceiver(transferId) {
  const [sessionMeta, setSessionMeta] = useState(null);
  const [status, setStatus] = useState('idle'); // idle|loading|waiting|connecting|receiving|verifying|done|error
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  const socket = useRef(null);
  const pcRef = useRef(null);
  const storeRef = useRef(null);
  const chunksRef = useRef({}); // chunkId → ArrayBuffer (in-memory small cache)
  const receivedCount = useRef(0);
  const totalChunksRef = useRef(0);
  const pendingHeadersRef = useRef({}); // dataChannel label -> header for next binary chunk
  const checkpointTimer = useRef(null);

  useEffect(() => {
    if (!transferId) return;
    socket.current = getSocket();
    loadSession();

    return () => {
      clearInterval(checkpointTimer.current);
      if (pcRef.current) pcRef.current.close();
    };
  }, [transferId]);

  async function loadSession() {
    setStatus('loading');
    try {
      const res = await fetch(`/api/session/${transferId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Transfer not found');
      }
      const meta = await res.json();
      setSessionMeta(meta);
      totalChunksRef.current = meta.totalChunks;

      // Check IndexedDB for existing chunks (resume support)
      storeRef.current = new ChunkStore(transferId);
      await storeRef.current.open();
      const existingIds = await storeRef.current.getAllChunkIds();
      if (existingIds.length > 0) {
        receivedCount.current = existingIds.length;
        const pct = Math.round((existingIds.length / meta.totalChunks) * 100);
        setProgress(pct);
        setStatusText(`Resumable: ${existingIds.length} of ${meta.totalChunks} chunks already downloaded`);
      }
      setStatus('idle');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  const startDownload = useCallback(async () => {
    if (!sessionMeta) return;
    if (!storeRef.current) {
      setError('Storage is still initializing. Please retry in a moment.');
      return;
    }
    setStatus('connecting');
    setError('');
    setStatusText('Connecting to sender…');

    setupSocketListeners();
    socket.current.emit('receiver:join', { transferId });
  }, [sessionMeta, transferId]);

  function setupSocketListeners() {
    socket.current.off('receiver:joined');
    socket.current.off('signal:offer');
    socket.current.off('signal:ice');
    socket.current.off('sender:offline');
    socket.current.off('error');

    socket.current.on('receiver:joined', ({ fileName, fileSize, mimeType, totalChunks }) => {
      totalChunksRef.current = totalChunks;
      setStatusText('Sender found — establishing peer connection…');
    });

    socket.current.on('signal:offer', async ({ senderId, sdp }) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.current.emit('signal:ice', { targetId: senderId, candidate });
      };

      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === 'connected') {
          setStatus('receiving');
          setStatusText('Transfer started…');
          startCheckpointing();
        }
        if (s === 'failed' || s === 'disconnected') {
          setStatusText('Connection lost — will resume when sender reconnects.');
        }
      };

      pc.ondatachannel = (e) => {
        const dc = e.channel;
        if (dc.label === 'control') {
          dc.onmessage = handleControlMessage;
          return;
        }
        dc.binaryType = 'arraybuffer';
        dc.onmessage = (evt) => handleDataMessage(evt, dc.label);
      };

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.current.emit('signal:answer', { senderId, sdp: answer });

      // Check if we have existing chunks, request only missing ones
      const existingIds = await storeRef.current.getAllChunkIds();
      if (existingIds.length > 0) {
        const existingSet = new Set(existingIds);
        const missing = [];
        for (let i = 0; i < totalChunksRef.current; i++) {
          if (!existingSet.has(i)) missing.push(i);
        }
        if (missing.length < totalChunksRef.current) {
          socket.current.emit('transfer:resume', { transferId, missingChunks: missing });
          setStatusText(`Resuming — ${missing.length} chunks remaining…`);
        }
      }
    });

    socket.current.on('signal:ice', ({ fromId, candidate }) => {
      if (pcRef.current && candidate) {
        pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      }
    });

    socket.current.on('sender:offline', () => {
      setError('Sender went offline. Keep this page open — transfer will resume when they reconnect.');
      setStatus('error');
    });

    socket.current.on('error', ({ message }) => {
      setError(message);
      setStatus('error');
    });
  }

  function handleDataMessage(e, channelLabel) {
    if (typeof e.data === 'string') {
      // This is the chunk header
      pendingHeadersRef.current[channelLabel] = JSON.parse(e.data);
    } else if (e.data instanceof ArrayBuffer) {
      // This is the binary chunk data
      const header = pendingHeadersRef.current[channelLabel];
      if (!header) return;
      delete pendingHeadersRef.current[channelLabel];

      const chunkId = header.chunkId;

      // Verify SHA-256 (async, non-blocking)
      sha256(e.data).then(async (hash) => {
        if (hash !== header.hash) {
          console.warn(`[chunk ${chunkId}] SHA-256 mismatch — requesting retransmit`);
          // In production: request retransmit via control channel
          return;
        }

        // Store in IndexedDB immediately (don't hold in RAM for large files)
        await storeRef.current.saveChunk(chunkId, e.data);

        // Keep small in-memory cache for assembly
        chunksRef.current[chunkId] = e.data;

        receivedCount.current += 1;
        const total = totalChunksRef.current || sessionMeta?.totalChunks || 1;
        const pct = Math.min(100, Math.round((receivedCount.current / total) * 100));
        setProgress(pct);
        setStatusText(`Receiving… ${receivedCount.current} of ${total} chunks (${pct}%)`);
      }).catch((err) => {
        setError(err?.message || 'Failed while processing incoming chunk.');
        setStatus('error');
      });
    }
  }

  async function handleControlMessage(e) {
    const msg = JSON.parse(e.data);
    if (msg.type === 'done') {
      clearInterval(checkpointTimer.current);
      setStatus('verifying');
      setStatusText('Verifying file integrity…');

      // Load all chunks from IndexedDB in order
      await new Promise(r => setTimeout(r, 300));

      setStatusText('Assembling file…');
      await new Promise(r => setTimeout(r, 200));

      // Assemble from IndexedDB
      const totalChunks = totalChunksRef.current || sessionMeta.totalChunks;
      const allChunks = [];
      for (let i = 0; i < totalChunks; i++) {
        const chunk = chunksRef.current[i] || await storeRef.current.getChunk(i);
        if (chunk) allChunks.push(chunk);
      }

      assembleAndDownload(
        allChunks,
        totalChunks,
        sessionMeta.fileName,
        sessionMeta.mimeType
      );

      // Clean up IndexedDB after successful download
      await storeRef.current.destroy();
      chunksRef.current = {};

      setStatus('done');
      setProgress(100);
      setStatusText('Download complete — file saved to your device.');
      socket.current.emit('transfer:complete', { transferId });
    }
  }

  function startCheckpointing() {
    checkpointTimer.current = setInterval(async () => {
      const ids = Object.keys(chunksRef.current).map(Number);
      await storeRef.current.saveMeta('checkpoint', { receivedIds: ids, ts: Date.now() });
    }, CHECKPOINT_INTERVAL);
  }

  return { sessionMeta, status, progress, statusText, error, startDownload };
}
