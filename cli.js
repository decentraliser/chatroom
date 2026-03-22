#!/usr/bin/env node

const readline = require('readline');
const WebSocket = require('ws');

const args = process.argv.slice(2);
let serverUrl = 'ws://localhost:4000';
let roomId = null;
let userName = null;

// Parse args: cli.js <room> [--name <name>] [--server <url>]
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
  console.error('Usage: node cli.js <room-id> [--name <name>] [--server <url>]');
  process.exit(1);
}

if (!userName) {
  userName = `user-${Math.random().toString(36).slice(2, 8)}`;
}

const ws = new WebSocket(serverUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '',
});

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

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

  // Clear current line, print message, restore prompt
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);

  switch (msg.type) {
    case 'joined':
      console.log(`\x1b[32m✓ Joined room "${msg.room}" as ${msg.you.name}\x1b[0m`);
      console.log(`\x1b[90m  Members: ${msg.members.map(m => m.name).join(', ')}\x1b[0m`);
      break;

    case 'msg':
      if (msg.fromId === myId) {
        // Own message — already typed it, just show timestamp
        console.log(`\x1b[90m${formatTime(msg.timestamp)}\x1b[0m \x1b[36m${msg.from}\x1b[0m: ${msg.text}`);
      } else {
        console.log(`\x1b[90m${formatTime(msg.timestamp)}\x1b[0m \x1b[33m${msg.from}\x1b[0m: ${msg.text}`);
      }
      break;

    case 'system':
      console.log(`\x1b[90m${formatTime(msg.timestamp)} — ${msg.text}\x1b[0m`);
      break;

    case 'members':
      console.log(`\x1b[90mRoom "${msg.room}": ${msg.members.map(m => m.name).join(', ')}\x1b[0m`);
      break;

    case 'error':
      console.log(`\x1b[31m✗ ${msg.text}\x1b[0m`);
      break;
  }

  rl.prompt(true);
});

let myId = null;

// Capture our ID from join response
const origOn = ws.on.bind(ws);
ws.on('message', (raw) => {
  try {
    const msg = JSON.parse(raw);
    if (msg.type === 'joined' && msg.you) {
      myId = msg.you.id;
    }
  } catch {}
});

ws.on('close', () => {
  console.log('\x1b[31mDisconnected from server\x1b[0m');
  process.exit(0);
});

ws.on('error', (err) => {
  console.error(`\x1b[31mConnection error: ${err.message}\x1b[0m`);
  process.exit(1);
});

rl.on('line', (line) => {
  const text = line.trim();
  if (!text) {
    rl.prompt();
    return;
  }

  if (text === '/who') {
    ws.send(JSON.stringify({ type: 'who' }));
  } else if (text === '/quit' || text === '/exit') {
    ws.close();
  } else {
    ws.send(JSON.stringify({ type: 'msg', text }));
  }

  rl.prompt();
});

rl.on('close', () => {
  ws.close();
  process.exit(0);
});
