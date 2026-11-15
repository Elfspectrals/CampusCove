export const EMOTE_TIME_SCALE = 1
export const EMOTE_STOP_KEY = 'Digit0'

export interface EmoteDef {
  id: string
  clip: string
  tier: number | null
}

export interface EmoteWheelRow extends EmoteDef {
  key: string
  locked: boolean
}

function parseEmote(raw: unknown, tier: number | null, what: string): EmoteDef {
  const e = raw as { id?: unknown; clip?: unknown }
  if (typeof e?.id !== 'string' || typeof e.clip !== 'string' || e.clip === '') throw new Error(`dance.json: invalid ${what}`)
  return { id: e.id, clip: e.clip, tier }
}

export function parseEmoteDefs(rules: unknown): EmoteDef[] {
  const r = rules as { freeEmotes?: unknown; unlockableEmotes?: unknown }
  if (!Array.isArray(r?.freeEmotes) || !Array.isArray(r.unlockableEmotes)) throw new Error('dance.json: missing freeEmotes or unlockableEmotes')
  return [
    ...r.freeEmotes.map((e, i) => parseEmote(e, null, `freeEmotes[${i}]`)),
    ...r.unlockableEmotes.map((e, i) => {
      const tier = (e as { tier?: unknown }).tier
      if (!Number.isInteger(tier)) throw new Error(`dance.json: invalid unlockableEmotes[${i}] tier`)
      return parseEmote(e, tier as number, `unlockableEmotes[${i}]`)
    }),
  ]
}

export function wheelRows(defs: readonly EmoteDef[], unlocked: ReadonlySet<string> | null): EmoteWheelRow[] {
  return defs.map((d, i) => ({ ...d, key: `Digit${i + 1}`, locked: d.tier !== null && !(unlocked?.has(d.id) ?? false) }))
}

export function clipOf(defs: readonly EmoteDef[], id: string): string | null {
  return defs.find((d) => d.id === id)?.clip ?? null
}
