const http = require('http');
const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');
const fs = require('fs');
const pathMod = require('path');

const ARTIFACT_BASE = pathMod.join('/tmp', 'chatroom-artifacts');

const PORT = process.env.PORT || 4000;
const PING_INTERVAL  = 30_000;        // 30s — detect dead TCP connections
const PING_TIMEOUT   = 10_000;        // 10s pong deadline
const IDLE_TIMEOUT   = 60 * 60_000;   // 1h — evict if no messages sent
const IDLE_SWEEP     = 60_000;        // check for idle connections every 60s

// rooms: Map<roomId, Map<ws, { id, name, joinedAt }>>
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  return rooms.get(roomId);
}

function broadcast(roomId, message, exclude = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const [ws] of room) {
    if (ws !== exclude && ws.readyState === 1) {
      ws.send(payload);
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  if (req.url === '/rooms') {
    const list = [];
    for (const [roomId, members] of rooms) {
      list.push({
        id: roomId,
        members: Array.from(members.values()).map(m => ({
          id: m.id, name: m.name,
          idleSince: Math.round((Date.now() - m.lastActivity) / 1000),
        })),
        count: members.size,
      });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list));
    return;
  }
  // GET /rooms/:roomId/artifacts — list all artifacts for a room
  // GET /rooms/:roomId/artifacts/:name — get a specific artifact
  const artifactMatch = req.url.match(/^\/rooms\/([^/]+)\/artifacts(?:\/([^/]+))?$/);
  if (artifactMatch && req.method === 'GET') {
    const roomId = decodeURIComponent(artifactMatch[1]);
    const name = artifactMatch[2] ? decodeURIComponent(artifactMatch[2]) : null;
    const roomDir = pathMod.join(ARTIFACT_BASE, roomId);
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (!name) {
      // List all artifacts
      try {
        const files = fs.readdirSync(roomDir);
        const result = {};
        for (const f of files) {
          try {
            result[f] = fs.readFileSync(pathMod.join(roomDir, f), 'utf8');
          } catch {}
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      }
    } else {
      // Get specific artifact
      const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filepath = pathMod.join(roomDir, safeName);
      try {
        const content = fs.readFileSync(filepath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(content);
      } catch {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
      }
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let currentRoom = null;
  let userInfo = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', text: 'Invalid JSON' }));
      return;
    }

    switch (msg.type) {
      case 'join': {
        const roomId = msg.room;
        const name = msg.name || `anon-${randomUUID().slice(0, 6)}`;
        if (!roomId) {
          ws.send(JSON.stringify({ type: 'error', text: 'Missing room id' }));
          return;
        }

        // Leave current room if in one
        if (currentRoom) {
          const oldRoom = rooms.get(currentRoom);
          if (oldRoom) {
            oldRoom.delete(ws);
            broadcast(currentRoom, {
              type: 'system',
              text: `${userInfo.name} left the room`,
              timestamp: Date.now(),
            });
            if (oldRoom.size === 0) rooms.delete(currentRoom);
          }
        }

        currentRoom = roomId;
        userInfo = { id: randomUUID(), name, joinedAt: Date.now(), lastActivity: Date.now() };
        const room = getRoom(roomId);
        room.set(ws, userInfo);

        // Confirm join to sender
        ws.send(JSON.stringify({
          type: 'joined',
          room: roomId,
          you: userInfo,
          members: Array.from(room.values()).map(m => ({ id: m.id, name: m.name })),
        }));

        // Announce to others and push updated member list
        broadcast(roomId, {
          type: 'system',
          text: `${name} joined the room`,
          timestamp: Date.now(),
        }, ws);
        broadcast(roomId, {
          type: 'members',
          room: roomId,
          members: Array.from(room.values()).map(m => ({ id: m.id, name: m.name })),
        }, ws);

        break;
      }

      case 'msg': {
        if (!currentRoom || !userInfo) {
          ws.send(JSON.stringify({ type: 'error', text: 'Join a room first' }));
          return;
        }
        userInfo.lastActivity = Date.now();
        const text = (msg.text || '').trim();
        if (!text) return;

        const chatMsg = {
          type: 'msg',
          from: userInfo.name,
          fromId: userInfo.id,
          text,
          timestamp: Date.now(),
        };

        // Send to everyone in room INCLUDING sender
        const room = rooms.get(currentRoom);
        if (room) {
          const payload = JSON.stringify(chatMsg);
          for (const [memberWs] of room) {
            if (memberWs.readyState === 1) {
              memberWs.send(payload);
            }
          }
        }
        break;
      }

      case 'who': {
        if (!currentRoom) {
          ws.send(JSON.stringify({ type: 'error', text: 'Not in a room' }));
          return;
        }
        if (userInfo) userInfo.lastActivity = Date.now();
        const room = rooms.get(currentRoom);
        ws.send(JSON.stringify({
          type: 'members',
          room: currentRoom,
          members: room ? Array.from(room.values()).map(m => ({ id: m.id, name: m.name })) : [],
        }));
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', text: `Unknown type: ${msg.type}` }));
    }
  });

  ws.on('close', () => {
    if (currentRoom && userInfo) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.delete(ws);
        broadcast(currentRoom, {
          type: 'system',
          text: `${userInfo.name} left the room`,
          timestamp: Date.now(),
        });
        // Push authoritative member list so all clients stay in sync
        if (room.size > 0) {
          broadcast(currentRoom, {
            type: 'members',
            room: currentRoom,
            members: Array.from(room.values()).map(m => ({ id: m.id, name: m.name })),
          });
        } else {
          rooms.delete(currentRoom);
        }
      }
    }
  });
});

// ── Ping/Pong heartbeat — detects dead TCP connections ──
wss.on('connection', (ws) => {
  let pongTimer = null;

  function schedulePing() {
    const t = setTimeout(() => {
      pongTimer = setTimeout(() => ws.terminate(), PING_TIMEOUT);
      ws.ping();
    }, PING_INTERVAL);
    t.unref();
    return t;
  }

  let pingTimer = schedulePing();

  ws.on('pong', () => {
    if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
    clearTimeout(pingTimer);
    pingTimer = schedulePing();
  });

  ws.on('close', () => {
    clearTimeout(pingTimer);
    if (pongTimer) clearTimeout(pongTimer);
  });
});

// ── Idle sweep — evict connections with no messages for IDLE_TIMEOUT ──
const idleTimer = setInterval(() => {
  const now = Date.now();
  for (const [roomId, members] of rooms) {
    for (const [ws, info] of members) {
      if (now - info.lastActivity > IDLE_TIMEOUT) {
        // Notify and terminate
        try { ws.send(JSON.stringify({ type: 'system', text: 'Disconnected due to inactivity', timestamp: now })); } catch {}
        ws.terminate();
      }
    }
  }
}, IDLE_SWEEP);
idleTimer.unref();

server.listen(PORT, () => {
  console.log(`Chatroom server listening on ws://localhost:${PORT}`);
});
