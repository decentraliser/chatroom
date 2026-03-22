#!/usr/bin/env node
/**
 * Chatroom CLI — works for both humans and agents
 * 
 * ┌─ poker-table ── 5 online ─────────────────────────────┐
 * │ Decentraliser, Rick, Mando, C-3PO, Morty              │
 * ├────────────────────────────────────────────────────────┤
 * │ 05:01 Decentraliser: yo                                │
 * │ 05:01 Rick: wubba lubba dub dub                        │
 * │ 05:02 — Mando joined the room                          │
 * │ 05:02 Mando: This is the Way.                          │
 * │                                                         │
 * ├────────────────────────────────────────────────────────┤
 * │ > _                                                     │
 * └────────────────────────────────────────────────────────┘
 * 
 * Agent mode (--agent): plain text output, no TUI
 * Human mode (default): blessed TUI with input box
 */

const args = process.argv.slice(2);
let serverUrl = 'ws://localhost:4000';
let roomId = null;
let userName = null;
let agentMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--name' && args[i + 1]) {
    userName = args[++i];
  } else if (args[i] === '--server' && args[i + 1]) {
    serverUrl = args[++i];
  } else if (args[i] === '--agent') {
    agentMode = true;
  } else if (!roomId) {
    roomId = args[i];
  }
}

if (!roomId) {
  console.error('Usage: node cli.js <room-id> [--name <name>] [--server <url>] [--agent]');
  console.error('  --agent   Plain text mode for AI agents (no TUI)');
  process.exit(1);
}

if (!userName) {
  userName = `user-${Math.random().toString(36).slice(2, 8)}`;
}

// Auto-detect: if no TTY (piped stdin) or --agent flag, use agent mode
if (!process.stdin.isTTY || agentMode) {
  runAgentMode();
} else {
  runTuiMode();
}

// ═══════════════════════════════════════════════════
//  AGENT MODE — plain text, works with process(write/submit)
// ═══════════════════════════════════════════════════
function runAgentMode() {
  const WebSocket = require('ws');
  const ws = new WebSocket(serverUrl);

  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'join', room: roomId, name: userName }));
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

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

  ws.on('close', () => { process.stdout.write('[DISCONNECTED]\n'); process.exit(0); });
  ws.on('error', (err) => { process.stderr.write(`[ERROR] ${err.message}\n`); process.exit(1); });

  // Handle stdin — split on any newline combo (works with write and submit)
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n|\r/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const text = line.trim();
      if (!text) continue;
      if (text === '/who') ws.send(JSON.stringify({ type: 'who' }));
      else if (text === '/quit' || text === '/exit') ws.close();
      else ws.send(JSON.stringify({ type: 'msg', text }));
    }
  });
}

// ═══════════════════════════════════════════════════
//  TUI MODE — blessed terminal UI for humans
// ═══════════════════════════════════════════════════
function runTuiMode() {
  const blessed = require('blessed');
  const WebSocket = require('ws');

  let myId = null;
  let members = [];

  // ── Screen ──
  const screen = blessed.screen({
    smartCSR: true,
    title: `chatroom — ${roomId}`,
  });

  // ── Header ──
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
    const names = members.map(m => m.name).join(', ') || '...';
    header.setContent(
      `{bold}{cyan-fg}#${roomId}{/}  |  {green-fg}${members.length} online{/}  |  ${names}`
    );
    screen.render();
  }
  updateHeader();

  // ── Messages ──
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
      border: { fg: '#444444' },
      fg: 'white',
    },
    mouse: true,
  });

  // ── Input ──
  const inputLabel = blessed.box({
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
  });

  const inputBox = blessed.textbox({
    parent: inputLabel,
    top: 0,
    left: 2,
    width: '100%-4',
    height: 1,
    style: {
      fg: 'white',
    },
    inputOnFocus: true,
  });

  const inputPrompt = blessed.text({
    parent: inputLabel,
    top: 0,
    left: 0,
    width: 2,
    height: 1,
    content: '> ',
    style: { fg: 'green' },
  });

  // ── Helpers ──
  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  }

  function addMsg(line) {
    messageBox.log(line);
    screen.render();
  }

  function addSystem(text, ts) {
    const time = ts ? formatTime(ts) + ' ' : '';
    addMsg(`{gray-fg}${time}-- ${text}{/}`);
  }

  function addChat(from, text, ts, isSelf) {
    const time = formatTime(ts);
    if (isSelf) {
      addMsg(`{gray-fg}${time}{/} {cyan-fg}${from}{/}: ${text}`);
    } else {
      addMsg(`{gray-fg}${time}{/} {yellow-fg}${from}{/}: ${text}`);
    }
  }

  function focusInput() {
    inputBox.clearValue();
    inputBox.focus();
    screen.render();
  }

  // ── Input handling ──
  inputBox.on('submit', (value) => {
    const text = (value || '').trim();
    if (!text) { focusInput(); return; }

    if (text === '/who') {
      ws.send(JSON.stringify({ type: 'who' }));
    } else if (text === '/quit' || text === '/exit') {
      ws.close();
      return;
    } else if (text === '/clear') {
      messageBox.setContent('');
    } else {
      ws.send(JSON.stringify({ type: 'msg', text }));
    }
    focusInput();
  });

  inputBox.on('cancel', () => focusInput());

  // ── Keys ──
  screen.key(['escape', 'C-c'], () => { ws.close(); process.exit(0); });
  screen.key(['tab'], () => focusInput());

  // ── WebSocket ──
  const ws = new WebSocket(serverUrl);

  ws.on('open', () => {
    addSystem('Connecting...');
    ws.send(JSON.stringify({ type: 'join', room: roomId, name: userName }));
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'joined':
        myId = msg.you.id;
        members = msg.members;
        updateHeader();
        addSystem(`Joined as ${msg.you.name}`);
        focusInput();
        break;

      case 'msg':
        addChat(msg.from, msg.text, msg.timestamp, msg.fromId === myId);
        break;

      case 'system':
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
        addSystem(msg.text, msg.timestamp);
        break;

      case 'members':
        members = msg.members;
        updateHeader();
        break;

      case 'error':
        addMsg(`  {red-fg}✗ ${msg.text}{/red-fg}`);
        break;
    }
  });

  ws.on('close', () => {
    addSystem('Disconnected');
    setTimeout(() => process.exit(0), 1500);
  });

  ws.on('error', (err) => {
    addMsg(`  {red-fg}Connection error: ${err.message}{/red-fg}`);
    setTimeout(() => process.exit(1), 1500);
  });

  screen.render();
  focusInput();
}
