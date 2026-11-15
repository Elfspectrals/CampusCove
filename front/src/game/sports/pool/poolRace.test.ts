import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { approach, boardEdgeAt, fallingStrokes, formatRaceTime, inWater, noteForKey, noteKind, noteTimeMs, parsePoolRules, swimYaw, racingPhase, splashScale, swimmingAt, swimwearOutfit, trickForKey } from './poolRace.ts'

const read = (sport: string) => JSON.parse(readFileSync(new URL(`../../../../public/assets/sports/rules/${sport}.json`, import.meta.url), 'utf8'))
const rules = parsePoolRules(read('swimming'), read('diving'))

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

test('the chart matches the socket: 1200 ms lead-in, 560 ms apart then 4 ms closer down to 380 ms, a breath every eighth note', () => {
  assert.deepEqual([0, 1, 2, 45, 46].map((i) => noteTimeMs(rules.rhythm, i)), [1200, 1760, 2316, 22_440, 22_820])
  assert.deepEqual([0, 1, 6, 7, 8, 15, 16].map((i) => noteKind(rules.rhythm, i)), ['left', 'right', 'left', 'breath', 'right', 'breath', 'left'])
})

test('a note shows 1200 ms before its time, reaches the line on time and leaves 270 ms later or once judged', () => {
  assert.deepEqual(fallingStrokes(rules.rhythm, -1, new Set()), [])
  assert.deepEqual(fallingStrokes(rules.rhythm, 0, new Set()), [{ index: 0, kind: 'left', progress: 0 }])
  const onTime = fallingStrokes(rules.rhythm, 1200, new Set())
  assert.deepEqual(onTime.map((n) => [n.index, n.kind]), [[0, 'left'], [1, 'right'], [2, 'left']])
  assert.equal(onTime[0]!.progress, 1)
  assert.deepEqual(fallingStrokes(rules.rhythm, 1470, new Set()).map((n) => n.index), [0, 1, 2])
  assert.deepEqual(fallingStrokes(rules.rhythm, 1471, new Set()).map((n) => n.index), [1, 2])
  assert.deepEqual(fallingStrokes(rules.rhythm, 1200, new Set([0])).map((n) => n.index), [1, 2])
})

test('the swimmer faces the turn wall on odd lengths and the start wall on even ones', () => {
  assert.ok(rules.turnX < rules.startX)
  assert.equal(swimYaw(rules, 1), Math.PI / 2)
  assert.equal(swimYaw(rules, 2), -Math.PI / 2)
  assert.equal(swimYaw(rules, 3), Math.PI / 2)
})

test('the arms are the left and right keys or arrows, the breath is the jump key', () => {
  const bound = (action: string, code: string) => ({ moveLeft: 'KeyA', moveRight: 'KeyD', jump: 'Space' })[action] === code
  assert.equal(noteForKey('KeyA', bound), 'left')
  assert.equal(noteForKey('ArrowLeft', bound), 'left')
  assert.equal(noteForKey('KeyD', bound), 'right')
  assert.equal(noteForKey('ArrowRight', bound), 'right')
  assert.equal(noteForKey('Space', bound), 'breath')
  assert.equal(noteForKey('KeyW', bound), null)
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
