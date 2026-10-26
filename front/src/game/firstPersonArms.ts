import * as THREE from 'three'
import { DEFAULT_SKIN, SKINS } from './assets/catalog'
import { createGltfLoader } from './gltfLoaderFactory'

const WALK_SPEED = 0.5
const BASE_FADE_S = 0.2
const ONE_SHOT_FADE_S = 0.06
const ONE_SHOT_CLIPS = ['Equip', 'UseDoor', 'UseKey'] as const

export type ArmsUse = 'door' | 'key'

function fpArmsUrlFor(bodyModelGlb: string | null): string {
  const skin = bodyModelGlb === null ? DEFAULT_SKIN : SKINS.find((s) => s.modelUrl === bodyModelGlb)
  if (!skin) throw new Error(`No first-person arms for the skin model ${bodyModelGlb}`)
  return skin.fpArmsUrl
}

export function createFirstPersonArms(container: THREE.Group) {
  const loader = createGltfLoader()
  const lastPosition = new THREE.Vector3()
  let skinModel: string | null | undefined
  let loadToken = 0
  let model: THREE.Object3D | null = null
  let ownMeshes: THREE.Mesh[] = []
  let mixer: THREE.AnimationMixer | null = null
  let actions = new Map<string, THREE.AnimationAction>()
  let base: THREE.AnimationAction | null = null
  let oneShot: THREE.AnimationAction | null = null

  function action(name: string): THREE.AnimationAction {
    const found = actions.get(name)
    if (!found) throw new Error(`First-person arms have no ${name} clip`)
    return found
  }

  function playBase(name: 'Idle' | 'Walk'): void {
    const next = action(name)
    if (base === next) return
    next.reset().fadeIn(BASE_FADE_S).play()
    base?.fadeOut(BASE_FADE_S)
    base = next
  }

  function playOnce(name: (typeof ONE_SHOT_CLIPS)[number]): void {
    if (!mixer) return
    const next = action(name)
    oneShot?.stop()
    next.reset().fadeIn(ONE_SHOT_FADE_S).play()
    base?.fadeOut(ONE_SHOT_FADE_S)
    oneShot = next
  }

  function onFinished(e: { action: THREE.AnimationAction }): void {
    if (e.action !== oneShot) return
    oneShot = null
    base?.reset().fadeIn(BASE_FADE_S).play()
  }

  function clear(): void {
    mixer?.stopAllAction()
    mixer?.removeEventListener('finished', onFinished)
    model?.removeFromParent()
    for (const mesh of ownMeshes) {
      mesh.geometry.dispose()
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose()
    }
    ownMeshes = []
    model = null
    mixer = null
    actions = new Map()
    base = null
    oneShot = null
  }

  function setSkin(bodyModelGlb: string | null): void {
    if (bodyModelGlb === skinModel) return
    skinModel = bodyModelGlb
    const url = fpArmsUrlFor(bodyModelGlb)
    const token = ++loadToken
    loader
      .loadAsync(url)
      .then((gltf) => {
        if (token !== loadToken) return
        clear()
        model = gltf.scene
        model.traverse((obj) => {
          if (obj instanceof THREE.Mesh) ownMeshes.push(obj)
        })
        container.add(model)
        mixer = new THREE.AnimationMixer(model)
        actions = new Map(gltf.animations.map((clip) => [clip.name, mixer!.clipAction(clip)]))
        for (const name of ONE_SHOT_CLIPS) action(name).setLoop(THREE.LoopOnce, 1)
        mixer.addEventListener('finished', onFinished)
        playBase('Idle')
      })
      .catch((err: unknown) => {
        console.error('[firstPersonArms] load failed', url, err)
      })
  }

  function update(dt: number, position: { x: number; z: number }): void {
    if (!mixer) return
    const speed = dt > 0 ? Math.hypot(position.x - lastPosition.x, position.z - lastPosition.z) / dt : 0
    lastPosition.set(position.x, 0, position.z)
    if (!oneShot) playBase(speed > WALK_SPEED ? 'Walk' : 'Idle')
    mixer.update(dt)
  }

  function rightHand(): THREE.Object3D | null {
    return model?.getObjectByName('Hand_R') ?? null
  }

  return {
    setSkin,
    update,
    rightHand,
    equip: () => playOnce('Equip'),
    use: (kind: ArmsUse) => playOnce(kind === 'door' ? 'UseDoor' : 'UseKey'),
    dispose: clear,
  }
}
