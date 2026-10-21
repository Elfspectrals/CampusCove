import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { SHOWROOM } from '../assets/catalog'
import { buildWorldCollisionFromObject, resolveWorldMovement } from '../collision/worldCollision'
import { createGltfLoader } from '../gltfLoaderFactory'
import {
  apartmentAt,
  minimapApartments,
  nearestApartmentId,
  PARK_RADIUS,
  PLAZA_RADIUS,
  type ApartmentDef,
  type MinimapState,
  type ShowroomApartment,
  type SlotDef,
  type SlotsFile,
} from './showroomLayout'
import { ShowroomItems, type ShowroomItem } from './showroomItems'

/**
 * 3D showroom for the /NewNation route: loads the NewNation plaza (built in Blender,
 * see map-src/NewNation) and puts every shop item on a display slot. Two camera modes:
 * orbit (overview / fly-to items) and walk (first person, WASD, mouse look via pointer lock or
 * drag, Q/E to turn, Rapier collision) for strolling around the neighbourhood of walk-in model
 * apartments that ring the plaza.
 */

const SKY_COLOR = 0xa9cbea
/** Diagonal overview so the entrance gate does not block the plaza. */
const OVERVIEW_POSITION = new THREE.Vector3(23, 18, 23)
const OVERVIEW_TARGET = new THREE.Vector3(0, 1.5, 0)
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

function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
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
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly clock = new THREE.Clock()
  private readonly items: ShowroomItems
  /** Map + model apartments: what walk-mode collision is built from. */
  private readonly worldRoot = new THREE.Group()
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

    this.items = new ShowroomItems(this.loader)
    this.items.onPlaced = (id) => {
      if (this.pendingFlyId === id) this.select(id)
    }
    this.scene.add(this.worldRoot)
    this.scene.add(this.items.root)

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

  // ------------------------------------------------------------------ map

  /** Loads the plaza and slot layout. Resolves once the map is visible. */
  async loadMap(): Promise<void> {
    if (this.map) return
    const [gltf, slotsRes] = await Promise.all([this.loader.loadAsync(SHOWROOM.modelUrl), fetch(SHOWROOM.layoutUrl)])
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

  getMinimapState(): MinimapState {
    const dir = this.camera.getWorldDirection(new THREE.Vector3())
    return {
      plazaRadius: PLAZA_RADIUS,
      parkRadius: PARK_RADIUS,
      player: { x: this.camera.position.x, z: this.camera.position.z, yaw: Math.atan2(-dir.x, -dir.z) },
      apartments: minimapApartments(this.apartments),
      currentApartmentId: this.currentApartmentId,
    }
  }

  // ------------------------------------------------------------------ items

  /** Places (or re-places) the given items on the display slots. */
  setItems(items: ShowroomItem[]): Promise<void> {
    return this.items.setItems(items, this.slots)
  }

  select(id: number | null, fly = true): void {
    this.selectedId = id
    this.pendingFlyId = null
    this.items.setHighlight(this.selectedId, this.hoveredId)
    if (!fly || this.walking) return
    if (id === null) {
      this.flyTo(OVERVIEW_POSITION, OVERVIEW_TARGET)
      this.controls.autoRotate = true
      return
    }
    const placed = this.items.get(id)
    if (!placed) {
      this.pendingFlyId = id
      return
    }
    this.controls.autoRotate = false
    const outward = new THREE.Vector3(placed.slot.x, 0, placed.slot.z).normalize()
    const height = placed.item.group === 'skin' ? 1.1 : 0.8
    const target = placed.slot.clone().add(new THREE.Vector3(0, height, 0))
    // Items face the plaza centre, so view them from the centre side.
    const camPos = target.clone().addScaledVector(outward, -4.2).add(new THREE.Vector3(0, 1.2, 0))
    this.flyTo(camPos, target)
  }

  private setHovered(id: number | null): void {
    if (id === this.hoveredId) return
    this.hoveredId = id
    this.renderer.domElement.style.cursor = id !== null && !this.walking ? 'pointer' : ''
    this.items.setHighlight(this.selectedId, this.hoveredId)
    this.callbacks.onHover?.(id)
  }

  private pickItem(clientX: number, clientY: number): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.items.pick(this.raycaster)
  }

  /** Item under the crosshair, within reach (walk mode). */
  private pickCenter(): number | null {
    this.pointer.set(0, 0)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    this.raycaster.far = WALK_PICK_DISTANCE
    const id = this.items.pick(this.raycaster)
    this.raycaster.far = Infinity
    return id
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

  /** Visit the next (+1) / previous (-1) apartment around the ring. */
  goToNextApartment(step: 1 | -1): void {
    if (this.apartments.length === 0) return
    const fromId = this.currentApartmentId
      ?? nearestApartmentId(this.apartments, this.camera.position.x, this.camera.position.z)
    const idx = this.apartments.findIndex((a) => a.id === fromId)
    const next = this.apartments[(idx + step + this.apartments.length) % this.apartments.length]!
    this.goToApartment(next.id)
  }

  /** Walk mode: back to the plaza entrance, facing the fountain. */
  goToPlaza(): void {
    if (!this.walking) this.setWalkMode(true)
    this.placeWalker(this.walkSpawn, 0)
  }

  /** Hold-to-turn input from on-screen buttons: -1 left, 1 right, 0 stop. Works in both modes. */
  setTurnInput(direction: -1 | 0 | 1): void {
    this.turnInput = direction
    if (direction !== 0) {
      this.controls.autoRotate = false
      this.fly = null
    }
  }

  /** Ask for pointer lock (must be called from a user gesture). */
  requestMouseLook(): void {
    if (this.walking) void this.renderer.domElement.requestPointerLock()
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
    offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle)
    this.camera.position.copy(this.controls.target).add(offset)
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
    const pressed = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0)
    const forward = pressed('KeyW', 'ArrowUp') - pressed('KeyS', 'ArrowDown')
    const strafe = pressed('KeyD', 'ArrowRight') - pressed('KeyA', 'ArrowLeft')
    if (forward !== 0 || strafe !== 0) {
      const speed = pressed('ShiftLeft', 'ShiftRight') ? RUN_SPEED : WALK_SPEED
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

    const inside = apartmentAt(this.apartments, this.walkPos.x, this.walkPos.z)?.id ?? null
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

  private emitWalkState(): void {
    this.callbacks.onWalkStateChange?.({ walking: this.walking, mouseLook: this.mouseLook })
  }

  // ------------------------------------------------------------------ input

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

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e)) return
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
    if (!this.walking) {
      const id = this.pickItem(e.clientX, e.clientY)
      if (id !== null) this.callbacks.onSelect(id)
      return
    }
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
  }

  private readonly onPointerLeave = (): void => {
    if (!this.walking) this.setHovered(null)
  }

  // ------------------------------------------------------------------ frame + lifecycle

  private flyTo(position: THREE.Vector3, target: THREE.Vector3): void {
    this.fly = {
      fromPos: this.camera.position.clone(),
      toPos: position.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
      t: 0,
    }
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

    if (this.fly) {
      this.fly.t = Math.min(1, this.fly.t + dt / FLY_DURATION_S)
      const k = easeInOut(this.fly.t)
      this.camera.position.lerpVectors(this.fly.fromPos, this.fly.toPos, k)
      this.controls.target.lerpVectors(this.fly.fromTarget, this.fly.toTarget, k)
      if (this.fly.t >= 1) this.fly = null
    }

    this.items.animate(dt, this.clock.elapsedTime)

    if (this.walking) {
      this.updateWalk(dt)
    } else {
      this.updateOrbitTurn(dt)
      this.controls.update()
    }
    this.renderer.render(this.scene, this.camera)
    this.labelRenderer.render(this.scene, this.camera)
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
    this.items.dispose()
    disposeObject3D(this.worldRoot)
    this.envMap?.dispose()
    this.renderer.dispose()
    el.remove()
    this.labelRenderer.domElement.remove()
  }
}
