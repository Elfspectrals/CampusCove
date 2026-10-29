import * as THREE from 'three'
import { wearTopFpArmsUrl } from './assets/catalog'
import { createGltfLoader } from './gltfLoaderFactory'

const WALK_SPEED = 0.5
const BASE_FADE_S = 0.2
const ONE_SHOT_FADE_S = 0.06
const PUNCH_FADE_S = 0.02
const ONE_SHOT_CLIPS = ['Equip', 'UseDoor', 'UseKey', 'Punch', 'PunchL'] as const

/**
 * A procedural arm pose, in camera space (the arms root sits at the camera): where the hand goes, which way the
 * forearm points (elbow -> hand), and which way the back of the wrist faces (null = no roll constraint).
 * The arm is blended towards it after the mixer, so the clips keep playing underneath.
 */
interface ArmPose {
  hand: THREE.Vector3
  forearm: THREE.Vector3
  wristFacing: THREE.Vector3 | null
}

/**
 * Left wrist raised in front of the eyes to read the survival watch; right hand bringing food to the mouth.
 * Tunable live in dev (window.__ccArmPoses).
 */
const ARM_POSES = {
  watch: { hand: new THREE.Vector3(0.03, -0.07, -0.36), forearm: new THREE.Vector3(0.85, 0.3, -0.25), wristFacing: new THREE.Vector3(0, 0.25, 1) },
  eat: { hand: new THREE.Vector3(0.03, -0.11, -0.2), forearm: new THREE.Vector3(-0.55, 0.6, -0.5), wristFacing: null },
  watchSpeed: 7,
  eatDurationS: 0.9,
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
  let watchTarget = 0
  let watchWeight = 0
  let eatT = -1
  let frozenFor = 0
  let leftPunchNext = false
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

  function playBase(name: 'Idle' | 'Walk'): void {
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
    if (frozenFor > 0) frozenFor -= dt
    else mixer.update(dt)
    applyPoses(dt)
  }

  /** Blends `arm` by `weight` (0..1) towards `pose`, on top of what the mixer just wrote. */
  function blendArm(arm: THREE.Object3D | undefined, hand: THREE.Object3D | undefined, pose: ArmPose, weight: number): void {
    if (!arm || !hand || weight <= 0) return
    dir.copy(pose.forearm).normalize()
    poseQuat.setFromUnitVectors(FOREARM_LOCAL, dir)
    if (pose.wristFacing) {
      // roll around the forearm so the back of the wrist (the watch) faces `wristFacing`
      back.copy(WRIST_BACK_LOCAL).applyQuaternion(poseQuat).projectOnPlane(dir).normalize()
      want.copy(pose.wristFacing).projectOnPlane(dir).normalize()
      roll.setFromUnitVectors(back, want)
      poseQuat.premultiply(roll)
    }
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
    if (eatT >= 0) {
      eatT += dt / ARM_POSES.eatDurationS
      if (eatT >= 1) eatT = -1
      else blendArm(model.getObjectByName('Arm_R'), model.getObjectByName('Hand_R'), ARM_POSES.eat, Math.sin(Math.PI * eatT))
    }
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
    /** One bite / sip: the right hand goes to the mouth and back. */
    eat: () => {
      eatT = 0
    },
    isEating: () => eatT >= 0,
    equip: () => playOnce('Equip'),
    use: (kind: ArmsUse) => playOnce(kind === 'door' ? 'UseDoor' : 'UseKey'),
    punch: () => {
      playOnce(leftPunchNext ? 'PunchL' : 'Punch', PUNCH_FADE_S)
      leftPunchNext = !leftPunchNext
    },
    hitStop: (seconds: number) => {
      frozenFor = seconds
    },
    dispose: clear,
  }
}
