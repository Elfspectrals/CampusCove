import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PICKPOCKET_PROMPT_REACH, cursorAt, standsBehind, victimInFront, type PickpocketCandidate } from './pickpocket.ts'

const victim = (sessionId: string, z: number, ry = 0): PickpocketCandidate => ({ sessionId, x: 0, feetY: 0, z, ry })
const at = (distance: number, deg: number) => ({ x: Math.sin((deg * Math.PI) / 180) * distance, z: Math.cos((deg * Math.PI) / 180) * distance })

test('the prompt shows only right behind the victim, a little inside the server limits', () => {
  assert.ok(PICKPOCKET_PROMPT_REACH < 1.5)
  assert.equal(standsBehind(at(1, 0), victim('v', 0)), true)
  assert.equal(standsBehind(at(1, 24), victim('v', 0)), true)
  assert.equal(standsBehind(at(1, 26), victim('v', 0)), false)
  assert.equal(standsBehind(at(PICKPOCKET_PROMPT_REACH + 0.01, 0), victim('v', 0)), false)
  assert.equal(standsBehind(at(1, 180), victim('v', 0)), false)
  assert.equal(standsBehind(at(1, 0), victim('v', 0, Math.PI)), false)
})

test('the nearest victim the player stands behind is picked', () => {
  const near = victim('near', 0.5)
  const far = victim('far', 0.2)
  assert.equal(victimInFront({ x: 0, z: 1 }, [far, near])?.sessionId, 'near')
  assert.equal(victimInFront({ x: 0, z: -1 }, [far, near]), null)
})

test('the cursor follows the same back and forth as the server', () => {
  assert.equal(cursorAt(0, 800), 0)
  assert.equal(cursorAt(400, 800), 0.5)
  assert.equal(cursorAt(800, 800), 1)
  assert.equal(cursorAt(1200, 800), 0.5)
  assert.equal(cursorAt(-50, 800), 0)
})
