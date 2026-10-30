import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PubSeat } from '../world/worldManifest.ts'
import { canChallenge, challengeErrorText, challengeResultText, secondsLeft } from './challenge.ts'

const stool = (x: number, y = 0.72): PubSeat => ({ id: `stool_${x}`, kind: 'stool', position: [x, y, 0], yaw: 0 })

test('challenge needs two stools within 4 m on one floor', () => {
  assert.ok(canChallenge(stool(0), stool(3.9)))
  assert.ok(!canChallenge(stool(0), stool(4.5)))
  assert.ok(!canChallenge(stool(0), stool(1, -3)))
  assert.ok(!canChallenge(stool(0), { id: 'chair', kind: 'chair', position: [1, 0.45, 0], yaw: 0 }))
  assert.ok(!canChallenge(null, stool(1)))
  assert.ok(!canChallenge(stool(0), null))
})

test('seconds left', () => {
  assert.equal(secondsLeft(10_500, 0), 11)
  assert.equal(secondsLeft(1000, 2000), 0)
})

test('result and error texts', () => {
  assert.equal(challengeResultText('Mo', false, 'declined'), 'Mo declined.')
  assert.equal(challengeResultText('Mo', false), 'Mo declined.')
  assert.equal(challengeResultText('Mo', false, 'expired'), 'No answer from Mo.')
  assert.equal(challengeResultText('Mo', false, 'cancelled'), 'Challenge cancelled.')
  assert.match(challengeResultText('Mo', true), /accepted/)
  assert.ok(challengeErrorText('challenge_too_far'))
  assert.ok(challengeErrorText('race_in_progress'))
  assert.equal(challengeErrorText('race_not_on_stool'), null)
})
