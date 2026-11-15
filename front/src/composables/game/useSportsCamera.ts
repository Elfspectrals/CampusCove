import * as THREE from 'three'
import { EYE_HEIGHT } from '../../game/gameRoomConstants'
import { worldRayDistance } from '../../game/collision/worldCollision'
import { BODY_SHOWN_FROM, blendStep, damp, lockedLookFor, moveFrameYawFor, poseFor, viewChoices, type SportsView } from '../../game/camera/sportsCamera'

const ARM_MARGIN_M = 0.25
const ARM_MIN_M = 0.6
const ARM_EASE_OUT_PER_S = 5
const FRAMING_DAMP_PER_S = 7

export interface SportsCameraDeps {
  myPosition: { x: number; y: number; z: number }
  pointerLocked: () => boolean
  getFpHands: () => THREE.Object3D | null
  view: () => SportsView | null
  onThirdPerson: (view: SportsView) => void
}

export function useSportsCamera(deps: SportsCameraDeps) {
  const choiceBySport = new Map<string, number>()
  const announced = new Set<string>()
  const eye = new THREE.Vector3()
  const goal = new THREE.Vector3()
  const target = new THREE.Vector3()
  const shownPosition = new THREE.Vector3()
  const shownTarget = new THREE.Vector3()
  const pivot = new THREE.Vector3()
  const armDirection = new THREE.Vector3()
  const firstPerson = new THREE.Quaternion()
  const framed = new THREE.Quaternion()
  const lookMatrix = new THREE.Matrix4()
  let blend = 0
  let shown: SportsView | null = null
  let framing = false
  let arm = 0
  let timeS = 0

  function activeView(): SportsView | null {
    const view = deps.view()
    if (!view) return null
    const choices = viewChoices(view)
    return choices[(choiceBySport.get(view.sport) ?? 0) % choices.length] ?? null
  }

  function thirdPerson(): boolean {
    return blend > BODY_SHOWN_FROM
  }

  function toggle(): boolean {
    const view = deps.view()
    if (!view) return false
    const choices = viewChoices(view)
    if (choices.length < 2) return false
    choiceBySport.set(view.sport, ((choiceBySport.get(view.sport) ?? 0) + 1) % choices.length)
    return true
  }

  function lockedLook(): { yaw: number; pitch: number } | null {
    const view = activeView()
    return view ? lockedLookFor(view, deps.myPosition) : null
  }

  function shortenArm(dt: number): void {
    armDirection.subVectors(goal, pivot)
    const wanted = armDirection.length()
    if (wanted < 1e-3) return
    armDirection.divideScalar(wanted)
    const free = Math.max(ARM_MIN_M, worldRayDistance(pivot, armDirection, wanted + ARM_MARGIN_M) - ARM_MARGIN_M)
    const reach = Math.min(wanted, free)
    arm = reach < arm || arm === 0 ? reach : Math.min(reach, damp(arm, reach, ARM_EASE_OUT_PER_S, dt))
    goal.copy(pivot).addScaledVector(armDirection, arm)
  }

  function apply(camera: THREE.PerspectiveCamera, dt: number): void {
    timeS += dt
    const view = activeView()
    if (view) {
      shown = view
      if (view.optional && !announced.has(view.sport)) {
        announced.add(view.sport)
        deps.onThirdPerson(view)
      }
    }
    blend = blendStep(blend, view !== null, dt)
    const third = thirdPerson()
    const hands = deps.getFpHands()
    if (hands) hands.visible = deps.pointerLocked() && !third
    if (blend === 0 || !shown) {
      framing = false
      arm = 0
      return
    }
    eye.copy(camera.position)
    const pose = poseFor(shown, { eye, feetY: deps.myPosition.y - EYE_HEIGHT, yaw: camera.rotation.y, pitch: camera.rotation.x, timeS })
    goal.set(pose.position.x, pose.position.y, pose.position.z)
    target.set(pose.target.x, pose.target.y, pose.target.z)
    if (pose.pivot) {
      pivot.set(pose.pivot.x, pose.pivot.y, pose.pivot.z)
      shortenArm(dt)
    }
    if (shown.kind === 'follow' || !framing) {
      shownPosition.copy(goal)
      shownTarget.copy(target)
      framing = true
    } else {
      const t = 1 - Math.exp(-FRAMING_DAMP_PER_S * dt)
      shownPosition.lerp(goal, t)
      shownTarget.lerp(target, t)
    }
    firstPerson.copy(camera.quaternion)
    lookMatrix.lookAt(shownPosition, shownTarget, THREE.Object3D.DEFAULT_UP)
    framed.setFromRotationMatrix(lookMatrix)
    camera.position.lerpVectors(eye, shownPosition, blend)
    camera.quaternion.slerpQuaternions(firstPerson, framed, blend)
    if (pose.fov !== null) {
      camera.fov += (pose.fov - camera.fov) * blend
      camera.updateProjectionMatrix()
    }
  }

  function moveFrameYaw(): number | null {
    const view = activeView()
    return view ? moveFrameYawFor(view) : null
  }

  return { apply, toggle, thirdPerson, lockedLook, moveFrameYaw }
}
