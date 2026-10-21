import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { disposeObject3D } from '../avatar/compositeAvatar'
import { buildWorldCollisionFromObject, resolveWorldMovement } from '../composables/game/useWorldCollision'
import { createGltfLoader } from './gltfLoaderFactory'
import { SHOWROOM } from './assets/catalog'
import { RARITY_META, Rarity } from './rarity'

/**
 * 3D showroom for the /NewNation route: loads the NewNation plaza (built in Blender,
 * see map-src/NewNation) and puts every shop item on a display slot. Two camera modes:
 * orbit (overview / fly-to items) and walk (first person, WASD, mouse look via pointer lock or
 * drag, Q/E to turn, Rapier collision) for strolling around the neighbourhood of walk-in model
 * apartments that ring the plaza.
 */

const MAP_PATH = SHOWROOM.modelUrl
const SLOTS_PATH = SHOWROOM.layoutUrl
const SKY_COLOR = 0xa9cbea
/** Diagonal overview so the entrance gate does not block the plaza. */
const OVERVIEW_POSITION = new THREE.Vector3(23, 18, 23)
const OVERVIEW_TARGET = new THREE.Vector3(0, 1.5, 0)
/** Extra slots (with a code-built plinth) when the catalog outgrows the Blender slots. */
const OVERFLOW_RADIUS = 18
const APARTMENT_ITEM_SIZE = 1.3
const SKIN_ITEM_HEIGHT = 1.8
const CARD_SIZE = 1.15
const FLY_DURATION_S = 0.9
const EYE_HEIGHT = 1.6
const WALK_SPEED = 4.2
const RUN_SPEED = 7.5
const MOUSE_SENSITIVITY = 0.0022
/** Click-to-inspect reach in walk mode (metres). */
const WALK_PICK_DISTANCE = 7
/** Q/E and on-screen turn buttons (radians per second). */
const TURN_SPEED = 1.9
const DRAG_LOOK_SENSITIVITY = 0.005
const PLAZA_RADIUS = 20
const PARK_RADIUS = 34

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

interface SlotDef {
  name: string
  group: ShowroomGroup
  position: [number, number, number]
}

interface ApartmentDef {
  id: string
  name: string
  url: string
  /** Rotation of the north layout about the plaza centre (three.js rotation.y convention). */
  angle: number
  position: [number, number, number]
  rotationY: number
  /** Where walk mode drops you in front of the door, and the yaw that faces it. */
  doorStand: [number, number, number]
  doorYaw: number
  /** Footprint when placed north [minX, minZ, maxX, maxZ]; the real one is this rotated by `angle`. */
  footprint: [number, number, number, number]
}

interface SlotsFile {
  slots: SlotDef[]
  apartments?: ApartmentDef[]
  /** Nodes removed from every interior (closed entrance door, indoor-only sky backdrops). */
  hideNodes?: string[]
  walkSpawn?: [number, number, number]
}

export interface ShowroomApartment {
  id: string
  name: string
}

/** Everything the 2D minimap needs, in game x/z coordinates. */
export interface MinimapState {
  plazaRadius: number
  parkRadius: number
  player: { x: number; z: number; yaw: number }
  apartments: Array<{ id: string; name: string; corners: Array<[number, number]>; door: [number, number] }>
  currentApartmentId: string | null
}

/** Rotate a game-space (x, z) point about the origin like three.js rotation.y = angle. */
function rotateXZ(x: number, z: number, angle: number): [number, number] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [x * c + z * s, -x * s + z * c]
}

interface PlacedItem {
  item: ShowroomItem
  root: THREE.Group
  /** Visual that animates (spins / bobs); child of root. */
  visual: THREE.Group
  label: CSS2DObject
  slot: THREE.Vector3
  spin: boolean
  bob: boolean
}

export interface ShowroomCallbacks {
  onSelect: (id: number | null) => void
  onHover?: (id: number | null) => void
  /** Walk mode toggled, or pointer lock (mouse look) gained / lost while walking. */
  onWalkStateChange?: (state: { walking: boolean; mouseLook: boolean }) => void
  /** The walker entered / left one of the model apartments. */
  onApartmentChange?: (id: string | null) => void
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

function makeLabelElement(item: ShowroomItem): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = [
    'pointer-events:none',
    'padding:4px 10px',
    'border-radius:999px',
    'background:rgba(6,14,40,0.78)',
    `border:${item.rarity === Rarity.Legendary ? 2 : 1}px solid ${item.rarity ? RARITY_META[item.rarity].color : 'rgba(103,232,249,0.55)'}`,
    item.rarity ? `box-shadow:0 0 ${item.rarity === Rarity.Legendary ? 18 : 8}px ${RARITY_META[item.rarity].glow}` : '',
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
  price.style.cssText = `font-weight:600;font-size:11px;color:${item.rarity ? RARITY_META[item.rarity].color : '#a5f3fc'}`
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
  const words = item.name.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
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

export class NewNationShowroom {
  private readonly container: HTMLElement
  private readonly callbacks: ShowroomCallbacks
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly renderer: THREE.WebGLRenderer
  private readonly labelRenderer = new CSS2DRenderer()
  private readonly controls: OrbitControls
  private readonly loader = createGltfLoader()
  private readonly textureLoader = new THREE.TextureLoader()
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly clock = new THREE.Clock()
  private readonly itemsRoot = new THREE.Group()
  /** Map + model apartment: what walk-mode collision is built from. */
  private readonly worldRoot = new THREE.Group()
  private readonly placed = new Map<number, PlacedItem>()
  private readonly resizeObserver: ResizeObserver
  private map: THREE.Object3D | null = null
  private envMap: THREE.Texture | null = null
  private slots: SlotDef[] = []
  private frameId = 0
  private disposed = false
  private hoveredId: number | null = null
  private selectedId: number | null = null
  /** Selection made before its item finished loading; flown to once placed. */
  private pendingFlyId: number | null = null
  private pointerDown: { x: number; y: number } | null = null
  private fly: {
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
    t: number
  } | null = null
  private populateVersion = 0
  private walkSpawn = new THREE.Vector3(0, EYE_HEIGHT, 17.5)
  private apartments: ApartmentDef[] = []
  private currentApartmentId: string | null = null
  /** -1 / 0 / 1 from the on-screen turn buttons (held). */
  private turnInput = 0
  private dragLook: { x: number; y: number } | null = null
  private walking = false
  private mouseLook = false
  private yaw = 0
  private pitch = 0
  private readonly keys = new Set<string>()
  private readonly walkPos = new THREE.Vector3()
  private hoverCheckTimer = 0

  constructor(container: HTMLElement, callbacks: ShowroomCallbacks) {
    this.container = container
    this.callbacks = callbacks
    const { width, height } = this.size()

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 400)
    this.camera.position.copy(OVERVIEW_POSITION)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.domElement.style.display = 'block'
    container.appendChild(this.renderer.domElement)

    this.labelRenderer.setSize(width, height)
    this.labelRenderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none'
    container.appendChild(this.labelRenderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.copy(OVERVIEW_TARGET)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 2.5
    this.controls.maxDistance = 55
    this.controls.maxPolarAngle = Math.PI / 2 - 0.06
    this.controls.autoRotate = true
    this.controls.autoRotateSpeed = 0.35
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false
      this.fly = null
    })

    this.scene.background = new THREE.Color(SKY_COLOR)
    this.scene.fog = new THREE.Fog(SKY_COLOR, 70, 140)
    // Neutral ground colour: a green one tints every ceiling inside the model apartment.
    this.scene.add(new THREE.HemisphereLight(0xdcecff, 0x8a8478, 1.1))
    // Soft reflections so metallic materials (steel, brass) do not render black.
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.scene.environment = this.envMap
    this.scene.environmentIntensity = 0.45
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.6)
    sun.position.set(20, 35, 15)
    this.scene.add(sun)
    this.scene.add(this.worldRoot)
    this.scene.add(this.itemsRoot)

    const el = this.renderer.domElement
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointerleave', this.onPointerLeave)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    document.addEventListener('mousemove', this.onMouseLook)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)

    this.resizeObserver = new ResizeObserver(() => this.onResize())
    this.resizeObserver.observe(container)
    this.animate()
  }

  /** Loads the plaza and slot layout. Resolves once the map is visible. */
  async loadMap(): Promise<void> {
    if (this.map) return
    const [gltf, slotsRes] = await Promise.all([this.loader.loadAsync(MAP_PATH), fetch(SLOTS_PATH)])
    if (!slotsRes.ok) throw new Error('Could not load the showroom layout')
    const slotsFile = (await slotsRes.json()) as SlotsFile
    if (this.disposed) {
      disposeObject3D(gltf.scene)
      return
    }
    this.slots = slotsFile.slots
    if (slotsFile.walkSpawn) this.walkSpawn.fromArray(slotsFile.walkSpawn)
    this.map = gltf.scene
    this.worldRoot.add(gltf.scene)
    const hideNodes = slotsFile.hideNodes ?? []
    // Each apartment is optional: the plaza still works if one fails to load.
    const loaded = await Promise.all((slotsFile.apartments ?? []).map((def) =>
      this.loadApartment(def, hideNodes).then(
        (ok) => (ok ? def : null),
        (error: unknown) => {
          console.warn('[NewNation] apartment failed to load', def.id, error)
          return null
        },
      ),
    ))
    this.apartments = loaded.filter((def): def is ApartmentDef => def !== null)
  }

  /** Model apartments that loaded, in map order (N, E, S, W). */
  getApartments(): ShowroomApartment[] {
    return this.apartments.map(({ id, name }) => ({ id, name }))
  }

  private async loadApartment(def: ApartmentDef, hideNodes: string[]): Promise<boolean> {
    const gltf = await this.loader.loadAsync(def.url)
    if (this.disposed) {
      disposeObject3D(gltf.scene)
      return false
    }
    const root = gltf.scene
    const hidden = new Set(hideNodes)
    const toRemove: THREE.Object3D[] = []
    root.traverse((obj) => {
      // Blender may suffix duplicate names (Door_Entrance.008, which three.js turns into
      // Door_Entrance008): compare the base name
      if (hidden.has(obj.name.replace(/\.?\d{3,}$/, ''))) toRemove.push(obj)
    })
    for (const obj of toRemove) {
      obj.removeFromParent()
      disposeObject3D(obj)
    }
    root.position.fromArray(def.position)
    root.rotation.y = def.rotationY
    root.name = `ModelApartment_${def.id}`
    this.worldRoot.add(root)
    return true
  }

  /** Which apartment (if any) contains the game-space point. */
  private apartmentAt(x: number, z: number): ApartmentDef | null {
    for (const def of this.apartments) {
      const [minX, minZ, maxX, maxZ] = def.footprint
      // Undo the apartment's rotation to test against the north footprint.
      const [nx, nz] = rotateXZ(x, z, -def.angle)
      if (nx >= minX && nx <= maxX && nz >= minZ && nz <= maxZ) return def
    }
    return null
  }

  getMinimapState(): MinimapState {
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    return {
      plazaRadius: PLAZA_RADIUS,
      parkRadius: PARK_RADIUS,
      player: { x: this.camera.position.x, z: this.camera.position.z, yaw: Math.atan2(-dir.x, -dir.z) },
      apartments: this.apartments.map((def) => {
        const [minX, minZ, maxX, maxZ] = def.footprint
        return {
          id: def.id,
          name: def.name,
          corners: ([[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]] as Array<[number, number]>)
            .map(([x, z]) => rotateXZ(x, z, def.angle)),
          door: [def.doorStand[0], def.doorStand[2]] as [number, number],
        }
      }),
      currentApartmentId: this.currentApartmentId,
    }
  }

  // ------------------------------------------------------------------ walk mode

  /** Switch between orbit (overview) and first-person walking. */
  setWalkMode(on: boolean): void {
    if (on === this.walking) return
    this.walking = on
    this.fly = null
    this.keys.clear()
    if (on) {
      this.controls.enabled = false
      this.controls.autoRotate = false
      this.placeWalker(this.walkSpawn, 0)
      void buildWorldCollisionFromObject('new-nation', this.worldRoot)
    } else {
      if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock()
      // Hand the current view back to the orbit controls.
      const ahead = new THREE.Vector3(0, 0, -4).applyQuaternion(this.camera.quaternion)
      this.controls.target.copy(this.camera.position).add(ahead)
      this.controls.enabled = true
      this.setHovered(null)
    }
    this.emitWalkState()
  }

  /** Walk mode: stand in front of an apartment's door, facing it. */
  goToApartment(id: string): void {
    const def = this.apartments.find((a) => a.id === id)
    if (!def) return
    if (!this.walking) this.setWalkMode(true)
    this.placeWalker(new THREE.Vector3().fromArray(def.doorStand), def.doorYaw)
  }

  /** Visit the next (+1) / previous (-1) apartment around the ring; returns its id. */
  goToNextApartment(step: 1 | -1): string | null {
    if (this.apartments.length === 0) return null
    const fromId = this.currentApartmentId ?? this.nearestApartmentId()
    const idx = this.apartments.findIndex((a) => a.id === fromId)
    const next = this.apartments[(idx + step + this.apartments.length) % this.apartments.length]!
    this.goToApartment(next.id)
    return next.id
  }

  /** Walk mode: back to the plaza entrance, facing the fountain. */
  goToPlaza(): void {
    if (!this.walking) this.setWalkMode(true)
    this.placeWalker(this.walkSpawn, 0)
  }

  private nearestApartmentId(): string | null {
    let best: string | null = null
    let bestD = Infinity
    for (const def of this.apartments) {
      const d = Math.hypot(this.camera.position.x - def.doorStand[0], this.camera.position.z - def.doorStand[2])
      if (d < bestD) {
        bestD = d
        best = def.id
      }
    }
    return best
  }

  /** Hold-to-turn input from on-screen buttons: -1 left, 1 right, 0 stop. Works in both modes. */
  setTurnInput(direction: -1 | 0 | 1): void {
    this.turnInput = direction
    if (direction !== 0) {
      this.controls.autoRotate = false
      this.fly = null
    }
  }

  private turnAmount(dt: number): number {
    const keys = (this.keys.has('KeyQ') ? 1 : 0) - (this.keys.has('KeyE') ? 1 : 0)
    return (keys - this.turnInput) * TURN_SPEED * dt
  }

  /** Orbit mode turning: swing the camera around the orbit target. */
  private updateOrbitTurn(dt: number): void {
    const angle = this.turnAmount(dt)
    if (angle === 0) return
    const offset = this.camera.position.clone().sub(this.controls.target)
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
    this.camera.position.copy(this.controls.target).add(offset)
  }

  /** Ask for pointer lock (must be called from a user gesture). */
  requestMouseLook(): void {
    if (this.walking) void this.renderer.domElement.requestPointerLock()
  }

  private placeWalker(position: THREE.Vector3, yaw: number): void {
    this.walkPos.set(position.x, EYE_HEIGHT, position.z)
    this.yaw = yaw
    this.pitch = 0
    this.applyWalkCamera()
  }

  private applyWalkCamera(): void {
    this.camera.position.copy(this.walkPos)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
  }

  private updateWalk(dt: number): void {
    this.yaw += this.turnAmount(dt)
    const forward = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0)
      - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0)
    const strafe = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0)
      - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0)
    if (forward !== 0 || strafe !== 0) {
      const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? RUN_SPEED : WALK_SPEED
      const len = Math.hypot(forward, strafe)
      const sin = Math.sin(this.yaw)
      const cos = Math.cos(this.yaw)
      // At yaw 0 the camera looks down -Z.
      const dx = ((-sin * forward + cos * strafe) / len) * speed * dt
      const dz = ((-cos * forward - sin * strafe) / len) * speed * dt
      const resolved = resolveWorldMovement(this.walkPos, dx, dz)
      this.walkPos.x = resolved.x
      this.walkPos.z = resolved.z
    }
    this.applyWalkCamera()

    const inside = this.apartmentAt(this.walkPos.x, this.walkPos.z)?.id ?? null
    if (inside !== this.currentApartmentId) {
      this.currentApartmentId = inside
      this.callbacks.onApartmentChange?.(inside)
    }

    // Centre-of-screen hover so the UI can offer "click to inspect".
    this.hoverCheckTimer -= dt
    if (this.hoverCheckTimer <= 0) {
      this.hoverCheckTimer = 0.1
      this.setHovered(this.mouseLook ? this.pickCenter() : null)
    }
  }

  private pickCenter(): number | null {
    this.pointer.set(0, 0)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    this.raycaster.far = WALK_PICK_DISTANCE
    const hit = this.raycaster.intersectObject(this.itemsRoot, true).find((h) => h.object.userData.showroomItemId !== undefined)
    this.raycaster.far = Infinity
    return hit ? (hit.object.userData.showroomItemId as number) : null
  }

  private setHovered(id: number | null): void {
    if (id === this.hoveredId) return
    this.hoveredId = id
    this.renderer.domElement.style.cursor = id !== null && !this.walking ? 'pointer' : ''
    this.refreshLabelStates()
    this.callbacks.onHover?.(id)
  }

  private emitWalkState(): void {
    this.callbacks.onWalkStateChange?.({ walking: this.walking, mouseLook: this.mouseLook })
  }

  private readonly onPointerLockChange = (): void => {
    this.mouseLook = document.pointerLockElement === this.renderer.domElement
    if (!this.mouseLook) this.keys.clear()
    this.emitWalkState()
  }

  private readonly onMouseLook = (e: MouseEvent): void => {
    if (!this.walking || !this.mouseLook) return
    this.yaw -= e.movementX * MOUSE_SENSITIVITY
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * MOUSE_SENSITIVITY, -1.35, 1.35)
  }

  private isTypingTarget(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.isTypingTarget(e)) return
    const turnKey = e.code === 'KeyQ' || e.code === 'KeyE'
    if (!this.walking && !turnKey) return
    if (turnKey && !this.walking) {
      this.controls.autoRotate = false
      this.fly = null
    }
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
    this.keys.add(e.code)
  }

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code)
  }

  private readonly onBlur = (): void => {
    this.keys.clear()
  }

  /** Places (or re-places) the given items on the display slots. */
  async setItems(items: ShowroomItem[]): Promise<void> {
    const version = ++this.populateVersion
    this.clearItems()
    const bySlotGroup: Record<ShowroomGroup, SlotDef[]> = {
      apartment: this.slots.filter((s) => s.group === 'apartment'),
      skin: this.slots.filter((s) => s.group === 'skin'),
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
      // Spread items evenly around their ring instead of bunching them on one side.
      const slot = groupCount[item.group] <= ring.length
        ? ring[Math.floor((n * ring.length) / groupCount[item.group])]
        : ring[n]
      let position: THREE.Vector3
      if (slot) {
        position = new THREE.Vector3(...slot.position)
      } else {
        const a = (overflowIndex++ / Math.max(overflowTotal, 1)) * Math.PI * 2 + Math.PI / 2
        position = new THREE.Vector3(Math.cos(a) * OVERFLOW_RADIUS, 0.45, Math.sin(a) * OVERFLOW_RADIUS)
        this.itemsRoot.add(this.makeOverflowPlinth(position))
      }
      loads.push(this.placeItem(item, position, version))
    }
    await Promise.all(loads)
  }

  select(id: number | null, fly = true): void {
    this.selectedId = id
    this.pendingFlyId = null
    this.refreshLabelStates()
    if (!fly || this.walking) return
    if (id === null) {
      this.flyTo(OVERVIEW_POSITION, OVERVIEW_TARGET)
      this.controls.autoRotate = true
      return
    }
    const placed = this.placed.get(id)
    this.pendingFlyId = placed ? null : id
    if (!placed) return
    this.controls.autoRotate = false
    const outward = new THREE.Vector3(placed.slot.x, 0, placed.slot.z).normalize()
    const height = placed.item.group === 'skin' ? 1.1 : 0.8
    const target = placed.slot.clone().add(new THREE.Vector3(0, height, 0))
    // Items face the plaza centre, so view them from the centre side.
    const camPos = target.clone().addScaledVector(outward, -4.2).add(new THREE.Vector3(0, 1.2, 0))
    this.flyTo(camPos, target)
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frameId)
    this.resizeObserver.disconnect()
    const el = this.renderer.domElement
    el.removeEventListener('pointermove', this.onPointerMove)
    el.removeEventListener('pointerdown', this.onPointerDown)
    el.removeEventListener('pointerup', this.onPointerUp)
    el.removeEventListener('pointerleave', this.onPointerLeave)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('mousemove', this.onMouseLook)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    if (document.pointerLockElement === el) document.exitPointerLock()
    this.controls.dispose()
    this.clearItems()
    disposeObject3D(this.worldRoot)
    this.envMap?.dispose()
    this.renderer.dispose()
    el.remove()
    this.labelRenderer.domElement.remove()
  }

  // ------------------------------------------------------------------ items

  private async placeItem(item: ShowroomItem, slot: THREE.Vector3, version: number): Promise<void> {
    const root = new THREE.Group()
    root.position.copy(slot)
    // Face the plaza centre.
    root.rotation.y = Math.atan2(-slot.x, -slot.z)
    root.userData.showroomItemId = item.id
    const visual = new THREE.Group()
    root.add(visual)

    let visualHeight = CARD_SIZE + 0.4
    let spin = false
    let bob = false
    const model = item.modelUrl ? await this.loadModel(item.modelUrl) : null
    if (version !== this.populateVersion || this.disposed) {
      if (model) disposeObject3D(model)
      return
    }
    if (model) {
      visualHeight = this.fitModel(model, item.group)
      visual.add(model)
      spin = item.group === 'apartment'
    } else {
      visual.add(await this.makeCard(item))
      visual.position.y = 0.35
      bob = true
    }
    if (version !== this.populateVersion || this.disposed) {
      disposeObject3D(root)
      return
    }

    const label = new CSS2DObject(makeLabelElement(item))
    label.position.set(0, visualHeight + 0.45, 0)
    root.add(label)

    if (item.rarity) root.add(this.makeRarityRing(item.rarity))
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.userData.showroomItemId = item.id
    })
    this.itemsRoot.add(root)
    this.placed.set(item.id, { item, root, visual, label, slot, spin, bob })
    this.refreshLabelStates()
    if (this.pendingFlyId === item.id) this.select(item.id)
  }

  /** Glowing floor ring in the tier colour (bigger and brighter for legendary). */
  private makeRarityRing(rarity: Rarity): THREE.Mesh {
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

  private async loadModel(url: string): Promise<THREE.Group | null> {
    try {
      const gltf = await this.loader.loadAsync(url)
      return gltf.scene
    } catch (error) {
      console.warn('[NewNation] model failed to load, showing a card instead', url, error)
      return null
    }
  }

  /** Scales/centres a model on its slot; returns its final height. */
  private fitModel(model: THREE.Group, group: ShowroomGroup): number {
    model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
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

  private makeOverflowPlinth(position: THREE.Vector3): THREE.Mesh {
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.95, 0.45, 24),
      new THREE.MeshStandardMaterial({ color: 0x141a2e, metalness: 0.6, roughness: 0.35, emissive: 0x0e7490, emissiveIntensity: 0.25 }),
    )
    plinth.position.set(position.x, 0.225, position.z)
    plinth.userData.isOverflowPlinth = true
    return plinth
  }

  private clearItems(): void {
    for (const placed of this.placed.values()) {
      placed.label.element.remove()
    }
    this.placed.clear()
    for (const child of [...this.itemsRoot.children]) {
      this.itemsRoot.remove(child)
      disposeObject3D(child)
    }
  }

  private refreshLabelStates(): void {
    for (const [id, placed] of this.placed) {
      const el = placed.label.element
      const active = id === this.selectedId || id === this.hoveredId
      el.style.opacity = this.selectedId !== null && !active ? '0.35' : '1'
      el.style.borderColor = active ? 'rgba(253,224,71,0.95)' : 'rgba(103,232,249,0.55)'
      el.style.transform = active ? 'translateY(-10px) scale(1.08)' : 'translateY(-6px)'
    }
  }

  // ------------------------------------------------------------------ camera + input

  private flyTo(position: THREE.Vector3, target: THREE.Vector3): void {
    this.fly = {
      fromPos: this.camera.position.clone(),
      toPos: position.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
      t: 0,
    }
  }

  private pickItem(clientX: number, clientY: number): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObject(this.itemsRoot, true).find((h) => h.object.userData.showroomItemId !== undefined)
    return hit ? (hit.object.userData.showroomItemId as number) : null
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.walking) {
      // Drag to look around (no pointer lock needed).
      if (this.dragLook && !this.mouseLook) {
        this.yaw -= (e.clientX - this.dragLook.x) * DRAG_LOOK_SENSITIVITY
        this.pitch = THREE.MathUtils.clamp(this.pitch - (e.clientY - this.dragLook.y) * DRAG_LOOK_SENSITIVITY, -1.35, 1.35)
        this.dragLook = { x: e.clientX, y: e.clientY }
      }
      return
    }
    this.setHovered(this.pickItem(e.clientX, e.clientY))
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.pointerDown = { x: e.clientX, y: e.clientY }
    if (this.walking && !this.mouseLook) {
      this.dragLook = { x: e.clientX, y: e.clientY }
      this.renderer.domElement.setPointerCapture(e.pointerId)
    }
  }

  private readonly onPointerUp = (e: PointerEvent): void => {
    const down = this.pointerDown
    this.pointerDown = null
    this.dragLook = null
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
      this.renderer.domElement.releasePointerCapture(e.pointerId)
    }
    // Ignore drags (orbiting), only treat near-stationary clicks as selection.
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return
    if (this.walking) {
      if (!this.mouseLook) {
        // A plain click inspects the item under the cursor, otherwise captures the mouse.
        const clicked = this.pickItem(e.clientX, e.clientY)
        if (clicked !== null) this.callbacks.onSelect(clicked)
        else this.requestMouseLook()
        return
      }
      const id = this.pickCenter()
      if (id !== null) {
        // Free the mouse so the buy panel can be used.
        document.exitPointerLock()
        this.callbacks.onSelect(id)
      }
      return
    }
    const id = this.pickItem(e.clientX, e.clientY)
    if (id !== null) this.callbacks.onSelect(id)
  }

  private readonly onPointerLeave = (): void => {
    if (!this.walking) this.setHovered(null)
  }

  private size(): { width: number; height: number } {
    return {
      width: Math.max(1, this.container.clientWidth),
      height: Math.max(1, this.container.clientHeight),
    }
  }

  private onResize(): void {
    const { width, height } = this.size()
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
    this.labelRenderer.setSize(width, height)
  }

  private readonly animate = (): void => {
    this.frameId = requestAnimationFrame(this.animate)
    const dt = Math.min(this.clock.getDelta(), 0.1)
    const time = this.clock.elapsedTime

    if (this.fly) {
      this.fly.t = Math.min(1, this.fly.t + dt / FLY_DURATION_S)
      const k = easeInOut(this.fly.t)
      this.camera.position.lerpVectors(this.fly.fromPos, this.fly.toPos, k)
      this.controls.target.lerpVectors(this.fly.fromTarget, this.fly.toTarget, k)
      if (this.fly.t >= 1) this.fly = null
    }

    for (const [id, placed] of this.placed) {
      const speed = id === this.selectedId ? 0.9 : 0.35
      if (placed.spin) placed.visual.rotation.y += dt * speed
      if (placed.bob) placed.visual.position.y = 0.35 + Math.sin(time * 1.6 + id) * 0.06
    }

    if (this.walking) {
      this.updateWalk(dt)
    } else {
      this.updateOrbitTurn(dt)
      this.controls.update()
    }
    this.renderer.render(this.scene, this.camera)
    this.labelRenderer.render(this.scene, this.camera)
  }
}
