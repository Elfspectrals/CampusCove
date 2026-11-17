import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import type { SportsLobbyPayload } from '../../types/gameRealtime'
import {
  canSignUp,
  choosableSettings,
  choosesSettings,
  defaultSettings,
  kickoffSeconds,
  parseSignupSpec,
  shownLobby,
  signupMessage,
  teamRoster,
  venueChoices,
} from './sportsSignup.ts'

const RULES_DIR = new URL('../../../public/assets/sports/rules/', import.meta.url)

const football = parseSignupSpec(
  { signup: { teams: true, settings: [{ key: 'teamSize', label: 'Format', options: [2, 3] }, { key: 'durationSec', label: 'Length', options: [240, 360] }] } },
  'football',
)
const dance = parseSignupSpec(
  { signup: { teams: false, settings: [{ key: 'mode', label: 'Mode', options: ['solo', 'duel'] }, { key: 'song', label: 'Song', options: [] }] } },
  'dance',
)

const lobby = (extra: Partial<SportsLobbyPayload> = {}): SportsLobbyPayload => ({
  venue: 'gym_court',
  coach: 'gym_coach',
  sport: 'football',
  phase: 'open',
  settings: {},
  players: [],
  min: 4,
  max: 6,
  kickoffAt: null,
  ...extra,
})

test('every rules file with a coach sign-up parses', () => {
  const files = readdirSync(RULES_DIR).filter((f) => f.endsWith('.json'))
  assert.ok(files.length > 0)
  for (const file of files) {
    const raw = JSON.parse(readFileSync(new URL(file, RULES_DIR), 'utf8'))
    if (raw.signup === null) assert.throws(() => parseSignupSpec(raw, raw.sport), /signup: expected a coach sign-up block/)
    else assert.equal(typeof parseSignupSpec(raw, raw.sport).teams, 'boolean', file)
  }
})

test('a malformed sign-up block names the faulty field', () => {
  assert.throws(() => parseSignupSpec({ signup: { teams: 'yes', settings: [] } }, 'tennis'), /tennis.json signup.teams: expected true or false/)
  assert.throws(() => parseSignupSpec({ signup: { teams: true, settings: [{ key: 'mode', label: 'Mode', options: [{}] }] } }, 'tennis'), /signup.settings\[0\].options/)
})

test('settings with no option yet are not offered, the others start on their first option', () => {
  assert.deepEqual(choosableSettings(dance).map((s) => s.key), ['mode'])
  assert.deepEqual(defaultSettings(dance), { mode: 'solo' })
  assert.deepEqual(defaultSettings(football), { teamSize: 2, durationSec: 240 })
})

test('only the first player of an open lobby chooses the settings', () => {
  assert.equal(choosesSettings(lobby(), 'me'), true)
  assert.equal(choosesSettings(lobby({ players: [{ sessionId: 'a', name: 'Ann', team: 'red' }] }), 'me'), false)
  assert.equal(choosesSettings(lobby({ phase: 'playing' }), 'me'), false)
})

test('a player signs up once, before kick-off, while there is room', () => {
  const ann = { sessionId: 'a', name: 'Ann', team: 'red' as const }
  assert.equal(canSignUp(lobby(), 'me'), true)
  assert.equal(canSignUp(lobby({ players: [ann] }), 'a'), false)
  assert.equal(canSignUp(lobby({ phase: 'countdown', players: [ann] }), 'me'), true)
  assert.equal(canSignUp(lobby({ phase: 'playing' }), 'me'), false)
  assert.equal(canSignUp(lobby({ max: 1, players: [ann] }), 'me'), false)
})

test('the roster splits players by team', () => {
  const roster = teamRoster(lobby({ players: [{ sessionId: 'a', name: 'Ann', team: 'red' }, { sessionId: 'b', name: 'Bo', team: 'blue' }, { sessionId: 'c', name: 'Cy', team: 'red' }] }))
  assert.deepEqual([roster.red.map((p) => p.name), roster.blue.map((p) => p.name)], [['Ann', 'Cy'], ['Bo']])
})

test('the sign-up message carries the team for team sports and the settings for the first player only', () => {
  assert.deepEqual(signupMessage('gym_coach', 'gym_court', football, 'blue', { teamSize: 3, durationSec: 240 }), { coach: 'gym_coach', venue: 'gym_court', team: 'blue', settings: { teamSize: 3, durationSec: 240 } })
  assert.deepEqual(signupMessage('gym_coach', 'gym_court', football, 'red', null), { coach: 'gym_coach', venue: 'gym_court', team: 'red' })
  assert.deepEqual(signupMessage('dance_coach', 'dance_floor', dance, null, null), { coach: 'dance_coach', venue: 'dance_floor' })
  assert.throws(() => signupMessage('gym_coach', 'gym_court', football, null, null), /pick red or blue/)
})

test('the kick-off countdown counts whole seconds on the server clock and stops at zero', () => {
  assert.equal(kickoffSeconds(null, 0, 0), null)
  assert.equal(kickoffSeconds(60_000, 0, 0), 60)
  assert.equal(kickoffSeconds(60_000, 0, 500), 60)
  assert.equal(kickoffSeconds(60_000, 59_001, 0), 1)
  assert.equal(kickoffSeconds(60_000, 60_000, 0), 0)
  assert.equal(kickoffSeconds(60_000, 70_000, 0), 0)
})

test('a coach lists its venues in court order, numbered only when two share a sport', () => {
  const tennis = (venue: string) => lobby({ venue, coach: 'tennis_coach', sport: 'tennis' })
  const choices = venueChoices([tennis('tennis_10'), tennis('tennis_2'), lobby(), tennis('tennis_1')], 'tennis_coach')
  assert.deepEqual(choices.map((c) => [c.venue, c.court]), [['tennis_1', 1], ['tennis_2', 2], ['tennis_10', 3]])
  const gym = venueChoices([lobby(), lobby({ venue: 'gym_basket', sport: 'basketball' })], 'gym_coach')
  assert.deepEqual(gym.map((c) => [c.sport, c.court]), [['basketball', null], ['football', null]])
})

test('the panel shows the lobby you are in, else the venue you picked, else the only venue', () => {
  const one = lobby({ venue: 'tennis_1', coach: 'tennis_coach', sport: 'tennis' })
  const two = lobby({ venue: 'tennis_2', coach: 'tennis_coach', sport: 'tennis', players: [{ sessionId: 'me', name: 'Me', team: 'red' }] })
  assert.equal(shownLobby(venueChoices([one], 'tennis_coach'), null, 'me'), one)
  assert.equal(shownLobby(venueChoices([one, { ...two, players: [] }], 'tennis_coach'), null, 'me'), null)
  assert.equal(shownLobby(venueChoices([one, { ...two, players: [] }], 'tennis_coach'), 'tennis_1', 'me'), one)
  assert.equal(shownLobby(venueChoices([one, two], 'tennis_coach'), 'tennis_1', 'me'), two)
})
