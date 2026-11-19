import * as THREE from 'three'
import { firstPersonWalkTimeScale } from '../avatar/avatarAnimationLogic'
import { type AnimBlender, createAnimBlender } from '../avatar/animBlender'
import { wearTopFpArmsUrl } from './assets/catalog'
import { createGltfLoader } from './gltfLoaderFactory'
import { nextPunchHand, type PunchHand } from './punch'

const MIN_WALK_SPEED = 0.5
const BASE_FADE_S = 0.2
const ONE_SHOT_FADE_S = 0.06
const PUNCH_FADE_S = 0.02
const PICK_CANCEL_FADE_S = 0.15
const ONE_SHOT_CLIPS = ['Equip', 'UseDoor', 'UseKey', 'Punch', 'PunchL', 'Pick', 'TennisForehand', 'TennisBackhand', 'TennisLob', 'TennisServe', 'PetanquePoint', 'PetanqueShoot'] as const
const TENNIS_SWING_CLIPS = { forehand: 'TennisForehand', backhand: 'TennisBackhand', lob: 'TennisLob', serve: 'TennisServe' } as const
const EAT_CLIPS = { eat: 'Eat', drink: 'Drink' } as const
export type ArmsClimbPose = 'hang' | 'lower' | null
export type ArmsClimbMove = 'reachL' | 'reachR' | 'top' | 'fall'
const CLIMB_POSE_CLIPS = { hang: 'FpClimbHang', lower: 'FpClimbLower' } as const
const CLIMB_MOVE_CLIPS: Record<ArmsClimbMove, string> = { reachL: 'FpClimbReachL', reachR: 'FpClimbReachR', top: 'FpClimbTop', fall: 'FpClimbFall' }
const EAT_FADE_S = 0.25
const BOXING_LOOP_FADE_S = 0.12
const ARMS = 'arms'
const ARMS_LAYERS = [{ name: ARMS, keepsBone: () => true }]
export const FP_BOXING_LOOPS = ['FpGuard', 'FpBlock'] as const
export const FP_BOXING_SHOTS = ['FpJab', 'FpCross', 'FpHook', 'FpUppercut', 'FpHit'] as const
const FP_BOXING_CHARGES = ['FpHookCharge', 'FpUppercutCharge'] as const
export type FpBoxingShot = (typeof FP_BOXING_SHOTS)[number]
export type FpBoxingCharge = (typeof FP_BOXING_CHARGES)[number]

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
  let blender: AnimBlender | null = null
  let base: string | null = null
  let oneShot: string | null = null
  let holding = false
  let climbPose: ArmsClimbPose = null
  let watchTarget = 0
  let watchWeight = 0
  let frozenFor = 0
  let lastPunch: PunchHand | null = null
  let lastPunchAt = 0
  let boxingClips: THREE.AnimationClip[] | null = null
  let clips: THREE.AnimationClip[] = []
  let boxingBlock = false
  const poseQuat = new THREE.Quaternion()
  const roll = new THREE.Quaternion()
  const poseArm = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const back = new THREE.Vector3()
  const want = new THREE.Vector3()

  function need(name: string): AnimBlender {
    if (!blender) throw new Error('First-person arms are not loaded')
    if (!blender.has(name)) throw new Error(`First-person arms have no ${name} clip`)
    return blender
  }

  function backToBase(fadeS: number): void {
    oneShot = null
    if (base) need(base).play(ARMS, base, { fadeS })
  }

  function playBase(name: 'Idle' | 'Walk' | 'Hold' | (typeof FP_BOXING_LOOPS)[number] | (typeof CLIMB_POSE_CLIPS)[keyof typeof CLIMB_POSE_CLIPS]): void {
    const arms = need(name)
    if (base !== name) {
      base = name
      if (!oneShot) arms.play(ARMS, name, { fadeS: BASE_FADE_S })
    }
  }

  function playOnce(name: string, fadeS: number | undefined, durationS?: number, fromS?: number, backFadeS = BASE_FADE_S): void {
    if (!blender) return
    const arms = need(name)
    oneShot = name
    arms.play(ARMS, name, {
      once: true,
      fadeS,
      fromS,
      timeScale: durationS ? durationOf(name) / durationS : 1,
      onDone: () => {
        if (oneShot === name) backToBase(backFadeS)
      },
    })
  }

  function durationOf(name: string): number {
    const clip = clips.find((c) => c.name === name)
    if (!clip) throw new Error(`First-person arms have no ${name} clip`)
    return clip.duration
  }

  function isPlaying(...names: string[]): boolean {
    return oneShot !== null && names.includes(oneShot)
  }

  function cancelPick(): void {
    if (!isPlaying('Pick')) return
    backToBase(PICK_CANCEL_FADE_S)
  }

  function clear(): void {
    blender?.dispose()
    mixer?.stopAllAction()
    model?.removeFromParent()
    for (const mesh of ownMeshes) {
      mesh.geometry.dispose()
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose()
    }
    ownMeshes = []
    model = null
    mixer = null
    blender = null
    clips = []
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
        blender = createAnimBlender(mixer, model, ARMS_LAYERS)
        clips = [...gltf.animations]
        blender.add(clips)
        for (const name of [...ONE_SHOT_CLIPS, ...Object.values(CLIMB_MOVE_CLIPS)]) need(name)
        playBase('Idle')
        applyBoxing()
      })
      .catch((err: unknown) => {
        console.error('[firstPersonArms] load failed', url, err)
      })
  }

  function applyBoxing(): void {
    if (!blender || !boxingClips) return
    blender.add(boxingClips)
    clips = [...clips.filter((c) => !boxingClips!.some((b) => b.name === c.name)), ...boxingClips]
    base = boxingBlock ? 'FpBlock' : 'FpGuard'
    backToBase(BOXING_LOOP_FADE_S)
  }

  function update(dt: number, position: { x: number; z: number }): void {
    if (!mixer || !blender) return
    const speed = dt > 0 ? Math.hypot(position.x - lastPosition.x, position.z - lastPosition.z) / dt : 0
    lastPosition.set(position.x, 0, position.z)
    if (!oneShot && !boxingClips) playBase(climbPose ? CLIMB_POSE_CLIPS[climbPose] : holding ? 'Hold' : speed > MIN_WALK_SPEED ? 'Walk' : 'Idle')
    if (!oneShot && boxingClips) playBase(boxingBlock ? 'FpBlock' : 'FpGuard')
    if (base === 'Walk') blender.setTimeScale('Walk', firstPersonWalkTimeScale(speed))
    if (frozenFor > 0) frozenFor -= dt
    else {
      blender.update(dt)
      mixer.update(dt)
    }
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
      if (!blender || isPlaying('Pick')) return false
      const name = EAT_CLIPS[kind]
      oneShot = name
      need(name).play(ARMS, name, { fadeS: EAT_FADE_S })
      return true
    },
    stopEating: () => {
      if (!isPlaying(EAT_CLIPS.eat, EAT_CLIPS.drink)) return
      backToBase(EAT_FADE_S)
    },
    equip: () => {
      if (!isPlaying('Pick')) playOnce('Equip', ONE_SHOT_FADE_S)
    },
    use: (kind: ArmsUse) => playOnce(kind === 'door' ? 'UseDoor' : 'UseKey', ONE_SHOT_FADE_S),
    punch: () => {
      const now = performance.now()
      lastPunch = nextPunchHand(lastPunch, now - lastPunchAt)
      lastPunchAt = now
      playOnce(lastPunch === 'jab' ? 'PunchL' : 'Punch', PUNCH_FADE_S)
    },
    tennisSwing: (swing: keyof typeof TENNIS_SWING_CLIPS) => playOnce(TENNIS_SWING_CLIPS[swing], PUNCH_FADE_S),
    setClimbPose: (pose: ArmsClimbPose) => {
      climbPose = pose
    },
    climbMove: (move: ArmsClimbMove) => playOnce(CLIMB_MOVE_CLIPS[move], ONE_SHOT_FADE_S),
    pick: (durationMs?: number) => playOnce('Pick', ONE_SHOT_FADE_S, durationMs && durationMs / 1000),
    throwBoule: (mode: 'point' | 'shoot') => playOnce(mode === 'shoot' ? 'PetanqueShoot' : 'PetanquePoint', ONE_SHOT_FADE_S),
    cancelPick,
    hitStop: (seconds: number) => {
      frozenFor = seconds
    },
    setBoxing: (next: THREE.AnimationClip[] | null) => {
      const previous = boxingClips
      boxingClips = next
      boxingBlock = false
      if (next) applyBoxing()
      else if (blender && previous) {
        blender.release(previous.map((clip) => clip.name))
        clips = clips.filter((clip) => !previous.includes(clip))
        base = 'Idle'
        backToBase(BASE_FADE_S)
      }
    },
    setBoxingBlock: (on: boolean) => {
      boxingBlock = on
    },
    boxingShot: (name: FpBoxingShot, fromS = 0) => {
      if (!boxingClips) return
      playOnce(name, undefined, undefined, fromS, BOXING_LOOP_FADE_S)
    },
    boxingCharge: (name: FpBoxingCharge) => {
      if (!blender || !boxingClips || oneShot === name) return
      oneShot = name
      need(name).play(ARMS, name, { fadeS: BOXING_LOOP_FADE_S })
    },
    boxingRelax: () => {
      if (!boxingClips || !oneShot || !(FP_BOXING_CHARGES as readonly string[]).includes(oneShot)) return
      backToBase(BOXING_LOOP_FADE_S)
    },
    dispose: clear,
  }
}
