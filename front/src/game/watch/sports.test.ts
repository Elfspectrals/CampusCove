import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sportsWatchScreen } from './sports.ts'
import type { SportsLobbyPayload } from '../../types/gameRealtime.ts'

const NOW = 1_800_000_000_000

function lobby(venue: string, phase: SportsLobbyPayload['phase'], sessions: string[], kickoffAt: number | null = null): SportsLobbyPayload {
  return {
    venue,
    coach: 'coach_gym',
    sport: 'football',
    phase,
    settings: {},
    players: sessions.map((sessionId, i) => ({ sessionId, name: sessionId, team: i % 2 === 0 ? 'red' : 'blue' })),
    min: 4,
    max: 6,
    kickoffAt,
    serverNow: NOW,
  }
}

test('sports watch: the pass shows only while it is still valid at the server time', () => {
  assert.equal(sportsWatchScreen(null, [], 'me', NOW).passUntil, null)
  assert.equal(sportsWatchScreen(NOW, [], 'me', NOW).passUntil, null)
  assert.equal(sportsWatchScreen(NOW + 1, [], 'me', NOW).passUntil, NOW + 1)
})

test('sports watch: only my lobbies, with the kick-off countdown rounded up and never below zero', () => {
  const lobbies = [
    lobby('gym_court', 'countdown', ['a', 'me', 'b', 'c'], NOW + 41_500),
    lobby('outdoor_pitch', 'open', ['x']),
  ]
  assert.deepEqual(sportsWatchScreen(null, lobbies, 'me', NOW).lobbies, [
    { venue: 'gym_court', sport: 'football', team: 'blue', phase: 'countdown', players: 4, min: 4, max: 6, secondsLeft: 42 },
  ])
  assert.equal(sportsWatchScreen(null, lobbies, 'me', NOW + 60_000).lobbies[0]?.secondsLeft, 0)
  assert.equal(sportsWatchScreen(null, [lobby('gym_court', 'open', ['me'])], 'me', NOW).lobbies[0]?.secondsLeft, null)
  assert.deepEqual(sportsWatchScreen(null, lobbies, 'nobody', NOW).lobbies, [])
})
