import * as THREE from 'three'
import { firstPersonWalkTimeScale } from '../avatar/avatarAnimationLogic'
import { wearTopFpArmsUrl } from './assets/catalog'
import { createGltfLoader } from './gltfLoaderFactory'
import { nextPunchHand, type PunchHand } from './punch'

const MIN_WALK_SPEED = 0.5
const BASE_FADE_S = 0.2
const ONE_SHOT_FADE_S = 0.06
const PUNCH_FADE_S = 0.02
const PICK_CANCEL_FADE_S = 0.15
const ONE_SHOT_CLIPS = ['Equip', 'UseDoor', 'UseKey', 'Punch', 'PunchL', 'Pick'] as const
const HELD_CLIPS = ['Pick'] as const
const EAT_CLIPS = { eat: 'Eat', drink: 'Drink' } as const
const EAT_FADE_S = 0.25

/**
 * A procedural arm pose, in camera space (the arms root sits at the camera): where the hand goes, which way the
 * forearm points (elbow -> hand), and which way the back of the wrist faces.
 * The arm is blended towards it after the mixer, so the clips keep playing underneath.
 */
interface ArmPose {
  hand: THREE.Vector3
  forearm: THREE.Vector3
  wristFacing: THREE.Vector3
}

/**
 * Left wrist raised in front of the eyes to read the survival watch.
 * Tunable live in dev (window.__ccArmPoses).
 */
const ARM_POSES = {
  watch: { hand: new THREE.Vector3(0.03, -0.06, -0.36), forearm: new THREE.Vector3(0.9, 0.12, -0.3), wristFacing: new THREE.Vector3(0, 0.25, 1) },
  watchSpeed: 7,
}
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __ccArmPoses: typeof ARM_POSES }).__ccArmPoses = ARM_POSES
}

const FOREARM_LOCAL = new THREE.Vector3(0, 0, -1)
const WRIST_BACK_LOCAL = new THREE.Vector3(0, 1, 0)

export type ArmsUse = 'door' | 'key'

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

export function createFirstPersonArms(container: THREE.Group) {
  const loader = createGltfLoader()
  const lastPosition = new THREE.Vector3()
  let topModel: string | null | undefined
  let loadToken = 0
  let model: THREE.Object3D | null = null
  let ownMeshes: THREE.Mesh[] = []
  let mixer: THREE.AnimationMixer | null = null
  let actions = new Map<string, THREE.AnimationAction>()
  let base: THREE.AnimationAction | null = null
  let oneShot: THREE.AnimationAction | null = null
  let holding = false
  let watchTarget = 0
  let watchWeight = 0
  let frozenFor = 0
  let lastPunch: PunchHand | null = null
  let lastPunchAt = 0
  const poseQuat = new THREE.Quaternion()
  const roll = new THREE.Quaternion()
  const poseArm = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const back = new THREE.Vector3()
  const want = new THREE.Vector3()

  function action(name: string): THREE.AnimationAction {
    const found = actions.get(name)
    if (!found) throw new Error(`First-person arms have no ${name} clip`)
    return found
  }

  function playBase(name: 'Idle' | 'Walk' | 'Hold'): void {
    const next = action(name)
    if (base === next) return
    next.reset().fadeIn(BASE_FADE_S).play()
    base?.fadeOut(BASE_FADE_S)
    base = next
  }

  function playOnce(name: (typeof ONE_SHOT_CLIPS)[number], fadeS = ONE_SHOT_FADE_S): void {
    if (!mixer) return
    const next = action(name)
    oneShot?.stop()
    next.reset().fadeIn(fadeS).play()
    base?.fadeOut(fadeS)
    oneShot = next
  }

  function isPlaying(...names: string[]): boolean {
    return oneShot !== null && names.some((name) => oneShot === actions.get(name))
  }

  function cancelPick(): void {
    if (!oneShot || !isPlaying('Pick')) return
    oneShot.fadeOut(PICK_CANCEL_FADE_S)
    base?.reset().fadeIn(PICK_CANCEL_FADE_S).play()
    oneShot = null
  }

  function onFinished(e: { action: THREE.AnimationAction }): void {
    if (e.action !== oneShot) return
    oneShot = null
    if (e.action.clampWhenFinished) e.action.fadeOut(BASE_FADE_S)
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

  function setTop(topModelGlb: string | null): void {
    if (topModelGlb === topModel) return
    topModel = topModelGlb
    const url = wearTopFpArmsUrl(topModelGlb)
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
        for (const name of HELD_CLIPS) action(name).clampWhenFinished = true
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
    if (!oneShot) playBase(holding ? 'Hold' : speed > MIN_WALK_SPEED ? 'Walk' : 'Idle')
    if (base && base === actions.get('Walk')) base.timeScale = firstPersonWalkTimeScale(speed)
    if (frozenFor > 0) frozenFor -= dt
    else mixer.update(dt)
    applyPoses(dt)
  }

  /** Blends `arm` by `weight` (0..1) towards `pose`, on top of what the mixer just wrote. */
  function blendArm(arm: THREE.Object3D | undefined, hand: THREE.Object3D | undefined, pose: ArmPose, weight: number): void {
    if (!arm || !hand || weight <= 0) return
    dir.copy(pose.forearm).normalize()
    poseQuat.setFromUnitVectors(FOREARM_LOCAL, dir)
    // roll around the forearm so the back of the wrist (the watch) faces `wristFacing`
    back.copy(WRIST_BACK_LOCAL).applyQuaternion(poseQuat).projectOnPlane(dir).normalize()
    want.copy(pose.wristFacing).projectOnPlane(dir).normalize()
    roll.setFromUnitVectors(back, want)
    poseQuat.premultiply(roll)
    poseArm.copy(hand.position).applyQuaternion(poseQuat)
    poseArm.subVectors(pose.hand, poseArm)
    arm.position.lerp(poseArm, weight)
    arm.quaternion.slerp(poseQuat, weight)
  }

  function applyPoses(dt: number): void {
    if (!model) return
    const step = Math.min(1, ARM_POSES.watchSpeed * dt)
    watchWeight += (watchTarget - watchWeight) * step
    blendArm(model.getObjectByName('Arm_L'), model.getObjectByName('Hand_L'), ARM_POSES.watch, smooth(watchWeight))
  }

  function rightHand(): THREE.Object3D | null {
    return model?.getObjectByName('Hand_R') ?? null
  }

  function leftHand(): THREE.Object3D | null {
    return model?.getObjectByName('Hand_L') ?? null
  }

  return {
    setTop,
    update,
    rightHand,
    leftHand,
    /** Hold the left wrist up to read the watch (true while the key is held). */
    raiseWatch: (raised: boolean) => {
      watchTarget = raised ? 1 : 0
    },
    isWatchRaised: () => watchWeight > 0.6,
    /** Right hand closed on a job tool (Hold clip) instead of the Idle / Walk swing. */
    setHolding: (next: boolean) => {
      holding = next
    },
    startEating: (kind: 'eat' | 'drink'): boolean => {
      if (!mixer || isPlaying('Pick')) return false
      const next = action(EAT_CLIPS[kind])
      oneShot?.stop()
      next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(EAT_FADE_S).play()
      base?.fadeOut(EAT_FADE_S)
      oneShot = next
      return true
    },
    stopEating: () => {
      if (!oneShot || !isPlaying(EAT_CLIPS.eat, EAT_CLIPS.drink)) return
      oneShot.fadeOut(EAT_FADE_S)
      base?.reset().fadeIn(EAT_FADE_S).play()
      oneShot = null
    },
    equip: () => {
      if (!isPlaying(...HELD_CLIPS)) playOnce('Equip')
    },
    use: (kind: ArmsUse) => playOnce(kind === 'door' ? 'UseDoor' : 'UseKey'),
    punch: () => {
      const now = performance.now()
      lastPunch = nextPunchHand(lastPunch, now - lastPunchAt)
      lastPunchAt = now
      playOnce(lastPunch === 'jab' ? 'PunchL' : 'Punch', PUNCH_FADE_S)
    },
    pick: () => playOnce('Pick'),
    cancelPick,
    hitStop: (seconds: number) => {
      frozenFor = seconds
    },
    dispose: clear,
  }
}
