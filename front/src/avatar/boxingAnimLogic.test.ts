import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BOX_STEP_DESIGN_SPEED, BoxingAnimState, LOWER_BODY_BONES, footwork, keepsTrack, punchClip } from './boxingAnimLogic.ts'

test('footwork blends from the bouncing guard into the step as the boxer speeds up, no jump at either end', () => {
  assert.deepEqual(footwork(0), { idle: 1, step: 0, stepTimeScale: 0.7 })
  assert.equal(footwork(0.3).step, 0)
  assert.equal(footwork(1.6).step, 1)
  const mid = footwork(0.95)
  assert.ok(Math.abs(mid.idle + mid.step - 1) < 1e-9)
  assert.ok(mid.step > 0.45 && mid.step < 0.55)
  assert.ok(footwork(0.31).step < 0.01 && footwork(1.59).step > 0.99)
  assert.equal(footwork(BOX_STEP_DESIGN_SPEED).stepTimeScale, 1)
  assert.equal(footwork(9).stepTimeScale, 1.4)
})

test('a layer keeps only the tracks of its own bones', () => {
  assert.equal(keepsTrack('UpperLegL.quaternion', LOWER_BODY_BONES), true)
  assert.equal(keepsTrack('HandR.quaternion', LOWER_BODY_BONES), false)
  assert.equal(keepsTrack('Hips.position', LOWER_BODY_BONES), true)
})

test('a punch flows out of the guard and back into the guard, or into the block when the guard is held', () => {
  const s = new BoxingAnimState()
  assert.equal(s.shot(punchClip('hook')), 'Hook')
  assert.equal(s.shotFinished('Jab', false), null)
  assert.equal(s.shotFinished('Hook', true), 'Block')
  assert.deepEqual(s.pose({ guard: false, down: false, result: null }), { upper: 'Guard', full: 'none' })
  assert.deepEqual(s.pose({ guard: false, down: false, result: null }), { upper: null, full: 'none' })
})

test('a knockdown goes down, stays down, gets up, and the bout ends on KO or a win', () => {
  const s = new BoxingAnimState()
  assert.equal(s.pose({ guard: false, down: true, result: null }).full, 'Knockdown')
  assert.equal(s.shot('Jab'), null)
  assert.equal(s.fullFinished('Knockdown'), 'Down')
  assert.equal(s.pose({ guard: false, down: false, result: null }).full, 'GetUp')
  assert.equal(s.fullFinished('GetUp'), null)
  assert.equal(s.shot('Jab'), 'Jab')
  assert.equal(s.pose({ guard: false, down: false, result: 'lost' }).full, 'KO')
  assert.equal(s.pose({ guard: false, down: false, result: 'lost' }).full, 'none')
  assert.equal(new BoxingAnimState().pose({ guard: false, down: false, result: 'won' }).full, 'Win')
})
