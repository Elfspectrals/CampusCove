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
  noteKind,
  noteTimeMs,
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

type Style = 'perfect' | 'good' | 'no_breath' | 'spam'

function swim(r: Race, index: number, style: Style, reactionMs = 200, until = BEEP + 120_000): void {
  const s = r.swimmers[index]
  fireBeep(r, BEEP)
  pressDive(r, s, BEEP + reactionMs, rules)
  if (style === 'spam') {
    for (let t = BEEP + reactionMs + 120, i = 0; t <= until && !raceOver(r); t += 120, i += 1) {
      pressStroke(r, s, i % 2 === 0 ? 'left' : 'right', t, rules)
      advanceRace(r, t, rules)
    }
    return
  }
  for (let i = s.nextNote; !raceOver(r); i += 1) {
    const t = BEEP + noteTimeMs(rules.rhythm, i) - (style === 'good' ? 100 : 0)
    if (t > until) return
    const kind = noteKind(rules.rhythm, i)
    if (style !== 'no_breath' || kind !== 'breath') pressStroke(r, s, kind, t, rules)
    advanceRace(r, t, rules)
  }
}

function diver(reactionMs = 200): { r: Race, s: Race['swimmers'][number] } {
  const r = race(1, 100)
  fireBeep(r, BEEP)
  pressDive(r, r.swimmers[0], BEEP + reactionMs, rules)
  return { r, s: r.swimmers[0] }
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
  assert.deepEqual(pressStroke(r, r.swimmers[0], 'left', BEEP - 500, rules), { result: 'false_start', index: null })
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

test('the chart: first note 1200 ms after the beep, 560 ms apart then 4 ms closer each note down to 380 ms', () => {
  assert.equal(noteTimeMs(rules.rhythm, 0), 1200)
  assert.equal(noteTimeMs(rules.rhythm, 1), 1760)
  assert.equal(noteTimeMs(rules.rhythm, 2), 2316)
  assert.equal(noteTimeMs(rules.rhythm, 45), 22_440)
  assert.equal(noteTimeMs(rules.rhythm, 46), 22_820)
  assert.equal(noteTimeMs(rules.rhythm, 47), 23_200)
})

test('the chart alternates the left and right arm, every eighth note is a breath and the arms carry on after it', () => {
  const kinds = Array.from({ length: 17 }, (_, i) => noteKind(rules.rhythm, i))
  assert.deepEqual(kinds.slice(0, 9), ['left', 'right', 'left', 'right', 'left', 'right', 'left', 'breath', 'right'])
  assert.equal(kinds[15], 'breath')
  assert.equal(kinds[16], 'left')
})

test('a press is judged against its note on the server clock: 70 ms perfect, 150 ms good, 120 ms of lag forgiven, never early', () => {
  const NOTE = BEEP + 1760
  const judged = (at: number) => {
    const { r, s } = diver()
    return pressStroke(r, s, 'right', at, rules)
  }
  assert.deepEqual(judged(NOTE - 151), { result: 'stray', index: null })
  assert.deepEqual(judged(NOTE - 150), { result: 'good', index: 1 })
  assert.deepEqual(judged(NOTE - 71), { result: 'good', index: 1 })
  assert.deepEqual(judged(NOTE - 70), { result: 'perfect', index: 1 })
  assert.deepEqual(judged(NOTE), { result: 'perfect', index: 1 })
  assert.deepEqual(judged(NOTE + 190), { result: 'perfect', index: 1 })
  assert.deepEqual(judged(NOTE + 191), { result: 'good', index: 1 })
  assert.deepEqual(judged(NOTE + 270), { result: 'good', index: 1 })
  assert.deepEqual(judged(NOTE + 271), { result: 'stray', index: null })
})

test('a perfect note speeds up most, a good one less, a stray press and a missed note slow the swimmer', () => {
  const { r, s } = diver()
  s.speedMps = 1
  s.at = BEEP + 1200
  assert.equal(pressStroke(r, s, 'left', BEEP + 1200, rules).result, 'perfect')
  assert.equal(s.speedMps, 1.6)
  s.speedMps = 1
  assert.deepEqual(pressStroke(r, s, 'left', BEEP + 1200, rules), { result: 'stray', index: null })
  assert.equal(s.speedMps, 0.8)
  s.speedMps = 1
  s.at = BEEP + 1660
  assert.deepEqual(pressStroke(r, s, 'right', BEEP + 1660, rules), { result: 'good', index: 1 })
  assert.equal(s.speedMps, 1.45)
  s.speedMps = 2
  s.at = BEEP + 2316
  assert.equal(pressStroke(r, s, 'left', BEEP + 2316, rules).result, 'perfect')
  assert.equal(s.speedMps, rules.stroke.maxSpeedMps)
})

test('the wrong arm is a stray press and leaves the note to be missed 270 ms after its time', () => {
  const { r, s } = diver()
  assert.deepEqual(pressStroke(r, s, 'right', BEEP + 1200, rules), { result: 'stray', index: null })
  assert.deepEqual(advanceRace(r, BEEP + 1470, rules), [])
  const before = s.speedMps
  assert.deepEqual(advanceRace(r, BEEP + 1471, rules), [{ swimmer: s, index: 0 }])
  assert.ok(Math.abs(s.speedMps - before * Math.exp(-rules.stroke.dragPerS / 1000) * rules.stroke.missFactor) < 1e-9)
  assert.equal(s.nextNote, 1)
})

test('a note hit early is not missed later, and a note still in its late window can be hit after the next one', () => {
  const { r, s } = diver()
  assert.deepEqual(pressStroke(r, s, 'right', BEEP + 1620, rules), { result: 'good', index: 1 })
  assert.deepEqual(pressStroke(r, s, 'left', BEEP + 1380, rules), { result: 'perfect', index: 0 })
  assert.deepEqual(advanceRace(r, BEEP + 2100, rules), [])
  assert.equal(s.nextNote, 2)
})

test('notes that passed before the dive are skipped, not missed; a dive on the note keeps it', () => {
  const late = diver(1300)
  assert.equal(late.s.nextNote, 1)
  assert.deepEqual(advanceRace(late.r, BEEP + 1600, rules), [])
  assert.equal(diver(1200).s.nextNote, 0)
  assert.equal(diver(1201).s.nextNote, 1)
})

test('a press on the block after the beep and a press after the finish are ignored', () => {
  const r = race(1)
  fireBeep(r, BEEP)
  assert.deepEqual(pressStroke(r, r.swimmers[0], 'left', BEEP + 1200, rules), { result: 'ignored', index: null })
  swim(r, 0, 'perfect')
  assert.equal(r.swimmers[0].phase, 'finished')
  assert.deepEqual(pressStroke(r, r.swimmers[0], 'left', BEEP + 60_000, rules), { result: 'ignored', index: null })
})

test('perfect notes beat good ones, skipping the breaths costs time, spamming both arms loses; finish times come from the server clock', () => {
  const time = (style: Style, until?: number) => {
    const r = race(1)
    swim(r, 0, style, 200, until)
    return r.swimmers[0]
  }
  const perfect = time('perfect')
  assert.equal(perfect.phase, 'finished')
  assert.equal(perfect.distanceM, 25)
  const best = perfect.timeMs as number
  assert.ok(best > 11_000 && best < 16_000, `25 m in ${best} ms`)
  const good = time('good').timeMs as number
  const noBreath = time('no_breath').timeMs as number
  assert.ok(good > best + 1000, `good ${good} against perfect ${best}`)
  assert.ok(noBreath > best && noBreath < good, `no breath ${noBreath}`)
  const spam = time('spam', BEEP + 40_000)
  assert.ok(spam.timeMs === null || spam.timeMs > good * 1.5, `spam ${spam.timeMs}`)
})

test('the rules refuse a rhythm where one press could hit two notes of the same arm', () => {
  assert.throws(() => parsePoolRules({ ...RAW, rhythm: { ...RAW.rhythm, intervalMs: [560, 200] } }), /same arm/)
  assert.throws(() => parsePoolRules({ ...RAW, rhythm: { ...RAW.rhythm, intervalMs: [300, 380] } }), /slow down/)
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
