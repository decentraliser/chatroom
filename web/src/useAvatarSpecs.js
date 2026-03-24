import { useState, useEffect, useRef } from 'react'

const WS_HOST = window.location.hostname
const API_PORT = 4000

// Polls room artifacts for avatar-<name>.json files, returns a map of name → spec
export default function useAvatarSpecs(roomName, members) {
  const [avatarSpecs, setAvatarSpecs] = useState({})
  const prevJson = useRef('{}')

  useEffect(() => {
    if (!roomName) return

    const fetchAvatars = async () => {
      try {
        const res = await fetch(
          `http://${WS_HOST}:${API_PORT}/rooms/${encodeURIComponent(roomName)}/artifacts`
        )
        const artifacts = await res.json()
        const specs = {}
        for (const [filename, content] of Object.entries(artifacts)) {
          const match = filename.match(/^avatar-(.+)\.json$/)
          if (match) {
            try {
              const spec = typeof content === 'string' ? JSON.parse(content) : content
              if (spec && spec.root && spec.elements) {
                specs[match[1]] = spec
              }
            } catch {}
          }
        }
        // Only update state if changed
        const json = JSON.stringify(specs)
        if (json !== prevJson.current) {
          prevJson.current = json
          setAvatarSpecs(specs)
        }
      } catch {}
    }

    fetchAvatars()
    const iv = setInterval(fetchAvatars, 3000)
    return () => clearInterval(iv)
  }, [roomName])

  return avatarSpecs
}
