import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MARKET_MINUTE_STEPS,
  MONEY_STEPS,
  editsSearch,
  eventStatus,
  isHoldRow,
  isLive,
  moveOnHome,
  parentPage,
  placesWithRecentFirst,
  playerActions,
  playersByDistance,
  stepQuantity,
  stepThrough,
  typedQuery,
} from './adminWatch.ts'
import type { AdminEvents } from '../../types/gameRealtime.ts'

test('back goes one page up, and the home page has no parent', () => {
  assert.equal(parentPage({ kind: 'home' }), null)
  assert.deepEqual(parentPage({ kind: 'players' }), { kind: 'home' })
  assert.deepEqual(parentPage({ kind: 'player', sessionId: 'b' }), { kind: 'players' })
  assert.deepEqual(parentPage({ kind: 'money', sessionId: 'b' }), { kind: 'player', sessionId: 'b' })
  assert.deepEqual(parentPage({ kind: 'item', sessionId: 'b' }), { kind: 'player', sessionId: 'b' })
  assert.deepEqual(parentPage({ kind: 'market' }), { kind: 'events' })
  assert.deepEqual(parentPage({ kind: 'events' }), { kind: 'home' })
})

test('my own sheet only gives, another player can also be reached or brought', () => {
  assert.deepEqual(playerActions(true), ['money', 'item'])
  assert.deepEqual(playerActions(false), ['goto', 'bring', 'money', 'item'])
})

test('players are listed nearest first', () => {
  const far = { sessionId: 'f', pseudo: 'A', distance: 240, stars: 0 }
  const near = { sessionId: 'n', pseudo: 'Z', distance: 12, stars: 0 }
  assert.deepEqual(playersByDistance([far, near]).map((p) => p.sessionId), ['n', 'f'])
})

test('the last place used comes first, an unknown one changes nothing', () => {
  const places = [{ key: 'clinic', name: 'Clinic' }, { key: 'orchard', name: 'Orchard' }]
  assert.deepEqual(placesWithRecentFirst(places, 'orchard').map((p) => p.key), ['orchard', 'clinic'])
  assert.deepEqual(placesWithRecentFirst(places, 'gone').map((p) => p.key), ['clinic', 'orchard'])
  assert.deepEqual(placesWithRecentFirst(places, null).map((p) => p.key), ['clinic', 'orchard'])
})

test('amount steps: to the next preset, stuck at both ends, an amount between two presets snaps to them', () => {
  assert.equal(stepThrough(MONEY_STEPS, 500, 1), 1_000)
  assert.equal(stepThrough(MONEY_STEPS, 500, -1), 250)
  assert.equal(stepThrough(MONEY_STEPS, 50, -1), 50)
  assert.equal(stepThrough(MONEY_STEPS, 100_000, 1), 100_000)
  assert.equal(stepThrough(MONEY_STEPS, 700, 1), 1_000)
  assert.equal(stepThrough(MONEY_STEPS, 700, -1), 500)
  assert.equal(stepThrough(MARKET_MINUTE_STEPS, 10, 1), 15)
  assert.equal(stepThrough(MARKET_MINUTE_STEPS, 240, 1), 240)
})

test('quantity moves by one between 1 and the max', () => {
  assert.equal(stepQuantity(1, -1, 999), 1)
  assert.equal(stepQuantity(1, 1, 999), 2)
  assert.equal(stepQuantity(999, 1, 999), 999)
})

test('home tiles are a 2 by 2 grid', () => {
  assert.equal(moveOnHome(0, 'right'), 1)
  assert.equal(moveOnHome(0, 'down'), 2)
  assert.equal(moveOnHome(3, 'up'), 1)
  assert.equal(moveOnHome(0, 'up'), 0)
  assert.equal(moveOnHome(3, 'right'), 3)
  assert.equal(moveOnHome(3, 'down'), 3)
})

test('only collecting taxes and closing the market need a held Enter', () => {
  assert.equal(isHoldRow({ kind: 'events' }, 3), true)
  assert.equal(isHoldRow({ kind: 'events' }, 0), false)
  assert.equal(isHoldRow({ kind: 'market' }, 2), true)
  assert.equal(isHoldRow({ kind: 'market' }, 1), false)
  assert.equal(isHoldRow({ kind: 'players' }, 3), false)
})

test('item search: letters and digits type, space does not, Backspace erases only when there is text', () => {
  assert.equal(editsSearch('a', ''), true)
  assert.equal(editsSearch('7', ''), true)
  assert.equal(editsSearch(' ', 'ap'), false)
  assert.equal(editsSearch('ArrowUp', 'ap'), false)
  assert.equal(editsSearch('Backspace', ''), false)
  assert.equal(editsSearch('Backspace', 'ap'), true)
  assert.equal(typedQuery('ap', 'p'), 'app')
  assert.equal(typedQuery('app', 'Backspace'), 'ap')
})

test('event status: next time, sign-up, running, box number, market hours', () => {
  const events: AdminEvents = {
    quiz: { state: 'scheduled', startsAt: 1000 },
    storage: { state: 'running', index: 2, count: 9 },
    market: { open: false, opensAt: '2026-11-21T14:00:00Z', closesAt: '2026-11-21T16:00:00Z' },
  }
  assert.deepEqual(eventStatus('quiz', events), { key: 'scheduled', time: 1000 })
  assert.deepEqual(eventStatus('storage', events), { key: 'box', n: 3, count: 9 })
  assert.deepEqual(eventStatus('market', events), { key: 'closed', time: '2026-11-21T14:00:00Z' })
  assert.deepEqual(eventStatus('taxes', events), { key: 'none' })
  assert.deepEqual(eventStatus('quiz', { ...events, quiz: { state: 'registration', startsAt: 5 } }), { key: 'registration', time: 5 })
  assert.deepEqual(eventStatus('quiz', { ...events, quiz: { state: 'running', startsAt: 5 } }), { key: 'running' })
  assert.deepEqual(eventStatus('market', { ...events, market: { ...events.market!, open: true } }), { key: 'open', time: '2026-11-21T16:00:00Z' })
  assert.deepEqual(eventStatus('market', { ...events, market: null }), { key: 'unknown' })
  assert.equal(isLive({ key: 'box', n: 1, count: 2 }), true)
  assert.equal(isLive({ key: 'scheduled', time: 1 }), false)
})
