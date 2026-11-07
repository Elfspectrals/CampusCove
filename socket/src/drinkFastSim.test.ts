import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DRINK_FAST_STEP_S, createDrinkFastSim } from './drinkFastSim.ts'

// The same golden run is pinned in front/src/game/pub/drinkFast.test.ts: if one side changes, both tests must
// change together, or the server would replay a different race than the player saw.
test('golden run: same seed and inputs give the same glass on client and server', () => {
  const sim = createDrinkFastSim(20261106)
  let state = { y: 0.5, progress: 0, spills: 0 }
  for (let i = 0; i < 1200; i++) state = sim.step(DRINK_FAST_STEP_S, i % 90 < 50)
  assert.ok(Math.abs(state.progress - 0.4375833333333314) < 1e-9, String(state.progress))
  assert.equal(state.spills, 2)
  assert.equal(state.y, 0)
})
