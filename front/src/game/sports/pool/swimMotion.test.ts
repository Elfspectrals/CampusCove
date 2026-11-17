import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parsePoolRules } from './poolRace.ts'
import { floatEyeY, isUnderwater, swimStep, swimWaterAt, type SwimInput } from './swimMotion.ts'

const read = (sport: string) => JSON.parse(readFileSync(new URL(`../../../../public/assets/sports/rules/${sport}.json`, import.meta.url), 'utf8'))
const rules = parsePoolRules(read('swimming'), read('diving'))
const BASIN = { x: -505, z: -212 }
const PIT = { x: -525, z: -210 }
const still: SwimInput = { forward: 0, right: 0, up: false, down: false, fast: false, speedFactor: 1 }
const basin = swimWaterAt(rules, BASIN.x, BASIN.z)!
const pit = swimWaterAt(rules, PIT.x, PIT.z)!

function run(eyeY: number, vy: number, input: SwimInput, seconds: number, pitch = 0, water = basin): { y: number, vy: number, dist: number, lowest: number } {
  let y = eyeY
  let v = vy
  let dist = 0
  let lowest = y
  for (let t = 0; t < seconds; t += 1 / 60) {
    const s = swimStep(rules, water, y, v, input, 0, pitch, 1 / 60)
    y = s.y
    v = s.vy
    dist += Math.hypot(s.dx, s.dz)
    lowest = Math.min(lowest, y)
  }
  return { y, vy: v, dist, lowest }
}

test('the water has a floor per basin and the exit stairs are not swum', () => {
  assert.equal(basin.floorY, -2)
  assert.equal(pit.floorY, -4.5)
  assert.equal(swimWaterAt(rules, -494.5, -219), null)
  assert.equal(swimWaterAt(rules, -490, -212), null)
})

test('a still swimmer floats with the eyes just above the water, and rises back after diving', () => {
  assert.equal(run(floatEyeY(rules), 0, still, 2).y, floatEyeY(rules))
  assert.equal(isUnderwater(rules, BASIN.x, floatEyeY(rules), BASIN.z), false)
  const back = run(-1.4, 0, still, 6)
  assert.ok(Math.abs(back.y - floatEyeY(rules)) < 1e-6, `${back.y}`)
})

test('the move keys swim at the swim speed, the fast key at the fast speed, never at walking speed', () => {
  const slow = run(floatEyeY(rules), 0, { ...still, forward: 1 }, 1)
  const fast = run(floatEyeY(rules), 0, { ...still, forward: 1, fast: true }, 1)
  assert.ok(Math.abs(slow.dist - rules.swim.speedMps) < 0.05)
  assert.ok(Math.abs(fast.dist - rules.swim.fastSpeedMps) < 0.05)
})

test('looking down while swimming forward dives; underwater the swimmer follows the look; the floor stops them', () => {
  const flatLook = run(floatEyeY(rules), 0, { ...still, forward: 1 }, 2, -0.2)
  assert.equal(flatLook.y, floatEyeY(rules))
  const dive = run(floatEyeY(rules), 0, { ...still, forward: 1 }, 4, -1.2)
  assert.equal(dive.y, basin.floorY + rules.swim.minEyeAboveFloorM)
  assert.ok(isUnderwater(rules, BASIN.x, dive.y, BASIN.z))
  const keys = run(floatEyeY(rules), 0, { ...still, down: true }, 1)
  assert.ok(keys.y < floatEyeY(rules) - 1)
})

test('a dive from the 5 m platform falls into the pit, goes deep, stops above the floor and comes back up', () => {
  const fall = run(6.6, 0, still, 8, 0, pit)
  assert.ok(fall.lowest < -2, `${fall.lowest}`)
  assert.ok(fall.lowest >= pit.floorY + rules.swim.minEyeAboveFloorM)
  assert.ok(Math.abs(fall.y - floatEyeY(rules)) < 1e-6)
})
