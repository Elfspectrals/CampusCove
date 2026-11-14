import type { Bounds } from '../types.ts'
import type { MatchResult } from './venues.ts'

export const DANCE_LANES = 4
export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const
export const DANCE_MODES = ['solo', 'team', 'duel'] as const

export type Difficulty = (typeof DIFFICULTIES)[number]
export type DanceMode = (typeof DANCE_MODES)[number]
export type Judgement = 'perfect' | 'good' | 'miss'

export interface DanceSong {
  id: string
  name: string
  bpm: number
  lengthSec: number
  charts: Record<Difficulty, { stepBeats: number }>
}

export interface DanceVenuePoints {
  coach: { x: number, z: number }
  playArea: Bounds
  spots: { x: number, z: number }[]
}

export interface DanceRules {
  songs: DanceSong[]
  maxPlayers: number
  windowsMs: { perfect: number, good: number }
  allowanceMs: number
  points: { perfect: number, good: number }
  comboForDouble: number
  syncBonus: number
  leadInMs: number
  laneCooldownMs: number
  venue: DanceVenuePoints
}

export interface Note {
  t: number
  lane: number
}

export interface Dancer {
  accountId: number
  sessionId: string
  name: string
  judged: (Judgement | null)[]
  lastPressAt: number[]
  score: number
  combo: number
  maxCombo: number
  counts: Record<Judgement, number>
  out: boolean
}

export interface DanceGame {
  mode: DanceMode
  song: DanceSong
  difficulty: Difficulty
  startAt: number
  notes: Note[]
  dancers: Dancer[]
  synced: Set<number>
  syncScore: number
}

export interface JudgedNote {
  dancer: Dancer
  index: number
  judgement: Judgement
  synced: boolean
}

type Json = Record<string, unknown>

function fail(what: string): never {
  throw new Error(`sports/rules/dance.json: invalid ${what}`)
}

function positive(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) fail(what)
  return v
}

function point(v: unknown, what: string): { x: number, z: number } {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite)) fail(what)
  return { x: v[0], z: v[1] }
}

function parseSong(raw: unknown): DanceSong {
  const s = raw as Json
  if (typeof s?.id !== 'string' || !/^[a-z_]+$/.test(s.id) || typeof s.name !== 'string') fail('song id or name')
  const charts = s.charts as Json
  const parsed = Object.fromEntries(DIFFICULTIES.map((d) => [d, { stepBeats: positive((charts?.[d] as Json)?.stepBeats, `${s.id} chart ${d}`) }]))
  return { id: s.id, name: s.name, bpm: positive(s.bpm, `${s.id} bpm`), lengthSec: positive(s.lengthSec, `${s.id} lengthSec`), charts: parsed as DanceSong['charts'] }
}

function parseVenue(raw: unknown): DanceVenuePoints {
  const v = raw as Json
  const area = v?.playArea as Json
  const b = { minX: area?.minX, maxX: area?.maxX, minZ: area?.minZ, maxZ: area?.maxZ }
  if (!Object.values(b).every(Number.isFinite) || (b.minX as number) >= (b.maxX as number) || (b.minZ as number) >= (b.maxZ as number)) fail('venue playArea')
  if (!Array.isArray(v.spots) || v.spots.length === 0) fail('venue spots')
  return { coach: point(v.coach, 'venue coach'), playArea: b as Bounds, spots: v.spots.map((p, i) => point(p, `venue spot ${i}`)) }
}

export function parseDanceRules(raw: unknown): DanceRules {
  const r = raw as Json
  if (r?.sport !== 'dance' || r.status !== 'ready') fail('sport or status')
  if (!Array.isArray(r.songs) || r.songs.length === 0) fail('songs')
  const windows = r.windowsMs as Json
  const points = r.points as Json
  const rules: DanceRules = {
    songs: r.songs.map(parseSong),
    maxPlayers: positive(r.maxPlayers, 'maxPlayers'),
    windowsMs: { perfect: positive(windows?.perfect, 'windowsMs.perfect'), good: positive(windows?.good, 'windowsMs.good') },
    allowanceMs: positive(r.allowanceMs, 'allowanceMs'),
    points: { perfect: positive(points?.perfect, 'points.perfect'), good: positive(points?.good, 'points.good') },
    comboForDouble: positive(r.comboForDouble, 'comboForDouble'),
    syncBonus: positive(r.syncBonus, 'syncBonus'),
    leadInMs: positive(r.leadInMs, 'leadInMs'),
    laneCooldownMs: positive(r.laneCooldownMs, 'laneCooldownMs'),
    venue: parseVenue(r.venue)
  }
  if (rules.windowsMs.perfect >= rules.windowsMs.good) fail('windowsMs (perfect must be under good)')
  if (rules.venue.spots.length < rules.maxPlayers) fail('venue spots (fewer than maxPlayers)')
  return rules
}

function seededRandom(seed: string): () => number {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let t = Math.imul(h ^ (h >>> 15), 1 | h)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const INTRO_BEATS = 4
export const OUTRO_BEATS = 2

export function beatMs(song: DanceSong): number {
  return 60_000 / song.bpm
}

export function songLengthMs(song: DanceSong): number {
  return song.lengthSec * 1000
}

export function buildChart(song: DanceSong, difficulty: Difficulty): Note[] {
  const random = seededRandom(`${song.id}:${difficulty}`)
  const beat = beatMs(song)
  const step = beat * song.charts[difficulty].stepBeats
  const last = songLengthMs(song) - OUTRO_BEATS * beat
  const notes: Note[] = []
  for (let t = INTRO_BEATS * beat; t <= last; t += step) {
    const prev = notes.slice(-2).map((n) => n.lane)
    let lane = Math.floor(random() * DANCE_LANES)
    if (prev.length === 2 && prev[0] === lane && prev[1] === lane) lane = (lane + 1 + Math.floor(random() * (DANCE_LANES - 1))) % DANCE_LANES
    notes.push({ t: Math.round(t), lane })
  }
  return notes
}

export function newDancer(accountId: number, sessionId: string, name: string, noteCount: number): Dancer {
  return {
    accountId,
    sessionId,
    name,
    judged: new Array(noteCount).fill(null),
    lastPressAt: new Array(DANCE_LANES).fill(Number.NEGATIVE_INFINITY),
    score: 0,
    combo: 0,
    maxCombo: 0,
    counts: { perfect: 0, good: 0, miss: 0 },
    out: false
  }
}

export function newDanceGame(mode: DanceMode, song: DanceSong, difficulty: Difficulty, startAt: number, dancers: { accountId: number, sessionId: string, name: string }[]): DanceGame {
  const notes = buildChart(song, difficulty)
  return {
    mode,
    song,
    difficulty,
    startAt,
    notes,
    dancers: dancers.map((d) => newDancer(d.accountId, d.sessionId, d.name, notes.length)),
    synced: new Set(),
    syncScore: 0
  }
}

export function pressError(noteT: number, songMs: number, allowanceMs: number): number {
  if (noteT > songMs) return noteT - songMs
  if (noteT < songMs - allowanceMs) return songMs - allowanceMs - noteT
  return 0
}

function comboMultiplier(combo: number, rules: DanceRules): number {
  return 1 + Math.min(combo, rules.comboForDouble) / rules.comboForDouble
}

function award(game: DanceGame, dancer: Dancer, index: number, judgement: Judgement, rules: DanceRules): JudgedNote {
  dancer.judged[index] = judgement
  dancer.counts[judgement] += 1
  if (judgement === 'miss') {
    dancer.combo = 0
  } else {
    dancer.combo += 1
    dancer.maxCombo = Math.max(dancer.maxCombo, dancer.combo)
    dancer.score += Math.round(rules.points[judgement] * comboMultiplier(dancer.combo - 1, rules))
  }
  return { dancer, index, judgement, synced: checkSync(game, index, rules) }
}

function checkSync(game: DanceGame, index: number, rules: DanceRules): boolean {
  if (game.mode !== 'team' || game.synced.has(index)) return false
  const active = game.dancers.filter((d) => !d.out)
  if (active.length < 2 || !active.every((d) => d.judged[index] === 'perfect' || d.judged[index] === 'good')) return false
  game.synced.add(index)
  game.syncScore += rules.syncBonus
  return true
}

export type PressOutcome = { kind: 'judged', judged: JudgedNote } | { kind: 'stray' } | { kind: 'ignored' }

export function pressLane(game: DanceGame, dancer: Dancer, lane: number, now: number, rules: DanceRules): PressOutcome {
  if (dancer.out || !Number.isInteger(lane) || lane < 0 || lane >= DANCE_LANES) return { kind: 'ignored' }
  const songMs = now - game.startAt
  if (songMs < -rules.windowsMs.good || now - dancer.lastPressAt[lane] < rules.laneCooldownMs) return { kind: 'ignored' }
  dancer.lastPressAt[lane] = now
  const index = game.notes.findIndex((n, i) => n.lane === lane && dancer.judged[i] === null && pressError(n.t, songMs, rules.allowanceMs) <= rules.windowsMs.good)
  if (index < 0) {
    dancer.combo = 0
    return { kind: 'stray' }
  }
  const error = pressError(game.notes[index].t, songMs, rules.allowanceMs)
  return { kind: 'judged', judged: award(game, dancer, index, error <= rules.windowsMs.perfect ? 'perfect' : 'good', rules) }
}

export function expireNotes(game: DanceGame, now: number, rules: DanceRules): JudgedNote[] {
  const songMs = now - game.startAt
  const deadline = songMs - rules.allowanceMs - rules.windowsMs.good
  const missed: JudgedNote[] = []
  for (const dancer of game.dancers) {
    if (dancer.out) continue
    game.notes.forEach((n, i) => {
      if (n.t < deadline && dancer.judged[i] === null) missed.push(award(game, dancer, i, 'miss', rules))
    })
  }
  return missed
}

export function songOver(game: DanceGame, now: number, rules: DanceRules): boolean {
  const lastNote = game.notes.length ? game.notes[game.notes.length - 1].t : 0
  const songMs = now - game.startAt
  return songMs >= songLengthMs(game.song) && songMs > lastNote + rules.allowanceMs + rules.windowsMs.good
}

export function teamScore(game: DanceGame): number {
  return game.dancers.reduce((sum, d) => sum + d.score, 0) + game.syncScore
}

export function fullCombo(dancer: Dancer): boolean {
  return dancer.counts.miss === 0 && dancer.judged.every((j) => j !== null)
}

export function danceRunRecord(game: DanceGame, ref: string, endedAt: number) {
  return {
    ref,
    song: game.song.id,
    difficulty: game.difficulty,
    mode: game.mode,
    endedAt,
    teamScore: game.mode === 'team' ? teamScore(game) : null,
    dancers: game.dancers.map((d) => ({ accountId: d.accountId, score: d.score, fullCombo: fullCombo(d), finished: !d.out }))
  }
}

export function danceResults(game: DanceGame): MatchResult[] {
  const active = game.dancers.filter((d) => !d.out)
  if (game.mode === 'solo' || game.mode === 'team') {
    const score = (d: Dancer) => (game.mode === 'team' && !d.out ? teamScore(game) : d.score)
    return game.dancers.map((d) => ({ accountId: d.accountId, team: null, result: d.out ? 'dnf' : 'finished', score: score(d) }))
  }
  const ranked = [...active].sort((a, b) => b.score - a.score)
  const best = ranked.length ? ranked[0].score : 0
  const tiedTop = ranked.filter((d) => d.score === best).length
  return game.dancers.map((d) => {
    if (d.out) return { accountId: d.accountId, team: null, result: 'dnf', score: d.score }
    const place = 1 + ranked.filter((o) => o.score > d.score).length
    const result = d.score < best ? 'loss' : tiedTop > 1 ? 'draw' : 'win'
    return { accountId: d.accountId, team: null, result, place, score: d.score }
  })
}
