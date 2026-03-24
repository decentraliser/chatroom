// Custom MaskoAvatar component for json-render registry.
// Renders a Masko transparent video animation in 3D space using drei's Html.
import React from 'react'
import { Html } from '@react-three/drei'

// Pool of default Masko mascots from their public examples
export const DEFAULT_MASCOTS = [
  {
    name: 'Zen Master',
    webm: 'https://assets.masko.ai/7fced6/zen-master-f981/meditate-12dced1c-360.webm',
    mov: 'https://assets.masko.ai/7fced6/zen-master-f981/meditate-d3d8ff12-360.mov',
  },
  {
    name: 'Owl Teacher',
    webm: 'https://assets.masko.ai/7fced6/owl-teacher-29b8/teach-1aaf24fb-360.webm',
    mov: 'https://assets.masko.ai/7fced6/owl-teacher-29b8/teach-83a8eb7c-360.mov',
  },
  {
    name: 'Sleepy Moon',
    webm: 'https://assets.masko.ai/7fced6/sleepy-moon-0f1f/sleep-eec91143-360.webm',
    mov: 'https://assets.masko.ai/7fced6/sleepy-moon-0f1f/sleep-2b5b02b1-360.mov',
  },
  {
    name: 'Coach Flex',
    webm: 'https://assets.masko.ai/7fced6/turbo-9bb8/encourage-fd5883d0-360.webm',
    mov: 'https://assets.masko.ai/7fced6/turbo-9bb8/encourage-e3c82794-360.mov',
  },
  {
    name: 'Budget Buddy',
    webm: 'https://assets.masko.ai/7fced6/budget-buddy-2702/think-0aa8d7c1-360.webm',
    mov: 'https://assets.masko.ai/7fced6/budget-buddy-2702/think-3340c8e9-360.mov',
  },
  {
    name: 'Dr. Pulse',
    webm: 'https://assets.masko.ai/7fced6/dr-pulse-4dfd/thumbs-up-53808117-360.webm',
    mov: 'https://assets.masko.ai/7fced6/dr-pulse-4dfd/thumbs-up-0152281c-360.mov',
  },
  {
    name: 'Foodie Fox',
    webm: 'https://assets.masko.ai/7fced6/foodie-fox-6251/deliver-ef943893-360.webm',
    mov: 'https://assets.masko.ai/7fced6/foodie-fox-6251/deliver-d4108c1f-360.mov',
  },
  {
    name: 'Shu',
    webm: 'https://assets.masko.ai/7fced6/shu-17b1/begging-pose-5f1b21cc-360.webm',
    mov: 'https://assets.masko.ai/7fced6/shu-17b1/begging-pose-5f1b21cc-360.mov',
  },
  {
    name: 'Spark',
    webm: 'https://assets.masko.ai/7fced6/spark-4735/playful-pounce-70845c09-360.webm',
    mov: 'https://assets.masko.ai/7fced6/spark-4735/playful-pounce-7c9941ec-360.mov',
  },
  {
    name: 'Pixel Runner',
    webm: 'https://assets.masko.ai/7fced6/pixel-runner-f1fb/flex-828cf529-360.webm',
    mov: 'https://assets.masko.ai/7fced6/pixel-runner-f1fb/flex-fc2b4500-360.mov',
  },
]

export function pickDefaultMascot(username) {
  let h = 0
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) | 0
  return DEFAULT_MASCOTS[Math.abs(h) % DEFAULT_MASCOTS.length]
}

// The actual React component rendered inside the R3F canvas
export function MaskoAvatarComponent({ props }) {
  const { position, rotation, scale, webm, mov, src, size = 180 } = props
  const videoWebm = webm || src
  const videoMov = mov

  const pos = Array.isArray(position) ? position : [0, 0, 0]
  const rot = Array.isArray(rotation) ? rotation : undefined
  const scl = Array.isArray(scale) ? scale : undefined

  return (
    <group position={pos} rotation={rot} scale={scl}>
      <Html center transform distanceFactor={5} style={{ pointerEvents: 'none' }}>
        <video
          width={size}
          height={size}
          autoPlay
          loop
          muted
          playsInline
          style={{ objectFit: 'contain', background: 'transparent' }}
        >
          {videoMov && (
            <source src={videoMov} type='video/mp4; codecs="hvc1"' />
          )}
          {videoWebm && (
            <source src={videoWebm} type="video/webm" />
          )}
        </video>
      </Html>
    </group>
  )
}
