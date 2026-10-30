import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BOUNCER_STEP_S, bouncerStepAmount } from './bouncerStep.ts'

test('the bouncer steps in, holds the doorway, and is back at rest when it ends', () => {
  assert.equal(bouncerStepAmount(0), 0)
  assert.ok(bouncerStepAmount(0.07) > 0.5)
  assert.equal(bouncerStepAmount(0.3), 1)
  assert.ok(bouncerStepAmount(BOUNCER_STEP_S - 0.05) < 0.1)
  assert.equal(bouncerStepAmount(BOUNCER_STEP_S), 0)
  let last = 1
  for (let t = 0.5; t < BOUNCER_STEP_S; t += 0.01) {
    const amount = bouncerStepAmount(t)
    assert.ok(amount <= last + 1e-9)
    last = amount
  }
})
