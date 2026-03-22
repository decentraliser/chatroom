#!/usr/bin/env node
/**
 * Agent-friendly chatroom client.
 * Plain text output, works with PTY submit for agent interaction.
 * 
 * Usage: node agent-cli.js <room> --name <name> [--server ws://localhost:4000]
 */

const readline = require('readline');
const WebSocket = require('ws');

const args = process.argv.slice(2);
let serverUrl = 'ws://localhost:4000';
let roomId = null;
let userName = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--name' && args[i + 1]) {
    userName = args[++i];
  } else if (args[i] === '--server' && args[i + 1]) {
    serverUrl = args[++i];
  } else if (!roomId) {
    roomId = args[i];
  }
}

if (!roomId) {
  console.error('Usage: node agent-cli.js <room-id> --name <name> [--server <url>]');
  process.exit(1);
}

if (!userName) {
  userName = `agent-${Math.random().toString(36).slice(2, 8)}`;
}

const ws = new WebSocket(serverUrl);

// Use readline with terminal:true so PTY submit works
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'join', room: roomId, name: userName }));
});

ws.on('message', (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  // Use process.stdout.write to avoid readline interference
  let line = '';
  switch (msg.type) {
    case 'joined':
      line = `[JOINED] room=${msg.room} name=${msg.you.name} members=${msg.members.map(m => m.name).join(',')}`;
      break;
    case 'msg':
      line = `[MSG] ${msg.from}: ${msg.text}`;
      break;
    case 'system':
      line = `[SYS] ${msg.text}`;
      break;
    case 'members':
      line = `[MEMBERS] ${msg.members.map(m => m.name).join(', ')}`;
      break;
    case 'error':
      line = `[ERROR] ${msg.text}`;
      break;
  }
  if (line) {
    process.stdout.write('\r\x1b[K' + line + '\n');
  }
});

ws.on('close', () => {
  process.stdout.write('[DISCONNECTED]\n');
  process.exit(0);
});

ws.on('error', (err) => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
});

rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;

  if (text === '/who') {
    ws.send(JSON.stringify({ type: 'who' }));
  } else if (text === '/quit' || text === '/exit') {
    ws.close();
  } else {
    ws.send(JSON.stringify({ type: 'msg', text }));
  }
});

rl.on('close', () => {
  ws.close();
});
