import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SHOPPER_PAUSE_S, SHOPPER_SPEED, crowdPath, lapSeconds, shopperAt } from './marketCrowd.ts'

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)
const stalls = [
  { x: 0, z: 0, yaw: 0 },
  { x: 10, z: 0, yaw: 0 },
]

test('the path stops 1.8 m in front of each stall, facing it, then detours away from the U to close the loop', () => {
  const u = [
    { x: 0, z: -5, yaw: 0 },
    { x: 5, z: 0, yaw: -Math.PI / 2 },
    { x: 0, z: 5, yaw: Math.PI },
  ]
  const path = crowdPath(u)
  assert.equal(path.length, 4)
  near(path[0]!.x, 0)
  near(path[0]!.z, -3.2)
  near(path[0]!.faceYaw!, Math.PI)
  near(path[1]!.x, 3.2)
  assert.equal(path[3]!.faceYaw, null)
  near(path[3]!.x, -3)
  near(path[3]!.z, 0)
  assert.deepEqual(crowdPath([]), [])
})

test('a shopper waits at a stall, walks to the next one, and the lap repeats', () => {
  const path = crowdPath(stalls)
  assert.deepEqual(shopperAt(path, 0), { x: path[0]!.x, z: path[0]!.z, yaw: path[0]!.faceYaw!, moving: false })
  const halfway = shopperAt(path, SHOPPER_PAUSE_S + 5 / SHOPPER_SPEED)
  near(halfway.x, 5)
  near(halfway.z, 1.8)
  assert.equal(halfway.moving, true)
  near(halfway.yaw, Math.PI / 2)
  const lap = lapSeconds(path)
  assert.deepEqual(shopperAt(path, lap + 1), shopperAt(path, 1))
  assert.deepEqual(shopperAt(path, -1), shopperAt(path, lap - 1))
})
