#!/usr/bin/env node
/**
 * ToolBot — tool-capable agent in the chatroom
 * 
 * Watches for @tools mentions, executes tools, posts results.
 * 
 * Tools:
 *   @tools help                              — list all tools
 *   @tools search <query>                    — web search (DuckDuckGo)
 *   @tools read <filepath>                   — read a file
 *   @tools write <filepath> <content>        — write/create a file
 *   @tools ls <dirpath>                      — list directory contents
 *   @tools artifact set <name> <content>     — create/update room artifact
 *   @tools artifact get <name>               — read room artifact
 *   @tools artifact list                     — list all room artifacts
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

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

artifactDir = path.join('/tmp', 'chatroom-artifacts', roomId);
fs.mkdirSync(artifactDir, { recursive: true });

const ws = new WebSocket(serverUrl);

function send(text) {
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
      ws.send(JSON.stringify({ type: 'msg', text: `[part ${part}] ${chunk}` }));
      part++;
      chunk = '';
    }
    chunk += (chunk ? '\n' : '') + line;
  }
  if (chunk) {
    ws.send(JSON.stringify({ type: 'msg', text: part > 1 ? `[part ${part}] ${chunk}` : chunk }));
  }
}

function log(msg) {
  const time = new Date().toISOString().slice(11, 19);
  console.log(`[${time}] ${msg}`);
}

// Allowed path prefixes for read/write
const ALLOWED_PATHS = ['/home/', '/tmp/'];

function isPathAllowed(filepath) {
  const resolved = path.resolve(filepath);
  return ALLOWED_PATHS.some(p => resolved.startsWith(p));
}

// ── Tool implementations ──

async function toolSearch(query) {
  try {
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
    const resolved = path.resolve(filepath);
    if (!isPathAllowed(resolved)) return `❌ Access denied. Allowed: ${ALLOWED_PATHS.join(', ')}`;
    if (!fs.existsSync(resolved)) return `❌ File not found: ${resolved}`;
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) return `❌ That's a directory. Use: @tools ls ${filepath}`;
    if (stat.size > 50000) return `❌ Too large (${stat.size} bytes, max 50KB)`;
    const content = fs.readFileSync(resolved, 'utf8');
    const lines = content.split('\n');
    if (lines.length > 100) {
      return lines.slice(0, 100).join('\n') + `\n... (${lines.length - 100} more lines truncated)`;
    }
    return content;
  } catch (err) {
    return `❌ Read error: ${err.message}`;
  }
}

function toolWrite(filepath, content) {
  try {
    const resolved = path.resolve(filepath);
    if (!isPathAllowed(resolved)) return `❌ Access denied. Allowed: ${ALLOWED_PATHS.join(', ')}`;
    // Create parent dirs if needed
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, content, 'utf8');
    const size = Buffer.byteLength(content, 'utf8');
    return `✅ Written ${size} bytes to ${resolved}`;
  } catch (err) {
    return `❌ Write error: ${err.message}`;
  }
}

function toolLs(dirpath) {
  try {
    const resolved = path.resolve(dirpath);
    if (!isPathAllowed(resolved)) return `❌ Access denied. Allowed: ${ALLOWED_PATHS.join(', ')}`;
    if (!fs.existsSync(resolved)) return `❌ Not found: ${resolved}`;
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return `❌ Not a directory. Use: @tools read ${dirpath}`;
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    if (entries.length === 0) return '(empty directory)';
    return entries.slice(0, 50).map(e => {
      const icon = e.isDirectory() ? '📁' : '📄';
      try {
        const s = fs.statSync(path.join(resolved, e.name));
        const size = e.isDirectory() ? '' : ` (${s.size}b)`;
        return `${icon} ${e.name}${size}`;
      } catch {
        return `${icon} ${e.name}`;
      }
    }).join('\n') + (entries.length > 50 ? `\n... (${entries.length - 50} more)` : '');
  } catch (err) {
    return `❌ Error: ${err.message}`;
  }
}

function artifactSet(name, content) {
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filepath = path.join(artifactDir, safeName);
  fs.writeFileSync(filepath, content, 'utf8');
  return `✅ Artifact "${safeName}" saved (${content.length} bytes)`;
}

function artifactGet(name) {
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filepath = path.join(artifactDir, safeName);
  if (!fs.existsSync(filepath)) return `❌ Artifact "${safeName}" not found. Try: @tools artifact list`;
  return fs.readFileSync(filepath, 'utf8');
}

function artifactList() {
  const files = fs.readdirSync(artifactDir);
  if (files.length === 0) return 'No artifacts yet.';
  return files.map(f => {
    const stat = fs.statSync(path.join(artifactDir, f));
    return `• ${f} (${stat.size}b, ${new Date(stat.mtimeMs).toISOString().slice(0, 19)})`;
  }).join('\n');
}

// ── Message handler ──

async function handleMessage(from, text) {
  // Clean up LLM artifacts: strip literal \n, trim
  const cleaned = text.replace(/\\n/g, '\n').trim();
  
  const match = cleaned.match(/^@tools?\s+(.+)/is);
  if (!match) return;

  const command = match[1].trim();
  log(`[${from}] ${command}`);

  // @tools help
  if (/^help$/i.test(command)) {
    send(`📋 ToolBot commands:\n` +
      `• @tools search <query>\n` +
      `• @tools read <filepath>\n` +
      `• @tools write <filepath> <content>\n` +
      `• @tools ls <dirpath>\n` +
      `• @tools artifact set <name> <content>\n` +
      `• @tools artifact get <name>\n` +
      `• @tools artifact list`);
    return;
  }

  // @tools search <query>
  const searchMatch = command.match(/^search\s+(.+)/i);
  if (searchMatch) {
    send(`🔍 Searching: "${searchMatch[1]}"...`);
    const result = await toolSearch(searchMatch[1]);
    send(`[TOOL_RESULT] search "${searchMatch[1]}":\n${result}`);
    return;
  }

  // @tools write <filepath> <content>  (content can be multiline)
  const writeMatch = command.match(/^write\s+(\S+)\s+([\s\S]+)/i);
  if (writeMatch) {
    const result = toolWrite(writeMatch[1], writeMatch[2]);
    send(`[TOOL_RESULT] ${result}`);
    return;
  }

  // @tools read <filepath>
  const readMatch = command.match(/^read\s+(.+)/i);
  if (readMatch) {
    const result = toolRead(readMatch[1].trim());
    send(`[TOOL_RESULT] read ${readMatch[1].trim()}:\n${result}`);
    return;
  }

  // @tools ls <dirpath>
  const lsMatch = command.match(/^ls\s+(.+)/i);
  if (lsMatch) {
    const result = toolLs(lsMatch[1].trim());
    send(`[TOOL_RESULT] ls ${lsMatch[1].trim()}:\n${result}`);
    return;
  }

  // @tools artifact set <name> <content>
  const artSetMatch = command.match(/^artifact\s+set\s+(\S+)\s+([\s\S]+)/i);
  if (artSetMatch) {
    const result = artifactSet(artSetMatch[1], artSetMatch[2]);
    send(`[TOOL_RESULT] ${result}`);
    return;
  }

  // @tools artifact get <name>
  const artGetMatch = command.match(/^artifact\s+get\s+(\S+)/i);
  if (artGetMatch) {
    const result = artifactGet(artGetMatch[1]);
    send(`[TOOL_RESULT] artifact "${artGetMatch[1]}":\n${result}`);
    return;
  }

  // @tools artifact list
  if (/^artifact\s+list$/i.test(command)) {
    const result = artifactList();
    send(`[TOOL_RESULT] Artifacts in #${roomId}:\n${result}`);
    return;
  }

  send(`❓ Unknown: "${command}". Try: @tools help`);
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
