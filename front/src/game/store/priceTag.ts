import * as THREE from 'three'

/** Board size in metres (the canvas keeps the same 4:3 ratio). */
const TAG_W = 0.62
const TAG_H = 0.465
const CANVAS_W = 512
const CANVAS_H = 384

export interface PriceTagContent {
  name: string
  department: string
  description: string
  /** null when the item is not on sale (missing / unpublished in the shop catalogue). */
  price: number | null
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth) {
      line = next
      continue
    }
    if (line) lines.push(line)
    line = word
    if (lines.length === maxLines) break
  }
  if (line && lines.length < maxLines) lines.push(line)
  return lines
}

function drawTag(canvas: HTMLCanvasElement, content: PriceTagContent): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  // white card, yellow header band, blue brand strip
  ctx.fillStyle = '#fbfaf6'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.fillStyle = '#f7c21b'
  ctx.fillRect(0, 0, CANVAS_W, 92)
  ctx.fillStyle = '#1f5fae'
  ctx.fillRect(0, CANVAS_H - 30, CANVAS_W, 30)

  ctx.fillStyle = '#1f3b66'
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(content.department.toUpperCase(), 24, 14)
  ctx.font = '900 44px system-ui, sans-serif'
  const name = content.name.toUpperCase()
  let size = 44
  while (size > 26 && ctx.measureText(name).width > CANVAS_W - 48) {
    size -= 2
    ctx.font = `900 ${size}px system-ui, sans-serif`
  }
  ctx.fillStyle = '#10213d'
  ctx.fillText(name, 24, 42)

  ctx.font = '600 24px system-ui, sans-serif'
  ctx.fillStyle = '#4a5363'
  wrapLines(ctx, content.description, CANVAS_W - 48, 2).forEach((l, i) => ctx.fillText(l, 24, 110 + i * 30))

  if (content.price === null) {
    ctx.font = '800 34px system-ui, sans-serif'
    ctx.fillStyle = '#9aa0a8'
    ctx.fillText('Coming soon', 24, 236)
  } else {
    // big price + coin
    ctx.font = '900 92px system-ui, sans-serif'
    ctx.fillStyle = '#10213d'
    const label = String(content.price)
    ctx.fillText(label, 24, 196)
    const x = 24 + ctx.measureText(label).width + 40
    ctx.beginPath()
    ctx.arc(x, 246, 30, 0, Math.PI * 2)
    ctx.fillStyle = '#f7c21b'
    ctx.fill()
    ctx.lineWidth = 6
    ctx.strokeStyle = '#c99510'
    ctx.stroke()
    ctx.font = '900 30px system-ui, sans-serif'
    ctx.fillStyle = '#8a6208'
    ctx.textAlign = 'center'
    ctx.fillText('C', x, 231)
    ctx.textAlign = 'left'
  }
  ctx.font = 'bold 18px system-ui, sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.fillText('COVE HOME  ·  CLICK TO BUY', 24, CANVAS_H - 25)
}

/**
 * IKEA-style price tag: a canvas texture on a board, with a dark backing so it reads from behind too.
 * The board's front faces local +Z (set `rotation.y` to the display's tag yaw). Call `update` to redraw.
 */
export function createPriceTag(content: PriceTagContent): {
  object: THREE.Group
  update: (next: PriceTagContent) => void
  dispose: () => void
} {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  drawTag(canvas, content)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(TAG_W, TAG_H),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  )
  face.position.z = 0.011
  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(TAG_W + 0.03, TAG_H + 0.03, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.6 }),
  )
  const object = new THREE.Group()
  object.add(backing, face)
  return {
    object,
    update(next) {
      drawTag(canvas, next)
      texture.needsUpdate = true
    },
    dispose() {
      texture.dispose()
      face.geometry.dispose()
      ;(face.material as THREE.Material).dispose()
      backing.geometry.dispose()
      ;(backing.material as THREE.Material).dispose()
    },
  }
}
