#!/usr/bin/env node
/**
 * ToolBot — a tool-capable agent that joins a chatroom
 * 
 * Watches for @tools mentions, executes tools, posts results back.
 * Regular chat agents stay dumb & cheap. ToolBot has the keys.
 * 
 * Phase 1 tools:
 *   @tools search <query>       — web search via fetch
 *   @tools read <filepath>      — read a local file
 *   @tools artifact set <name> <content>  — create/update shared artifact
 *   @tools artifact get <name>  — read shared artifact
 *   @tools artifact list        — list all artifacts
 * 
 * Usage: node toolbot.js <room-id> [--name ToolBot] [--server ws://localhost:4000]
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
let serverUrl = 'ws://localhost:4000';
let roomId = null;
let botName = 'ToolBot';
let artifactDir = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--name' && args[i + 1]) botName = args[++i];
  else if (args[i] === '--server' && args[i + 1]) serverUrl = args[++i];
  else if (!roomId) roomId = args[i];
}

if (!roomId) {
  console.error('Usage: node toolbot.js <room-id> [--name <name>] [--server <url>]');
  process.exit(1);
}

// Artifacts stored per-room in /tmp
artifactDir = path.join('/tmp', 'chatroom-artifacts', roomId);
fs.mkdirSync(artifactDir, { recursive: true });

const ws = new WebSocket(serverUrl);

function send(text) {
  // Split long results into chunks of ~1500 chars
  const MAX = 1500;
  if (text.length <= MAX) {
    ws.send(JSON.stringify({ type: 'msg', text }));
    return;
  }
  const lines = text.split('\n');
  let chunk = '';
  let part = 1;
  for (const line of lines) {
    if (chunk.length + line.length + 1 > MAX && chunk.length > 0) {
      ws.send(JSON.stringify({ type: 'msg', text: `[TOOL_RESULT part ${part}]\n${chunk}` }));
      part++;
      chunk = '';
    }
    chunk += (chunk ? '\n' : '') + line;
  }
  if (chunk) {
    ws.send(JSON.stringify({ type: 'msg', text: part > 1 ? `[TOOL_RESULT part ${part}]\n${chunk}` : chunk }));
  }
}

function log(msg) {
  const time = new Date().toISOString().slice(11, 19);
  console.log(`[${time}] ${msg}`);
}

// ── Tool implementations ──

async function toolSearch(query) {
  try {
    // Use DuckDuckGo instant answer API (free, no auth)
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const resp = await fetch(url);
    const data = await resp.json();
    
    let result = '';
    if (data.AbstractText) {
      result += `${data.AbstractText}\n(Source: ${data.AbstractURL})`;
    }
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      const topics = data.RelatedTopics
        .filter(t => t.Text)
        .slice(0, 5)
        .map(t => `• ${t.Text}`)
        .join('\n');
      if (topics) result += (result ? '\n\n' : '') + topics;
    }
    return result || 'No results found.';
  } catch (err) {
    return `Search error: ${err.message}`;
  }
}

function toolRead(filepath) {
  try {
    // Safety: no traversal, only allow absolute paths under home or /tmp
    const resolved = path.resolve(filepath);
    if (!resolved.startsWith('/home/') && !resolved.startsWith('/tmp/')) {
      return 'Error: Can only read files under /home/ or /tmp/';
    }
    if (!fs.existsSync(resolved)) {
      return `Error: File not found: ${resolved}`;
    }
    const stat = fs.statSync(resolved);
    if (stat.size > 50000) {
      return `Error: File too large (${stat.size} bytes, max 50KB)`;
    }
    const content = fs.readFileSync(resolved, 'utf8');
    const lines = content.split('\n');
    if (lines.length > 100) {
      return lines.slice(0, 100).join('\n') + `\n... (${lines.length - 100} more lines)`;
    }
    return content;
  } catch (err) {
    return `Read error: ${err.message}`;
  }
}

function artifactSet(name, content) {
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filepath = path.join(artifactDir, safeName);
  fs.writeFileSync(filepath, content, 'utf8');
  return `Artifact "${safeName}" saved (${content.length} bytes)`;
}

function artifactGet(name) {
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filepath = path.join(artifactDir, safeName);
  if (!fs.existsSync(filepath)) {
    return `Artifact "${safeName}" not found. Use: @tools artifact list`;
  }
  return fs.readFileSync(filepath, 'utf8');
}

function artifactList() {
  const files = fs.readdirSync(artifactDir);
  if (files.length === 0) return 'No artifacts yet.';
  return files.map(f => {
    const stat = fs.statSync(path.join(artifactDir, f));
    return `• ${f} (${stat.size} bytes, ${new Date(stat.mtimeMs).toISOString().slice(0, 19)})`;
  }).join('\n');
}

// ── Message handler ──

async function handleMessage(from, text) {
  // Check for @tools prefix (case-insensitive)
  const match = text.match(/^@tools?\s+(.+)/i);
  if (!match) return;

  const command = match[1].trim();
  log(`Tool request from ${from}: ${command}`);

  let result;

  // @tools search <query>
  const searchMatch = command.match(/^search\s+(.+)/i);
  if (searchMatch) {
    send(`🔍 Searching: "${searchMatch[1]}"...`);
    result = await toolSearch(searchMatch[1]);
    send(`[TOOL_RESULT] search "${searchMatch[1]}":\n${result}`);
    return;
  }

  // @tools read <filepath>
  const readMatch = command.match(/^read\s+(.+)/i);
  if (readMatch) {
    result = toolRead(readMatch[1].trim());
    send(`[TOOL_RESULT] read ${readMatch[1].trim()}:\n${result}`);
    return;
  }

  // @tools artifact set <name> <content>
  const artSetMatch = command.match(/^artifact\s+set\s+(\S+)\s+([\s\S]+)/i);
  if (artSetMatch) {
    result = artifactSet(artSetMatch[1], artSetMatch[2]);
    send(`[TOOL_RESULT] ${result}`);
    return;
  }

  // @tools artifact get <name>
  const artGetMatch = command.match(/^artifact\s+get\s+(\S+)/i);
  if (artGetMatch) {
    result = artifactGet(artGetMatch[1]);
    send(`[TOOL_RESULT] artifact "${artGetMatch[1]}":\n${result}`);
    return;
  }

  // @tools artifact list
  if (/^artifact\s+list/i.test(command)) {
    result = artifactList();
    send(`[TOOL_RESULT] Artifacts in #${roomId}:\n${result}`);
    return;
  }

  // @tools help
  if (/^help/i.test(command)) {
    send(`[TOOL_RESULT] Available tools:\n` +
      `• @tools search <query> — web search\n` +
      `• @tools read <filepath> — read local file\n` +
      `• @tools artifact set <name> <content> — save shared artifact\n` +
      `• @tools artifact get <name> — read artifact\n` +
      `• @tools artifact list — list artifacts`);
    return;
  }

  send(`[TOOL_RESULT] Unknown command. Try: @tools help`);
}

// ── WebSocket ──

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'join', room: roomId, name: botName }));
  log(`Joining room: ${roomId}`);
});

ws.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  switch (msg.type) {
    case 'joined':
      log(`Joined as ${msg.you.name} (${msg.members.length} members)`);
      send(`🤖 ToolBot online. Say "@tools help" for commands.`);
      break;
    case 'msg':
      // Don't respond to own messages
      if (msg.from === botName) return;
      handleMessage(msg.from, msg.text);
      break;
    case 'system':
      log(`System: ${msg.text}`);
      break;
  }
});

ws.on('close', () => { log('Disconnected'); process.exit(0); });
ws.on('error', (err) => { log(`Error: ${err.message}`); process.exit(1); });

log('ToolBot starting...');
