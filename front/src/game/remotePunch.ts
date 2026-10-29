import * as THREE from 'three'
import { PUNCH_IMPACT_S } from './punch'

const SWING_S = 0.45
const RECOIL_RISE_S = 0.05
const RECOIL_S = 0.35
const LUNGE_DISTANCE = 0.25
const LUNGE_LEAN = 0.18
const RECOIL_DISTANCE = 0.3
const RECOIL_TILT = 0.22
const JAB_LIFT = 0.15
const IMPACT_LIFETIME_S = 0.3
const IMPACT_Y = 1.25
const IMPACT_TOWARDS_ATTACKER = 0.35
const IMPACT_SIZE = 0.75
const CANVAS = 128

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function swingWeight(t: number): number {
  if (t < 0 || t >= SWING_S) return 0
  if (t < PUNCH_IMPACT_S) return smooth(t / PUNCH_IMPACT_S)
  return 1 - smooth((t - PUNCH_IMPACT_S) / (SWING_S - PUNCH_IMPACT_S))
}

function recoilWeight(t: number): number {
  if (t < 0 || t >= RECOIL_S) return 0
  if (t < RECOIL_RISE_S) return t / RECOIL_RISE_S
  return 1 - smooth((t - RECOIL_RISE_S) / (RECOIL_S - RECOIL_RISE_S))
}

export interface PunchPose {
  swingT: number
  recoilT: number
  recoilX: number
  recoilZ: number
}

export function idlePunchPose(): PunchPose {
  return { swingT: SWING_S, recoilT: RECOIL_S, recoilX: 0, recoilZ: 0 }
}

export function startSwing(pose: PunchPose): void {
  pose.swingT = 0
}

export function startRecoil(pose: PunchPose, dirX: number, dirZ: number): void {
  pose.recoilT = -PUNCH_IMPACT_S
  pose.recoilX = dirX
  pose.recoilZ = dirZ
}

export function advancePunchPose(pose: PunchPose, dt: number): void {
  pose.swingT += dt
  pose.recoilT += dt
}

export function punchPoseOffset(pose: PunchPose, yaw: number) {
  const swing = swingWeight(pose.swingT)
  const recoil = recoilWeight(pose.recoilT)
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const localX = cos * pose.recoilX - sin * pose.recoilZ
  const localZ = sin * pose.recoilX + cos * pose.recoilZ
  return {
    swing,
    x: sin * LUNGE_DISTANCE * swing + pose.recoilX * RECOIL_DISTANCE * recoil,
    z: cos * LUNGE_DISTANCE * swing + pose.recoilZ * RECOIL_DISTANCE * recoil,
    leanX: LUNGE_LEAN * swing + RECOIL_TILT * recoil * localZ,
    leanZ: -RECOIL_TILT * recoil * localX,
  }
}

const shoulder = new THREE.Vector3()
const joint = new THREE.Vector3()
const bone = new THREE.Vector3()
const aim = new THREE.Quaternion()
const boneWorld = new THREE.Quaternion()
const parentWorld = new THREE.Quaternion()
const target = new THREE.Quaternion()

function aimBone(from: THREE.Object3D, to: THREE.Object3D, direction: THREE.Vector3, weight: number): void {
  if (!from.parent) return
  from.getWorldPosition(shoulder)
  to.getWorldPosition(joint)
  bone.subVectors(joint, shoulder).normalize()
  aim.setFromUnitVectors(bone, direction)
  from.getWorldQuaternion(boneWorld)
  from.parent.getWorldQuaternion(parentWorld)
  target.copy(parentWorld.invert()).multiply(aim.multiply(boneWorld))
  from.quaternion.slerp(target, weight)
  from.updateMatrixWorld(true)
}

const jabDirection = new THREE.Vector3()

export function jabRightArm(avatar: THREE.Object3D, weight: number): void {
  const upper = avatar.getObjectByName('UpperArmR')
  const lower = avatar.getObjectByName('LowerArmR')
  const hand = avatar.getObjectByName('HandR')
  if (!upper || !lower || !hand || weight <= 0) return
  jabDirection.set(Math.sin(avatar.rotation.y), JAB_LIFT, Math.cos(avatar.rotation.y)).normalize()
  aimBone(upper, lower, jabDirection, weight)
  aimBone(lower, hand, jabDirection, weight)
}

let impactTexture: THREE.CanvasTexture | null = null

function starTexture(): THREE.CanvasTexture {
  if (impactTexture) return impactTexture
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = CANVAS
  const ctx = canvas.getContext('2d')!
  const c = CANVAS / 2
  ctx.beginPath()
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 60 : 26
    const a = (i / 16) * Math.PI * 2
    ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fillStyle = '#fff3c4'
  ctx.strokeStyle = '#ef9f27'
  ctx.lineWidth = 6
  ctx.fill()
  ctx.stroke()
  impactTexture = new THREE.CanvasTexture(canvas)
  impactTexture.colorSpace = THREE.SRGBColorSpace
  return impactTexture
}

export function createPunchImpact(avatar: THREE.Object3D, dirX: number, dirZ: number) {
  const material = new THREE.SpriteMaterial({ map: starTexture(), transparent: true, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.renderOrder = 5
  sprite.visible = false
  avatar.add(sprite)
  const yaw = avatar.rotation.y
  const towardsX = -(Math.cos(yaw) * dirX - Math.sin(yaw) * dirZ) * IMPACT_TOWARDS_ATTACKER
  const towardsZ = -(Math.sin(yaw) * dirX + Math.cos(yaw) * dirZ) * IMPACT_TOWARDS_ATTACKER
  let age = -PUNCH_IMPACT_S

  function update(dt: number): boolean {
    age += dt
    if (age >= IMPACT_LIFETIME_S) {
      sprite.removeFromParent()
      material.dispose()
      return false
    }
    if (age < 0) return true
    const t = age / IMPACT_LIFETIME_S
    const parentScale = avatar.scale.y || 1
    sprite.visible = true
    sprite.scale.setScalar((IMPACT_SIZE * (0.6 + 0.6 * Math.sin(Math.min(1, t * 3) * (Math.PI / 2)))) / parentScale)
    sprite.position.set(towardsX / parentScale, IMPACT_Y / parentScale, towardsZ / parentScale)
    material.rotation = t * 0.8
    material.opacity = 1 - smooth(t)
    return true
  }

  return { update }
}
