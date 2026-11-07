/**
 * The body a player builds in the character creator (docs/CHARACTER.md): sex, preset face and build. Every body fit
 * shares one skeleton, so a look only changes which files load and which face mesh shows, never the animations.
 */
export type CharacterSex = 'm' | 'f'
export type CharacterBuild = 'slim' | 'normal' | 'broad'

export interface CharacterLook {
  sex: CharacterSex
  /** 1..FACE_COUNT */
  face: number
  build: CharacterBuild
}

export const SEXES: readonly CharacterSex[] = ['m', 'f']
export const BUILDS: readonly CharacterBuild[] = ['slim', 'normal', 'broad']
export const FACE_COUNT = 6
export const HAIRCUTS = ['basic', 'short', 'long', 'curly', 'buzz', 'ponytail'] as const
export type Haircut = (typeof HAIRCUTS)[number]

/** What the game shows for a player who has no character yet (or sent a bad one). */
export const DEFAULT_LOOK: CharacterLook = { sex: 'm', face: 1, build: 'normal' }

export const SKIN_TONES = ['#F6D7C3', '#EBC1A0', '#D9A47E', '#C68E62', '#A86F48', '#8A5534', '#6B3F25', '#4B2C1A'] as const
export const HAIR_COLORS = ['#1C1512', '#3B2618', '#5E3B22', '#8A5A33', '#C08A4E', '#E3C17F', '#B8432F', '#9A9A9A', '#E8E4DC', '#5B6FD6'] as const

/** Body / piece files of the reference fit end in model.glb; other fits in model_<fit>.glb next to it. */
const REFERENCE_FIT = 'm_normal'
const FITTED_SLOTS = new Set(['top', 'bottom'])

export function fitOf(look: CharacterLook | null): string {
  const l = look ?? DEFAULT_LOOK
  return `${l.sex}_${l.build}`
}

function withFit(url: string, fit: string): string {
  return fit === REFERENCE_FIT ? url : url.replace(/\/model\.glb$/, `/model_${fit}.glb`)
}

/** File of a wear piece for this body; hair, head accessories and shoes have one file for every body. */
export function pieceUrlFor(slot: string, url: string, look: CharacterLook | null): string {
  return FITTED_SLOTS.has(slot) ? withFit(url, fitOf(look)) : url
}

export function bodyUrlFor(baseUrl: string, look: CharacterLook | null): string {
  return withFit(baseUrl, fitOf(look))
}

/** What the creator dresses a new player in (Laravel CharacterAppearanceService::NEWCOMER_OUTFIT). */
export const NEWCOMER_OUTFIT = {
  top: '/assets/wear/top/newcomer/model.glb',
  bottom: '/assets/wear/bottom/newcomer/model.glb',
  shoes: '/assets/wear/shoes/newcomer/model.glb',
} as const

export function hairUrl(cut: Haircut): string {
  return `/assets/wear/hair/${cut}/model.glb`
}

export function haircutOfUrl(url: string | null | undefined): Haircut | null {
  const key = /^\/assets\/wear\/hair\/([a-z_]+)\/model\.glb$/.exec(url ?? '')?.[1]
  return (HAIRCUTS as readonly string[]).includes(key ?? '') ? (key as Haircut) : null
}

/** The whole look or null, like the socket's normalizeCharacter: one bad field drops it. */
export function parseCharacterLook(raw: unknown): CharacterLook | null {
  if (!raw || typeof raw !== 'object') return null
  const { sex, face, build } = raw as Record<string, unknown>
  if (!SEXES.includes(sex as CharacterSex) || !BUILDS.includes(build as CharacterBuild)) return null
  if (typeof face !== 'number' || !Number.isInteger(face) || face < 1 || face > FACE_COUNT) return null
  return { sex: sex as CharacterSex, face, build: build as CharacterBuild }
}

function pick<T>(list: readonly T[], rnd: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rnd() * list.length))]!
}

export interface CreatorChoice extends CharacterLook {
  hair: Haircut
  skinColor: string
  hairColor: string
}

/** "Surprise me" in the creator. */
export function randomChoice(rnd: () => number = Math.random): CreatorChoice {
  const sex = pick(SEXES, rnd)
  return {
    sex,
    face: 1 + Math.min(FACE_COUNT - 1, Math.floor(rnd() * FACE_COUNT)),
    build: pick(BUILDS, rnd),
    hair: pick(HAIRCUTS, rnd),
    skinColor: pick(SKIN_TONES, rnd),
    hairColor: pick(HAIR_COLORS, rnd),
  }
}
