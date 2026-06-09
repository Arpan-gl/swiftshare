const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const app = express();
const httpServer = createServer(app);

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
  : true;

function getAppOrigin(req) {
  const origin = req.get('origin');
  if (origin) return origin;
  if (Array.isArray(corsOrigins) && corsOrigins.length > 0) return corsOrigins[0];
  return `${req.protocol}://${req.get('host')}`;
}

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e8, // 100 MB socket buffer
});

app.use(cors({ origin: corsOrigins }));
app.use(express.json());

// In-memory session store (use Redis in production)
const sessions = new Map();
// socketId -> transferId mapping
const socketToSession = new Map();

// ─── REST: Create transfer session ───────────────────────────────────────────
app.post('/api/session', (req, res) => {
  const { fileName, fileSize, mimeType, totalChunks } = req.body;
  if (!fileName || !fileSize) {
    return res.status(400).json({ error: 'fileName and fileSize required' });
  }

  const transferId = uuidv4().replace(/-/g, '').slice(0, 12);
  const session = {
    transferId,
    fileName,
    fileSize,
    mimeType: mimeType || 'application/octet-stream',
    totalChunks,
    createdAt: Date.now(),
    expiresAt: Date.now() + 48 * 60 * 60 * 1000, // 48h
    senderSocketId: null,
    receivers: [],
    status: 'waiting', // waiting | transferring | done
  };

  sessions.set(transferId, session);

  console.log(`[session] Created: ${transferId} — ${fileName} (${fileSize} bytes)`);

  res.json({
    transferId,
    shareUrl: `${getAppOrigin(req)}/download/${transferId}`,
    expiresAt: session.expiresAt,
  });
});

// ─── REST: Get session metadata (for download page) ──────────────────────────
app.get('/api/session/:transferId', (req, res) => {
  const session = sessions.get(req.params.transferId);
  if (!session) return res.status(404).json({ error: 'Transfer not found or expired' });
  if (Date.now() > session.expiresAt) {
    sessions.delete(req.params.transferId);
    return res.status(410).json({ error: 'Transfer link has expired' });
  }

  res.json({
    transferId: session.transferId,
    fileName: session.fileName,
    fileSize: session.fileSize,
    mimeType: session.mimeType,
    totalChunks: session.totalChunks,
    status: session.status,
    senderOnline: !!session.senderSocketId,
    expiresAt: session.expiresAt,
  });
});

// ─── REST: Health check ───────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', sessions: sessions.size }));

// ─── Socket.IO: WebRTC Signaling ─────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[ws] Connected: ${socket.id}`);

  // ── Sender registers with their transferId ─────────────────────────────────
  socket.on('sender:register', ({ transferId }) => {
    const session = sessions.get(transferId);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    session.senderSocketId = socket.id;
    socketToSession.set(socket.id, transferId);
    socket.join(`room:${transferId}`);

    console.log(`[signal] Sender registered for ${transferId}`);
    socket.emit('sender:registered', { transferId });
  });

  // ── Receiver joins a room, triggers WebRTC offer flow ──────────────────────
  socket.on('receiver:join', ({ transferId }) => {
    const session = sessions.get(transferId);
    if (!session) {
      socket.emit('error', { message: 'Transfer not found' });
      return;
    }
    if (Date.now() > session.expiresAt) {
      socket.emit('error', { message: 'Transfer link has expired' });
      return;
    }
    if (!session.senderSocketId) {
      socket.emit('error', { message: 'Sender is not online. Keep this page open and retry.' });
      return;
    }

    const receiverId = socket.id;
    session.receivers.push(receiverId);
    socketToSession.set(socket.id, transferId);
    socket.join(`room:${transferId}`);

    console.log(`[signal] Receiver ${receiverId} joined ${transferId}`);

    // Tell sender a receiver has arrived — include receiverId so sender knows who to call
    io.to(session.senderSocketId).emit('receiver:arrived', {
      receiverId,
      transferId,
      fileName: session.fileName,
      fileSize: session.fileSize,
    });

    socket.emit('receiver:joined', {
      transferId,
      fileName: session.fileName,
      fileSize: session.fileSize,
      mimeType: session.mimeType,
      totalChunks: session.totalChunks,
    });
  });

  // ── WebRTC Offer (sender → receiver) ───────────────────────────────────────
  socket.on('signal:offer', ({ receiverId, sdp }) => {
    console.log(`[signal] offer ${socket.id} → ${receiverId}`);
    io.to(receiverId).emit('signal:offer', { senderId: socket.id, sdp });
  });

  // ── WebRTC Answer (receiver → sender) ──────────────────────────────────────
  socket.on('signal:answer', ({ senderId, sdp }) => {
    console.log(`[signal] answer ${socket.id} → ${senderId}`);
    io.to(senderId).emit('signal:answer', { receiverId: socket.id, sdp });
  });

  // ── ICE Candidate relay ────────────────────────────────────────────────────
  socket.on('signal:ice', ({ targetId, candidate }) => {
    io.to(targetId).emit('signal:ice', { fromId: socket.id, candidate });
  });

  // ── Transfer complete ──────────────────────────────────────────────────────
  socket.on('transfer:complete', ({ transferId }) => {
    const session = sessions.get(transferId);
    if (session) {
      session.status = 'done';
      io.to(`room:${transferId}`).emit('transfer:complete', { transferId });
      console.log(`[transfer] Complete: ${transferId}`);
    }
  });

  // ── Resume: receiver tells sender which chunks it already has ──────────────
  socket.on('transfer:resume', ({ transferId, missingChunks }) => {
    const session = sessions.get(transferId);
    if (session && session.senderSocketId) {
      io.to(session.senderSocketId).emit('transfer:resume', {
        receiverId: socket.id,
        missingChunks,
      });
    }
  });

  // ── Disconnect cleanup ─────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const transferId = socketToSession.get(socket.id);
    if (transferId) {
      const session = sessions.get(transferId);
      if (session) {
        if (session.senderSocketId === socket.id) {
          session.senderSocketId = null;
          io.to(`room:${transferId}`).emit('sender:offline', { transferId });
          console.log(`[signal] Sender disconnected from ${transferId}`);
        } else {
          session.receivers = session.receivers.filter(r => r !== socket.id);
          if (session.senderSocketId) {
            io.to(session.senderSocketId).emit('receiver:left', { receiverId: socket.id });
          }
        }
      }
      socketToSession.delete(socket.id);
    }
    console.log(`[ws] Disconnected: ${socket.id}`);
  });
});

// ─── Cleanup expired sessions every 10 minutes ───────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(id);
      console.log(`[cleanup] Expired session: ${id}`);
    }
  }
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 SwiftShare Signaling Server running on http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Health:    http://localhost:${PORT}/health\n`);
});
