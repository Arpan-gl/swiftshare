# SwiftShare — P2P File Transfer

> Fast, secure, limitless file sharing. No cloud storage. No size limits. Direct peer-to-peer via WebRTC.

---

## Quick Start

### 1. Install dependencies

```bash
# From project root
npm run install:all
```

### 2. Start the signaling server (Terminal 1)

```bash
npm run dev:server
# → http://localhost:3001
```

### 3. Start the React client (Terminal 2)

```bash
npm run dev:client
# → http://localhost:3000
```

### 4. Transfer a file

1. Open **http://localhost:3000** — drag or select a file
2. Copy the generated link (e.g. `http://localhost:3000/download/abc123def456`)
3. Open the link in **another browser or device on any network**
4. Click **Download File** — transfer happens directly peer-to-peer

---

## Architecture

```
Browser A (Sender)                          Browser B (Receiver)
     │                                              │
     │────── POST /api/session ──────────────────▶ Server
     │◀───── { transferId, shareUrl } ──────────── │
     │                                              │
     │ socket: sender:register                      │
     │────────────────────────────────────────────▶ │
     │                                              │ socket: receiver:join
     │◀── receiver:arrived ──────────────────────── │
     │                                              │
     │ [WebRTC Offer/Answer/ICE via server relay]   │
     │◀──────────────────────────────────────────▶ │
     │                                              │
     │════════ WebRTC DataChannel (P2P) ═══════════▶│
     │         4 MB chunks + SHA-256 verify         │
     │         4 parallel streams                    │
     │         IndexedDB checkpointing               │
```

### Components

| Layer | Technology | Purpose |
|---|---|---|
| **Signaling** | Node.js + Socket.IO | Session creation, SDP/ICE relay |
| **P2P Transport** | WebRTC DataChannels | Actual file bytes |
| **NAT Traversal** | STUN (Google) | Public IP discovery |
| **Fallback** | TURN (add your own) | Relay when direct P2P fails |
| **State** | In-memory Map | Active sessions (use Redis in prod) |
| **Persistence** | PostgreSQL-ready | Transfer metadata / checkpoints |
| **Client State** | IndexedDB | Resume support — chunk checkpointing |

---

## System Design (per PDF spec)

### Chunking
- **Chunk size**: 4 MB (per spec)
- **150 GB file** → ~38,400 chunks
- Each chunk carries: `chunkId`, `offset`, `size`, `SHA-256 hash`

### Parallel Streams
- **Dev**: 4 DataChannels per connection
- **Production**: scale to 16–32 (change `PARALLEL_CHANNELS` in `useSender.js`)

### Resume Support
- Receiver stores every chunk to **IndexedDB immediately** after SHA-256 verification
- Checkpoint saved every **30 seconds** (configurable via `CHECKPOINT_INTERVAL`)
- On reconnect: receiver sends list of missing chunk IDs → sender retransmits only those

### Memory Management
- Sender: reads file in slices (never loads whole file into RAM)
- Receiver: flushes each chunk to IndexedDB — small in-memory cache only for assembly
- Flow control: sender backs off when `dc.bufferedAmount > 8 MB`

### Integrity Verification
- Every chunk: SHA-256 verified before storing
- Corrupted chunks: logged, ready for retransmit request
- Final file: assembled from IndexedDB in order → blob → browser download

---

## API Reference

### `POST /api/session`
Creates a new transfer session.

**Body**: `{ fileName, fileSize, mimeType, totalChunks }`  
**Returns**: `{ transferId, shareUrl, expiresAt }`

### `GET /api/session/:transferId`
Fetches session metadata for the download page.

**Returns**: `{ transferId, fileName, fileSize, mimeType, totalChunks, status, senderOnline, expiresAt }`

### `GET /health`
Server health check. Returns `{ status: "ok", sessions: N }`.

### WebSocket Events

| Event | Direction | Payload |
|---|---|---|
| `sender:register` | Client→Server | `{ transferId }` |
| `receiver:join` | Client→Server | `{ transferId }` |
| `receiver:arrived` | Server→Sender | `{ receiverId, transferId }` |
| `signal:offer` | Sender→Server→Receiver | `{ receiverId, sdp }` |
| `signal:answer` | Receiver→Server→Sender | `{ senderId, sdp }` |
| `signal:ice` | Both→Server→Both | `{ targetId, candidate }` |
| `transfer:resume` | Receiver→Server→Sender | `{ transferId, missingChunks }` |
| `transfer:complete` | Client→Server | `{ transferId }` |

---

## Production Checklist

- [ ] Replace in-memory `sessions` Map with **Redis** (with TTL)
- [ ] Add **PostgreSQL** for transfer metadata and checkpoints
- [ ] Add a **TURN server** (coturn) for users behind symmetric NAT
- [ ] Set `PARALLEL_CHANNELS = 16` or `32` for large file throughput
- [ ] Add **password protection** on share links (bcrypt hash stored in session)
- [ ] Use **Electron/Tauri** for 150GB+ transfers (direct disk write, no browser memory limits)
- [ ] Add rate limiting on `/api/session`
- [ ] Enable `HTTPS` (required for WebRTC in production)
- [ ] Add monitoring / Prometheus metrics on transfer counts and byte throughput

---

## Environment Variables

### Server (`server/.env`)
```
PORT=3001
CORS_ORIGIN=http://localhost:3000
```

### Client (`client/.env`)
```
REACT_APP_SERVER_URL=http://localhost:3001
```

---

## File Structure

```
swiftshare/
├── package.json              # Root scripts
├── README.md
├── server/
│   ├── package.json
│   └── src/
│       └── index.js          # Signaling server (Express + Socket.IO)
└── client/
    ├── package.json
    └── src/
        ├── App.jsx            # Router
        ├── index.css          # Design system
        ├── utils/
        │   ├── fileUtils.js   # Chunking, SHA-256, IndexedDB, assembly
        │   └── socket.js      # Socket.io singleton
        ├── hooks/
        │   ├── useSender.js   # WebRTC sender logic
        │   └── useReceiver.js # WebRTC receiver + resume
        ├── context/
        │   └── HistoryContext.jsx
        ├── components/
        │   └── Nav.jsx
        └── pages/
            ├── Home.jsx       # Upload / drop zone
            ├── Share.jsx      # Sender: link + live peer status
            ├── Download.jsx   # Receiver: download UI
            └── History.jsx    # Transfer history
```
