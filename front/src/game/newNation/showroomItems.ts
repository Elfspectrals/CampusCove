/**
 * Shop items on display in the /NewNation showroom: one model (or a picture card when there is none) per
 * slot, a floating name + price label, and a floor ring in the rarity colour.
 */
import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { RARITY_META, Rarity } from '../rarity'
import type { SlotDef } from './showroomLayout'

/** Extra slots (with a code-built plinth) when the catalog outgrows the Blender slots. */
const OVERFLOW_RADIUS = 18
const APARTMENT_ITEM_SIZE = 1.3
const SKIN_ITEM_HEIGHT = 1.8
const CARD_SIZE = 1.15

export type ShowroomGroup = 'apartment' | 'skin'

export interface ShowroomItem {
  id: number
  name: string
  priceLabel: string
  group: ShowroomGroup
  /** Tints the label and the floor ring so players read the tier at a glance. */
  rarity?: Rarity
  modelUrl: string | null
  imageUrl: string | null
}

export interface PlacedItem {
  item: ShowroomItem
  root: THREE.Group
  /** Visual that animates (spins / bobs); child of root. */
  visual: THREE.Group
  label: CSS2DObject
  slot: THREE.Vector3
  spin: boolean
  bob: boolean
}

function makeLabelElement(item: ShowroomItem): HTMLDivElement {
  const el = document.createElement('div')
  const meta = item.rarity ? RARITY_META[item.rarity] : null
  const legendary = item.rarity === Rarity.Legendary
  el.style.cssText = [
    'pointer-events:none',
    'padding:4px 10px',
    'border-radius:999px',
    'background:rgba(6,14,40,0.78)',
    `border:${legendary ? 2 : 1}px solid ${meta ? meta.color : 'rgba(103,232,249,0.55)'}`,
    meta ? `box-shadow:0 0 ${legendary ? 18 : 8}px ${meta.glow}` : '',
    'color:#fff',
    'font:700 12px/1.25 system-ui,sans-serif',
    'text-align:center',
    'white-space:nowrap',
    'transform:translateY(-6px)',
    'transition:opacity .2s, transform .2s',
  ].join(';')
  const name = document.createElement('div')
  name.textContent = item.name
  const price = document.createElement('div')
  price.textContent = item.priceLabel
  price.style.cssText = `font-weight:600;font-size:11px;color:${meta ? meta.color : '#a5f3fc'}`
  el.append(name, price)
  return el
}

/** Fallback card texture for items without a model or preview image. */
function makeTextCardTexture(item: ShowroomItem): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createLinearGradient(0, 0, 0, 512)
  grad.addColorStop(0, item.group === 'skin' ? '#7c3aed' : '#0ea5e9')
  grad.addColorStop(1, '#0b1640')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 512, 512)
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = 10
  ctx.strokeRect(14, 14, 484, 484)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.font = '120px system-ui, sans-serif'
  ctx.fillText(item.group === 'skin' ? '✨' : '🪑', 256, 210)
  ctx.font = 'bold 40px system-ui, sans-serif'
  const lines: string[] = []
  let line = ''
  for (const w of item.name.split(' ')) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > 440 && line) {
      lines.push(line)
      line = w
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, 256, 320 + i * 50))
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Glowing floor ring in the tier colour (bigger and brighter for legendary). */
function makeRarityRing(rarity: Rarity): THREE.Mesh {
  const legendary = rarity === Rarity.Legendary
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(legendary ? 0.95 : 0.7, legendary ? 1.2 : 0.8, 48),
    new THREE.MeshBasicMaterial({
      color: RARITY_META[rarity].color,
      transparent: true,
      opacity: legendary ? 0.95 : 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.02
  return ring
}

function makeOverflowPlinth(position: THREE.Vector3): THREE.Mesh {
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.95, 0.45, 24),
    new THREE.MeshStandardMaterial({ color: 0x141a2e, metalness: 0.6, roughness: 0.35, emissive: 0x0e7490, emissiveIntensity: 0.25 }),
  )
  plinth.position.set(position.x, 0.225, position.z)
  return plinth
}

/** Scales/centres a model on its slot; returns its final height. */
function fitModel(model: THREE.Group, group: ShowroomGroup): number {
  model.updateMatrixWorld(true)
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
  const scale = group === 'skin'
    ? SKIN_ITEM_HEIGHT / Math.max(size.y, 0.001)
    : APARTMENT_ITEM_SIZE / Math.max(size.x, size.y, size.z, 0.001)
  model.scale.setScalar(scale)
  model.updateMatrixWorld(true)
  const fitted = new THREE.Box3().setFromObject(model)
  const center = fitted.getCenter(new THREE.Vector3())
  model.position.set(-center.x, -fitted.min.y, -center.z)
  return fitted.max.y - fitted.min.y
}

export class ShowroomItems {
  readonly root = new THREE.Group()
  private readonly loader: GLTFLoader
  private readonly textureLoader = new THREE.TextureLoader()
  private readonly placed = new Map<number, PlacedItem>()
  private populateVersion = 0
  private disposed = false
  private selectedId: number | null = null
  private hoveredId: number | null = null
  /** Called when an item finished loading and stands on its slot. */
  onPlaced: ((id: number) => void) | null = null

  constructor(loader: GLTFLoader) {
    this.loader = loader
  }

  get(id: number): PlacedItem | undefined {
    return this.placed.get(id)
  }

  /** Places (or re-places) the given items on the display slots, spread evenly around their ring. */
  async setItems(items: ShowroomItem[], slots: readonly SlotDef[]): Promise<void> {
    const version = ++this.populateVersion
    this.clear()
    const bySlotGroup: Record<ShowroomGroup, SlotDef[]> = {
      apartment: slots.filter((s) => s.group === 'apartment'),
      skin: slots.filter((s) => s.group === 'skin'),
    }
    const groupCount: Record<ShowroomGroup, number> = {
      apartment: items.filter((i) => i.group === 'apartment').length,
      skin: items.filter((i) => i.group === 'skin').length,
    }
    const used: Record<ShowroomGroup, number> = { apartment: 0, skin: 0 }
    let overflowIndex = 0
    const overflowTotal = Math.max(0, groupCount.apartment - bySlotGroup.apartment.length)
      + Math.max(0, groupCount.skin - bySlotGroup.skin.length)

    const loads: Promise<void>[] = []
    for (const item of items) {
      const ring = bySlotGroup[item.group]
      const n = used[item.group]++
      const slot = groupCount[item.group] <= ring.length
        ? ring[Math.floor((n * ring.length) / groupCount[item.group])]
        : ring[n]
      let position: THREE.Vector3
      if (slot) {
        position = new THREE.Vector3(...slot.position)
      } else {
        const a = (overflowIndex++ / Math.max(overflowTotal, 1)) * Math.PI * 2 + Math.PI / 2
        position = new THREE.Vector3(Math.cos(a) * OVERFLOW_RADIUS, 0.45, Math.sin(a) * OVERFLOW_RADIUS)
        this.root.add(makeOverflowPlinth(position))
      }
      loads.push(this.placeItem(item, position, version))
    }
    await Promise.all(loads)
  }

  /** Selected / hovered labels pop out, the others fade while something is selected. */
  setHighlight(selectedId: number | null, hoveredId: number | null): void {
    this.selectedId = selectedId
    this.hoveredId = hoveredId
    for (const [id, placed] of this.placed) {
      const el = placed.label.element
      const active = id === selectedId || id === hoveredId
      el.style.opacity = selectedId !== null && !active ? '0.35' : '1'
      el.style.borderColor = active ? 'rgba(253,224,71,0.95)' : 'rgba(103,232,249,0.55)'
      el.style.transform = active ? 'translateY(-10px) scale(1.08)' : 'translateY(-6px)'
    }
  }

  /** Furniture spins on its plinth (faster when selected), picture cards bob. */
  animate(dt: number, time: number): void {
    for (const [id, placed] of this.placed) {
      const speed = id === this.selectedId ? 0.9 : 0.35
      if (placed.spin) placed.visual.rotation.y += dt * speed
      if (placed.bob) placed.visual.position.y = 0.35 + Math.sin(time * 1.6 + id) * 0.06
    }
  }

  /** Item id under the ray, if any. */
  pick(raycaster: THREE.Raycaster): number | null {
    const hit = raycaster.intersectObject(this.root, true).find((h) => h.object.userData.showroomItemId !== undefined)
    return hit ? (hit.object.userData.showroomItemId as number) : null
  }

  clear(): void {
    for (const placed of this.placed.values()) placed.label.element.remove()
    this.placed.clear()
    for (const child of [...this.root.children]) {
      this.root.remove(child)
      disposeObject3D(child)
    }
  }

  dispose(): void {
    this.disposed = true
    this.clear()
  }

  private isStale(version: number): boolean {
    return version !== this.populateVersion || this.disposed
  }

  private async placeItem(item: ShowroomItem, slot: THREE.Vector3, version: number): Promise<void> {
    const root = new THREE.Group()
    root.position.copy(slot)
    // Face the plaza centre.
    root.rotation.y = Math.atan2(-slot.x, -slot.z)
    const visual = new THREE.Group()
    root.add(visual)

    let visualHeight = CARD_SIZE + 0.4
    let spin = false
    let bob = false
    const model = item.modelUrl ? await this.loadModel(item.modelUrl) : null
    if (this.isStale(version)) {
      if (model) disposeObject3D(model)
      return
    }
    if (model) {
      visualHeight = fitModel(model, item.group)
      visual.add(model)
      spin = item.group === 'apartment'
    } else {
      visual.add(await this.makeCard(item))
      visual.position.y = 0.35
      bob = true
    }
    if (this.isStale(version)) {
      disposeObject3D(root)
      return
    }

    const label = new CSS2DObject(makeLabelElement(item))
    label.position.set(0, visualHeight + 0.45, 0)
    root.add(label)
    if (item.rarity) root.add(makeRarityRing(item.rarity))
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.userData.showroomItemId = item.id
    })
    this.root.add(root)
    this.placed.set(item.id, { item, root, visual, label, slot, spin, bob })
    this.setHighlight(this.selectedId, this.hoveredId)
    this.onPlaced?.(item.id)
  }

  private async loadModel(url: string): Promise<THREE.Group | null> {
    try {
      return (await this.loader.loadAsync(url)).scene
    } catch (error) {
      console.warn('[NewNation] model failed to load, showing a card instead', url, error)
      return null
    }
  }

  private async makeCard(item: ShowroomItem): Promise<THREE.Group> {
    let texture: THREE.Texture
    try {
      if (!item.imageUrl) throw new Error('no image')
      texture = await this.textureLoader.loadAsync(item.imageUrl)
      texture.colorSpace = THREE.SRGBColorSpace
    } catch {
      texture = makeTextCardTexture(item)
    }
    const card = new THREE.Group()
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(CARD_SIZE + 0.1, CARD_SIZE + 0.1, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x0b1640, metalness: 0.4, roughness: 0.35 }),
    )
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_SIZE, CARD_SIZE),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
    )
    face.position.z = 0.03
    const back = face.clone()
    back.position.z = -0.03
    back.rotation.y = Math.PI
    frame.position.y = face.position.y = back.position.y = CARD_SIZE / 2 + 0.05
    card.add(frame, face, back)
    return card
  }
}
