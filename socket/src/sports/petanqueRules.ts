import type { Bounds } from '../types.ts'
import type { PetanquePhysics } from './petanqueSim.ts'
import { type SettingSpec, parseSignupRules } from './signup.ts'

export interface PetanqueFormat {
  id: string
  teamSize: number
  boules: number
}

export interface PetanquePiste {
  id: string
  bounds: Bounds
}

export interface PetanqueRules extends PetanquePhysics {
  zone: string
  coachId: string
  coach: { x: number, z: number }
  settings: SettingSpec[]
  pistes: PetanquePiste[]
  formats: PetanqueFormat[]
  circleFromEndM: number
  circleReachM: number
  shotClockMs: number
  endPauseMs: number
  riseMs: number
  rejoinGraceMs: number
  gear: string
}

function finite(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`petanque rules: invalid ${what}`)
  return value
}

function positive(value: unknown, what: string): number {
  const n = finite(value, what)
  if (n <= 0) throw new Error(`petanque rules: ${what} must be positive`)
  return n
}

function pair(value: unknown, what: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`petanque rules: invalid ${what}`)
  return [finite(value[0], what), finite(value[1], what)]
}

function parsePiste(raw: unknown): PetanquePiste {
  const { id, centre, sizeM } = (raw ?? {}) as { id?: unknown, centre?: unknown, sizeM?: unknown }
  if (typeof id !== 'string' || id === '') throw new Error('petanque rules: piste without id')
  const [x, z] = pair(centre, `${id} centre`)
  const [w, l] = pair(sizeM, `${id} sizeM`)
  return { id, bounds: { minX: x - w / 2, maxX: x + w / 2, minZ: z - l / 2, maxZ: z + l / 2 } }
}

function parseFormat(raw: unknown): PetanqueFormat {
  const { id, teamSize, boules } = (raw ?? {}) as { id?: unknown, teamSize?: unknown, boules?: unknown }
  if (typeof id !== 'string' || !Number.isInteger(teamSize) || !Number.isInteger(boules) || (teamSize as number) < 1 || (boules as number) < 1) {
    throw new Error(`petanque rules: invalid format ${JSON.stringify(raw)}`)
  }
  return { id, teamSize: teamSize as number, boules: boules as number }
}

export function parsePetanqueRules(raw: unknown): PetanqueRules {
  const r = (raw ?? {}) as Record<string, any>
  if (r.sport !== 'petanque' || r.status !== 'ready') throw new Error('petanque rules: not a ready petanque file')
  if (typeof r.zone !== 'string' || typeof r.coachId !== 'string') throw new Error('petanque rules: missing zone or coachId')
  const { settings } = parseSignupRules(r, 'petanque rules')
  const formats = (Array.isArray(r.formats) ? r.formats : []).map(parseFormat)
  const pistes = (Array.isArray(r.pistes) ? r.pistes : []).map(parsePiste)
  const formatSetting = settings.find((s) => s.key === 'format')
  const targetSetting = settings.find((s) => s.key === 'targetPoints')
  if (!formatSetting || !formatSetting.options.every((o) => formats.some((f) => f.id === o))) throw new Error('petanque rules: format options without a format')
  if (!targetSetting || !targetSetting.options.every((o) => Number.isInteger(o) && (o as number) > 0)) throw new Error('petanque rules: invalid targetPoints options')
  if (pistes.length === 0) throw new Error('petanque rules: no piste')
  if (!Array.isArray(r.gear) || typeof r.gear[0] !== 'string') throw new Error('petanque rules: missing gear')
  const t = r.throw ?? {}
  const [coachX, coachZ] = pair(r.coach, 'coach')
  return {
    zone: r.zone,
    coachId: r.coachId,
    coach: { x: coachX, z: coachZ },
    settings,
    pistes,
    formats,
    boule: { radiusM: positive(r.boule?.radiusM, 'boule.radiusM'), massKg: positive(r.boule?.massKg, 'boule.massKg') },
    jack: {
      radiusM: positive(r.jack?.radiusM, 'jack.radiusM'),
      massKg: positive(r.jack?.massKg, 'jack.massKg'),
      throwDistanceRangeM: pair(r.jack?.throwDistanceRangeM, 'jack.throwDistanceRangeM'),
      minSideGapM: positive(r.jack?.minSideGapM, 'jack.minSideGapM')
    },
    ground: { rollingDecelMs2: positive(r.ground?.rollingDecelMs2, 'ground.rollingDecelMs2'), restitution: positive(r.ground?.restitution, 'ground.restitution') },
    throw: {
      maxDistanceM: positive(t.maxDistanceM, 'throw.maxDistanceM'),
      maxAimDeg: positive(t.maxAimDeg, 'throw.maxAimDeg'),
      pointLandFraction: positive(t.pointLandFraction, 'throw.pointLandFraction'),
      shootSpeedMs: positive(t.shootSpeedMs, 'throw.shootSpeedMs'),
      shootKeepFraction: positive(t.shootKeepFraction, 'throw.shootKeepFraction'),
      pointApexM: positive(t.pointApexM, 'throw.pointApexM'),
      shootApexM: positive(t.shootApexM, 'throw.shootApexM'),
      aimScatterDeg: positive(t.aimScatterDeg, 'throw.aimScatterDeg'),
      powerScatter: positive(t.powerScatter, 'throw.powerScatter'),
      carreauRadiusM: positive(t.carreauRadiusM, 'throw.carreauRadiusM')
    },
    circleFromEndM: positive(t.circleFromEndM, 'throw.circleFromEndM'),
    circleReachM: positive(t.circleReachM, 'throw.circleReachM'),
    shotClockMs: positive(t.shotClockSec, 'throw.shotClockSec') * 1000,
    endPauseMs: positive(r.endPauseSec, 'endPauseSec') * 1000,
    riseMs: positive(r.powerMeter?.riseMs, 'powerMeter.riseMs'),
    rejoinGraceMs: positive(r.rejoinGraceSec, 'rejoinGraceSec') * 1000,
    gear: r.gear[0]
  }
}
