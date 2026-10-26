import * as THREE from 'three'
import type { HousingUnit } from './housing'

const CANVAS_WIDTH = 512
const CANVAS_HEIGHT = 136
const SIGN_WIDTH = 2.4
const SIGN_HEIGHT = SIGN_WIDTH * (CANVAS_HEIGHT / CANVAS_WIDTH)
const SIGN_HEIGHT_ABOVE_DOOR = 1.2

const BACKGROUND = 'rgba(8, 10, 32, 0.82)'
const DETAIL_COLOR = 'rgb(150, 160, 214)'
const TITLE_COLOR = { sale: 'rgb(255, 202, 58)', owned: 'rgb(236, 239, 255)', mine: 'rgb(76, 227, 160)' } as const

interface DoorSignText {
  title: string
  detail: string
  tone: keyof typeof TITLE_COLOR
}

function formatDelay(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function doorSignText(unit: HousingUnit, myAccountId: number | null, now: number): DoorSignText {
  if (unit.status === 'vacant') {
    return {
      title: 'For sale',
      detail: `${unit.price_coins.toLocaleString()} coins · tax ${unit.tax_coins.toLocaleString()}/day`,
      tone: 'sale',
    }
  }
  if (myAccountId !== null && unit.occupant_account_id === myAccountId) {
    const due = unit.tax_due_at ? Date.parse(unit.tax_due_at) : NaN
    const detail = Number.isFinite(due)
      ? `Tax ${unit.tax_coins.toLocaleString()} in ${formatDelay(due - now)}`
      : `Tax ${unit.tax_coins.toLocaleString()}/day`
    return { title: 'Your house', detail, tone: 'mine' }
  }
  const owner = unit.occupant_name ?? 'Someone'
  const detail = myAccountId !== null && unit.key_holder_account_ids.includes(myAccountId) ? 'You have the keys' : 'Private'
  return { title: `${owner}'s house`, detail, tone: 'owned' }
}

function drawSign(canvas: HTMLCanvasElement, text: DoorSignText): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable for door signs')
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  ctx.fillStyle = BACKGROUND
  ctx.beginPath()
  ctx.roundRect(4, 4, CANVAS_WIDTH - 8, CANVAS_HEIGHT - 8, 28)
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = TITLE_COLOR[text.tone]
  ctx.font = '48px "Lilita One", Nunito, system-ui, sans-serif'
  ctx.fillText(text.title, CANVAS_WIDTH / 2, 50, CANVAS_WIDTH - 40)
  ctx.fillStyle = DETAIL_COLOR
  ctx.font = 'bold 30px Nunito, system-ui, sans-serif'
  ctx.fillText(text.detail, CANVAS_WIDTH / 2, 100, CANVAS_WIDTH - 40)
}

interface DoorSign {
  sprite: THREE.Sprite
  canvas: HTMLCanvasElement
  texture: THREE.CanvasTexture
  label: string
}

export function createDoorSigns() {
  const group = new THREE.Group()
  group.name = 'DoorSigns'
  const signs = new Map<string, DoorSign>()

  function signFor(unit: HousingUnit): DoorSign {
    const existing = signs.get(unit.public_id)
    if (existing) return existing
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_WIDTH
    canvas.height = CANVAS_HEIGHT
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
    sprite.scale.set(SIGN_WIDTH, SIGN_HEIGHT, 1)
    group.add(sprite)
    const sign = { sprite, canvas, texture, label: '' }
    signs.set(unit.public_id, sign)
    return sign
  }

  function update(units: readonly HousingUnit[], myAccountId: number | null): void {
    const now = Date.now()
    const seen = new Set<string>()
    for (const unit of units) {
      seen.add(unit.public_id)
      const sign = signFor(unit)
      sign.sprite.position.set(unit.pos_x, unit.pos_y + SIGN_HEIGHT_ABOVE_DOOR, unit.pos_z)
      const text = doorSignText(unit, myAccountId, now)
      const label = `${text.tone}|${text.title}|${text.detail}`
      if (label === sign.label) continue
      drawSign(sign.canvas, text)
      sign.texture.needsUpdate = true
      sign.label = label
    }
    for (const [publicId, sign] of signs) {
      if (seen.has(publicId)) continue
      group.remove(sign.sprite)
      sign.texture.dispose()
      sign.sprite.material.dispose()
      signs.delete(publicId)
    }
  }

  function invalidate(): void {
    for (const sign of signs.values()) sign.label = ''
  }

  function dispose(): void {
    update([], null)
    group.removeFromParent()
  }

  return { group, update, invalidate, dispose }
}
