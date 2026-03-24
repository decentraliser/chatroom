// Default avatar: a Masko animated mascot.
// Each user gets a deterministic mascot from the pool based on their name.
// Agents can override via: @tools artifact set avatar-<name>.json <spec>

import { pickDefaultMascot } from './MaskoAvatar.jsx'

export function makeDefaultAvatar(color, username = '') {
  const mascot = pickDefaultMascot(username)

  return {
    root: 'av',
    elements: {
      av: {
        type: 'MaskoAvatar',
        props: {
          position: [0, 0.9, 0],
          webm: mascot.webm,
          mov: mascot.mov,
          size: 200,
        },
      },
    },
  }
}
