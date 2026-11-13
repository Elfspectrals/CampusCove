import * as THREE from 'three'

const TAG_Y = 2.05
const TAG_HEIGHT = 0.24
const NAME_TAG_MAX_DISTANCE = 25
const FONT_PX = 44
const PADDING_PX = 18
const CANVAS_HEIGHT = 64
const BADGE_PX = 40
const BADGE_GAP_PX = 10
const ICON_GRID = 24
const BADGE_COLOR = 'rgb(255, 204, 51)'

export function nameTagVisible(dx: number, dz: number): boolean {
  return dx * dx + dz * dz <= NAME_TAG_MAX_DISTANCE * NAME_TAG_MAX_DISTANCE
}

function drawBadge(ctx: CanvasRenderingContext2D, iconPath: string, left: number): void {
  const icon = new Path2D(iconPath)
  ctx.save()
  ctx.translate(left, (CANVAS_HEIGHT - BADGE_PX) / 2)
  ctx.scale(BADGE_PX / ICON_GRID, BADGE_PX / ICON_GRID)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 6
  ctx.strokeStyle = 'rgba(20, 20, 28, 0.85)'
  ctx.stroke(icon)
  ctx.lineWidth = 2.5
  ctx.strokeStyle = BADGE_COLOR
  ctx.stroke(icon)
  ctx.restore()
}

function nameTexture(pseudo: string, badgeIcons: readonly string[]): { texture: THREE.CanvasTexture; aspect: number } {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const font = `700 ${FONT_PX}px system-ui, sans-serif`
  ctx.font = font
  const badgesWidth = badgeIcons.length * (BADGE_PX + BADGE_GAP_PX)
  const textWidth = Math.ceil(ctx.measureText(pseudo).width)
  canvas.width = badgesWidth + textWidth + PADDING_PX * 2
  canvas.height = CANVAS_HEIGHT
  badgeIcons.forEach((iconPath, index) => drawBadge(ctx, iconPath, PADDING_PX + index * (BADGE_PX + BADGE_GAP_PX)))
  const textCenter = PADDING_PX + badgesWidth + textWidth / 2
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 8
  ctx.strokeStyle = 'rgba(20, 20, 28, 0.85)'
  ctx.strokeText(pseudo, textCenter, CANVAS_HEIGHT / 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(pseudo, textCenter, CANVAS_HEIGHT / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return { texture, aspect: canvas.width / CANVAS_HEIGHT }
}

export function createNameTag(avatar: THREE.Object3D, pseudo: string, badgeIcons: readonly string[] = []) {
  const { texture, aspect } = nameTexture(pseudo, badgeIcons)
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
