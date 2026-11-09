import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { updateAvatarAnimation } from '../../avatar/glbCharacter'
import { CEILING_HEIGHT, CELL_HEIGHT, usableArea, type CellPreset, type MallTemplate, type TemplateProp, type Vec3 } from '../mallTemplates/mallTemplate.ts'
import { createSurfacePanels, disposeSurfacePanels } from '../mallTemplates/templateSurfaces'
import { createPropObject, disposeLookMaps, materialSlotsOf, placeProp, propSignature, type MaterialSlot } from '../mallTemplates/templateProps'
import { createPlacementGhost, DEFAULT_GHOST_COLOR } from '../placement/placementGhost'

export interface PlacementRequest {
  modelUrl: string | null
  place: (position: Vec3) => void
  cancel: () => void
}

export type GizmoMode = 'select' | 'translate' | 'rotate' | 'scale'

export interface PropTransform {
  position: Vec3
  yaw: number
  scale: number
}

interface PlacedObject {
  object: THREE.Object3D | null
  signature: string
}

const SKY_COLOR = 0x1d2233
const WALL_THICKNESS = 0.3
const FLY_SPEED = 6
const FLY_FAST = 3
const LOOK_SPEED = 0.003
const CLICK_SLOP_PX = 5
const GHOST_LIFT = 0.5
const EYE_HEIGHT = 1.6
const WALK_SPEED = 3.2
const WALK_MARGIN = 0.25
const MIN_SCALE = 0.05
const FLY_KEYS: Record<string, THREE.Vector3> = {
  KeyW: new THREE.Vector3(0, 0, -1),
  KeyS: new THREE.Vector3(0, 0, 1),
  KeyA: new THREE.Vector3(-1, 0, 0),
  KeyD: new THREE.Vector3(1, 0, 0),
  KeyE: new THREE.Vector3(0, 1, 0),
  KeyQ: new THREE.Vector3(0, -1, 0),
}

function isTypingTarget(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
}

function cellGrid(width: number, depth: number): THREE.LineSegments {
  const points: number[] = []
  for (let x = -width / 2; x <= width / 2 + 0.001; x += 1) points.push(x, 0, 0, x, 0, -depth)
  for (let z = 0; z >= -depth - 0.001; z -= 1) points.push(-width / 2, 0, z, width / 2, 0, z)
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  const grid = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x55607a }))
  grid.name = 'Grid'
  grid.position.y = 0.002
  grid.raycast = () => {}
  return grid
}

function disposeShell(shell: THREE.Group): void {
  shell.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments)) return
    obj.geometry.dispose()
    ;(obj.material as THREE.Material).dispose()
  })
}

function shellMaterial(color: number, opacity = 1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: opacity < 1, opacity, depthWrite: opacity === 1 })
}

function box(width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  mesh.position.set(x, y, z)
  return mesh
}

function buildShell(preset: CellPreset): THREE.Group {
  const { halfWidth, minZ } = usableArea(preset)
  const width = halfWidth * 2
  const depth = -minZ
  const shell = new THREE.Group()
  shell.name = 'CellShell'
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), shellMaterial(0x8d8578))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, -depth / 2)
  floor.name = 'Floor'
  const wall = shellMaterial(0xd8d2c6)
  const halfHeight = CELL_HEIGHT / 2
  shell.add(
    floor,
    box(WALL_THICKNESS, CELL_HEIGHT, depth, wall, -(width + WALL_THICKNESS) / 2, halfHeight, -depth / 2),
    box(WALL_THICKNESS, CELL_HEIGHT, depth, wall, (width + WALL_THICKNESS) / 2, halfHeight, -depth / 2),
    box(width + WALL_THICKNESS * 2, CELL_HEIGHT, WALL_THICKNESS, wall, 0, halfHeight, -depth - WALL_THICKNESS / 2),
    box(width, CELL_HEIGHT, 0.05, shellMaterial(0x9fd3ff, 0.18), 0, halfHeight, 0.025),
  )
  shell.add(cellGrid(width, depth))
  return shell
}

function lightHelper(color: string): THREE.Mesh {
  const helper = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), new THREE.MeshBasicMaterial({ color }))
  helper.name = 'LightHelper'
  return helper
}

function snapTo(value: number, step: number): number {
  return step > 0 ? Number((Math.round(value / step) * step).toFixed(4)) : value
}

export class MallEditorScene {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  readonly controls: OrbitControls
  private readonly container: HTMLElement
  private readonly resizeObserver: ResizeObserver
  private readonly envMap: THREE.Texture
  private readonly clock = new THREE.Clock()
  private readonly flyKeys = new Set<string>()
  private readonly propsRoot = new THREE.Group()
  private readonly placed = new Map<string, PlacedObject>()
  private readonly ghost = createPlacementGhost()
  private readonly raycaster = new THREE.Raycaster()
  private readonly ghostRest = new THREE.Vector3()
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private placement: PlacementRequest | null = null
  private preset: CellPreset | null = null
  private readonly gizmo: TransformControls
  private readonly selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0xffc94d)
  private selectedId: string | null = null
  private hiddenIds = new Set<string>()
  private gizmoMode: GizmoMode = 'translate'
  private gizmoDragging = false
  private pressAt: { x: number; y: number } | null = null
  private scaleBeforeDrag = 1
  translationSnap = 0.1
  private rotationSnap = 0
  onSelect: (id: string | null) => void = () => {}
  onTransform: (id: string, transform: PropTransform) => void = () => {}
  onError: (message: string) => void = () => {}
  onMaterials: (id: string, slots: MaterialSlot[]) => void = () => {}
  private shell: THREE.Group | null = null
  private surfaces: THREE.Group | null = null
  private surfacesToken = 0
  private flying = false
  private walking = false
  private readonly cameraBeforeWalk = { position: new THREE.Vector3(), target: new THREE.Vector3() }
  onWalkEnd: () => void = () => {}
  private frameId = 0

  constructor(container: HTMLElement) {
    this.container = container
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200)
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.domElement.style.display = 'block'
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.1
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: null }
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02

    this.scene.background = new THREE.Color(SKY_COLOR)
    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x6d665c, 1.2))
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.4)
    sun.position.set(6, 12, 8)
    this.scene.add(sun)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    this.envMap = pmrem.fromScene(room, 0.04).texture
    room.dispose()
    pmrem.dispose()
    this.scene.environment = this.envMap
    this.scene.environmentIntensity = 0.45

    this.propsRoot.name = 'TemplateProps'
    this.ghost.root.visible = false
    this.selectionBox.visible = false
    this.selectionBox.raycast = () => {}
    this.gizmo = new TransformControls(this.camera, this.renderer.domElement)
    this.gizmo.addEventListener('dragging-changed', this.onGizmoDragging)
    this.gizmo.addEventListener('objectChange', this.onGizmoChange)
    this.scene.add(this.propsRoot, this.ghost.root, this.selectionBox, this.gizmo.getHelper())

    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onPlacePointerDown, { capture: true })
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('lostpointercapture', this.onLostPointerCapture)
    el.addEventListener('contextmenu', this.onContextMenu)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    document.addEventListener('pointerlockerror', this.onPointerLockError)
    document.addEventListener('mousemove', this.onWalkLook)
    this.resizeObserver = new ResizeObserver(() => this.onResize())
    this.resizeObserver.observe(container)
    this.onResize()
    this.animate()
  }

  syncProps(props: readonly TemplateProp[]): void {
    const ids = new Set(props.map((p) => p.id))
    for (const [id, entry] of this.placed) {
      if (ids.has(id)) continue
      this.removePlaced(entry)
      this.placed.delete(id)
    }
    for (const prop of props) {
      const signature = propSignature(prop)
      const entry = this.placed.get(prop.id)
      if (entry && entry.signature === signature) {
        if (entry.object) placeProp(entry.object, prop)
        continue
      }
      if (entry) this.removePlaced(entry)
      const next: PlacedObject = { object: null, signature }
      this.placed.set(prop.id, next)
      this.loadPlaced(prop, next).catch((error: unknown) => {
        if (this.placed.get(prop.id) === next) this.placed.delete(prop.id)
        this.onError(`${prop.id}: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
    this.attachSelection()
  }

  private async loadPlaced(prop: TemplateProp, entry: PlacedObject): Promise<void> {
    const object = await createPropObject(prop)
    if (this.placed.get(prop.id) !== entry) {
      disposeObject3D(object)
      return
    }
    if (prop.kind === 'light') object.add(lightHelper(prop.color))
    object.name = prop.id
    object.userData.templatePropId = prop.id
    object.userData.templatePropKind = prop.kind
    placeProp(object, prop)
    object.visible = !this.hiddenIds.has(prop.id)
    entry.object = object
    this.propsRoot.add(object)
    if (prop.kind === 'decor') this.onMaterials(prop.id, materialSlotsOf(object))
    if (this.selectedId === prop.id) this.attachSelection()
  }

  setHidden(ids: readonly string[]): void {
    this.hiddenIds = new Set(ids)
    for (const [id, { object }] of this.placed) if (object) object.visible = !this.hiddenIds.has(id)
  }

  select(id: string | null): void {
    this.selectedId = id
    this.attachSelection()
  }

  setGizmoMode(mode: GizmoMode): void {
    this.gizmoMode = mode
    if (mode !== 'select') {
      this.gizmo.setMode(mode)
      this.gizmo.showX = mode !== 'rotate'
      this.gizmo.showZ = mode !== 'rotate'
      this.gizmo.showY = true
    }
    this.attachSelection()
  }

  setSnaps(translation: number, rotationDegrees: number, scale: number): void {
    this.translationSnap = translation
    this.gizmo.setTranslationSnap(translation > 0 ? translation : null)
    this.rotationSnap = THREE.MathUtils.degToRad(rotationDegrees)
    this.gizmo.setScaleSnap(scale > 0 ? scale : null)
  }

  private selectedObject(): THREE.Object3D | null {
    return this.selectedId ? (this.placed.get(this.selectedId)?.object ?? null) : null
  }

  private attachSelection(): void {
    if (this.walking) return
    const object = this.selectedObject()
    this.selectionBox.visible = object !== null
    if (object) this.selectionBox.setFromObject(object)
    if (object && this.gizmoMode !== 'select') this.gizmo.attach(object)
    else this.gizmo.detach()
  }

  private updateOrbitEnabled(): void {
    this.controls.enabled = !this.flying && !this.gizmoDragging
  }

  private readonly onGizmoDragging = (event: { value: unknown }): void => {
    this.gizmoDragging = event.value === true
    this.updateOrbitEnabled()
    const object = this.selectedObject()
    if (!object || !this.selectedId) return
    if (this.gizmoDragging) {
      this.scaleBeforeDrag = object.scale.x
      return
    }
    this.onTransform(this.selectedId, this.clampedTransform(object))
  }

  private readonly onGizmoChange = (): void => {
    const object = this.selectedObject()
    if (!object) return
    if (this.gizmoMode === 'scale') {
      const { x, y, z } = object.scale
      const moved = [x, y, z].reduce((a, b) => (Math.abs(b - this.scaleBeforeDrag) > Math.abs(a - this.scaleBeforeDrag) ? b : a))
      object.scale.setScalar(Math.max(MIN_SCALE, moved))
    }
    if (this.gizmoMode === 'rotate') {
      const yaw = new THREE.Euler().setFromQuaternion(object.quaternion, 'YXZ').y
      object.rotation.set(0, this.rotationSnap > 0 ? Math.round(yaw / this.rotationSnap) * this.rotationSnap : yaw, 0)
    }
    this.selectionBox.setFromObject(object)
  }

  private clampedTransform(object: THREE.Object3D): PropTransform {
    const { halfWidth, minZ } = usableArea(this.preset ?? { width: 0, depth: 0 })
    const round = (v: number) => Number(v.toFixed(4))
    return {
      position: [
        round(THREE.MathUtils.clamp(object.position.x, -halfWidth, halfWidth)),
        round(THREE.MathUtils.clamp(object.position.y, 0, object.userData.templatePropKind === 'light' ? CEILING_HEIGHT : Infinity)),
        round(THREE.MathUtils.clamp(object.position.z, minZ, 0)),
      ],
      yaw: round(object.rotation.y),
      scale: round(object.scale.x),
    }
  }

  private pickProp(event: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    for (const hit of this.raycaster.intersectObject(this.propsRoot, true)) {
      let node: THREE.Object3D | null = hit.object
      while (node && node.userData.templatePropId === undefined) node = node.parent
      if (node && !this.hiddenIds.has(node.userData.templatePropId as string)) return node.userData.templatePropId as string
    }
    return null
  }

  private removePlaced(entry: PlacedObject): void {
    if (!entry.object) return
    this.propsRoot.remove(entry.object)
    disposeLookMaps(entry.object)
    disposeObject3D(entry.object)
  }

  beginPlacing(request: PlacementRequest): void {
    this.placement = request
    this.ghost.resetFeedback()
    this.ghost.showPlaceholder(DEFAULT_GHOST_COLOR)
    if (request.modelUrl) void this.ghost.upgradeToModel(request.modelUrl, DEFAULT_GHOST_COLOR, () => this.placement === request)
    this.ghost.root.visible = false
  }

  cancelPlacing(): void {
    const request = this.placement
    this.placement = null
    this.ghost.root.visible = false
    request?.cancel()
  }

  get placing(): boolean {
    return this.placement !== null
  }

  private floorPoint(event: PointerEvent): Vec3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = this.raycaster.ray.intersectPlane(this.floorPlane, new THREE.Vector3())
    return hit ? [snapTo(hit.x, this.translationSnap), 0, snapTo(hit.z, this.translationSnap)] : null
  }

  private insideCell(point: Vec3): boolean {
    if (!this.preset) return false
    const [x, , z] = point
    const { halfWidth, minZ } = usableArea(this.preset)
    return Math.abs(x) <= halfWidth && z <= 0 && z >= minZ
  }

  private readonly onPlacePointerDown = (event: PointerEvent): void => {
    if (!this.placement || event.button !== 0) return
    const point = this.floorPoint(event)
    if (!point) return
    event.stopImmediatePropagation()
    if (!this.insideCell(point)) {
      this.ghost.deny()
      return
    }
    const { place } = this.placement
    this.placement = null
    this.ghost.root.visible = false
    place(point)
  }

  async setSurfaces(template: Pick<MallTemplate, 'preset' | 'surfaces'>): Promise<void> {
    const token = ++this.surfacesToken
    const next = await createSurfacePanels(template)
    if (token !== this.surfacesToken) return disposeSurfacePanels(next)
    if (this.surfaces) {
      this.scene.remove(this.surfaces)
      disposeSurfacePanels(this.surfaces)
    }
    this.surfaces = next
    this.scene.add(next)
  }

  setPreset(preset: CellPreset): void {
    this.preset = preset
    if (this.shell) {
      this.scene.remove(this.shell)
      disposeShell(this.shell)
    }
    this.shell = buildShell(preset)
    this.scene.add(this.shell)
    const reach = Math.max(preset.width, preset.depth)
    this.controls.target.set(0, 0, -preset.depth / 2)
    this.camera.position.set(reach * 0.55, reach * 0.75, reach * 0.55)
    this.controls.update()
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.walking) return
    if (event.button === 0) this.pressAt = this.gizmo.dragging ? null : { x: event.clientX, y: event.clientY }
    if (event.button !== 2) return
    this.flying = true
    this.updateOrbitEnabled()
    this.renderer.domElement.setPointerCapture(event.pointerId)
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.placement && !this.flying) {
      const point = this.floorPoint(event)
      this.ghost.root.visible = point !== null
      if (point) {
        this.ghostRest.set(point[0], GHOST_LIFT, point[2])
        this.ghost.root.position.copy(this.ghostRest)
        this.ghost.setValid(this.insideCell(point))
      }
      return
    }
    if (!this.flying) return
    if ((event.buttons & 2) === 0) {
      this.stopFlying()
      return
    }
    const look = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ')
    look.y -= event.movementX * LOOK_SPEED
    look.x = THREE.MathUtils.clamp(look.x - event.movementY * LOOK_SPEED, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01)
    this.camera.quaternion.setFromEuler(look)
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button === 0) this.endClick(event)
    if (event.button !== 2 || !this.flying) return
    this.stopFlying()
  }

  private endClick(event: PointerEvent): void {
    const press = this.pressAt
    this.pressAt = null
    if (!press) return
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_SLOP_PX) return
    this.onSelect(this.pickProp(event))
  }

  get isFlying(): boolean {
    return this.flying
  }

  get isWalking(): boolean {
    return this.walking
  }

  async startWalk(): Promise<boolean> {
    if (this.walking || !this.preset) return false
    this.cancelPlacing()
    this.cameraBeforeWalk.position.copy(this.camera.position)
    this.cameraBeforeWalk.target.copy(this.controls.target)
    this.walking = true
    this.controls.enabled = false
    this.gizmo.detach()
    this.selectionBox.visible = false
    this.camera.position.set(0, EYE_HEIGHT, -WALK_MARGIN)
    this.camera.rotation.set(0, 0, 0, 'YXZ')
    try {
      await this.renderer.domElement.requestPointerLock()
    } catch (error) {
      this.onError(`Mouse look needs pointer lock (${error instanceof Error ? error.message : String(error)}). WASD still walks, Escape leaves.`)
    }
    return true
  }

  private readonly onPointerLockError = (): void => {
    if (this.walking) this.onError('Mouse look needs pointer lock, which the browser refused. WASD still walks, Escape leaves.')
  }

  stopWalk(): void {
    if (!this.walking) return
    this.walking = false
    this.flyKeys.clear()
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock()
    this.camera.position.copy(this.cameraBeforeWalk.position)
    this.controls.target.copy(this.cameraBeforeWalk.target)
    this.camera.lookAt(this.controls.target)
    this.updateOrbitEnabled()
    this.attachSelection()
    this.onWalkEnd()
  }

  private readonly onPointerLockChange = (): void => {
    if (this.walking && document.pointerLockElement !== this.renderer.domElement) this.stopWalk()
  }

  private readonly onWalkLook = (event: MouseEvent): void => {
    if (!this.walking) return
    const look = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ')
    look.y -= event.movementX * LOOK_SPEED
    look.x = THREE.MathUtils.clamp(look.x - event.movementY * LOOK_SPEED, -1.2, 1.2)
    look.z = 0
    this.camera.quaternion.setFromEuler(look)
  }

  private walk(dt: number): void {
    if (!this.preset) return
    const move = new THREE.Vector3()
    for (const code of this.flyKeys) if (FLY_KEYS[code] && FLY_KEYS[code].y === 0) move.add(FLY_KEYS[code])
    if (move.lengthSq() > 0) {
      const yaw = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ').y
      move.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiplyScalar(WALK_SPEED * dt)
      this.camera.position.add(move)
    }
    const area = usableArea(this.preset)
    const halfWidth = area.halfWidth - WALK_MARGIN
    this.camera.position.set(
      THREE.MathUtils.clamp(this.camera.position.x, -halfWidth, halfWidth),
      EYE_HEIGHT,
      THREE.MathUtils.clamp(this.camera.position.z, area.minZ + WALK_MARGIN, -WALK_MARGIN),
    )
  }

  get isTransforming(): boolean {
    return this.gizmoDragging
  }

  private readonly onLostPointerCapture = (): void => {
    if (this.flying) this.stopFlying()
  }

  private readonly onContextMenu = (event: Event): void => event.preventDefault()

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey) return
    if (this.flying || this.walking) event.preventDefault()
    else if (isTypingTarget(event)) return
    if (event.code === 'Escape' && this.walking) this.stopWalk()
    if (event.code === 'Escape' && this.placement) this.cancelPlacing()
    if (event.code in FLY_KEYS || event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.flyKeys.add(event.code)
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'Meta') this.flyKeys.clear()
    this.flyKeys.delete(event.code)
  }

  private readonly onBlur = (): void => {
    this.flyKeys.clear()
    if (this.flying) this.stopFlying()
  }

  private stopFlying(): void {
    this.flying = false
    const forward = this.camera.getWorldDirection(new THREE.Vector3())
    const onFloor = new THREE.Ray(this.camera.position, forward).intersectPlane(this.floorPlane, new THREE.Vector3())
    if (onFloor) this.controls.target.copy(onFloor)
    else this.controls.target.copy(this.camera.position).add(forward.setY(0).normalize().multiplyScalar(3))
    this.updateOrbitEnabled()
  }

  private fly(dt: number): void {
    const move = new THREE.Vector3()
    for (const code of this.flyKeys) if (FLY_KEYS[code]) move.add(FLY_KEYS[code])
    if (move.lengthSq() === 0) return
    const fast = this.flyKeys.has('ShiftLeft') || this.flyKeys.has('ShiftRight')
    const speed = FLY_SPEED * (fast ? FLY_FAST : 1) * dt
    this.camera.position.add(move.normalize().applyQuaternion(this.camera.quaternion).multiplyScalar(speed))
  }

  private size(): { width: number; height: number } {
    return { width: Math.max(1, this.container.clientWidth), height: Math.max(1, this.container.clientHeight) }
  }

  private onResize(): void {
    const { width, height } = this.size()
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  private readonly animate = (): void => {
    this.frameId = requestAnimationFrame(this.animate)
    const dt = Math.min(this.clock.getDelta(), 0.1)
    if (this.walking) this.walk(dt)
    else if (this.flying) this.fly(dt)
    else this.controls.update()
    if (this.ghost.root.visible) {
      this.ghost.tickFeedback(dt, this.ghostRest)
      this.ghost.applyShake()
      this.ghost.updateColors(dt)
    }
    const selected = this.selectedObject()
    if (selected && this.gizmoDragging) this.selectionBox.setFromObject(selected)
    for (const { object } of this.placed.values()) {
      if (object?.userData.templatePropKind === 'npc') updateAvatarAnimation(object, dt, 0)
    }
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId)
    this.resizeObserver.disconnect()
    const el = this.renderer.domElement
    el.removeEventListener('pointerdown', this.onPlacePointerDown, { capture: true })
    el.removeEventListener('pointerdown', this.onPointerDown)
    el.removeEventListener('pointermove', this.onPointerMove)
    el.removeEventListener('pointerup', this.onPointerUp)
    el.removeEventListener('lostpointercapture', this.onLostPointerCapture)
    el.removeEventListener('contextmenu', this.onContextMenu)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('pointerlockerror', this.onPointerLockError)
    document.removeEventListener('mousemove', this.onWalkLook)
    if (document.pointerLockElement === el) document.exitPointerLock()
    this.gizmo.removeEventListener('dragging-changed', this.onGizmoDragging)
    this.gizmo.removeEventListener('objectChange', this.onGizmoChange)
    this.gizmo.dispose()
    this.controls.dispose()
    if (this.shell) disposeShell(this.shell)
    if (this.surfaces) disposeSurfacePanels(this.surfaces)
    disposeObject3D(this.scene)
    this.envMap.dispose()
    this.renderer.dispose()
    el.remove()
  }
}
