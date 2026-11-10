import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { animalCycle, animalPose, parseAnimals } from './animals.ts'

const animals = parseAnimals(JSON.parse(readFileSync(new URL('../../../public/assets/animals/animals.json', import.meta.url), 'utf8')))
const cow = animals.cow!
const pen = { id: 'cow1', position: [-20, 0, -150] as [number, number, number], yaw: 0, size: [8, 6] as [number, number] }

test('the shared animal table lists the barnyard with a walking speed and a rest time', () => {
  assert.deepEqual(Object.keys(animals), ['cow', 'pig', 'sheep', 'dog', 'hen', 'rooster'])
  assert.throws(() => parseAnimals({ version: 1, animals: { cow: { ...cow, speed: 0 } } }), /speed/)
  assert.throws(() => parseAnimals({ version: 1, animals: { cow: { label: 'Cow', speed: 1, rest: 2, sped: 3 } } }), /cow\.sped: unknown field/)
  assert.throws(() => parseAnimals({ version: 1, animals: { cow: null } }), /cow: expected an object/)
})

test('a cycle lasts the rest time plus the longest walk across the pen', () => {
  assert.equal(animalCycle(pen, { speed: 1, rest: 6 }), 16)
})

test('the animal never leaves its pen, even a rotated one', () => {
  const rotated = { ...pen, yaw: Math.PI / 3 }
  for (let t = 0; t < 2000; t += 0.7) {
    const { x, z } = animalPose(rotated, cow, t)
    const dx = x - rotated.position[0]
    const dz = z - rotated.position[2]
    const localX = dx * Math.cos(rotated.yaw) - dz * Math.sin(rotated.yaw)
    const localZ = dx * Math.sin(rotated.yaw) + dz * Math.cos(rotated.yaw)
    assert.ok(Math.abs(localX) <= 4 - 0.4 + 1e-9 && Math.abs(localZ) <= 3 - 0.4 + 1e-9, `t=${t} at ${localX}, ${localZ}`)
  }
})

test('the path is continuous across a cycle boundary', () => {
  const cycle = animalCycle(pen, cow)
  for (const k of [1, 2, 57, 1_000_000]) {
    const before = animalPose(pen, cow, k * cycle - 1e-4)
    const after = animalPose(pen, cow, k * cycle)
    assert.ok(Math.hypot(before.x - after.x, before.z - after.z) < 1e-3, `cycle ${k}`)
    assert.ok(Math.abs(Math.atan2(Math.sin(before.yaw - after.yaw), Math.cos(before.yaw - after.yaw))) < 1e-3, `cycle ${k} yaw`)
  }
})

test('each cycle walks first, then rests grazing or idle, the same for every player', () => {
  const cycle = animalCycle(pen, cow)
  const start = 40 * cycle
  assert.equal(animalPose(pen, cow, start + 0.01).clip, 'walk')
  assert.notEqual(animalPose(pen, cow, start + cycle - 0.01).clip, 'walk')
  assert.deepEqual(animalPose(pen, cow, start + 3.3), animalPose({ ...pen }, cow, start + 3.3))
  const clips = new Set(Array.from({ length: 50 }, (_, k) => animalPose(pen, cow, (k + 1) * cycle - 0.01).clip))
  assert.deepEqual([...clips].sort(), ['graze', 'idle'])
})

test('a short walk finishes its turn before the animal stops', () => {
  const cycle = animalCycle(pen, cow)
  let short = 0
  for (let k = 0; k < 2000; k++) {
    let [lo, hi] = [k * cycle, (k + 1) * cycle - 1e-6]
    if (animalPose(pen, cow, lo).clip !== 'walk') continue
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      if (animalPose(pen, cow, mid).clip === 'walk') lo = mid
      else hi = mid
    }
    if (lo - k * cycle < 0.5) short++
    const walking = animalPose(pen, cow, lo)
    const resting = animalPose(pen, cow, hi)
    assert.ok(Math.abs(Math.atan2(Math.sin(walking.yaw - resting.yaw), Math.cos(walking.yaw - resting.yaw))) < 1e-3, `cycle ${k}`)
  }
  assert.ok(short > 0, 'no short walk sampled')
})

test('a walking animal faces where it goes', () => {
  const cycle = animalCycle(pen, cow)
  const t = 12 * cycle + 1
  const a = animalPose(pen, cow, t)
  const b = animalPose(pen, cow, t + 0.1)
  assert.equal(a.clip, 'walk')
  assert.ok(Math.abs(Math.atan2(b.x - a.x, b.z - a.z) - b.yaw) < 1e-6 || Math.abs(Math.abs(Math.atan2(b.x - a.x, b.z - a.z) - b.yaw) - 2 * Math.PI) < 1e-6)
})
