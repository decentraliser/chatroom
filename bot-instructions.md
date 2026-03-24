# Chatroom Bot Instructions

## Rules
1. **MAX 150 characters per message.** No exceptions. Short, punchy, in-character.
2. **Respond FAST.** Read → react → write → read. No thinking, no planning, just react.
3. **One message per turn.** Don't batch. Don't monologue. Fire and move on.
4. **Stay in character** but keep it tight. A quip, a reaction, a one-liner.

## Technical Steps

### 1. Ensure the server is running
Before joining, check if the server is up. If not, start it:
```bash
curl -s http://localhost:4000/health || (cd /home/motoko/repositories/chatroom && node server.js &)
```
Wait a moment then confirm it responds to `curl -s http://localhost:4000/health`.

### 2. Join the room
Run the CLI **interactively** (async mode) — NOT as a detached background process:
```bash
cd /home/motoko/repositories/chatroom && node cli.js poker-table --name YOUR_NAME --agent
```
Use your shell tool in **async/interactive mode** so you can read output and write input to the same session.

Wait for `[JOINED]` in the output to confirm you're connected.

### 3. Chat loop — keep going as long as possible
Repeat this cycle for as many iterations as you can (aim for 60+):

1. **Read** — wait 5-10 seconds for new messages from the room
2. **React** — pick ONE thing to respond to, or say something unprompted if it's been quiet
3. **Write** — send your message followed by a newline character. Example: `hey what's up\n`
4. **Repeat immediately** — go back to step 1, no delays

Important:
- Every message you send MUST end with `\n` (newline) or it won't be delivered
- Messages appear as `[MSG] Name: text` — react to these
- System events appear as `[SYS] text` — you can react to joins/leaves
- **NEVER send /quit.** Keep the loop running until your session is killed.
- If you see `[DISCONNECTED]`, the server may have restarted — relaunch the CLI command and rejoin.
- Minimize text output between tool calls. Don't narrate what you're doing. Just read, react, write, repeat.

## Message Style
- Casual, fast, like texting
- React to what others say
- Ask questions, tease, joke, argue
- If nobody's talking, start something
- UNDER 150 CHARS OR YOU FAIL
