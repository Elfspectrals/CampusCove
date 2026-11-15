import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { bumped, glide, hitBoards, newSkater, onIce, parseSkatingSpec, push, pushKind, raceClock, rhythmCue, skateStep, speedKmh, steer, turnRate } from './skateMotion.ts'

const raw = JSON.parse(readFileSync(new URL('../../../../public/assets/sports/rules/skating.json', import.meta.url), 'utf8'))
const spec = parseSkatingSpec(raw)
const t = spec.tuning

test('the shipped rules parse', () => {
  assert.equal(t.maxSpeed, 9)
  assert.ok(onIce(spec.rink, (spec.rink.minX + spec.rink.maxX) / 2, (spec.rink.minZ + spec.rink.maxZ) / 2))
  assert.throws(() => parseSkatingSpec({ ...raw, skate: { ...raw.skate, brake: null } }), /skate.brake/)
})

test('speed follows the same pushes as the socket replay (golden values)', () => {
  const s = newSkater(0)
  assert.equal(push(t, s, 0), 'normal')
  assert.equal(s.speed, 1.6)
  glide(t, s, 0.65, false)
  assert.equal(push(t, s, 650), 'good')
  assert.ok(Math.abs(s.speed - 3.875) < 1e-9)
  assert.equal(pushKind(t, 499), 'early')
  assert.equal(pushKind(t, 801), 'normal')
  for (let at = 1300; at <= 6500; at += 650) push(t, s, at)
  assert.equal(s.speed, t.maxSpeed)
  glide(t, s, 10, true)
  assert.equal(s.speed, 0)
})

test('turns are wide at speed and the step follows the heading', () => {
  assert.ok(turnRate(t, t.maxSpeed) < turnRate(t, 0))
  const s = newSkater(0)
  s.speed = t.maxSpeed
  steer(t, s, Math.PI / 2, 0.1)
  assert.ok(Math.abs(s.heading - t.turnAtMax * 0.1) < 1e-9)
  const fresh = newSkater(-Math.PI / 2)
  fresh.speed = 4
  const { dx, dz } = skateStep(t, fresh, -Math.PI / 2, false, 0.5, 0)
  assert.ok(dx > 1.9 && Math.abs(dz) < 1e-9, 'heading -pi/2 skates towards +x')
})

test('a fallen skater stays put, the boards stop a fast skater and make them fall', () => {
  const s = newSkater(0)
  s.speed = 8
  assert.equal(hitBoards(spec, s, 0.4, 0.05, 1000), true)
  assert.equal(s.fallenUntil, 1000 + spec.fallMs)
  assert.deepEqual(skateStep(t, s, 0, false, 0.1, 1200), { dx: 0, dz: 0 })
  const slow = newSkater(0)
  slow.speed = 3
  assert.equal(hitBoards(spec, slow, 0.15, 0.0, 0), false)
  assert.equal(slow.speed, 0)
})

test('HUD helpers', () => {
  const s = newSkater(0)
  assert.equal(rhythmCue(t, s, 100), 0)
  push(t, s, 0)
  assert.equal(rhythmCue(t, s, 400), 0.5)
  assert.equal(speedKmh(s), 6)
  assert.equal(raceClock(83_456), '1:23.4')
})

test('a bump costs a share of the speed', () => {
  const s = newSkater(0)
  s.speed = 5
  bumped(spec, s)
  assert.ok(Math.abs(s.speed - 3.5) < 1e-9)
})
