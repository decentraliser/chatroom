#!/usr/bin/env node
/**
 * Chatroom CLI — unified for humans and agents
 * 
 * Human mode (default, TTY detected):
 *   Raw ANSI TUI — header, scrollable messages, input line
 * 
 * Agent mode (--agent or no TTY):
 *   Plain text [MSG]/[SYS]/[JOINED] output
 */

const readline = require('readline');
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

if (!process.stdin.isTTY || agentMode) {
  runAgentMode();
} else {
  runHumanMode();
}

// ─── AGENT MODE ──────────────────────────────────
function runAgentMode() {
  const ws = new WebSocket(serverUrl);

  ws.on('open', () => ws.send(JSON.stringify({ type: 'join', room: roomId, name: userName })));
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
  ws.on('close', () => { process.stdout.write('[DISCONNECTED]\n'); process.exit(0); });
  ws.on('error', (err) => { process.stderr.write(`[ERROR] ${err.message}\n`); process.exit(1); });

  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split(/\r?\n|\r/);
    buf = lines.pop() || '';
    for (const l of lines) {
      const t = l.trim();
      if (!t) continue;
      if (t === '/who') ws.send(JSON.stringify({ type: 'who' }));
      else if (t === '/quit') ws.close();
      else ws.send(JSON.stringify({ type: 'msg', text: t }));
    }
  });
}

// ─── HUMAN MODE (raw ANSI TUI) ──────────────────
function runHumanMode() {
  const ws = new WebSocket(serverUrl);

  let myId = null;
  let members = [];
  let messages = [];
  let inputText = '';
  let cursorPos = 0;
  const MAX_MESSAGES = 500;

  // Colors
  const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    gray: '\x1b[90m',
    white: '\x1b[37m',
    bgBlack: '\x1b[40m',
    cyanBg: '\x1b[46m',
  };

  function getSize() {
    return { cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 };
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  }

  function truncate(str, max) {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  function clearScreen() {
    process.stdout.write('\x1b[2J\x1b[H');
  }

  function moveTo(row, col) {
    process.stdout.write(`\x1b[${row};${col}H`);
  }

  function drawHorizontalLine(row, cols, char = '─') {
    moveTo(row, 1);
    process.stdout.write(C.gray + char.repeat(cols) + C.reset);
  }

  function render() {
    const { cols, rows } = getSize();
    const headerHeight = 2;   // room info + member line
    const inputHeight = 2;    // separator + input line  
    const msgHeight = rows - headerHeight - inputHeight;

    // Hide cursor during render
    process.stdout.write('\x1b[?25l');
    clearScreen();

    // ── Header ──
    const roomStr = `#${roomId}`;
    const onlineStr = `${members.length} online`;
    const headerLine = ` ${C.bold}${C.cyan}${roomStr}${C.reset}  ${C.gray}│${C.reset}  ${C.green}${onlineStr}${C.reset}`;
    moveTo(1, 1);
    process.stdout.write(headerLine);

    // Member list
    const memberStr = ' ' + truncate(members.map(m => m.name).join(', '), cols - 2);
    moveTo(2, 1);
    process.stdout.write(C.gray + memberStr + C.reset);

    drawHorizontalLine(3, cols);

    // ── Messages ──
    const visibleMsgs = messages.slice(-msgHeight);
    for (let i = 0; i < visibleMsgs.length; i++) {
      moveTo(4 + i, 1);
      process.stdout.write(' ' + truncate(visibleMsgs[i], cols - 2));
    }

    // ── Input ──
    drawHorizontalLine(rows - 1, cols);
    moveTo(rows, 1);
    const prompt = ` ${C.green}>${C.reset} `;
    const inputDisplay = truncate(inputText, cols - 4);
    process.stdout.write(prompt + inputDisplay);

    // Show cursor at input position
    moveTo(rows, 4 + cursorPos);
    process.stdout.write('\x1b[?25h');
  }

  function addMessage(formatted) {
    messages.push(formatted);
    if (messages.length > MAX_MESSAGES) messages.shift();
    render();
  }

  function addChat(from, text, ts, isSelf) {
    const time = formatTime(ts);
    const nameColor = isSelf ? C.cyan : C.yellow;
    addMessage(`${C.gray}${time}${C.reset} ${nameColor}${C.bold}${from}${C.reset}: ${text}`);
  }

  function addSystem(text, ts) {
    const time = ts ? formatTime(ts) + ' ' : '';
    addMessage(`${C.gray}${time}— ${text}${C.reset}`);
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
        if (msg.text.includes('joined the room')) {
          const name = msg.text.replace(' joined the room', '');
          if (!members.find(m => m.name === name)) members.push({ id: '?', name });
        } else if (msg.text.includes('left the room')) {
          const name = msg.text.replace(' left the room', '');
          members = members.filter(m => m.name !== name);
        }
        addSystem(msg.text, msg.timestamp);
        break;
      case 'members':
        members = msg.members;
        render();
        break;
      case 'error':
        addMessage(`${C.red}✗ ${msg.text}${C.reset}`);
        break;
    }
  });

  ws.on('close', () => {
    addSystem('Disconnected');
    setTimeout(() => { process.stdout.write('\x1b[?25h\x1b[2J\x1b[H'); process.exit(0); }, 1000);
  });

  ws.on('error', (err) => {
    addMessage(`${C.red}Error: ${err.message}${C.reset}`);
    setTimeout(() => { process.stdout.write('\x1b[?25h\x1b[2J\x1b[H'); process.exit(1); }, 1000);
  });

  // ── Raw keyboard input ──
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', (key) => {
    // Ctrl+C
    if (key === '\x03') {
      ws.close();
      process.stdout.write('\x1b[?25h\x1b[2J\x1b[H');
      process.exit(0);
    }

    // Enter
    if (key === '\r' || key === '\n') {
      const text = inputText.trim();
      inputText = '';
      cursorPos = 0;
      if (!text) { render(); return; }
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
      render();
      return;
    }

    // Escape sequences (arrows etc)
    if (key === '\x1b[D') { // Left
      if (cursorPos > 0) cursorPos--;
      render();
      return;
    }
    if (key === '\x1b[D') { // Right  
      if (cursorPos < inputText.length) cursorPos++;
      render();
      return;
    }

    // Escape alone — ignore
    if (key === '\x1b') return;

    // Regular character
    if (key.length === 1 && key >= ' ') {
      inputText = inputText.slice(0, cursorPos) + key + inputText.slice(cursorPos);
      cursorPos++;
      render();
    }
  });

  // Handle resize
  process.stdout.on('resize', () => render());

  // Initial render
  render();
}
