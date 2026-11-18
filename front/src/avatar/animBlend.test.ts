import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TWIN_SUFFIX, UPPER_BODY_BONES, blendGroup, clipOfInstance, fadeSeconds, freshInstance, phaseTime, sharesFootPhase, stepWeights } from './animBlend.ts'

const close = (actual: number | undefined, expected: number) => assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-6, `${actual} is not ${expected}`)

const sum = (w: ReadonlyMap<string, number>) => [...w.values()].reduce((a, b) => a + b, 0)

describe('stepWeights', () => {
  it('moves linearly to the target over the fade and keeps the sum at 1', () => {
    let w = new Map([['Idle', 1]])
    const target = new Map([['Walk', 1]])
    w = stepWeights(w, target, 0.1, 0.2)
    close(w.get('Walk'), 0.5)
    close(w.get('Idle'), 0.5)
    close(sum(w), 1)
    w = stepWeights(w, target, 0.1, 0.2)
    close(w.get('Walk'), 1)
    assert.equal(w.has('Idle'), false)
  })

  it('continues from the current weights when interrupted mid-fade, never back to 1', () => {
    let w = stepWeights(new Map([['Jab', 1]]), new Map([['Cross', 1]]), 0.04, 0.08)
    close(w.get('Jab'), 0.5)
    w = stepWeights(w, new Map([['Hook', 1]]), 0.02, 0.08)
    close(w.get('Hook'), 0.25)
    close(w.get('Jab'), 0.375)
    close(w.get('Cross'), 0.375)
    close(sum(w), 1)
  })

  it('jumps at once with no fade', () => {
    const w = stepWeights(new Map([['Idle', 1]]), new Map([['Sit', 1]]), 0.016, 0)
    assert.equal(w.get('Sit'), 1)
    assert.equal(w.has('Idle'), false)
  })

  it('follows a mixed target such as footwork', () => {
    let w = new Map([['BoxIdle', 1]])
    for (let i = 0; i < 20; i += 1) w = stepWeights(w, new Map([['BoxIdle', 0.3], ['BoxStep', 0.7]]), 0.016, 0.15)
    close(w.get('BoxStep'), 0.7)
    close(w.get('BoxIdle'), 0.3)
  })

  it('keeps the sum at 1 even before the first full step, so no bone leaks to the rest pose', () => {
    const w = stepWeights(new Map([['A', 0.6], ['B', 0.4]]), new Map([['C', 1]]), 0.01, 0.2)
    close(sum(w), 1)
  })
})

describe('freshInstance', () => {
  it('starts the clip itself when it is silent', () => {
    assert.equal(freshInstance('Jab', new Map([['Guard', 1]])), 'Jab')
  })

  it('starts the twin when the same clip is still showing, so its time does not snap to 0', () => {
    assert.equal(freshInstance('Jab', new Map([['Jab', 0.8]])), 'Jab' + TWIN_SUFFIX)
  })

  it('goes back to the clip when the twin is the louder one', () => {
    assert.equal(freshInstance('Jab', new Map([['Jab', 0.2], ['Jab' + TWIN_SUFFIX, 0.8]])), 'Jab')
  })

  it('names the clip of a twin', () => {
    assert.equal(clipOfInstance('Hook' + TWIN_SUFFIX), 'Hook')
  })
})

describe('fadeSeconds', () => {
  it('uses short fades between punches and a shorter one in first person', () => {
    assert.equal(fadeSeconds('Jab', 'Cross'), 0.08)
    assert.equal(fadeSeconds('Jab' + TWIN_SUFFIX, 'Jab'), 0.08)
    assert.equal(fadeSeconds('FpJab', 'FpCross'), 0.05)
    assert.equal(fadeSeconds('Guard', 'Hook'), 0.05)
    assert.equal(fadeSeconds('Cross', 'Guard'), 0.15)
  })

  it('times locomotion, seats, actions and hits', () => {
    assert.equal(fadeSeconds('Idle', 'Walk'), 0.25)
    assert.equal(fadeSeconds('Walk', 'Run'), 0.2)
    assert.equal(fadeSeconds('Run', 'Idle'), 0.3)
    assert.equal(fadeSeconds('Walk', 'Sit'), 0.35)
    assert.equal(fadeSeconds('Sit', 'Idle'), 0.3)
    assert.equal(fadeSeconds('Walk', 'Eat'), 0.2)
    assert.equal(fadeSeconds('Eat', 'Idle'), 0.25)
    assert.equal(fadeSeconds('Guard', 'HitReact'), 0.05)
    assert.equal(fadeSeconds('Guard', 'Knockdown'), 0.08)
    assert.equal(fadeSeconds('Down', 'GetUp'), 0.3)
    assert.equal(fadeSeconds('Guard', 'DodgeL'), 0.06)
  })

  it('starts the first clip with no fade and falls back on the default', () => {
    assert.equal(fadeSeconds(null, 'Idle'), 0)
    assert.equal(fadeSeconds('Idle', 'ClimbHang'), 0.22)
    assert.equal(blendGroup('ClimbHang'), 'other')
  })
})

describe('body layers', () => {
  it('puts the spine, head and arms in the upper layer and leaves hips and legs to the lower one', () => {
    assert.ok(UPPER_BODY_BONES.includes('Spine'))
    assert.ok(UPPER_BODY_BONES.includes('HandR'))
    assert.ok(!UPPER_BODY_BONES.includes('Hips'))
    assert.ok(!UPPER_BODY_BONES.includes('UpperLegL'))
  })
})

describe('foot phase', () => {
  it('ties Walk and Run, twins included, and nothing else', () => {
    assert.equal(sharesFootPhase('Walk', 'Run'), true)
    assert.equal(sharesFootPhase('Run' + TWIN_SUFFIX, 'Walk'), true)
    assert.equal(sharesFootPhase('Walk', 'Walk'), false)
    assert.equal(sharesFootPhase('Idle', 'Walk'), false)
  })

  it('maps a time to the same point of the stride in a clip of another length', () => {
    close(phaseTime(0.25, 1, 0.6), 0.15)
    close(phaseTime(1.25, 1, 0.6), 0.15)
    close(phaseTime(-0.25, 1, 0.6), 0.45)
    assert.equal(phaseTime(0.3, 0, 0.6), 0)
  })
})
