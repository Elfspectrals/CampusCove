import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { approach, boardEdgeAt, cadenceMeter, formatRaceTime, inWater, parsePoolRules, racingPhase } from './poolRace.ts'

const read = (sport: string) => JSON.parse(readFileSync(new URL(`../../../../public/assets/sports/rules/${sport}.json`, import.meta.url), 'utf8'))
const rules = parsePoolRules(read('swimming'), read('diving'))
const stroke = { goodCadenceMs: 450, toleranceMs: 150 }

test('reads the water, the three boards and the trick keys of the ready rules', () => {
  assert.equal(rules.water.length, 2)
  assert.deepEqual(rules.boards.map((b) => b.heightM), [1, 3, 5])
  assert.equal(rules.trickKeys.ArrowUp, 'somersault')
  assert.ok(rules.wadeY < rules.waterY)
})

test('finds the board edge only at its height', () => {
  const platform = rules.boards[2]!
  const x = (platform.edgeZone.minX + platform.edgeZone.maxX) / 2
  const z = (platform.edgeZone.minZ + platform.edgeZone.maxZ) / 2
  assert.equal(boardEdgeAt(rules, x, z, 5)?.id, 'platform_5m')
  assert.equal(boardEdgeAt(rules, x, z, 5.3)?.id, 'platform_5m')
  assert.equal(boardEdgeAt(rules, x, z, -1.3), null)
  assert.equal(inWater(rules, x, z), true)
})

test('refuses rules that are still placeholders', () => {
  assert.throws(() => parsePoolRules({ ...read('swimming'), status: 'placeholder' }, read('diving')))
})

test('is empty before the first stroke and fills with the time since the last one', () => {
  assert.equal(cadenceMeter(null, stroke).fill, 0)
  assert.equal(cadenceMeter(450, stroke).inWindow, true)
  assert.equal(cadenceMeter(250, stroke).inWindow, false)
  assert.equal(cadenceMeter(700, stroke).inWindow, false)
  assert.equal(cadenceMeter(10_000, stroke).fill, 1)
})

test('places the good window inside the bar', () => {
  const { windowFrom, windowTo } = cadenceMeter(0, stroke)
  assert.ok(windowFrom > 0)
  assert.ok(windowTo < 1)
})

test('formats times in seconds, then minutes past a minute', () => {
  assert.equal(formatRaceTime(null), '--')
  assert.equal(formatRaceTime(12_345), '12.35')
  assert.equal(formatRaceTime(65_432), '1:05.43')
})

test('locks the swimmer only on the block and in the water', () => {
  assert.equal(racingPhase('marks'), true)
  assert.equal(racingPhase('swimming'), true)
  assert.equal(racingPhase('finished'), false)
  assert.equal(racingPhase(null), false)
})

test('approaches a target without overshooting', () => {
  assert.ok(Math.abs(approach(0, 1, 0.3) - 0.3) < 1e-9)
  assert.equal(approach(0.9, 1, 0.3), 1)
  assert.equal(approach(1, 0, 0.5), 0.5)
})
