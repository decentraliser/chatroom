#!/usr/bin/env node
/**
 * Chatroom TUI — blessed-based terminal UI
 * 
 * ┌─ poker-table ── 3 online ──────────────────┐
 * │ Decentraliser, Rick, Mando                  │
 * ├─────────────────────────────────────────────┤
 * │ 05:01 Decentraliser: yo                     │
 * │ 05:01 Rick: wubba lubba dub dub             │
 * │ 05:02 — Mando joined the room               │
 * │ 05:02 Mando: This is the Way.               │
 * │                                              │
 * ├─────────────────────────────────────────────┤
 * │ > Type a message...                          │
 * └─────────────────────────────────────────────┘
 */

const blessed = require('blessed');
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
  console.error('Usage: node cli.js <room-id> [--name <name>] [--server <url>]');
  process.exit(1);
}

if (!userName) {
  userName = `user-${Math.random().toString(36).slice(2, 8)}`;
}

// ── State ──
let myId = null;
let members = [];

// ── Screen ──
const screen = blessed.screen({
  smartCSR: true,
  title: `chatroom — ${roomId}`,
});

// ── Header: room info + members ──
const header = blessed.box({
  parent: screen,
  top: 0,
  left: 0,
  width: '100%',
  height: 3,
  tags: true,
  border: { type: 'line' },
  style: {
    border: { fg: 'cyan' },
    fg: 'white',
  },
});

function updateHeader() {
  const memberList = members.map(m => m.name).join(', ') || '...';
  header.setContent(
    `{bold}{cyan-fg}${roomId}{/cyan-fg}{/bold}  {gray-fg}${members.length} online{/gray-fg}  │  ${memberList}`
  );
  screen.render();
}
updateHeader();

// ── Messages area ──
const messageBox = blessed.log({
  parent: screen,
  top: 3,
  left: 0,
  width: '100%',
  height: '100%-6',
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  scrollbar: {
    style: { bg: 'cyan' },
  },
  border: { type: 'line' },
  style: {
    border: { fg: 'gray' },
    fg: 'white',
  },
  mouse: true,
});

// ── Input box ──
const inputBox = blessed.textbox({
  parent: screen,
  bottom: 0,
  left: 0,
  width: '100%',
  height: 3,
  border: { type: 'line' },
  style: {
    border: { fg: 'green' },
    fg: 'white',
  },
  inputOnFocus: true,
});

// ── Helpers ──
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function addMessage(line) {
  messageBox.log(line);
  screen.render();
}

function addSystemMessage(text, ts) {
  const time = ts ? formatTime(ts) : '';
  addMessage(`{gray-fg}${time} — ${text}{/gray-fg}`);
}

function addChatMessage(from, text, ts, isSelf) {
  const time = formatTime(ts);
  const nameColor = isSelf ? 'cyan-fg' : 'yellow-fg';
  addMessage(`{gray-fg}${time}{/gray-fg} {${nameColor}}{bold}${from}{/bold}{/${nameColor}}: ${text}`);
}

// ── Focus input ──
function focusInput() {
  inputBox.clearValue();
  inputBox.focus();
  screen.render();
}

// ── Input handling ──
inputBox.on('submit', (value) => {
  const text = (value || '').trim();
  if (!text) {
    focusInput();
    return;
  }

  if (text === '/who') {
    ws.send(JSON.stringify({ type: 'who' }));
  } else if (text === '/quit' || text === '/exit') {
    ws.close();
    return;
  } else if (text.startsWith('/clear')) {
    messageBox.setContent('');
  } else {
    ws.send(JSON.stringify({ type: 'msg', text }));
  }

  focusInput();
});

inputBox.on('cancel', () => {
  focusInput();
});

// ── Keys ──
screen.key(['escape', 'C-c'], () => {
  ws.close();
  process.exit(0);
});

screen.key(['tab'], () => {
  focusInput();
});

// ── WebSocket ──
const ws = new WebSocket(serverUrl);

ws.on('open', () => {
  addSystemMessage('Connecting...');
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
      myId = msg.you.id;
      members = msg.members;
      updateHeader();
      addSystemMessage(`Joined as {bold}${msg.you.name}{/bold}`);
      addSystemMessage(`Members: ${msg.members.map(m => m.name).join(', ')}`);
      focusInput();
      break;

    case 'msg':
      addChatMessage(msg.from, msg.text, msg.timestamp, msg.fromId === myId);
      break;

    case 'system':
      // Update member list on join/leave
      if (msg.text.includes('joined the room')) {
        const name = msg.text.replace(' joined the room', '');
        if (!members.find(m => m.name === name)) {
          members.push({ id: '?', name });
          updateHeader();
        }
      } else if (msg.text.includes('left the room')) {
        const name = msg.text.replace(' left the room', '');
        members = members.filter(m => m.name !== name);
        updateHeader();
      }
      addSystemMessage(msg.text, msg.timestamp);
      break;

    case 'members':
      members = msg.members;
      updateHeader();
      addSystemMessage(`Members: ${msg.members.map(m => m.name).join(', ')}`);
      break;

    case 'error':
      addMessage(`{red-fg}✗ ${msg.text}{/red-fg}`);
      break;
  }
});

ws.on('close', () => {
  addSystemMessage('Disconnected');
  setTimeout(() => process.exit(0), 1000);
});

ws.on('error', (err) => {
  addMessage(`{red-fg}Connection error: ${err.message}{/red-fg}`);
  setTimeout(() => process.exit(1), 1000);
});

// ── Start ──
screen.render();
focusInput();
