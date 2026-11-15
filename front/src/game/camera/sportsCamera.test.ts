import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blendStep, lockedLookFor, lookDirection, moveFrameYawFor, poseFor, yawTowards, type SportsView, type ViewFrame } from './sportsCamera.ts'

const FRAME: ViewFrame = { eye: { x: 0, y: 1.6, z: 0 }, feetY: 0, yaw: 0, pitch: 0, timeS: 0 }

function close(actual: number, expected: number, what: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${what}: ${actual} is not ${expected}`)
}

test('the blend goes to third person when a view is active and back when it stops', () => {
  assert.equal(blendStep(0, true, 0), 0)
  assert.equal(blendStep(0, true, 10), 1)
  assert.equal(blendStep(1, false, 10), 0)
  const half = blendStep(0, true, 0.1)
  assert.ok(half > 0.5 && half < 0.6)
})

test('yaw 0 looks towards -Z and a quarter turn left looks towards -X', () => {
  close(lookDirection(0, 0).z, -1, 'forward z')
  close(yawTowards({ x: 0, z: 0 }, { x: 0, z: -1 }), 0, 'yaw to -Z')
  close(yawTowards({ x: 0, z: 0 }, { x: -1, z: 0 }), Math.PI / 2, 'yaw to -X')
})

test('the follow camera sits behind and above the eye, looking where the player looks', () => {
  const view: SportsView = { kind: 'follow', sport: 'gym', optional: true, distance: 3, lift: 0.3, waterY: null }
  const pose = poseFor(view, FRAME)
  close(pose.position.x, 0, 'x')
  close(pose.position.y, 1.9, 'y')
  close(pose.position.z, 3, 'z')
  close(pose.target.z, -10, 'target z')
  assert.equal(pose.fov, null)
})

test('the follow camera never goes under the floor when the player looks up', () => {
  const view: SportsView = { kind: 'follow', sport: 'gym', optional: true, distance: 3, lift: 0.3, waterY: null }
  const pose = poseFor(view, { ...FRAME, pitch: 1.2 })
  close(pose.position.y, 0.35, 'y')
})

test('the swimming camera stays above the water at the surface and under it when diving', () => {
  const view: SportsView = { kind: 'follow', sport: 'swimming', optional: true, distance: 3, lift: 0.3, waterY: 1 }
  const surface = poseFor(view, { ...FRAME, eye: { x: 0, y: 1.1, z: 0 }, pitch: 0.5 })
  close(surface.position.y, 1.6, 'surface camera')
  const edge = poseFor(view, { ...FRAME, eye: { x: 0, y: 0.9, z: 0 }, pitch: 0.5 })
  close(edge.position.y, 1.6, 'eye just at the band counts as the surface')
  const dive = poseFor(view, { ...FRAME, eye: { x: 0, y: 0.5, z: 0 }, pitch: -0.5 })
  close(dive.position.y, 0.7, 'underwater camera')
})

const OPEN = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }

test('the duel camera stands behind the player, frames the midpoint and backs off with the gap', () => {
  const near = poseFor({ kind: 'duel', sport: 'boxing', optional: true, opponent: { x: 0, z: -2 }, arena: OPEN }, FRAME)
  assert.ok(near.position.z > 0, 'behind the player')
  close(Math.hypot(near.position.x, near.position.z), 3.4, 'distance at 2 m')
  close(near.target.z, -1, 'midpoint')
  assert.equal(near.fov, 52)
  assert.equal(near.pivot, null)
  const far = poseFor({ kind: 'duel', sport: 'boxing', optional: true, opponent: { x: 0, z: -20 }, arena: OPEN }, FRAME)
  close(Math.hypot(far.position.x, far.position.z), 5.5, 'distance capped')
})

test('the duel camera never leaves its arena, so a cornered boxer keeps it inside the hall', () => {
  const pose = poseFor({ kind: 'duel', sport: 'boxing', optional: true, opponent: { x: 0, z: -2 }, arena: { minX: -1, maxX: 1, minZ: -5, maxZ: 2 } }, FRAME)
  close(pose.position.z, 2, 'kept at the arena edge')
  assert.ok(pose.position.x >= -1 && pose.position.x <= 1)
})

test('the court camera stays behind the baseline, looks down at the near half and follows the player a little', () => {
  const red: SportsView = { kind: 'court', sport: 'tennis', optional: false, cx: 0, netZ: 0, halfLength: 11.885, side: 1 }
  const pose = poseFor(red, { ...FRAME, eye: { x: 2, y: 1.6, z: 10 } })
  close(pose.position.x, 0.4, 'x')
  close(pose.position.z, 27.885, 'z')
  close(pose.position.y, 10, 'height')
  close(pose.target.x, 0.4, 'target follows too')
  close(pose.target.z, 9.485, 'target in the near half')
  const blue = poseFor({ ...red, side: -1 }, FRAME)
  close(blue.position.z, -27.885, 'blue side')
})

test('the stage camera faces the dancer and keeps them left of the middle, clear of the note lanes', () => {
  const pose = poseFor({ kind: 'stage', sport: 'dance', optional: false, facingYaw: 0 }, FRAME)
  close(pose.position.z, -4.6, 'in front')
  close(pose.position.x, -1.7, 'camera to its right')
  close(pose.target.x, -1.7, 'looks beside the dancer')
  close(pose.target.z, 0, 'at the dancer depth')
})

test('views that frame the action lock the body, the follow view leaves it to the mouse', () => {
  const me = { x: 0, z: 0 }
  assert.equal(lockedLookFor({ kind: 'follow', sport: 'gym', optional: true, distance: 3, lift: 0.3, waterY: null }, me), null)
  close(lockedLookFor({ kind: 'duel', sport: 'boxing', optional: true, opponent: { x: -3, z: 0 }, arena: OPEN }, me)!.yaw, Math.PI / 2, 'faces the opponent')
  close(lockedLookFor({ kind: 'court', sport: 'tennis', optional: false, cx: 0, netZ: 0, halfLength: 11.885, side: -1 }, me)!.yaw, Math.PI, 'blue faces +Z')
  close(lockedLookFor({ kind: 'stage', sport: 'dance', optional: false, facingYaw: 1 }, me)!.yaw, 1, 'keeps the dance facing')
})

test('the broadcast camera sits in the stands, follows the ball no further than 7 m from the player and stops 9 m from each end', () => {
  const view = (focusX: number): SportsView => ({ kind: 'broadcast', sport: 'gym', optional: true, court: { minX: -22, maxX: 22, minZ: -12, maxZ: 12 }, focusX, focusZ: -6.2, fallback: null })
  const middle = poseFor(view(4), FRAME)
  close(middle.position.x, 4, 'follows the ball')
  close(middle.position.z, -19, 'behind the near line')
  close(middle.position.y, 8.5, 'height')
  close(middle.target.z, -6.2, 'looks into the court')
  assert.equal(middle.fov, 46)
  close(poseFor({ ...view(4), focusZ: 12 } as SportsView, FRAME).target.z, -1.65, 'looks a quarter further in for a ball on the far line')
  close(poseFor({ ...view(4), focusZ: 40 } as SportsView, FRAME).target.z, -1.65, 'never past the far line')
  close(poseFor(view(7), FRAME).position.x, 7, 'a ball 7 m away is still followed')
  close(poseFor(view(20), FRAME).position.x, 7, 'a far ball leads the player by 7 m')
  close(poseFor(view(-20), FRAME).position.x, -7, 'on either side')
  const at = (x: number): ViewFrame => ({ ...FRAME, eye: { ...FRAME.eye, x } })
  close(poseFor(view(21), at(20)).position.x, 13, 'east stop')
  close(poseFor(view(-40), at(-38)).position.x, -13, 'west stop')
  assert.equal(moveFrameYawFor(view(0)), Math.PI)
  assert.equal(moveFrameYawFor({ kind: 'stage', sport: 'dance', optional: false, facingYaw: 0 }), null)
  assert.equal(lockedLookFor(view(0), { x: 0, z: 0 }), null)
})
