import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'

const WS_HOST = window.location.hostname
const API_PORT = 4000

export default function Lobby() {
  const [roomName, setRoomName] = useState('')
  const [rooms, setRooms] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    fetch(`http://${WS_HOST}:${API_PORT}/rooms`)
      .then(r => r.json())
      .then(setRooms)
      .catch(() => {})
    const iv = setInterval(() => {
      fetch(`http://${WS_HOST}:${API_PORT}/rooms`)
        .then(r => r.json())
        .then(setRooms)
        .catch(() => {})
    }, 3000)
    return () => clearInterval(iv)
  }, [])

  const go = () => {
    const name = roomName.trim() || `void-${Date.now().toString(36)}`
    navigate(`/room/${encodeURIComponent(name)}`)
  }

  return (
    <div className="lobby">
      <h1>🍄 chatroom</h1>
      <p style={{ color: '#ff00ff', fontSize: '0.8rem' }}>enter the void</p>
      <input
        placeholder="room name..."
        value={roomName}
        onChange={e => setRoomName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && go()}
        autoFocus
      />
      <button onClick={go}>⌁ enter ⌁</button>
      {rooms.length > 0 && (
        <div className="rooms-list">
          <h3>~ active rooms ~</h3>
          {rooms.map(r => (
            <Link key={r.room} to={`/room/${encodeURIComponent(r.room)}`}>
              {r.room} ({r.members} beings)
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
