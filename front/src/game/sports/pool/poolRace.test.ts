import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { approach, boardEdgeAt, cadenceMeter, formatRaceTime, inWater, parsePoolRules, racingPhase, splashScale, swimmingAt, swimwearOutfit, trickForKey } from './poolRace.ts'

const read = (sport: string) => JSON.parse(readFileSync(new URL(`../../../../public/assets/sports/rules/${sport}.json`, import.meta.url), 'utf8'))
const rules = parsePoolRules(read('swimming'), read('diving'))
const stroke = { goodCadenceMs: 450, toleranceMs: 150 }

test('reads the water and the three boards of the ready rules', () => {
  assert.equal(rules.water.length, 2)
  assert.deepEqual(rules.boards.map((b) => b.heightM), [1, 3, 5])
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

test('a trick key maps to its trick through the bindings', () => {
  const bound: Record<string, string> = { diveTwist: 'ArrowLeft', diveSomersault: 'ArrowUp', diveCannonball: 'KeyC' }
  const matches = (action: string, code: string) => bound[action] === code
  assert.equal(trickForKey('KeyC', matches), 'cannonball')
  assert.equal(trickForKey('ArrowUp', matches), 'somersault')
  assert.equal(trickForKey('KeyW', matches), null)
})

test('a cannonball makes a bigger splash than any other entry from the same height', () => {
  assert.ok(splashScale(5, 'cannonball') > splashScale(5, 'somersault'))
  assert.equal(splashScale(5, null), splashScale(5, 'twist'))
  assert.ok(splashScale(5, null) > splashScale(1, null))
})

test('in the water the swimsuit replaces the top, bottom, shoes and headwear, the hair stays', () => {
  const own = { hair: 'curly', head_accessory: 'gamer', top: 'hoodie', bottom: 'jeans', shoes: 'boots' }
  assert.deepEqual(swimwearOutfit(own), { hair: 'curly', head_accessory: null, top: null, bottom: '/assets/wear/bottom/swimsuit/model.glb', shoes: null })
})

test('a player swims only with the feet down in the pool water, not on a board above it', () => {
  const platform = rules.boards[2]!
  const x = (platform.edgeZone.minX + platform.edgeZone.maxX) / 2
  const z = (platform.edgeZone.minZ + platform.edgeZone.maxZ) / 2
  assert.equal(swimmingAt(rules, x, rules.wadeY, z), true)
  assert.equal(swimmingAt(rules, x, 5, z), false)
  assert.equal(swimmingAt(rules, -493, rules.wadeY, -212), false)
})
