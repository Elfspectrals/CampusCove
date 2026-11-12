import * as THREE from 'three'

const TAG_Y = 2.05
const TAG_HEIGHT = 0.24
const NAME_TAG_MAX_DISTANCE = 25
const FONT_PX = 44
const PADDING_PX = 18
const CANVAS_HEIGHT = 64

export function nameTagVisible(dx: number, dz: number): boolean {
  return dx * dx + dz * dz <= NAME_TAG_MAX_DISTANCE * NAME_TAG_MAX_DISTANCE
}

function nameTexture(pseudo: string): { texture: THREE.CanvasTexture; aspect: number } {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const font = `700 ${FONT_PX}px system-ui, sans-serif`
  ctx.font = font
  canvas.width = Math.ceil(ctx.measureText(pseudo).width) + PADDING_PX * 2
  canvas.height = CANVAS_HEIGHT
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 8
  ctx.strokeStyle = 'rgba(20, 20, 28, 0.85)'
  ctx.strokeText(pseudo, canvas.width / 2, CANVAS_HEIGHT / 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(pseudo, canvas.width / 2, CANVAS_HEIGHT / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return { texture, aspect: canvas.width / CANVAS_HEIGHT }
}

export function createNameTag(avatar: THREE.Object3D, pseudo: string) {
  const { texture, aspect } = nameTexture(pseudo)
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.renderOrder = 4
  const parentScale = avatar.scale.y || 1
  sprite.scale.set((TAG_HEIGHT * aspect) / parentScale, TAG_HEIGHT / parentScale, 1)
  sprite.position.set(0, TAG_Y / parentScale, 0)
  avatar.add(sprite)

  function setVisible(visible: boolean): void {
    sprite.visible = visible
  }

  function dispose(): void {
    sprite.removeFromParent()
    material.dispose()
    texture.dispose()
  }

  return { setVisible, dispose }
}

export type NameTag = ReturnType<typeof createNameTag>
