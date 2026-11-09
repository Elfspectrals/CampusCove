import * as THREE from 'three'
import GUI from 'lil-gui'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { createGltfLoader } from '../gltfLoaderFactory'

const PIECES_URL = '/assets/test3d/test3d.glb'
const SKY_COLOR = 0xbfdcf2
const EYE_HEIGHT = 1.6
const WALK_SPEED = 3
const RUN_FACTOR = 2.5
const LOOK_SENSITIVITY = 0.0022

type Role = 'wood' | 'fabric' | 'glass'
type Palette = Partial<Record<Role, string>>

const ROLE_BY_MATERIAL: Record<string, Role> = {
  T3_Wood: 'wood',
  T3_Fabric: 'fabric',
  T3_Glass: 'glass',
}

const CHAIR_VARIANTS: Record<string, Palette> = {
  'Oak / cream': { wood: '#a0673f', fabric: '#efe3c8' },
  'Light / sage': { wood: '#e3c9a0', fabric: '#8fb59a' },
  'Dark / rose': { wood: '#5c3a26', fabric: '#d98f96' },
  'White / blue': { wood: '#f2efe8', fabric: '#7fa6d6' },
}

const LANTERN_VARIANTS: Record<string, Palette> = {
  'Wood / warm': { wood: '#8a5a3a', glass: '#ffd28a' },
  'Iron / cool': { wood: '#3b3f44', glass: '#cfe8ff' },
  'Green / amber': { wood: '#4f7a5a', glass: '#ffb347' },
  'Brass / white': { wood: '#c9a24a', glass: '#fff6e0' },
}

const DECOR_SLOTS = [
  { chairVariant: 'Oak / cream', lanternVariant: 'Wood / warm' },
  { chairVariant: 'Light / sage', lanternVariant: 'Iron / cool' },
  { chairVariant: 'Dark / rose', lanternVariant: 'Green / amber' },
]

function paletteOf(variants: Record<string, Palette>, name: string): Palette {
  const palette = variants[name]
  if (!palette) throw new Error(`Unknown variant ${name}`)
  return palette
}

export class Test3DScene {
  private readonly container: HTMLElement
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true })
  private readonly labelRenderer = new CSS2DRenderer()
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly clock = new THREE.Clock()
  private readonly gui = new GUI({ title: 'Test 3D' })
  private readonly keys = new Set<string>()
  private readonly decorSlots: Array<{ chair: THREE.Object3D; lantern: THREE.Object3D; chairVariant: string; lanternVariant: string }> = []
  private readonly envMap: THREE.Texture
  private pieces: THREE.Object3D | null = null
  private yaw = 0
  private pitch = -0.15
  private frame = 0

  constructor(container: HTMLElement) {
    this.container = container
    const { clientWidth: width, clientHeight: height } = container
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.05, 300)
    this.camera.position.set(0, EYE_HEIGHT, 9)

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.domElement.style.display = 'block'
    container.appendChild(this.renderer.domElement)
    this.labelRenderer.setSize(width, height)
    this.labelRenderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none'
    container.appendChild(this.labelRenderer.domElement)

    this.scene.background = new THREE.Color(SKY_COLOR)
    this.scene.add(new THREE.HemisphereLight(0xdcecff, 0x8a8478, 1.1))
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.6)
    sun.position.set(15, 30, 12)
    this.scene.add(sun)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.scene.environment = this.envMap
    this.scene.environmentIntensity = 0.45

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x9fbf86, roughness: 1 }))
    ground.rotation.x = -Math.PI / 2
    this.scene.add(ground)

    this.renderer.domElement.addEventListener('click', this.onCanvasClick)
    document.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('resize', this.onResize)
    this.loop()
  }

  async load(): Promise<void> {
    const loader = createGltfLoader()
    this.pieces = (await loader.loadAsync(PIECES_URL)).scene
    this.placeDecor()
    this.buildGui()
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.renderer.domElement.removeEventListener('click', this.onCanvasClick)
    document.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('resize', this.onResize)
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock()
    this.gui.destroy()
    this.envMap.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labelRenderer.domElement.remove()
  }

  private piece(name: string): THREE.Object3D {
    const node = this.pieces?.getObjectByName(name)
    if (!node) throw new Error(`test3d.glb has no node named ${name}`)
    return node.clone()
  }

  private tinted(name: string, palette: Palette): THREE.Object3D {
    const object = this.piece(name)
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const material = (child.material as THREE.MeshStandardMaterial).clone()
      const role = ROLE_BY_MATERIAL[material.name]
      const color = role ? palette[role] : undefined
      if (color) material.color.set(color)
      if (role === 'glass' && color) material.emissive.set(color)
      child.material = material
    })
    return object
  }

  private label(object: THREE.Object3D, text: string, height: number): void {
    const element = document.createElement('div')
    element.textContent = text
    element.style.cssText = 'font:600 11px system-ui;color:#fff;background:rgba(20,30,40,.65);padding:2px 6px;border-radius:4px'
    const label = new CSS2DObject(element)
    label.position.set(0, height, 0)
    object.add(label)
  }

  private placeDecor(): void {
    DECOR_SLOTS.forEach(({ chairVariant, lanternVariant }, i) => {
      const chair = this.makeChair(chairVariant)
      chair.position.set(-3 + i * 1.2, 0, 0)
      this.scene.add(chair)
      const lantern = this.makeLantern(lanternVariant)
      lantern.position.set(1.2 + i * 1, 0, 0)
      this.scene.add(lantern)
      this.decorSlots.push({ chair, lantern, chairVariant, lanternVariant })
    })
  }

  private makeChair(variant: string): THREE.Object3D {
    const palette = paletteOf(CHAIR_VARIANTS, variant)
    const chair = new THREE.Group()
    chair.add(this.tinted('Chair_Frame', palette))
    const cushion = this.tinted('Chair_Cushion', palette)
    const seat = this.seatHeight(chair)
    cushion.position.set(0, seat, 0.07)
    chair.add(cushion)
    this.label(chair, variant, 1.25)
    return chair
  }

  private seatHeight(chair: THREE.Object3D): number {
    chair.updateMatrixWorld(true)
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 2, 0.07), new THREE.Vector3(0, -1, 0))
    const hit = ray.intersectObject(chair, true).find((h) => h.point.y > 0.25 && h.point.y < 0.65)
    if (!hit) throw new Error('Chair_Frame: no seat found under the cushion')
    return hit.point.y
  }

  private makeLantern(variant: string): THREE.Object3D {
    const palette = paletteOf(LANTERN_VARIANTS, variant)
    const lantern = new THREE.Group()
    const post = this.tinted('Lantern_Post', palette)
    lantern.add(post)
    const top = new THREE.Box3().setFromObject(post).max.y
    const head = this.tinted('Lantern_Head', palette)
    head.position.y = top
    lantern.add(head)
    const panes = this.tinted('Lantern_Panes', palette)
    panes.position.y += top
    lantern.add(panes)
    this.label(lantern, variant, top + 0.65)
    return lantern
  }

  private replaceDecor(index: number): void {
    const slot = this.decorSlots[index]
    if (!slot) throw new Error(`No decor slot ${index}`)
    const chair = this.makeChair(slot.chairVariant)
    chair.position.copy(slot.chair.position)
    this.scene.remove(slot.chair)
    this.scene.add(chair)
    slot.chair = chair
    const lantern = this.makeLantern(slot.lanternVariant)
    lantern.position.copy(slot.lantern.position)
    this.scene.remove(slot.lantern)
    this.scene.add(lantern)
    slot.lantern = lantern
  }

  private buildGui(): void {
    const decor = this.gui.addFolder('Decor variants')
    this.decorSlots.forEach((slot, index) => {
      decor.add(slot, 'chairVariant', Object.keys(CHAIR_VARIANTS)).name(`Chair ${index + 1}`).onChange(() => this.replaceDecor(index))
      decor.add(slot, 'lanternVariant', Object.keys(LANTERN_VARIANTS)).name(`Lantern ${index + 1}`).onChange(() => this.replaceDecor(index))
    })
  }

  private readonly onCanvasClick = () => {
    void this.renderer.domElement.requestPointerLock()
  }

  private readonly onMouseMove = (event: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement) return
    this.yaw -= event.movementX * LOOK_SENSITIVITY
    this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * LOOK_SENSITIVITY, -1.4, 1.4)
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return
    this.keys.add(event.code)
  }

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code)
  }

  private readonly onResize = () => {
    const { clientWidth: width, clientHeight: height } = this.container
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
    this.labelRenderer.setSize(width, height)
  }

  private move(delta: number): void {
    const pressed = (...codes: string[]) => codes.some((code) => this.keys.has(code))
    const forward = Number(pressed('KeyW', 'ArrowUp')) - Number(pressed('KeyS', 'ArrowDown'))
    const strafe = Number(pressed('KeyD', 'ArrowRight')) - Number(pressed('KeyA', 'ArrowLeft'))
    const lift = Number(pressed('Space')) - Number(pressed('KeyC'))
    const speed = WALK_SPEED * (pressed('ShiftLeft', 'ShiftRight') ? RUN_FACTOR : 1) * delta
    const direction = new THREE.Vector3(Math.sin(this.yaw) * -forward + Math.cos(this.yaw) * strafe, 0, Math.cos(this.yaw) * -forward - Math.sin(this.yaw) * strafe)
    if (direction.lengthSq() > 0) this.camera.position.addScaledVector(direction.normalize(), speed)
    this.camera.position.y = Math.max(0.3, this.camera.position.y + lift * speed)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
  }

  private readonly loop = () => {
    this.frame = requestAnimationFrame(this.loop)
    this.move(Math.min(this.clock.getDelta(), 0.1))
    this.renderer.render(this.scene, this.camera)
    this.labelRenderer.render(this.scene, this.camera)
  }
}
