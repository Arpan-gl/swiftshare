import { useState, useRef, useCallback, useEffect } from 'react';
import { getSocket } from '../utils/socket';
import { CHUNK_SIZE, getTotalChunks, sha256 } from '../utils/fileUtils';

const API_BASE = (process.env.REACT_APP_SERVER_URL || '').replace(/\/$/, '');

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const PARALLEL_CHANNELS = 2;
const MAX_BUFFERED_AMOUNT = 2 * 1024 * 1024; // 2 MB per channel
const LOW_BUFFERED_AMOUNT = 512 * 1024; // resume threshold

export function useSender() {
  const [status, setStatus] = useState('idle'); // idle|registering|waiting|transferring|done|error
  const [transferId, setTransferId] = useState(null);
  const [shareUrl, setShareUrl] = useState('');
  const [peers, setPeers] = useState({}); // { receiverId: { pct, status } }
  const [error, setError] = useState('');

  const fileRef = useRef(null);
  const transferIdRef = useRef(null);
  const peerConns = useRef({}); // receiverId → RTCPeerConnection
  const socket = useRef(null);

  useEffect(() => {
    socket.current = getSocket();

    socket.current.on('receiver:arrived', ({ receiverId }) => {
      setPeers(p => ({ ...p, [receiverId]: { pct: 0, status: 'connecting' } }));
      initiatePeerConnection(receiverId);
    });

    socket.current.on('signal:answer', ({ receiverId, sdp }) => {
      const pc = peerConns.current[receiverId];
      if (pc && pc.signalingState !== 'stable') {
        pc.setRemoteDescription(new RTCSessionDescription(sdp)).catch(console.error);
      }
    });

    socket.current.on('signal:ice', ({ fromId, candidate }) => {
      const pc = peerConns.current[fromId];
      if (pc && candidate) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      }
    });

    socket.current.on('receiver:left', ({ receiverId }) => {
      setPeers(p => {
        const next = { ...p };
        if (next[receiverId]) next[receiverId].status = 'disconnected';
        return next;
      });
    });

    socket.current.on('transfer:resume', ({ receiverId, missingChunks }) => {
      const pc = peerConns.current[receiverId];
      if (pc && fileRef.current) {
        sendChunksToReceiver(receiverId, pc, fileRef.current, missingChunks);
      }
    });

    return () => {
      socket.current.off('receiver:arrived');
      socket.current.off('signal:answer');
      socket.current.off('signal:ice');
      socket.current.off('receiver:left');
      socket.current.off('transfer:resume');
    };
  }, []);

  const createSession = useCallback(async (file) => {
    fileRef.current = file;
    setStatus('registering');
    setError('');

    try {
      const totalChunks = getTotalChunks(file.size);
      const res = await fetch(`${API_BASE}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          totalChunks,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      setTransferId(data.transferId);
      transferIdRef.current = data.transferId;
      setShareUrl(data.shareUrl);
      setStatus('waiting');

      socket.current.emit('sender:register', { transferId: data.transferId });

      return data;
    } catch (err) {
      setError(err.message);
      setStatus('error');
      throw err;
    }
  }, []);

  const primeTransfer = useCallback((file, existingTransferId, existingShareUrl = '') => {
    if (file) fileRef.current = file;
    if (existingTransferId) {
      setTransferId(existingTransferId);
      transferIdRef.current = existingTransferId;
      setStatus('waiting');
    }
    if (existingShareUrl) {
      setShareUrl(existingShareUrl);
    }
  }, []);

  const registerSender = useCallback((id = null) => {
    const effectiveId = id || transferIdRef.current || transferId;
    if (!effectiveId || !socket.current) return;
    socket.current.emit('sender:register', { transferId: effectiveId });
  }, [transferId]);

  async function initiatePeerConnection(receiverId) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConns.current[receiverId] = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.current.emit('signal:ice', { targetId: receiverId, candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      setPeers(p => ({ ...p, [receiverId]: { ...p[receiverId], status: state } }));
      if (state === 'connected' && fileRef.current) {
        setStatus('transferring');
        sendChunksToReceiver(receiverId, pc, fileRef.current);
      }
    };

    // Create parallel data channels (system design: 16-32 streams)
    const channels = [];
    for (let i = 0; i < PARALLEL_CHANNELS; i++) {
      const dc = pc.createDataChannel(`chunk-stream-${i}`, { ordered: true });
      channels.push(dc);
    }

    // Control channel for signaling done/resume
    const ctrlChannel = pc.createDataChannel('control', { ordered: true });
    pc.channels = channels;
    pc.ctrlChannel = ctrlChannel;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.current.emit('signal:offer', { receiverId, sdp: offer });
  }

  async function sendChunksToReceiver(receiverId, pc, file, missingChunkIds = null) {
    const totalChunks = getTotalChunks(file.size);
    const chunkIds = missingChunkIds
      ? missingChunkIds
      : Array.from({ length: totalChunks }, (_, i) => i);

    const channels = pc.channels;
    if (!channels || channels.length === 0) return;

    // Wait for channels to open
    await Promise.all(channels.map(dc => new Promise(res => {
      if (dc.readyState === 'open') return res();
      dc.onopen = res;
    })));

    let sentCount = 0;
    let chunkIndex = 0;

    const waitForChannelDrain = async (channel) => {
      if (channel.readyState !== 'open') {
        throw new Error('Data channel closed while waiting for buffer drain.');
      }

      if (channel.bufferedAmount <= MAX_BUFFERED_AMOUNT) return;

      await new Promise((resolve, reject) => {
        let settled = false;

        const cleanup = () => {
          clearInterval(timer);
          channel.removeEventListener('bufferedamountlow', onLow);
        };

        const finishResolve = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };

        const finishReject = (err) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        };

        const onLow = () => finishResolve();

        channel.bufferedAmountLowThreshold = LOW_BUFFERED_AMOUNT;
        channel.addEventListener('bufferedamountlow', onLow);

        const timer = setInterval(() => {
          if (channel.readyState !== 'open') {
            finishReject(new Error('Data channel closed while buffering data.'));
            return;
          }

          // Fallback for browsers where bufferedamountlow can be unreliable.
          if (channel.bufferedAmount <= LOW_BUFFERED_AMOUNT) {
            finishResolve();
          }
        }, 50);
      });
    };

    const waitForWritableChannel = async () => {
      // Keep waiting while at least one channel is still connecting.
      while (true) {
        const openChannels = channels.filter((dc) => dc.readyState === 'open');
        if (openChannels.length > 0) {
          openChannels.sort((a, b) => a.bufferedAmount - b.bufferedAmount);
          return openChannels[0];
        }

        const hasConnecting = channels.some((dc) => dc.readyState === 'connecting');
        if (!hasConnecting) return null;

        await new Promise((r) => setTimeout(r, 50));
      }
    };

    const sendNextBatch = async () => {
      while (chunkIndex < chunkIds.length) {
        const ci = chunkIds[chunkIndex];
        chunkIndex++;

        const channel = await waitForWritableChannel();
        if (!channel) {
          throw new Error('All WebRTC data channels closed during transfer.');
        }

        const offset = ci * CHUNK_SIZE;
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();
        const hash = await sha256(buffer);

        // Wait if channel buffer is already saturated.
        await waitForChannelDrain(channel);

        if (channel.readyState !== 'open') {
          // Retry this chunk on another channel.
          chunkIndex--;
          continue;
        }

        // Send header first (JSON), then binary.
        try {
          channel.send(JSON.stringify({ chunkId: ci, size: buffer.byteLength, hash }));
          channel.send(buffer);
        } catch (sendErr) {
          if (channel.readyState !== 'open') {
            // Channel dropped mid-send; retry this chunk elsewhere.
            chunkIndex--;
            continue;
          }
          throw sendErr;
        }

        sentCount++;
        const pct = Math.round((sentCount / chunkIds.length) * 100);
        setPeers(p => ({ ...p, [receiverId]: { pct, status: 'connected' } }));
      }

      // Send done signal on control channel.
      if (pc.ctrlChannel?.readyState === 'open') {
        pc.ctrlChannel.send(JSON.stringify({ type: 'done', totalChunks }));
      }

      setPeers(p => ({ ...p, [receiverId]: { pct: 100, status: 'done' } }));
      setStatus('done');
      if (transferIdRef.current) {
        socket.current.emit('transfer:complete', { transferId: transferIdRef.current });
      }
    };

    sendNextBatch().catch((err) => {
      console.error('[transfer] sender loop failed:', err);
      setError(err?.message || 'Transfer failed unexpectedly.');
      setPeers(p => ({
        ...p,
        [receiverId]: {
          ...(p[receiverId] || { pct: 0 }),
          status: 'error',
        },
      }));
      setStatus('error');
    });
  }

  return { status, transferId, shareUrl, peers, error, createSession, primeTransfer, registerSender };
}
