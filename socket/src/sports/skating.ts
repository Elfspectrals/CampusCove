import { besideManifest, readManifest, readSportRules } from '../world.ts'
import { parseSignupRules } from './signup.ts'
import { registerFigureSkating } from './figureRink.ts'
import { parseFigureRules } from './figureSkating.ts'
import { parseSkatingRules } from './skatingSim.ts'
import { ICE_SKATES, RINK_PLAY_AREA, registerSkating } from './skatingRink.ts'

export function coachProp(decor: unknown, coachId: string, zone: string): { id: string, x: number, z: number } {
  const props = (decor as { props?: unknown } | null)?.props
  if (!Array.isArray(props)) throw new Error(`zones/${zone}.json: missing props`)
  const coach = props.find((p) => p?.coach === coachId)
  const [x, , z] = Array.isArray(coach?.position) ? coach.position : []
  if (![x, z].every(Number.isFinite)) throw new Error(`zones/${zone}.json: no coach prop ${coachId}`)
  return { id: coachId, x, z }
}

export async function loadSkating(): Promise<void> {
  const raw = await readSportRules('skating')
  if (typeof raw?.zone !== 'string' || typeof raw?.coachId !== 'string') throw new Error('skating rules: missing zone or coachId')
  const decor = await readManifest(besideManifest(`zones/${raw.zone}.json`))
  const rules = parseSkatingRules(raw)
  const coach = coachProp(decor, raw.coachId, raw.zone)
  const figure = await readSportRules('figure_skating')
  if (typeof figure?.venue !== 'string') throw new Error('figure skating rules: missing venue')
  registerFigureSkating(parseFigureRules(figure), figure.venue, raw.zone, coach, rules.rink, RINK_PLAY_AREA, ICE_SKATES, parseSignupRules(figure, 'figure skating').settings)
  registerSkating(rules, raw.zone, coach, parseSignupRules(raw, 'skating').settings, [figure.venue])
}
