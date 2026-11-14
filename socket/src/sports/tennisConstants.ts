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
export const HIT_SAMPLE_MS = 10
export const REACH_M = 1.6
export const SWEET_M = 0.6
export const HIT_MAX_HEIGHT = 2.8
export const DRIVE_SPEED = [10, 20] as const
export const LOB_SPEED = [6.5, 8.5] as const
export const SERVE_SPEED = [12, 22] as const
export const MISS_M = 4.0
export const MIN_CONTACT_Y = 0.3
export const AIM_NET_GAP = 1.0
export const AIM_OUT_MARGIN = 3.0
export const OWN_HALF_TOLERANCE = 0.5

export const TOSS_START_Y = 1.8
export const TOSS_SPEED = 5.0
export const SERVE_WINDOW_MS = 250
export const TOSS_FALL_MS = 1100
export const SERVE_WAIT_MS = 10_000
export const POINT_PAUSE_MS = 2_000
export const TENNIS_HIT_COOLDOWN_MS = 120
export const REJOIN_GRACE_MS = 30_000
export const BASELINE_STANDBY_M = 1.0
export const DOUBLES_SPREAD_M = 2.5
