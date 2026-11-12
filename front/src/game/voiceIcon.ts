import * as THREE from 'three'

export type VoiceIconState = 'speaking' | 'muted' | null

const ICON_Y = 2.33
const ICON_SIZE = 0.26
const CANVAS = 64
const textures = new Map<Exclude<VoiceIconState, null>, THREE.CanvasTexture>()

function drawSpeaker(ctx: CanvasRenderingContext2D, muted: boolean): void {
  ctx.clearRect(0, 0, CANVAS, CANVAS)
  ctx.fillStyle = 'rgba(20, 20, 28, 0.75)'
  ctx.beginPath()
  ctx.arc(32, 32, 30, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(14, 26)
  ctx.lineTo(22, 26)
  ctx.lineTo(32, 17)
  ctx.lineTo(32, 47)
  ctx.lineTo(22, 38)
  ctx.lineTo(14, 38)
  ctx.closePath()
  ctx.fill()
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  if (muted) {
    ctx.strokeStyle = '#ff6b6b'
    ctx.beginPath()
    ctx.moveTo(38, 24)
    ctx.lineTo(52, 40)
    ctx.moveTo(52, 24)
    ctx.lineTo(38, 40)
    ctx.stroke()
    return
  }
  ctx.strokeStyle = '#7ee08a'
  for (const r of [8, 15]) {
    ctx.beginPath()
    ctx.arc(34, 32, r, -Math.PI / 4, Math.PI / 4)
    ctx.stroke()
  }
}

function iconTexture(state: Exclude<VoiceIconState, null>): THREE.CanvasTexture {
  const cached = textures.get(state)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = CANVAS
  drawSpeaker(canvas.getContext('2d')!, state === 'muted')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  textures.set(state, texture)
  return texture
}

export function createVoiceIcon(avatar: THREE.Object3D) {
  const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.renderOrder = 4
  sprite.visible = false
  const parentScale = avatar.scale.y || 1
  sprite.scale.setScalar(ICON_SIZE / parentScale)
  sprite.position.set(0, ICON_Y / parentScale, 0)
  avatar.add(sprite)
  let state: VoiceIconState = null

  function set(next: VoiceIconState, visible: boolean): void {
    if (next !== state) {
      state = next
      if (next) {
        material.map = iconTexture(next)
        material.needsUpdate = true
      }
    }
    sprite.visible = visible && state !== null
  }

  function dispose(): void {
    sprite.removeFromParent()
    material.dispose()
  }

  return { set, dispose }
}

export type VoiceIcon = ReturnType<typeof createVoiceIcon>
