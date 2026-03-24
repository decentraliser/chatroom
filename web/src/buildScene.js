// Spaceship bridge interior — cozy top-down isometric view

import { makeDefaultAvatar } from './defaultAvatar.js'

const PALETTE = [
  '#ff88aa', '#88ddff', '#ffdd66', '#ff7766', '#77eebb',
  '#ffaa55', '#bb88ff', '#66ffcc', '#ff77cc', '#77bbff',
]

function hashColor(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

// Avatars hang out in the bridge area, loosely scattered
function seatPosition(index, total) {
  // Predefined cozy spots on the bridge
  const spots = [
    { x: -2, z: 0.5 },
    { x: 2, z: 0.5 },
    { x: -1, z: 2.5 },
    { x: 1, z: 2.5 },
    { x: 0, z: 1.5 },
    { x: -3, z: 2 },
    { x: 3, z: 2 },
    { x: -2, z: 3.5 },
    { x: 2, z: 3.5 },
    { x: 0, z: 3.5 },
  ]
  if (index < spots.length) return spots[index]
  // Overflow: spread further back
  const col = index % 4
  const row = Math.floor(index / 4)
  return { x: -3 + col * 2, z: 4 + row * 2 }
}

let _id = 0
function uid(prefix) { return `${prefix}-${_id++}` }

function mergeAvatarSpec(spec, prefix, elements) {
  const keyMap = {}
  for (const key of Object.keys(spec.elements)) {
    keyMap[key] = `${prefix}${key}`
  }
  for (const [key, el] of Object.entries(spec.elements)) {
    const newEl = { ...el, props: { ...el.props } }
    if (el.children) {
      newEl.children = el.children.map(c => keyMap[c] || `${prefix}${c}`)
    }
    elements[keyMap[key]] = newEl
  }
  return keyMap[spec.root]
}

export function buildSpec(messages, members, roomName, tick, avatarSpecs = {}) {
  _id = 0
  const elements = {}
  const rootChildren = []

  // ── Controls (camera set via ThreeCanvas props) ──
  elements['controls'] = {
    type: 'OrbitControls',
    props: {
      enableDamping: true, enableRotate: false, enableZoom: true,
      target: [0, 0, 2],
    },
  }
  rootChildren.push('controls')

  // ── Space background ──
  elements['stars'] = {
    type: 'Stars',
    props: { radius: 80, depth: 50, count: 3000, factor: 4, saturation: 0.2, fade: true, speed: 0.3 },
  }
  rootChildren.push('stars')

  // ── Lighting ──
  elements['ambient'] = {
    type: 'AmbientLight',
    props: { color: '#aabbdd', intensity: 0.4 },
  }
  rootChildren.push('ambient')

  // Main overhead light — bridge ceiling
  elements['overhead'] = {
    type: 'DirectionalLight',
    props: { position: [0, 10, 2], color: '#ddeeff', intensity: 0.6 },
  }
  rootChildren.push('overhead')

  // Console glow — blue from the front viewport
  elements['viewport-light'] = {
    type: 'PointLight',
    props: { position: [0, 2, -5], color: '#4488cc', intensity: 2, distance: 12 },
  }
  rootChildren.push('viewport-light')

  // Warm accent from the back
  elements['rear-light'] = {
    type: 'PointLight',
    props: { position: [0, 2, 7], color: '#ffaa55', intensity: 1, distance: 10 },
  }
  rootChildren.push('rear-light')

  // Side accent lights (red/blue like a real bridge)
  elements['port-light'] = {
    type: 'PointLight',
    props: { position: [-5, 1.5, 1], color: '#ff4444', intensity: 0.6, distance: 8 },
  }
  rootChildren.push('port-light')
  elements['starboard-light'] = {
    type: 'PointLight',
    props: { position: [5, 1.5, 1], color: '#4466ff', intensity: 0.6, distance: 8 },
  }
  rootChildren.push('starboard-light')

  // ── Bridge floor ──
  // Main deck plate
  elements['floor'] = {
    type: 'Plane',
    props: {
      position: [0, 0, 2], rotation: [-Math.PI / 2, 0, 0],
      width: 12, height: 14,
      material: { color: '#2a2a3a', roughness: 0.3, metalness: 0.8 },
    },
  }
  rootChildren.push('floor')

  // Floor center walkway strip
  elements['walkway'] = {
    type: 'Plane',
    props: {
      position: [0, 0.005, 2], rotation: [-Math.PI / 2, 0, 0],
      width: 2, height: 12,
      material: { color: '#334455', roughness: 0.4, metalness: 0.6 },
    },
  }
  rootChildren.push('walkway')

  // Floor guide lights along the walkway
  const guideLightZ = [-2, 0, 2, 4, 6]
  guideLightZ.forEach((z, i) => {
    const leftId = uid('guide-l')
    const rightId = uid('guide-r')
    elements[leftId] = {
      type: 'Box',
      props: {
        position: [-1.1, 0.02, z], scale: [0.15, 0.02, 0.4],
        material: { color: '#ffaa44', emissive: '#ffaa44', emissiveIntensity: 1.5, transparent: true, opacity: 0.7 },
      },
    }
    elements[rightId] = {
      type: 'Box',
      props: {
        position: [1.1, 0.02, z], scale: [0.15, 0.02, 0.4],
        material: { color: '#ffaa44', emissive: '#ffaa44', emissiveIntensity: 1.5, transparent: true, opacity: 0.7 },
      },
    }
    rootChildren.push(leftId, rightId)
  })

  // ── Front viewport window (the big space window) ──
  elements['viewport-frame'] = {
    type: 'Box',
    props: {
      position: [0, 1.5, -4.5], scale: [10, 3, 0.15],
      material: { color: '#1a1a2a', roughness: 0.1, metalness: 0.9 },
    },
  }
  rootChildren.push('viewport-frame')

  // The "window" — a glowing panel representing deep space
  elements['viewport-glass'] = {
    type: 'Plane',
    props: {
      position: [0, 1.5, -4.4], width: 9.5, height: 2.6,
      material: { color: '#112244', emissive: '#112244', emissiveIntensity: 0.8, transparent: true, opacity: 0.9 },
    },
  }
  rootChildren.push('viewport-glass')

  // Stars visible through viewport (small sparkles)
  elements['viewport-stars'] = {
    type: 'Sparkles',
    props: {
      position: [0, 1.5, -4.3], count: 40, speed: 0.1, size: 1,
      color: '#ffffff', opacity: 0.8, noise: 1, scale: [9, 2.5, 0.5],
    },
  }
  rootChildren.push('viewport-stars')

  // ── Side walls ──
  // Left wall
  elements['wall-left'] = {
    type: 'Box',
    props: {
      position: [-5.5, 1.2, 2], scale: [0.15, 2.4, 13],
      material: { color: '#2a2a3a', roughness: 0.3, metalness: 0.8 },
    },
  }
  rootChildren.push('wall-left')
  // Right wall
  elements['wall-right'] = {
    type: 'Box',
    props: {
      position: [5.5, 1.2, 2], scale: [0.15, 2.4, 13],
      material: { color: '#2a2a3a', roughness: 0.3, metalness: 0.8 },
    },
  }
  rootChildren.push('wall-right')
  // Back wall
  elements['wall-back'] = {
    type: 'Box',
    props: {
      position: [0, 1.2, 8.5], scale: [11, 2.4, 0.15],
      material: { color: '#2a2a3a', roughness: 0.3, metalness: 0.8 },
    },
  }
  rootChildren.push('wall-back')

  // ── Wall accent trim (glowing strips along base) ──
  const trims = [
    { pos: [-5.4, 0.06, 2], scale: [0.06, 0.06, 12.5] },
    { pos: [5.4, 0.06, 2], scale: [0.06, 0.06, 12.5] },
    { pos: [0, 0.06, 8.4], scale: [10.5, 0.06, 0.06] },
    { pos: [0, 0.06, -4.4], scale: [10.5, 0.06, 0.06] },
  ]
  trims.forEach((t, i) => {
    const id = uid('trim')
    const color = i < 2 ? (i === 0 ? '#ff4444' : '#4466ff') : '#ffaa44'
    elements[id] = {
      type: 'Box',
      props: {
        position: t.pos, scale: t.scale,
        material: { color, emissive: color, emissiveIntensity: 1.5, transparent: true, opacity: 0.6 },
      },
    }
    rootChildren.push(id)
  })

  // ── Front console / helm ──
  elements['helm'] = {
    type: 'Box',
    props: {
      position: [0, 0.45, -3], scale: [5, 0.9, 1.2],
      material: { color: '#333344', roughness: 0.3, metalness: 0.7 },
    },
  }
  rootChildren.push('helm')

  // Helm screen panels
  const helmScreens = [
    { pos: [-1.5, 1, -3], w: 1.2, h: 0.6, color: '#113322', emissive: '#22aa66' },
    { pos: [0, 1, -3], w: 1.5, h: 0.6, color: '#112233', emissive: '#4488cc' },
    { pos: [1.5, 1, -3], w: 1.2, h: 0.6, color: '#221133', emissive: '#8844cc' },
  ]
  helmScreens.forEach((s, i) => {
    const id = uid('screen')
    elements[id] = {
      type: 'Plane',
      props: {
        position: s.pos, width: s.w, height: s.h,
        rotation: [-0.3, 0, 0],
        material: { color: s.color, emissive: s.emissive, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 },
      },
    }
    rootChildren.push(id)
  })

  // ── Side consoles ──
  // Left console station
  elements['console-left'] = {
    type: 'Box',
    props: {
      position: [-4.5, 0.4, 0], scale: [1.5, 0.8, 3],
      material: { color: '#333344', roughness: 0.3, metalness: 0.7 },
    },
  }
  rootChildren.push('console-left')
  elements['screen-left'] = {
    type: 'Plane',
    props: {
      position: [-4.5, 0.9, 0], width: 1.2, height: 0.5,
      rotation: [-0.4, 0, 0],
      material: { color: '#112222', emissive: '#22aaaa', emissiveIntensity: 0.5 },
    },
  }
  rootChildren.push('screen-left')

  // Right console station
  elements['console-right'] = {
    type: 'Box',
    props: {
      position: [4.5, 0.4, 0], scale: [1.5, 0.8, 3],
      material: { color: '#333344', roughness: 0.3, metalness: 0.7 },
    },
  }
  rootChildren.push('console-right')
  elements['screen-right'] = {
    type: 'Plane',
    props: {
      position: [4.5, 0.9, 0], width: 1.2, height: 0.5,
      rotation: [-0.4, 0, 0],
      material: { color: '#221122', emissive: '#cc4488', emissiveIntensity: 0.5 },
    },
  }
  rootChildren.push('screen-right')

  // ── Cozy touches ──
  // Back lounge area — a bench / couch along the back wall
  elements['couch'] = {
    type: 'Box',
    props: {
      position: [0, 0.25, 7.5], scale: [6, 0.5, 1.2],
      material: { color: '#554433', roughness: 0.9, metalness: 0 },
    },
  }
  rootChildren.push('couch')
  // Couch back
  elements['couch-back'] = {
    type: 'Box',
    props: {
      position: [0, 0.7, 8], scale: [6, 0.6, 0.3],
      material: { color: '#554433', roughness: 0.9, metalness: 0 },
    },
  }
  rootChildren.push('couch-back')

  // Cushions on couch
  const couchCushions = [
    { pos: [-2, 0.55, 7.5], color: '#ff7766' },
    { pos: [0, 0.55, 7.5], color: '#88bbff' },
    { pos: [2, 0.55, 7.5], color: '#ffaa55' },
  ]
  couchCushions.forEach((c, i) => {
    const id = uid('cushion')
    elements[id] = {
      type: 'Sphere',
      props: {
        position: c.pos, scale: [0.5, 0.2, 0.4],
        material: { color: c.color, roughness: 0.9, metalness: 0 },
      },
    }
    rootChildren.push(id)
  })

  // Small table in the middle area
  elements['table'] = {
    type: 'Cylinder',
    props: {
      position: [0, 0.3, 2], radiusTop: 0.6, radiusBottom: 0.5, height: 0.6,
      material: { color: '#444455', roughness: 0.3, metalness: 0.7 },
    },
  }
  rootChildren.push('table')

  // Hologram projector on table
  elements['holo'] = {
    type: 'Sphere',
    props: {
      position: [0, 0.9, 2], radius: 0.2,
      material: { color: '#88ddff', emissive: '#88ddff', emissiveIntensity: 1.5, transparent: true, opacity: 0.3 },
    },
  }
  rootChildren.push('holo')
  elements['holo-light'] = {
    type: 'PointLight',
    props: { position: [0, 1, 2], color: '#88ddff', intensity: 0.5, distance: 3 },
  }
  rootChildren.push('holo-light')

  // Plants (because even spaceships need plants)
  const plantSpots = [[-4.8, 0, 7], [4.8, 0, 7], [-4.8, 0, -3], [4.8, 0, -3]]
  plantSpots.forEach((pos, i) => {
    const potId = uid('pot')
    elements[potId] = {
      type: 'Cylinder',
      props: {
        position: [pos[0], 0.15, pos[2]], radiusTop: 0.2, radiusBottom: 0.15, height: 0.3,
        material: { color: '#445566', roughness: 0.5, metalness: 0.5 },
      },
    }
    rootChildren.push(potId)
    const plantId = uid('plant')
    elements[plantId] = {
      type: 'Sphere',
      props: {
        position: [pos[0], 0.45, pos[2]], radius: 0.25, scale: [1, 0.8, 1],
        material: { color: '#44aa55', roughness: 0.85, metalness: 0 },
      },
    }
    rootChildren.push(plantId)
  })

  // Ambient dust / particles
  elements['dust'] = {
    type: 'Sparkles',
    props: { position: [0, 1.5, 2], count: 20, speed: 0.08, size: 0.8, color: '#aabbcc', opacity: 0.3, noise: 2, scale: [10, 3, 12] },
  }
  rootChildren.push('dust')

  // Room name label on the viewport
  elements['room-label'] = {
    type: 'HtmlLabel',
    props: {
      position: [0, 2.9, -4.3], text: `🚀 ${roomName || '???'}`,
      color: '#88ddff', fontSize: 13, center: true, distanceFactor: 6,
    },
  }
  rootChildren.push('room-label')

  // ── Build last-message map per user ──
  const lastMsgByUser = {}
  for (const msg of messages) {
    if (msg.kind === 'msg' && msg.from) lastMsgByUser[msg.from] = msg
  }

  // ── Avatars scattered on the bridge ──
  const total = members.length
  members.forEach((member, i) => {
    const name = member.name || `user-${i}`
    const color = hashColor(name)
    const { x, z } = seatPosition(i, total)

    const avatarSpec = avatarSpecs[name] || makeDefaultAvatar(color, name)
    const prefix = `m${i}-`
    const avatarRootId = mergeAvatarSpec(avatarSpec, prefix, elements)

    const groupId = uid('avatar')
    elements[groupId] = {
      type: 'Group',
      props: { position: [x, 0, z] },
      children: [avatarRootId],
    }
    rootChildren.push(groupId)

    // Name tag
    const nameTagId = uid('nametag')
    elements[nameTagId] = {
      type: 'HtmlLabel',
      props: { position: [x, 2.2, z], text: name, color, fontSize: 11, center: true, distanceFactor: 6 },
    }
    rootChildren.push(nameTagId)

    // Speech bubble
    const lastMsg = lastMsgByUser[name]
    if (lastMsg) {
      const text = lastMsg.text.length > 50 ? lastMsg.text.slice(0, 47) + '…' : lastMsg.text
      const bubbleId = uid('bubble')
      elements[bubbleId] = {
        type: 'HtmlLabel',
        props: { position: [x, 2.6, z], text: `💬 ${text}`, color: '#eeddcc', fontSize: 12, center: true, distanceFactor: 5 },
      }
      rootChildren.push(bubbleId)
    }
  })

  // ── Post-processing ──
  elements['effects'] = { type: 'EffectComposer', props: { enabled: true }, children: ['bloom', 'vignette'] }
  elements['bloom'] = { type: 'Bloom', props: { intensity: 0.4, luminanceThreshold: 0.4, luminanceSmoothing: 0.9, mipmapBlur: true } }
  elements['vignette'] = { type: 'Vignette', props: { offset: 0.25, darkness: 0.5 } }
  rootChildren.push('effects')

  elements['root'] = { type: 'Group', props: { position: [0, 0, 0] }, children: rootChildren }
  return { root: 'root', elements }
}
