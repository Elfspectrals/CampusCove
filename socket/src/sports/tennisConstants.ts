export const TENNIS_ZONE = 'sports_tennis'
export const TENNIS_COACH = { id: 'tennis_coach', x: -443.5, z: -271.5 }
export const TENNIS_NET_Z = -271.5
export const TENNIS_COURTS = [
  { id: 'tennis_1', cx: -454.645 },
  { id: 'tennis_2', cx: -432.355 }
] as const

export const COURT_HALF_LENGTH = 11.885
export const SINGLES_HALF_WIDTH = 4.115
export const DOUBLES_HALF_WIDTH = 5.485
export const NET_HEIGHT = 0.914
export const NET_HALF_SPAN = 6.399
export const PLAY_AREA_SIDE_MARGIN = 1.5
export const PLAY_AREA_END_MARGIN = 4.0

export const GRAVITY = 9.81
export const BALL_RADIUS = 0.033
export const RESTITUTION = 0.75
export const BOUNCE_KEEP = 0.8

export const HIT_ALLOWANCE_MS = 150
export const SWING_AHEAD_MS = 350
export const TIMING_PERFECT_MS = [-60, 200] as const
export const TIMING_FLOOR = 0.5
export const CHARGE_MS = 1000
export const SMASH_SPEED = 25
export const PERFECT_QUALITY = 0.85
export const HIT_SAMPLE_MS = 10
export const REACH_M = 1.8
export const SWEET_M = 0.8
export const SWING_DRIFT_M = 0.5
export const HIT_MAX_HEIGHT = 2.8
export const DRIVE_SPEED = [11, 19] as const
export const LOB_SPEED = [6.5, 8.5] as const
export const SERVE_SPEED = [12, 20] as const
export const MISS_M = 4.0
export const NET_CLEAR_M = 0.35
export const CLEAR_QUALITY = 0.5
export const MIN_CONTACT_Y = 0.3
export const AIM_NET_GAP = 1.0
export const AIM_OUT_MARGIN = 3.0
export const OWN_HALF_TOLERANCE = 0.5

export const TOSS_START_Y = 1.8
export const TOSS_SPEED = 5.0
export const SERVE_WINDOW_MS = 400
export const SERVE_FLOOR = 0.3
export const SERVE_REACH_M = 1.0
export const TOSS_FALL_MS = 1100
export const SERVE_WAIT_MS = 10_000
export const POINT_PAUSE_MS = 2_000
export const TENNIS_HIT_COOLDOWN_MS = 400
export const TENNIS_WHIFF_RECOVERY_MS = 700
export const REJOIN_GRACE_MS = 10_000
export const BASELINE_STANDBY_M = 1.0
export const DOUBLES_SPREAD_M = 2.5
export const TENNIS_BALL_LOAN = 'tennis_ball'
export const BALL_BASKET_REACH = 2.5
export const BALL_BASKETS = [
  { court: 'tennis_1', x: -444.7, z: -266.0 },
  { court: 'tennis_2', x: -442.3, z: -266.0 }
] as const
export const TENNIS_GEAR = 'gear_tennis_racket'

export type ShotKind = 'drive' | 'lob' | 'topspin' | 'slice' | 'flat' | 'drop' | 'special'
export type CoveStroke = 'topspin' | 'slice' | 'flat' | 'lob' | 'drop'
export const COVE_STROKES: readonly CoveStroke[] = ['topspin', 'slice', 'flat', 'lob', 'drop']

export interface ShotSpec {
  speed: readonly [number, number]
  keep: number
  restitution: number
  netClearM: number
  maxDepthM: number | null
  smashes: boolean
}

export const SHOTS: Record<ShotKind, ShotSpec> = {
  drive: { speed: DRIVE_SPEED, keep: BOUNCE_KEEP, restitution: RESTITUTION, netClearM: NET_CLEAR_M, maxDepthM: null, smashes: true },
  lob: { speed: LOB_SPEED, keep: BOUNCE_KEEP, restitution: RESTITUTION, netClearM: NET_CLEAR_M, maxDepthM: null, smashes: false },
  topspin: { speed: [11, 19], keep: 0.88, restitution: 0.9, netClearM: 0.6, maxDepthM: null, smashes: true },
  slice: { speed: [9, 15], keep: 0.7, restitution: 0.45, netClearM: 0.3, maxDepthM: null, smashes: true },
  flat: { speed: [14, 23], keep: BOUNCE_KEEP, restitution: 0.7, netClearM: 0.15, maxDepthM: null, smashes: true },
  drop: { speed: [5, 7], keep: 0.5, restitution: 0.4, netClearM: 0.3, maxDepthM: 3.5, smashes: false },
  special: { speed: [28, 28], keep: BOUNCE_KEEP, restitution: RESTITUTION, netClearM: 0.2, maxDepthM: null, smashes: false }
}

export const GAUGE_FULL = 100
export const GAUGE_GAIN: Record<'smash' | 'perfect' | 'good', number> = { smash: 20, perfect: 25, good: 12 }
export const KNOCKED_RETURN_QUALITY = 0.3
export const KNOCK_BACK_M = 2
export const KNOCK_ROOT_MS = 800
