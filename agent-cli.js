#!/usr/bin/env node
/**
 * Agent-friendly chatroom client.
 * Works with both process(write) and process(submit) from OpenClaw.
 * Plain text output, no ANSI, no cursor manipulation.
 */

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
  process.stderr.write('Usage: node agent-cli.js <room-id> --name <name> [--server <url>]\n');
  process.exit(1);
}

if (!userName) {
  userName = `agent-${Math.random().toString(36).slice(2, 8)}`;
}

const ws = new WebSocket(serverUrl);

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

  switch (msg.type) {
    case 'joined':
      process.stdout.write(`[JOINED] room=${msg.room} name=${msg.you.name} members=${msg.members.map(m => m.name).join(',')}\n`);
      break;
    case 'msg':
      process.stdout.write(`[MSG] ${msg.from}: ${msg.text}\n`);
      break;
    case 'system':
      process.stdout.write(`[SYS] ${msg.text}\n`);
      break;
    case 'members':
      process.stdout.write(`[MEMBERS] ${msg.members.map(m => m.name).join(', ')}\n`);
      break;
    case 'error':
      process.stdout.write(`[ERROR] ${msg.text}\n`);
      break;
  }
});

ws.on('close', () => {
  process.stdout.write('[DISCONNECTED]\n');
  process.exit(0);
});

ws.on('error', (err) => {
  process.stderr.write(`[ERROR] ${err.message}\n`);
  process.exit(1);
});

// Handle stdin manually — split on any newline/CR combo
// This works with both process(write, data="msg\n") and process(submit, data="msg")
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.resume();
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  // Split on \n, \r\n, or \r
  const lines = buffer.split(/\r?\n|\r/);
  // Last element is incomplete (no terminator yet) — keep in buffer
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;

    if (text === '/who') {
      ws.send(JSON.stringify({ type: 'who' }));
    } else if (text === '/quit' || text === '/exit') {
      ws.close();
    } else {
      ws.send(JSON.stringify({ type: 'msg', text }));
    }
  }
});
