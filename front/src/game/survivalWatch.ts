import * as THREE from 'three'
import { SURVIVAL_WATCH_URL } from './assets/catalog'
import { createGltfLoader } from './gltfLoaderFactory'
import { GAUGE_COLORS, isLow, mostUrgentGauge, type GaugeKey, type SurvivalStats } from './survival'

/**
 * The wrist watch on the first-person left arm: the survival HUD lives on its screen (no 2D gauges). Its `Screen`
 * node gets a live canvas texture; the player raises the wrist (arms.raiseWatch) to read it. A low gauge blinks
 * and the whole watch buzzes from time to time, so it is noticed even with the arm down.
 * Model: map-src/CampusCove/build_food_items.py (items/tools/watch).
 */

/** Watch transform on the `Hand_L` node (the wrist); tunable live in dev (window.__ccWatchMount). */
const WATCH_MOUNT = {
  // a few cm up the forearm from the wrist (the hand's +Z), strap around the forearm axis, face on the back
  // the stylised forearm is ~13 cm thick and centred 2 cm towards the thumb: the watch is scaled to wrap it
  position: new THREE.Vector3(0.022, 0, 0.05),
  rotation: new THREE.Euler(0, Math.PI / 2, 0),
  scale: 2.4,
}
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __ccWatchMount: typeof WATCH_MOUNT }).__ccWatchMount = WATCH_MOUNT
}

const CANVAS_W = 120
const CANVAS_H = 144
const REDRAW_S = 0.25
const BUZZ_EVERY_S = 6
const BUZZ_S = 0.5

const ROWS: Array<{ key: GaugeKey; glyph: (ctx: CanvasRenderingContext2D, x: number, y: number) => void }> = [
  { key: 'health', glyph: drawHeart },
  { key: 'hunger', glyph: drawDrumstick },
  { key: 'thirst', glyph: drawDrop },
]

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y + 6)
  ctx.bezierCurveTo(x - 12, y - 3, x - 5, y - 12, x, y - 5)
  ctx.bezierCurveTo(x + 5, y - 12, x + 12, y - 3, x, y + 6)
  ctx.fill()
}

function drawDrumstick(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath()
  ctx.ellipse(x - 2, y - 2, 7, 6, -0.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(x + 2, y + 1, 7, 3)
  ctx.beginPath()
  ctx.arc(x + 10, y + 2.5, 2.5, 0, Math.PI * 2)
  ctx.fill()
}

function drawDrop(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y - 9)
  ctx.quadraticCurveTo(x + 8, y + 1, x, y + 7)
  ctx.quadraticCurveTo(x - 8, y + 1, x, y - 9)
  ctx.fill()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

export function createSurvivalWatch() {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  const ctx = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  // drawn over the case top it sits on, whatever the mesh quantisation did to the gap
  const screenMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })

  let model: THREE.Object3D | null = null
  let hand: THREE.Object3D | null = null
  let stats: SurvivalStats | null = null
  let boostUntil = 0
  let healUntil = 0
  let time = 0
  let sinceDraw = REDRAW_S
  let sinceBuzz = 0

  void createGltfLoader()
    .loadAsync(SURVIVAL_WATCH_URL)
    .then((gltf) => {
      model = gltf.scene
      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.name === 'Screen') obj.material = screenMaterial
      })
      mount()
    })
    .catch((err: unknown) => console.error('[survivalWatch] load failed', err))

  function mount(): void {
    if (!model) return
    if (!hand) {
      model.removeFromParent()
      return
    }
    if (model.parent !== hand) hand.add(model)
    model.position.copy(WATCH_MOUNT.position)
    model.rotation.copy(WATCH_MOUNT.rotation)
    model.scale.setScalar(WATCH_MOUNT.scale)
  }

  function draw(): void {
    ctx.fillStyle = '#1d1b26'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    if (!stats) {
      ctx.fillStyle = '#9f9bb0'
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('â€¦', CANVAS_W / 2, CANVAS_H / 2)
      return
    }
    const blinkOff = Math.floor(time * 3) % 2 === 1
    ROWS.forEach(({ key, glyph }, i) => {
      const value = stats![key]
      const y = 26 + i * 40
      const low = isLow(value)
      ctx.fillStyle = low && blinkOff ? '#3a3648' : GAUGE_COLORS[key]
      glyph(ctx, 18, y)
      ctx.fillStyle = '#3a3648'
      roundRect(ctx, 34, y - 6, 76, 12, 6)
      ctx.fillStyle = low && blinkOff ? '#5b566e' : GAUGE_COLORS[key]
      roundRect(ctx, 34, y - 6, Math.max(6, (76 * value) / 100), 12, 6)
      ctx.fillStyle = '#f1efe8'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(String(Math.round(value)), 108, y + 18)
    })
    if (Date.now() < boostUntil) {
      ctx.fillStyle = '#fac775'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`â˜• ${Math.ceil((boostUntil - Date.now()) / 1000)}s`, 6, CANVAS_H - 6)
    }
    if (Date.now() < healUntil) {
      ctx.fillStyle = GAUGE_COLORS.health
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`+ ${Math.ceil((healUntil - Date.now()) / 1000)}s`, CANVAS_W - 6, CANVAS_H - 6)
    }
  }

  function update(dt: number, nextHand: THREE.Object3D | null): void {
    time += dt
    if (nextHand !== hand) {
      hand = nextHand
      mount()
    }
    sinceDraw += dt
    if (sinceDraw >= REDRAW_S) {
      sinceDraw = 0
      draw()
      texture.needsUpdate = true
    }
    if (!model) return
    // buzz: a short shake when a gauge is low, so it is noticed with the arm down
    sinceBuzz += dt
    const urgent = stats ? mostUrgentGauge(stats) : null
    if (sinceBuzz >= BUZZ_EVERY_S) sinceBuzz = urgent ? 0 : BUZZ_EVERY_S
    const buzzing = urgent !== null && sinceBuzz < BUZZ_S
    model.position.copy(WATCH_MOUNT.position)
    if (buzzing) model.position.x += Math.sin(time * 90) * 0.0015
    model.rotation.copy(WATCH_MOUNT.rotation)
    model.scale.setScalar(WATCH_MOUNT.scale)
  }

  return {
    update,
    setStats: (next: SurvivalStats, nextBoostUntil: number, nextHealUntil: number) => {
      stats = next
      boostUntil = nextBoostUntil
      healUntil = nextHealUntil
      sinceDraw = REDRAW_S
    },
    dispose: () => {
      model?.removeFromParent()
      texture.dispose()
      screenMaterial.dispose()
    },
  }
}
