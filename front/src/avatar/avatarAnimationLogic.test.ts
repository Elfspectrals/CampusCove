import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AvatarClipSelector,
  MAX_DT_S,
  RUN_DESIGN_SPEED,
  RUN_ENTER,
  RUN_EXIT,
  WALK_DESIGN_SPEED,
  WALK_ENTER,
  clampDt,
  firstPersonWalkTimeScale,
  runTimeScale,
  walkTimeScale,
} from './avatarAnimationLogic.ts'

function settle(sel: AvatarClipSelector, speed: number, seconds = 1): string {
  let clip = sel.clip as string
  for (let t = 0; t < seconds; t += 1 / 60) clip = sel.update(1 / 60, speed).clip
  return clip
}

test('starts idle and stays idle without movement', () => {
  const sel = new AvatarClipSelector()
  assert.equal(settle(sel, 0), 'Idle')
})

test('walks then runs as speed grows', () => {
  const sel = new AvatarClipSelector()
  assert.equal(settle(sel, WALK_ENTER + 1), 'Walk')
  assert.equal(settle(sel, RUN_ENTER + 3), 'Run')
})

test('hysteresis: speed hovering around the enter threshold does not flip clips every frame', () => {
  const sel = new AvatarClipSelector()
  settle(sel, WALK_ENTER + 1)
  let switches = 0
  let last = sel.clip as string
  for (let i = 0; i < 120; i++) {
    const clip = sel.update(1 / 60, i % 2 === 0 ? WALK_ENTER + 0.1 : WALK_ENTER - 0.1).clip
    if (clip !== last) switches++
    last = clip
  }
  assert.equal(switches, 0)
})

test('a teleported avatar (absurd instantaneous speed) is capped and smoothed, not an instant sprint', () => {
  const sel = new AvatarClipSelector()
  assert.notEqual(sel.update(1 / 60, 500).clip, 'Run')
})

test('never switches twice inside the minimum hold time', () => {
  const sel = new AvatarClipSelector()
  settle(sel, 8)
  const seen = new Set<string>()
  for (let i = 0; i < 6; i++) seen.add(sel.update(1 / 60, i < 3 ? 0 : 8).clip)
  assert.ok(seen.size <= 2)
})

test('clampDt bounds hidden-tab spikes and rejects bad values', () => {
  assert.equal(clampDt(5), MAX_DT_S)
  assert.equal(clampDt(-1), 0)
  assert.equal(clampDt(Number.NaN), 0)
})

test('walk time scale stays within bounds', () => {
  assert.equal(walkTimeScale(0), 0.6)
  assert.equal(walkTimeScale(100), 1.3)
})

test('walking at 5 m/s plays Walk at its designed pace, never Run', () => {
  const sel = new AvatarClipSelector()
  settle(sel, WALK_DESIGN_SPEED, 2)
  const { clip, timeScale } = sel.update(1 / 60, WALK_DESIGN_SPEED)
  assert.equal(clip, 'Walk')
  assert.ok(Math.abs(timeScale - 1) < 0.01)
})

test('sprinting at 8.5 m/s plays Run at its designed pace', () => {
  const sel = new AvatarClipSelector()
  settle(sel, RUN_DESIGN_SPEED, 2)
  const { clip, timeScale } = sel.update(1 / 60, RUN_DESIGN_SPEED)
  assert.equal(clip, 'Run')
  assert.ok(Math.abs(timeScale - 1) < 0.01)
})

test('Run starts at 6.7 m/s and holds down to 5.8 m/s', () => {
  assert.equal(RUN_ENTER, 6.7)
  assert.equal(RUN_EXIT, 5.8)
  const sel = new AvatarClipSelector()
  assert.equal(settle(sel, RUN_ENTER - 0.05, 2), 'Walk')
  assert.equal(settle(sel, RUN_ENTER + 0.05, 2), 'Run')
  assert.equal(settle(sel, RUN_EXIT + 0.05, 2), 'Run')
  assert.equal(settle(sel, RUN_EXIT - 0.05, 2), 'Walk')
})

test('walk and run time scales follow speed over the design speed, clamped', () => {
  assert.equal(walkTimeScale(4), 0.8)
  assert.equal(walkTimeScale(2.5), 0.6)
  assert.equal(walkTimeScale(6.5), 1.3)
  assert.equal(runTimeScale(5.8), 0.8)
  assert.equal(runTimeScale(8.5), 1)
  assert.equal(runTimeScale(10.2), 1.2)
  assert.equal(runTimeScale(12), 1.3)
})

test('first-person walk time scale is speed over 5 m/s, clamped to 0.8..1.3', () => {
  assert.equal(firstPersonWalkTimeScale(0.6), 0.8)
  assert.equal(firstPersonWalkTimeScale(5), 1)
  assert.equal(firstPersonWalkTimeScale(4.5), 0.9)
  assert.equal(firstPersonWalkTimeScale(8.5), 1.3)
})
