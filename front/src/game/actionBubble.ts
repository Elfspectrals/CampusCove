import * as THREE from 'three'
import { foodPreviewUrl } from './assets/catalog'

/** Height of the bubble above the avatar's feet (metres), and how far it rises while it fades. */
const BUBBLE_Y = 2.25
const RISE = 0.35
const LIFETIME_S = 1.8
const POP_S = 0.18
const SIZE = 0.7
const CANVAS = 128

export type AvatarAction = 'eat' | 'drink'

const textures = new Map<string, THREE.CanvasTexture>()

function drawBubble(ctx: CanvasRenderingContext2D, ring: string): void {
  ctx.clearRect(0, 0, CANVAS, CANVAS)
  ctx.fillStyle = '#fffaf0'
  ctx.strokeStyle = ring
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.arc(CANVAS / 2, CANVAS / 2 - 8, 50, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  // tail pointing down to the head
  ctx.beginPath()
  ctx.moveTo(CANVAS / 2 - 12, CANVAS - 26)
  ctx.lineTo(CANVAS / 2, CANVAS - 4)
  ctx.lineTo(CANVAS / 2 + 12, CANVAS - 26)
  ctx.fill()
}

function drawDrop(ctx: CanvasRenderingContext2D): void {
  const x = CANVAS / 2
  const y = CANVAS / 2 - 8
  ctx.fillStyle = '#378add'
  ctx.beginPath()
  ctx.moveTo(x, y - 30)
  ctx.quadraticCurveTo(x + 26, y + 6, x, y + 26)
  ctx.quadraticCurveTo(x - 26, y + 6, x, y - 30)
  ctx.fill()
}

/** One texture per food code (its preview picture in a bubble), or a water drop for a fountain sip. */
function bubbleTexture(action: AvatarAction, code: string | null): THREE.CanvasTexture {
  const key = code ?? `__${action}`
  const cached = textures.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = CANVAS
  const ctx = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  drawBubble(ctx, action === 'drink' ? '#378add' : '#ef9f27')
  if (code) {
    const img = new Image()
    img.onload = () => {
      ctx.save()
      ctx.beginPath()
      ctx.arc(CANVAS / 2, CANVAS / 2 - 8, 44, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(img, CANVAS / 2 - 44, CANVAS / 2 - 52, 88, 88)
      ctx.restore()
      texture.needsUpdate = true
    }
    img.src = foodPreviewUrl(code)
  } else {
    drawDrop(ctx)
  }
  textures.set(key, texture)
  return texture
}

/**
 * The bubble shown above another player's head while they eat or drink (socket `user_action`): pops in, rises
 * and fades. `update` returns false once it is finished and removed.
 */
export function createActionBubble(avatar: THREE.Object3D, action: AvatarAction, code: string | null) {
  const material = new THREE.SpriteMaterial({ map: bubbleTexture(action, code), transparent: true, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.renderOrder = 5
  avatar.add(sprite)
  let age = 0

  function update(dt: number): boolean {
    age += dt
    if (age >= LIFETIME_S) {
      sprite.removeFromParent()
      material.dispose()
      return false
    }
    const t = age / LIFETIME_S
    const pop = age < POP_S ? 1.25 * Math.sin((age / POP_S) * (Math.PI / 2)) : 1 + 0.25 * Math.max(0, 1 - (age - POP_S) * 6)
    // the avatar group may be scaled (rigged skins): keep the bubble a constant world size
    const parentScale = avatar.scale.y || 1
    sprite.scale.setScalar((SIZE * pop) / parentScale)
    sprite.position.set(0, (BUBBLE_Y + RISE * t) / parentScale, 0)
    material.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3
    return true
  }

  update(0)
  return { update }
}
