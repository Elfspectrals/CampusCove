import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  type EntrantInput,
  type SettingSpec,
  expireAway,
  forfeit,
  joinLobby,
  leaveLobby,
  lobbyDue,
  markAway,
  markBack,
  openLobby,
  parseSignupRules,
  rebalance,
  startMatch,
  validateSettings
} from './signup.ts'
import { KICKOFF_COUNTDOWN_MS, LOBBY_IDLE_CANCEL_MS } from './sportsConstants.ts'

const SPEC: SettingSpec[] = [
  { key: 'mode', label: 'Mode', options: ['singles', 'doubles'] },
  { key: 'length', label: 'Length', options: [5, 10] }
]

function entrant(accountId: number, team: 'red' | 'blue' | null = 'red'): EntrantInput {
  return { sessionId: `s${accountId}`, accountId, name: `P${accountId}`, team }
}

test('the first player settings must use the listed options, every key once', () => {
  assert.deepEqual(validateSettings(SPEC, { mode: 'doubles', length: 10 }), { mode: 'doubles', length: 10 })
  assert.equal(validateSettings(SPEC, { mode: 'triples', length: 10 }), null)
  assert.equal(validateSettings(SPEC, { mode: 'singles', length: '10' }), null)
  assert.equal(validateSettings(SPEC, { mode: 'singles' }), null)
  assert.equal(validateSettings(SPEC, { mode: 'singles', length: 5, extra: 1 }), null)
  assert.equal(validateSettings(SPEC, undefined), null)
  assert.equal(validateSettings(SPEC, ['singles', 5]), null)
  assert.deepEqual(validateSettings([], undefined), {})
})

test('the signup block of a sport rules file is parsed and malformed ones throw', () => {
  const rules = { signup: { teams: true, settings: [{ key: 'mode', label: 'Mode', options: ['singles', 'doubles'] }] } }
  assert.deepEqual(parseSignupRules(rules, 'tennis'), { teams: true, settings: rules.signup.settings })
  assert.throws(() => parseSignupRules({}, 'tennis'), /signup block/)
  assert.throws(() => parseSignupRules({ signup: { teams: true, settings: [{ key: 'mode', label: 'Mode', options: [] }] } }, 'tennis'))
  const twice = { key: 'mode', label: 'Mode', options: ['a'] }
  assert.throws(() => parseSignupRules({ signup: { teams: false, settings: [twice, twice] } }, 'tennis'), /duplicate/)
})

test('a full lobby kicks off at once', () => {
  const lobby = openLobby('court', 'court', {}, { min: 2, max: 2 }, entrant(1, 'red'), 0)
  assert.equal(lobbyDue(lobby, 0), null)
  assert.equal(joinLobby(lobby, entrant(2, 'blue'), 1000), 'joined')
  assert.equal(lobby.kickoffAt, 1000)
  assert.equal(lobbyDue(lobby, 1000), 'kickoff')
  assert.equal(joinLobby(lobby, entrant(3), 1000), 'full')
})

test('reaching the minimum starts a 60 s countdown that later sign-ups do not restart', () => {
  const lobby = openLobby('court', 'court', {}, { min: 2, max: 4 }, entrant(1), 0)
  assert.equal(lobby.phase, 'open')
  joinLobby(lobby, entrant(2), 5000)
  assert.equal(lobby.phase, 'countdown')
  assert.equal(lobby.kickoffAt, 5000 + KICKOFF_COUNTDOWN_MS)
  joinLobby(lobby, entrant(3), 30_000)
  assert.equal(lobby.kickoffAt, 5000 + KICKOFF_COUNTDOWN_MS)
  assert.equal(lobbyDue(lobby, 5000 + KICKOFF_COUNTDOWN_MS - 1), null)
  assert.equal(lobbyDue(lobby, 5000 + KICKOFF_COUNTDOWN_MS), 'kickoff')
})

test('dropping under the minimum stops the countdown', () => {
  const lobby = openLobby('court', 'court', {}, { min: 2, max: 4 }, entrant(1), 0)
  joinLobby(lobby, entrant(2), 0)
  assert.equal(leaveLobby(lobby, 2, 10), true)
  assert.equal(lobby.phase, 'open')
  assert.equal(lobby.kickoffAt, null)
  assert.equal(leaveLobby(lobby, 99, 10), false)
})

test('a solo race with a minimum of 1 counts down from the first sign-up', () => {
  const lobby = openLobby('track', 'track', {}, { min: 1, max: 8 }, entrant(1, null), 0)
  assert.equal(lobby.kickoffAt, KICKOFF_COUNTDOWN_MS)
})

test('a lobby under the minimum is cancelled 5 minutes after the last sign-up', () => {
  const lobby = openLobby('court', 'court', {}, { min: 3, max: 4 }, entrant(1), 0)
  joinLobby(lobby, entrant(2), 60_000)
  assert.equal(lobbyDue(lobby, LOBBY_IDLE_CANCEL_MS), null)
  assert.equal(lobbyDue(lobby, 60_000 + LOBBY_IDLE_CANCEL_MS - 1), null)
  assert.equal(lobbyDue(lobby, 60_000 + LOBBY_IDLE_CANCEL_MS), 'cancel')
})

test('a lobby in countdown is never cancelled for being idle', () => {
  const lobby = openLobby('court', 'court', {}, { min: 1, max: 4 }, entrant(1), 0)
  lobby.kickoffAt = LOBBY_IDLE_CANCEL_MS * 2
  assert.equal(lobbyDue(lobby, LOBBY_IDLE_CANCEL_MS), null)
})

test('the same account cannot sign up twice for one lobby', () => {
  const lobby = openLobby('court', 'court', {}, { min: 2, max: 4 }, entrant(1), 0)
  assert.equal(joinLobby(lobby, { ...entrant(1), sessionId: 'other' }, 10), 'already_signed')
  assert.equal(lobby.entrants.length, 1)
})

test('at kick-off the last signed-up players of a team 2 bigger move to the other team', () => {
  const lobby = openLobby('court', 'court', {}, { min: 2, max: 10 }, entrant(1, 'red'), 0)
  for (const id of [2, 3, 4, 5]) joinLobby(lobby, entrant(id, 'red'), id)
  joinLobby(lobby, entrant(6, 'blue'), 6)
  const teams = Object.fromEntries(rebalance(lobby.entrants).map((e) => [e.accountId, e.team]))
  assert.deepEqual(teams, { 1: 'red', 2: 'red', 3: 'red', 4: 'blue', 5: 'blue', 6: 'blue' })
})

test('a one-player difference is left as it is, and solo entrants keep no team', () => {
  const lobby = openLobby('court', 'court', {}, { min: 2, max: 10 }, entrant(1, 'red'), 0)
  joinLobby(lobby, entrant(2, 'red'), 1)
  joinLobby(lobby, entrant(3, 'blue'), 2)
  assert.deepEqual(rebalance(lobby.entrants).map((e) => e.team), ['red', 'red', 'blue'])
  const solo = openLobby('track', 'track', {}, { min: 1, max: 8 }, entrant(1, null), 0)
  joinLobby(solo, entrant(2, null), 1)
  assert.deepEqual(rebalance(solo.entrants).map((e) => e.team), [null, null])
})

test('a match starts with the rebalanced teams', () => {
  const lobby = openLobby('court', 'court', { mode: 'singles' }, { min: 2, max: 4 }, entrant(1, 'red'), 0)
  joinLobby(lobby, entrant(2, 'red'), 1)
  joinLobby(lobby, entrant(3, 'red'), 2)
  const match = startMatch(lobby, 'm1', 'tennis', 100)
  assert.equal(match.startedAt, 100)
  assert.deepEqual(match.settings, { mode: 'singles' })
  assert.deepEqual(match.players.map((p) => p.team), ['red', 'red', 'blue'])
})

function twoVsTwo() {
  const lobby = openLobby('court', 'court', {}, { min: 2, max: 4 }, entrant(1, 'red'), 0)
  joinLobby(lobby, entrant(2, 'red'), 1)
  joinLobby(lobby, entrant(3, 'blue'), 2)
  joinLobby(lobby, entrant(4, 'blue'), 3)
  return startMatch(lobby, 'm1', 'football', 10)
}

test('a player back within the rejoin grace plays on, even from a new session', () => {
  const match = twoVsTwo()
  assert.equal(markAway(match, 3, 1000), true)
  assert.deepEqual(expireAway(match, 1000 + 29_999, 30_000), [])
  assert.equal(markBack(match, 3, 'reconnected'), true)
  assert.equal(match.players[2].sessionId, 'reconnected')
  assert.deepEqual(expireAway(match, 1000 + 30_000, 30_000), [])
})

test('past the rejoin grace the player is out, and a team at 0 loses', () => {
  const match = twoVsTwo()
  markAway(match, 3, 0)
  markAway(match, 4, 10_000)
  assert.deepEqual(expireAway(match, 30_000, 30_000).map((p) => p.accountId), [3])
  assert.equal(forfeit(match, true), null)
  assert.deepEqual(expireAway(match, 40_000, 30_000).map((p) => p.accountId), [4])
  assert.deepEqual(forfeit(match, true), { loser: 'blue' })
  assert.equal(markBack(match, 4, 's4'), false)
})

test('both teams empty is a forfeit with no winner', () => {
  const match = twoVsTwo()
  for (const p of match.players) p.out = true
  assert.deepEqual(forfeit(match, true), { loser: null })
})

test('a solo racer who leaves with a grace of 0 is out at once (did not finish)', () => {
  const lobby = openLobby('track', 'track', {}, { min: 1, max: 8 }, entrant(1, null), 0)
  joinLobby(lobby, entrant(2, null), 1)
  const match = startMatch(lobby, 'm2', 'running', 10)
  markAway(match, 1, 500)
  assert.deepEqual(expireAway(match, 500, 0).map((p) => p.accountId), [1])
  assert.equal(forfeit(match, false), null)
  markAway(match, 2, 600)
  expireAway(match, 600, 0)
  assert.deepEqual(forfeit(match, false), { loser: null })
})

test('marking away twice keeps the first time', () => {
  const match = twoVsTwo()
  markAway(match, 1, 100)
  assert.equal(markAway(match, 1, 5000), false)
  assert.equal(match.players[0].awaySince, 100)
})
