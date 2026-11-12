import * as THREE from 'three'

export const CHAT_LIFETIME_S = 6
const FADE_S = 0.5
const POP_S = 0.15
const BUBBLE_BOTTOM_Y = 2.25
const METRES_PER_PX = 2 / 512
const CANVAS_WIDTH = 512
const TEXT_MAX_WIDTH = 460
const FONT_PX = 30
const LINE_PX = 38
const PADDING_PX = 18
const TAIL_PX = 16
const RADIUS_PX = 18

export function wrapChatLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word
    if (measure(candidate) <= maxWidth) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    line = ''
    for (const char of word) {
      if (line && measure(line + char) > maxWidth) {
        lines.push(line)
        line = ''
      }
      line += char
    }
  }
  if (line) lines.push(line)
  return lines
}

function bubbleCanvas(text: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const font = `600 ${FONT_PX}px system-ui, sans-serif`
  ctx.font = font
  const lines = wrapChatLines(text, TEXT_MAX_WIDTH, (s) => ctx.measureText(s).width)
  const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width))
  const boxWidth = Math.ceil(textWidth) + PADDING_PX * 2
  const boxHeight = lines.length * LINE_PX + PADDING_PX * 2
  canvas.width = CANVAS_WIDTH
  canvas.height = boxHeight + TAIL_PX
  const left = (CANVAS_WIDTH - boxWidth) / 2
  ctx.fillStyle = '#fffaf0'
  ctx.strokeStyle = 'rgba(20, 20, 28, 0.25)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(left, 1.5, boxWidth, boxHeight - 3, RADIUS_PX)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(CANVAS_WIDTH / 2 - TAIL_PX, boxHeight - 2)
  ctx.lineTo(CANVAS_WIDTH / 2, boxHeight + TAIL_PX - 2)
  ctx.lineTo(CANVAS_WIDTH / 2 + TAIL_PX, boxHeight - 2)
  ctx.fill()
  ctx.font = font
  ctx.fillStyle = '#1c1c24'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((l, i) => ctx.fillText(l, CANVAS_WIDTH / 2, PADDING_PX + LINE_PX * (i + 0.5)))
  return canvas
}

export function createChatBubble(avatar: THREE.Object3D, text: string) {
  const canvas = bubbleCanvas(text)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.renderOrder = 5
  avatar.add(sprite)
  const width = canvas.width * METRES_PER_PX
  const height = canvas.height * METRES_PER_PX
  let age = 0

  function dispose(): void {
    sprite.removeFromParent()
    material.dispose()
    texture.dispose()
  }

  function update(dt: number): boolean {
    age += dt
    if (age >= CHAT_LIFETIME_S) {
      dispose()
      return false
    }
    const pop = age < POP_S ? Math.sin((age / POP_S) * (Math.PI / 2)) : 1
    const parentScale = avatar.scale.y || 1
    sprite.scale.set((width * pop) / parentScale, (height * pop) / parentScale, 1)
    sprite.position.set(0, (BUBBLE_BOTTOM_Y + height / 2) / parentScale, 0)
    material.opacity = Math.min(1, (CHAT_LIFETIME_S - age) / FADE_S)
    return true
  }

  update(0)
  return { update, dispose }
}

export type ChatBubble = ReturnType<typeof createChatBubble>
