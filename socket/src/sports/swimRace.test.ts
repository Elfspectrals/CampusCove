import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  type Race,
  advanceRace,
  createRace,
  dropSwimmer,
  fireBeep,
  lanePosition,
  parsePoolRules,
  places,
  pressDive,
  pressStroke,
  raceOver
} from './swimRace.ts'

const RAW = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/swimming.json', import.meta.url), 'utf8'))
const rules = parsePoolRules(RAW)
const T0 = 1_000_000
const BEEP_DELAY = 2000
const BEEP = T0 + BEEP_DELAY

function race(count: number, distanceM = 25): Race {
  const entrants = Array.from({ length: count }, (_, i) => ({ accountId: i + 1, sessionId: `s${i + 1}`, name: `P${i + 1}` }))
  return createRace(entrants, distanceM, T0, BEEP_DELAY)
}

function swim(r: Race, index: number, cadenceMs: number, reactionMs = 200, until = BEEP + 120_000): void {
  const s = r.swimmers[index]
  let next = BEEP + reactionMs
  let side: 'left' | 'right' = 'left'
  let dived = false
  for (let t = BEEP; t <= until && !raceOver(r); t += 10) {
    if (t === BEEP) fireBeep(r, t)
    if (t >= next) {
      if (!dived) {
        pressDive(r, s, t, rules)
        dived = true
      } else {
        pressStroke(r, s, side, t, rules)
        side = side === 'left' ? 'right' : 'left'
      }
      next = t + cadenceMs
    }
    if (t % 100 === 0) advanceRace(r, t, rules)
  }
}

test('the ready swimming rules parse: 6 lanes, 25 m, one length between the walls', () => {
  assert.equal(rules.lanes.length, 6)
  assert.equal(rules.lengthM, 25)
  assert.deepEqual(rules.distancesM, [25, 50, 100])
  assert.equal(Math.abs(rules.startX - rules.turnX), 25)
})

test('a press before the beep is a false start: the swimmer is disqualified, the beep does not fire early', () => {
  const r = race(2)
  assert.equal(fireBeep(r, BEEP - 1), false)
  assert.equal(pressStroke(r, r.swimmers[0], 'left', BEEP - 500, rules), 'false_start')
  assert.equal(pressDive(r, r.swimmers[1], BEEP - 1, rules), 'false_start')
  assert.deepEqual(r.swimmers.map((s) => s.phase), ['disqualified', 'disqualified'])
  assert.equal(raceOver(r), true)
})

test('the dive after the beep measures the reaction time from the beep and glides', () => {
  const r = race(1)
  fireBeep(r, BEEP)
  assert.equal(pressDive(r, r.swimmers[0], BEEP + 230, rules), 'started')
  assert.equal(r.swimmers[0].reactionMs, 230)
  assert.equal(r.swimmers[0].distanceM, rules.dive.glideM)
  assert.equal(pressDive(r, r.swimmers[0], BEEP + 300, rules), 'ignored')
})

test('strokes: the good window speeds up, same side twice or too fast cuts the speed, too slow boosts less', () => {
  const r = race(1)
  fireBeep(r, BEEP)
  const s = r.swimmers[0]
  pressDive(r, s, BEEP + 200, rules)
  assert.equal(pressStroke(r, s, 'left', BEEP + 650, rules), 'good')
  assert.equal(pressStroke(r, s, 'right', BEEP + 1100, rules), 'good')
  const fast = s.speedMps
  assert.equal(pressStroke(r, s, 'right', BEEP + 1550, rules), 'off')
  assert.ok(s.speedMps < fast * 0.7)
  assert.equal(pressStroke(r, s, 'left', BEEP + 1650, rules), 'off')
  assert.equal(pressStroke(r, s, 'right', BEEP + 2500, rules), 'slow')
})

test('a steady good cadence wins over spamming and over a slow cadence; finish times come from the server clock', () => {
  const r = race(3)
  swim(r, 0, rules.stroke.goodCadenceMs)
  const good = r.swimmers[0].timeMs as number
  assert.equal(r.swimmers[0].phase, 'finished')
  assert.equal(r.swimmers[0].distanceM, 25)
  assert.ok(good > 9_000 && good < 16_000, `25 m in ${good} ms`)
  const spam = race(1)
  swim(spam, 0, 120, 200, BEEP + 40_000)
  assert.ok(spam.swimmers[0].timeMs === null || (spam.swimmers[0].timeMs as number) > good * 1.5)
  const slow = race(1)
  swim(slow, 0, 750)
  assert.ok((slow.swimmers[0].timeMs as number) > good)
})

test('places sort by time, ties share a place, a dropped swimmer has none', () => {
  const r = race(3)
  fireBeep(r, BEEP)
  r.swimmers[0].phase = 'finished'
  r.swimmers[0].timeMs = 12_000
  r.swimmers[1].phase = 'finished'
  r.swimmers[1].timeMs = 12_000
  dropSwimmer(r, 3)
  assert.deepEqual([...places(r)], [[1, 1], [2, 1]])
  assert.equal(r.swimmers[2].phase, 'dnf')
  assert.equal(raceOver(r), true)
})

test('past the time limit everyone still in the water did not finish', () => {
  const r = race(1, 50)
  fireBeep(r, BEEP)
  pressDive(r, r.swimmers[0], BEEP + 200, rules)
  advanceRace(r, BEEP + 2 * rules.timeLimitPerLengthMs, rules)
  assert.equal(r.swimmers[0].phase, 'dnf')
})

test('lane position: out to the turn wall on odd lengths, back to the start wall on even ones', () => {
  assert.deepEqual(lanePosition(rules, 0), { x: rules.startX, length: 1 })
  assert.deepEqual(lanePosition(rules, 25), { x: rules.turnX, length: 1 })
  const back = lanePosition(rules, 30)
  assert.equal(back.length, 2)
  assert.equal(back.x, rules.turnX + Math.sign(rules.startX - rules.turnX) * 5)
  assert.deepEqual(lanePosition(rules, 50), { x: rules.startX, length: 2 })
})
