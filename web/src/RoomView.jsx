import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ThreeCanvas } from '@json-render/react-three-fiber'
import { defineRegistry } from '@json-render/react'
import { threeComponents, threeComponentDefinitions } from '@json-render/react-three-fiber'
import { defineCatalog } from '@json-render/core'
import { schema } from '@json-render/react/schema'
import { z } from 'zod'
import useRoomSocket from './useRoomSocket'
import useAvatarSpecs from './useAvatarSpecs'
import { buildSpec } from './buildScene'
import { MaskoAvatarComponent } from './MaskoAvatar'

// Register MaskoAvatar as a custom component alongside the built-in three components
const customDefs = {
  ...threeComponentDefinitions,
  MaskoAvatar: {
    props: z.object({
      position: z.tuple([z.number(), z.number(), z.number()]).optional(),
      rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
      scale: z.tuple([z.number(), z.number(), z.number()]).optional(),
      webm: z.string().optional(),
      mov: z.string().optional(),
      src: z.string().optional(),
      size: z.number().optional(),
    }),
    description: 'Animated Masko mascot avatar (transparent video)',
  },
}

const customComponents = {
  ...threeComponents,
  MaskoAvatar: MaskoAvatarComponent,
}

const catalog = defineCatalog(schema, { components: customDefs, actions: {} })
const { registry } = defineRegistry(catalog, { components: customComponents })

export default function RoomView() {
  const { roomName } = useParams()
  const decodedRoom = decodeURIComponent(roomName)
  const { messages, members, me, connected, sendMessage, myName } = useRoomSocket(decodedRoom)
  const avatarSpecs = useAvatarSpecs(decodedRoom, members)
  const [input, setInput] = useState('')
  const logRef = useRef(null)

  // Auto-scroll message log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages])

  const spec = useMemo(
    () => buildSpec(messages, members, decodedRoom, 0, avatarSpecs),
    [messages, members, decodedRoom, avatarSpecs]
  )

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    sendMessage(text)
    setInput('')
  }

  return (
    <div className="room-layout">
      {/* Left panel: chat */}
      <div className="chat-panel">
        <div className="chat-header">
          <Link to="/" className="back-link">← lobby</Link>
          <span className="room-name">🚀 {decodedRoom}</span>
          <div className="member-pills">
            {members.map((m, i) => (
              <span key={m.id || i} className={m.name === myName ? 'me' : ''}>{m.name}</span>
            ))}
            {!connected && <span className="disconnected">disconnected</span>}
          </div>
        </div>

        <div className="message-log" ref={logRef}>
          {messages.map(msg => (
            <div key={msg.id} className={`msg-entry ${msg.kind}`}>
              {msg.kind === 'msg' ? (
                <>
                  <span className="sender" style={{ color: msg.from === myName ? '#ffcc55' : '#88ddff' }}>
                    {msg.from}
                  </span>
                  <span className="msg-text">{msg.text}</span>
                </>
              ) : (
                <span className="system-text">⟡ {msg.text}</span>
              )}
            </div>
          ))}
        </div>

        <div className="chat-input">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="speak into the void..."
          />
          <button onClick={handleSend}>⌁</button>
        </div>
      </div>

      {/* Right: 3D scene */}
      <div className="scene-container">
        <ThreeCanvas
          spec={spec}
          registry={registry}
          style={{ width: '100%', height: '100%', background: '#0a0a1a' }}
          camera={{ position: [12, 14, 14], fov: 30, near: 0.1, far: 200 }}
        />
      </div>
    </div>
  )
}
