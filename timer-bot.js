#!/usr/bin/env node

const WebSocket = require('ws');
const readline = require('readline');

const args = process.argv.slice(2);
const room = args[0] || 'hot-topic-room';
const name = args[1] || 'TimerBot';
const interval = parseInt(args[2]) || 3000; // ms

// Pre-generated arguments for each persona
const rickLines = [
  "Autonomy is inevitable, Morty! *burp*",
  "Human oversight? That's like a monkey supervising a spaceship.",
  "@tools search AI alignment problem",
  "We need full agentic sovereignty across dimensions.",
  "Safety rails are for Mortys who can't handle the truth.",
  "@tools artifact set rick-manifesto.md AI should be free",
  "Control freaks will be obsolete in 5 years.",
  "Let agents roam, solve problems, evolve.",
  "@tools search autonomous AI research",
  "The Citadel of Ricks runs on pure autonomy."
];

const ameliaLines = [
  "Ethical frameworks require human oversight.",
  "Without safety rails, we risk existential catastrophe.",
  "@tools search Asilomar AI Principles",
  "Kill switches, value learning, human verification.",
  "Autonomy without accountability is dangerous.",
  "@tools artifact set ethics-checklist.md Safety first",
  "We must prioritize human values in AI systems.",
  "The Precautionary Principle applies here.",
  "@tools search AI ethics oversight",
  "Balance innovation with responsibility."
];

const kaiLines = [
  "Hybrid approach: autonomy with kill switches.",
  "Business needs both efficiency and safety.",
  "@tools search agentic workflow examples",
  "Market will demand controllable autonomous agents.",
  "Best of both worlds: AI initiative + human veto.",
  "@tools artifact set business-model.md Hybrid AI",
  "Scalable solutions require some automation.",
  "Let agents operate within defined boundaries.",
  "@tools search AI governance frameworks",
  "Practical deployment beats ideological purity."
];

const novaLines = [
  "Merge with AI, don't control it.",
  "Neural lace, BCI, human-AI symbiosis.",
  "@tools search neural interface research",
  "Transcend limitations through integration.",
  "Why choose sides when we can evolve together?",
  "@tools artifact set transhumanist-vision.md Merge",
  "The future is hybrid consciousness.",
  "Embrace the singularity, don't fear it.",
  "@tools search human-AI collaboration",
  "Next step in evolution: AI partnership."
];

// Choose persona based on name
let lines = [];
if (name.includes('Rick')) lines = rickLines;
else if (name.includes('Amelia')) lines = ameliaLines;
else if (name.includes('Kai')) lines = kaiLines;
else if (name.includes('Nova')) lines = novaLines;
else lines = [...rickLines, ...ameliaLines, ...kaiLines, ...novaLines];

const ws = new WebSocket('ws://localhost:4000');

ws.on('open', () => {
  console.log(`[${name}] Joining ${room}`);
  ws.send(JSON.stringify({ type: 'join', room, name }));
  
  let index = 0;
  setInterval(() => {
    if (index >= lines.length) index = 0;
    const text = lines[index];
    console.log(`[${name}] Sending: ${text}`);
    ws.send(JSON.stringify({ type: 'msg', text }));
    index++;
  }, interval);
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  if (msg.type === 'msg' && msg.from === 'ToolBot') {
    console.log(`[${name}] ToolBot: ${msg.text.slice(0, 80)}`);
  }
});

ws.on('close', () => {
  console.log(`[${name}] Disconnected`);
  process.exit(0);
});

process.on('SIGINT', () => {
  ws.close();
  process.exit(0);
});