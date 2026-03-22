const http = require('http');
const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 4000;

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
        members: Array.from(members.values()).map(m => ({ id: m.id, name: m.name })),
        count: members.size,
      });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list));
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
        userInfo = { id: randomUUID(), name, joinedAt: Date.now() };
        const room = getRoom(roomId);
        room.set(ws, userInfo);

        // Confirm join to sender
        ws.send(JSON.stringify({
          type: 'joined',
          room: roomId,
          you: userInfo,
          members: Array.from(room.values()).map(m => ({ id: m.id, name: m.name })),
        }));

        // Announce to others
        broadcast(roomId, {
          type: 'system',
          text: `${name} joined the room`,
          timestamp: Date.now(),
        }, ws);

        break;
      }

      case 'msg': {
        if (!currentRoom || !userInfo) {
          ws.send(JSON.stringify({ type: 'error', text: 'Join a room first' }));
          return;
        }
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
        if (room.size === 0) rooms.delete(currentRoom);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Chatroom server listening on ws://localhost:${PORT}`);
});
