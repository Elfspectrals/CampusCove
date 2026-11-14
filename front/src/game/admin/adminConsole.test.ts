import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventStatus, isLive, placesWithRecentFirst } from './adminConsole.ts'
import type { AdminEvents } from '../../types/gameRealtime.ts'

test('the last place used comes first, an unknown one changes nothing', () => {
  const places = [{ key: 'clinic', name: 'Clinic' }, { key: 'orchard', name: 'Orchard' }]
  assert.deepEqual(placesWithRecentFirst(places, 'orchard').map((p) => p.key), ['orchard', 'clinic'])
  assert.deepEqual(placesWithRecentFirst(places, 'gone').map((p) => p.key), ['clinic', 'orchard'])
  assert.deepEqual(placesWithRecentFirst(places, null).map((p) => p.key), ['clinic', 'orchard'])
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
