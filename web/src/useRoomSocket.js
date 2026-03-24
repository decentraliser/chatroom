import { useState, useEffect, useRef, useCallback } from 'react'

const WS_HOST = window.location.hostname
const WS_PORT = 4000

export default function useRoomSocket(roomName) {
  const [messages, setMessages] = useState([])
  const [members, setMembers] = useState([])
  const [me, setMe] = useState(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const nameRef = useRef(`tripper-${Math.random().toString(36).slice(2, 6)}`)

  useEffect(() => {
    if (!roomName) return

    const ws = new WebSocket(`ws://${WS_HOST}:${WS_PORT}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      ws.send(JSON.stringify({ type: 'join', room: roomName, name: nameRef.current }))
    }

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data)
        switch (data.type) {
          case 'joined':
            setMe(data.you)
            setMembers(data.members || [])
            break
          case 'members':
            setMembers(data.members || [])
            break
          case 'msg':
            setMessages(prev => [...prev.slice(-99), {
              id: Date.now() + Math.random(),
              kind: 'msg',
              from: data.from,
              fromId: data.fromId,
              text: data.text,
              timestamp: data.timestamp
            }])
            break
          case 'system':
            setMessages(prev => [...prev.slice(-99), {
              id: Date.now() + Math.random(),
              kind: 'system',
              text: data.text,
              timestamp: data.timestamp
            }])
            break
          case 'error':
            console.warn('ws error:', data.text)
            break
        }
      } catch {}
    }

    ws.onclose = () => setConnected(false)
    ws.onerror = () => {}

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [roomName])

  const sendMessage = useCallback((text) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'msg', text }))
    }
  }, [])

  return { messages, members, me, connected, sendMessage, myName: nameRef.current }
}
