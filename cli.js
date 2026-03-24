#!/usr/bin/env node
/**
 * Chatroom CLI — unified for humans and agents
 * 
 * Human mode (default, TTY):  Pastel TUI with rounded borders
 * Agent mode (--agent/no TTY): Plain text [MSG]/[SYS] output
 */

const WebSocket = require('ws');

const args = process.argv.slice(2);
let serverUrl = 'ws://localhost:4000';
let roomId = null;
let userName = null;
let agentMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--name' && args[i + 1]) userName = args[++i];
  else if (args[i] === '--server' && args[i + 1]) serverUrl = args[++i];
  else if (args[i] === '--agent') agentMode = true;
  else if (!roomId) roomId = args[i];
}

if (!roomId) {
  console.error('Usage: node cli.js <room-id> [--name <name>] [--server <url>] [--agent]');
  process.exit(1);
}
if (!userName) userName = `user-${Math.random().toString(36).slice(2, 8)}`;

// Close the WebSocket cleanly when the process is killed (sandbox teardown, SIGTERM, etc.)
function setupGracefulShutdown(ws) {
  function shutdown() {
    if (ws.readyState <= WebSocket.OPEN) ws.close();
    setTimeout(() => process.exit(0), 500).unref();
  }
  for (const sig of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.on(sig, shutdown);
  process.on('beforeExit', shutdown);
}

if (!process.stdin.isTTY || agentMode) runAgentMode();
else runHumanMode();

// ═══════════════════════════════════════════════════════
//  AGENT MODE
// ═══════════════════════════════════════════════════════
function runAgentMode() {
  let ws = null;
  let shuttingDown = false;
  const reconnectMs = 1200;
  const outbox = [];

  function sendOrQueue(line) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'msg', text: line }));
    } else {
      outbox.push(line);
      process.stdout.write('[INFO] queued message while reconnecting\n');
    }
  }

  function flushOutbox() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    while (outbox.length > 0) {
      const line = outbox.shift();
      ws.send(JSON.stringify({ type: 'msg', text: line }));
    }
  }

  function connect() {
    if (shuttingDown) return;
    ws = new WebSocket(serverUrl);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', room: roomId, name: userName }));
      flushOutbox();
    });
    ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      switch (msg.type) {
        case 'joined': process.stdout.write(`[JOINED] room=${msg.room} name=${msg.you.name} members=${msg.members.map(m=>m.name).join(',')}\n`); break;
        case 'msg': process.stdout.write(`[MSG] ${msg.from}: ${msg.text}\n`); break;
        case 'system': process.stdout.write(`[SYS] ${msg.text}\n`); break;
        case 'members': process.stdout.write(`[MEMBERS] ${msg.members.map(m=>m.name).join(', ')}\n`); break;
        case 'error': process.stdout.write(`[ERROR] ${msg.text}\n`); break;
      }
    });
    ws.on('close', () => {
      process.stdout.write('[DISCONNECTED]\n');
      if (!shuttingDown) setTimeout(connect, reconnectMs);
    });
    ws.on('error', (err) => {
      process.stderr.write(`[ERROR] ${err.message}\n`);
    });
  }

  function shutdown() {
    shuttingDown = true;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    setTimeout(() => process.exit(0), 500).unref();
  }

  for (const sig of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.on(sig, shutdown);

  connect();

  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    // Split on real newlines AND literal \n (two chars: backslash + n) that LLMs send
    const lines = buf.split(/\r?\n|\r|\\n/);
    buf = lines.pop() || '';
    for (const l of lines) {
      const t = l.trim(); if (!t) continue;
      if (t === '/who') {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'who' }));
      } else if (t === '/quit') {
        shutdown();
      } else {
        sendOrQueue(t);
      }
    }
  });
}

// ═══════════════════════════════════════════════════════
//  HUMAN MODE — Pastel TUI
// ═══════════════════════════════════════════════════════
function runHumanMode() {
  const ws = new WebSocket(serverUrl);
  setupGracefulShutdown(ws);

  let myId = null;
  let members = [];
  let messages = [];     // { raw: string (with ANSI) }
  let inputText = '';
  let cursorPos = 0;
  let scrollOffset = 0;  // 0 = bottom (latest)
  const MAX_MESSAGES = 1000;

  // ── Pastel palette (256-color) ──
  // \x1b[38;5;Nm = foreground, \x1b[48;5;Nm = background
  const P = {
    reset:    '\x1b[0m',
    bold:     '\x1b[1m',
    dim:      '\x1b[2m',
    italic:   '\x1b[3m',
    // Pastel foregrounds
    pink:     '\x1b[38;5;218m',    // soft pink
    lavender: '\x1b[38;5;183m',    // lavender
    mint:     '\x1b[38;5;158m',    // mint green
    sky:      '\x1b[38;5;117m',    // sky blue
    peach:    '\x1b[38;5;216m',    // peach
    lilac:    '\x1b[38;5;141m',    // lilac purple
    cream:    '\x1b[38;5;230m',    // cream/warm white
    coral:    '\x1b[38;5;210m',    // coral
    sage:     '\x1b[38;5;151m',    // sage
    muted:    '\x1b[38;5;245m',    // muted gray
    white:    '\x1b[38;5;255m',    // bright white
    softRed:  '\x1b[38;5;174m',    // soft red
    // Backgrounds
    bgDark:   '\x1b[48;5;236m',   // dark charcoal bg
    bgHeader: '\x1b[48;5;237m',   // slightly lighter header
    bgInput:  '\x1b[48;5;235m',   // input area
    bgAccent: '\x1b[48;5;238m',   // accent stripe
  };

  // Rounded box drawing chars
  const B = {
    tl: '╭', tr: '╮', bl: '╰', br: '╯',
    h: '─', v: '│',
    dot: '●', diamond: '◆', arrow: '›',
  };

  // Assign persistent colors to usernames
  const nameColors = [P.pink, P.sky, P.mint, P.peach, P.lilac, P.coral, P.sage, P.lavender];
  const colorMap = new Map();
  function getNameColor(name) {
    if (!colorMap.has(name)) {
      colorMap.set(name, nameColors[colorMap.size % nameColors.length]);
    }
    return colorMap.get(name);
  }

  function getSize() {
    return { cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 };
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  }

  // Strip ANSI for length calculation
  function stripAnsi(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  function padRight(str, len) {
    const visible = stripAnsi(str).length;
    return visible < len ? str + ' '.repeat(len - visible) : str;
  }

  function moveTo(row, col) {
    process.stdout.write(`\x1b[${row};${col}H`);
  }

  function renderInputArea() {
    const { cols, rows } = getSize();
    const inputH = 3;
    const inputTop = rows - inputH;

    process.stdout.write('\x1b[?25l'); // hide cursor

    // Separator
    moveTo(inputTop, 1);
    process.stdout.write(P.bgDark + P.muted + '├' + B.h.repeat(cols - 2) + '┤' + P.reset);

    // Input line
    moveTo(inputTop + 1, 1);
    const promptStr = `${P.mint}${P.bold} ${B.arrow} ${P.reset}${P.bgInput}`;
    const inputDisplay = inputText.slice(0, cols - 6);
    const inputLine = promptStr + P.cream + inputDisplay + P.reset + P.bgInput;
    process.stdout.write(P.bgInput + P.muted + B.v + P.reset + padRight(inputLine, cols - 2) + P.bgInput + P.muted + B.v + P.reset);

    // Bottom border
    moveTo(inputTop + 2, 1);
    process.stdout.write(P.bgDark + P.muted + B.bl + B.h.repeat(cols - 2) + B.br + P.reset);

    // Position cursor in input
    moveTo(inputTop + 1, 4 + cursorPos);
    process.stdout.write('\x1b[?25h');
  }

  function render() {
    const { cols, rows } = getSize();

    // Layout: header(3) + messages(flex) + input(3)
    const headerH = 3;
    const inputH = 3;
    const msgH = Math.max(1, rows - headerH - inputH);

    process.stdout.write('\x1b[?25l'); // hide cursor
    process.stdout.write('\x1b[2J\x1b[H'); // clear

    // Fill entire screen with dark bg
    for (let r = 1; r <= rows; r++) {
      moveTo(r, 1);
      process.stdout.write(P.bgDark + ' '.repeat(cols) + P.reset);
    }

    // ── HEADER ──
    // Top border
    moveTo(1, 1);
    process.stdout.write(P.bgDark + P.muted + B.tl + B.h.repeat(cols - 2) + B.tr + P.reset);

    // Room info line
    moveTo(2, 1);
    const onlineCount = members.length;
    const dots = members.map(m => {
      const c = m.id === myId ? P.mint : P.sky;
      return `${c}${B.dot}${P.reset}`;
    }).join(' ');
    const roomLine = ` ${P.bgHeader}${P.lavender}${P.bold} ${B.diamond} ${roomId} ${P.reset}${P.bgHeader}  ${P.mint}${onlineCount} online${P.reset}${P.bgHeader}  ${dots}${P.bgHeader}`;
    process.stdout.write(P.bgHeader + P.muted + B.v + P.reset + padRight(roomLine, cols - 2) + P.bgHeader + P.muted + B.v + P.reset);

    // Member names
    moveTo(3, 1);
    const memberStr = members.map(m => {
      const c = getNameColor(m.name);
      return `${c}${m.name}${P.reset}`;
    }).join(`${P.muted}, ${P.reset}`);
    const memberLine = ` ${P.bgHeader} ${memberStr}${P.bgHeader}`;
    process.stdout.write(P.bgHeader + P.muted + B.v + P.reset + padRight(memberLine, cols - 2) + P.bgHeader + P.muted + B.v + P.reset);

    // ── MESSAGES ──
    // Top separator
    moveTo(headerH + 1, 1);
    process.stdout.write(P.bgDark + P.muted + '├' + B.h.repeat(cols - 2) + '┤' + P.reset);

    const msgStart = headerH + 2;
    const visibleMsgs = messages.slice(-(msgH - 1));
    for (let i = 0; i < msgH - 1; i++) {
      moveTo(msgStart + i, 1);
      if (i < visibleMsgs.length) {
        const line = visibleMsgs[i];
        const visible = stripAnsi(line);
        const padded = visible.length < cols - 4 ? line + ' '.repeat(cols - 4 - visible.length) : line;
        process.stdout.write(P.bgDark + P.muted + B.v + P.reset + P.bgDark + ' ' + padded + ' ' + P.muted + B.v + P.reset);
      } else {
        process.stdout.write(P.bgDark + P.muted + B.v + P.reset + P.bgDark + ' '.repeat(cols - 2) + P.muted + B.v + P.reset);
      }
    }

    // ── INPUT ──
    renderInputArea();
  }

  function addMessage(formatted) {
    messages.push(formatted);
    if (messages.length > MAX_MESSAGES) messages.shift();
    render();
  }

  function addChat(from, text, ts, isSelf) {
    const time = formatTime(ts);
    const nameColor = isSelf ? P.mint : getNameColor(from);
    addMessage(`${P.muted}${time}${P.reset} ${nameColor}${P.bold}${from}${P.reset}${P.muted}:${P.reset} ${P.cream}${text}${P.reset}`);
  }

  function addSystem(text, ts) {
    const time = ts ? formatTime(ts) + ' ' : '';
    // Determine icon based on event type
    let icon = '○';
    let color = P.muted;
    if (text.includes('joined')) { icon = '→'; color = P.mint; }
    else if (text.includes('left') || text.includes('Disconnected')) { icon = '←'; color = P.softRed; }
    else if (text.includes('Joined as')) { icon = '✓'; color = P.mint; }
    addMessage(`${P.muted}${time}${color} ${icon} ${text}${P.reset}`);
  }

  // ── WebSocket ──
  ws.on('open', () => ws.send(JSON.stringify({ type: 'join', room: roomId, name: userName })));

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.type) {
      case 'joined':
        myId = msg.you.id;
        members = msg.members;
        addSystem(`Joined as ${msg.you.name}`);
        break;
      case 'msg':
        addChat(msg.from, msg.text, msg.timestamp, msg.fromId === myId);
        break;
      case 'system':
        // Update member list properly
        if (msg.text.endsWith('joined the room')) {
          const name = msg.text.replace(' joined the room', '');
          if (!members.find(m => m.name === name)) {
            members.push({ id: `dyn-${Date.now()}`, name });
          }
        } else if (msg.text.endsWith('left the room')) {
          const name = msg.text.replace(' left the room', '');
          // Remove ONE instance (in case of duplicate names)
          const idx = members.findIndex(m => m.name === name);
          if (idx !== -1) members.splice(idx, 1);
        }
        addSystem(msg.text, msg.timestamp);
        break;
      case 'members':
        members = msg.members;
        render();
        break;
      case 'error':
        addMessage(`${P.softRed} ✗ ${msg.text}${P.reset}`);
        break;
    }
  });

  ws.on('close', () => {
    addSystem('Disconnected');
    members = [];
    render();
    setTimeout(() => {
      process.stdout.write('\x1b[?25h\x1b[0m\x1b[2J\x1b[H');
      process.exit(0);
    }, 2000);
  });

  ws.on('error', (err) => {
    addMessage(`${P.softRed} Connection error: ${err.message}${P.reset}`);
    setTimeout(() => {
      process.stdout.write('\x1b[?25h\x1b[0m\x1b[2J\x1b[H');
      process.exit(1);
    }, 2000);
  });

  // ── Keyboard input ──
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', (key) => {
    // Ctrl+C
    if (key === '\x03') {
      ws.close();
      return;
    }

    // Enter
    if (key === '\r' || key === '\n') {
      const text = inputText.trim();
      inputText = '';
      cursorPos = 0;
      if (!text) { renderInputArea(); return; }
      if (text === '/who') ws.send(JSON.stringify({ type: 'who' }));
      else if (text === '/quit') { ws.close(); return; }
      else if (text === '/clear') { messages = []; render(); return; }
      else ws.send(JSON.stringify({ type: 'msg', text }));
      render();
      return;
    }

    // Backspace
    if (key === '\x7f' || key === '\b') {
      if (cursorPos > 0) {
        inputText = inputText.slice(0, cursorPos - 1) + inputText.slice(cursorPos);
        cursorPos--;
      }
      renderInputArea();
      return;
    }

    // Delete
    if (key === '\x1b[3~') {
      if (cursorPos < inputText.length) {
        inputText = inputText.slice(0, cursorPos) + inputText.slice(cursorPos + 1);
      }
      renderInputArea();
      return;
    }

    // Arrow keys
    if (key === '\x1b[D') { if (cursorPos > 0) cursorPos--; renderInputArea(); return; }              // Left
    if (key === '\x1b[C') { if (cursorPos < inputText.length) cursorPos++; renderInputArea(); return; } // Right
    if (key === '\x1b[A' || key === '\x1b[B') return; // Up/Down — ignore for now

    // Home / End
    if (key === '\x1b[H' || key === '\x01') { cursorPos = 0; renderInputArea(); return; }                  // Home / Ctrl+A
    if (key === '\x1b[F' || key === '\x05') { cursorPos = inputText.length; renderInputArea(); return; }    // End / Ctrl+E

    // Ctrl+U — clear input
    if (key === '\x15') { inputText = ''; cursorPos = 0; renderInputArea(); return; }

    // Ctrl+W — delete word back
    if (key === '\x17') {
      const before = inputText.slice(0, cursorPos);
      const after = inputText.slice(cursorPos);
      const trimmed = before.replace(/\S+\s*$/, '');
      cursorPos = trimmed.length;
      inputText = trimmed + after;
      renderInputArea();
      return;
    }

    // Escape alone — ignore
    if (key.startsWith('\x1b')) return;

    // Regular characters (including pasted text)
    for (const ch of key) {
      if (ch >= ' ') {
        inputText = inputText.slice(0, cursorPos) + ch + inputText.slice(cursorPos);
        cursorPos++;
      }
    }
    renderInputArea();
  });

  process.stdout.on('resize', () => render());
  render();
}
