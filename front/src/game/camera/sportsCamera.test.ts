import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blendStep, lockedLookFor, lookDirection, poseFor, yawTowards, type SportsView, type ViewFrame } from './sportsCamera.ts'

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

test('the duel camera stands behind the player, frames the midpoint and backs off with the gap', () => {
  const near = poseFor({ kind: 'duel', sport: 'boxing', optional: true, opponent: { x: 0, z: -2 } }, FRAME)
  assert.ok(near.position.z > 0, 'behind the player')
  close(Math.hypot(near.position.x, near.position.z), 4.4, 'distance at 2 m')
  close(near.target.z, -1, 'midpoint')
  assert.equal(near.fov, 52)
  const far = poseFor({ kind: 'duel', sport: 'boxing', optional: true, opponent: { x: 0, z: -20 } }, FRAME)
  close(Math.hypot(far.position.x, far.position.z), 6.5, 'distance capped')
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

test('the stage camera faces the dancer', () => {
  const pose = poseFor({ kind: 'stage', sport: 'dance', optional: false, facingYaw: 0 }, FRAME)
  close(pose.position.z, -4.6, 'in front')
  close(pose.target.z, 0, 'looks at the dancer')
})

test('views that frame the action lock the body, the follow view leaves it to the mouse', () => {
  const me = { x: 0, z: 0 }
  assert.equal(lockedLookFor({ kind: 'follow', sport: 'gym', optional: true, distance: 3, lift: 0.3, waterY: null }, me), null)
  close(lockedLookFor({ kind: 'duel', sport: 'boxing', optional: true, opponent: { x: -3, z: 0 } }, me)!.yaw, Math.PI / 2, 'faces the opponent')
  close(lockedLookFor({ kind: 'court', sport: 'tennis', optional: false, cx: 0, netZ: 0, halfLength: 11.885, side: -1 }, me)!.yaw, Math.PI, 'blue faces +Z')
  close(lockedLookFor({ kind: 'stage', sport: 'dance', optional: false, facingYaw: 1 }, me)!.yaw, 1, 'keeps the dance facing')
})
