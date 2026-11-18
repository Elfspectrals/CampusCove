import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BOX_STEP_DESIGN_SPEED, BoxingAnimState, chargeClip, footwork, punchClip } from './boxingAnimLogic.ts'

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

test('a held button shows the wind-up until its punch or its release, and the guard state picks the loop it falls back to', () => {
  const s = new BoxingAnimState()
  s.pose({ guard: true, down: false, result: null })
  assert.equal(s.charge(chargeClip('right'), true), 'UppercutCharge')
  assert.deepEqual(s.pose({ guard: true, down: false, result: null }), { upper: null, full: 'none' })
  assert.equal(s.charge('HookCharge', false), null)
  assert.equal(s.charge('UppercutCharge', false), 'Block')
  s.charge('HookCharge', true)
  assert.equal(s.shot(punchClip('hook')), 'Hook')
  assert.equal(s.charge('HookCharge', false), null)
})

test('each of the four punches has its clip', () => {
  assert.deepEqual((['jab', 'cross', 'hook', 'uppercut'] as const).map(punchClip), ['Jab', 'Cross', 'Hook', 'Uppercut'])
})
