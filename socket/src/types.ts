// Shared shapes of the realtime server. Room helpers take a GameRoom (not CityRoom) so tests can pass fakes.

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Bounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface Stats {
  health: number
  hunger: number
  thirst: number
}

export interface HealOverTime {
  until: number
  perMs: number
  healedUntil: number
}

export type AppearanceSlot = 'body' | 'hair' | 'top' | 'bottom' | 'shoes' | 'head_accessory'
export type WearSlot = Exclude<AppearanceSlot, 'body'>

export interface Identity {
  accountId: number
  pseudo: string
  token: string
  /** GET /user's is_admin: unlocks the watch's admin app (src/admin.ts). */
  isAdmin: boolean
}

export interface Player extends Vec3 {
  sessionId: string
  accountId: number
  pseudo: string
  token: string | null
  isAdmin: boolean
  color: number
  ry: number
  lastMoveAt: number
  lastHousingRefreshAt: number
  lastDoorRattleAt: number
  stats: Stats | null
  statsDirty: boolean
  lastStatsSavedAt: number
  lastConsumeAt: number
  lastSipAt: number
  lastPunchAt: number
  stamina: number
  /** Last time stamina was spent (punch, jump, sprint); regen starts after STAMINA_REGEN_DELAY_MS. */
  staminaSpentAt: number
  fallPeakY: number
  knockedOutUntil: number
  speedBoostUntil: number
  healOverTime: HealOverTime | null
  lastClinicHealAt: number
  clinicHealPending: boolean
  clinicBedId: string | null
  /** Trade in progress (src/trade.ts), from the request until it completes or closes. */
  tradeId: string | null
  lastTradeRequestAt: number
  lastAdminActionAt: number
  seatId: string | null
  intoxication: number
  pubSecretUntil: number
  pubShots: PubShots | null
  lastPubBellAt: number
  /** Last pub_bouncer_block broadcast for this player (rate limit). */
  lastBouncerBlockAt: number
  /** Shift at a job station (src/jobs.ts), from the accepted job_start until it ends; shiftId null while the API opens it. */
  job: JobShift | null
  decoratedTemplateKey?: string | null
  appearance: Record<AppearanceSlot, number | null>
  slotHexes: Record<AppearanceSlot, string>
  bodyModelGlb: string | null
  slotModels: Record<WearSlot, string | null>
}

/** A house as the Laravel API lists it (GET /housing/units). */
export interface HousingUnit {
  public_id: string
  template_key: string
  model_key?: string | null
  status: string
  door_locked: boolean
  occupant_account_id: number | null
  key_holder_account_ids?: number[]
  pos_x: number
  pos_z: number
  interior_bounds?: Bounds | null
}

export interface FurnitureObject {
  objectKey: string
  x: number
  y: number
  z: number
}

/** The objects placed in one house (GET /apartments/houses). */
export interface HouseFurniture {
  model_key: string
  objects: FurnitureObject[]
}

export interface PubShots {
  startedAt: number
  seed: number
  alcohol: number
}

export interface PubRacer {
  progress: number
  lastProgressAt: number
  finishedAt: number | null
  forfeited: boolean
  alcohol: number
  spills: number
}

export interface PubRace {
  hostSessionId: string
  seed: number
  startsAt: number
  startedAt: number | null
  racers: Map<string, PubRacer>
  lastStateAt: number
}

export interface DartsThrow {
  x: number
  y: number
  score: number
}

export interface DartsPlayer {
  sessionId: string
  darts: DartsThrow[]
  alcohol: number
}

export interface DartsGame {
  startsAt: number
  started: boolean
  players: DartsPlayer[]
  turn: number
  turnEndsAt: number
  turnSeq: number
}

/** A Drink Fast challenge sent from one seated player to another, waiting for an answer. */
export interface PubChallenge {
  from: string
  to: string
  expiresAt: number
}

export interface PubState {
  secretOpen: boolean
  race: PubRace | null
  darts: DartsGame | null
  /** Pending Drink Fast challenges, keyed by the challenger's sessionId. */
  challenges: Map<string, PubChallenge>
  /** Last challenge sent per challenger (rate limit), pruned as it goes. */
  challengeSentAt: Map<string, number>
}

/** A shift at a job station (src/jobs.ts, rules in src/jobRules.ts, docs/JOBS.md). Times are this server's clock. */
export interface JobShift {
  sessionId: string
  accountId: number
  token: string
  job: string
  building: string
  stationId: string
  /** Laravel shift id: null until the API opened the shift. */
  shiftId: number | null
  salaryCoins: number
  periodMs: number
  /** Hunger and thirst drop at this fraction of the normal speed during the shift. */
  survivalFactor: number
  startedAt: number
  /** Time not counted as work: the server stalled (sleep, overload) for longer than JOB_STALL_MS. */
  pausedMs: number
  lastTickAt: number
  /** Next period to pay (1-based). Periods given up after MAX_BACKLOG_PERIODS are skipped. */
  nextPeriod: number
  paying: boolean
  failures: number
  retryAt: number
  earned: number
  forfeitedPeriods: number
  /** Set once the shift is over: the periods completed before it can still be paid (a few attempts). */
  endedAt: number | null
  endReason: string | null
}

export interface ClinicBedOccupant {
  sessionId: string | null
  usedAt: number
}

/** Untrusted message payload sent by a client: every field must be checked before use. */
export type ClientPayload = { readonly [key: string]: unknown } | null | undefined

export interface GameClient {
  sessionId: string
  send(type: string, payload?: unknown): void
}

export interface GameRoom {
  players: Map<string, Player>
  housingUnits: HousingUnit[]
  houseFurniture: HouseFurniture[]
  openDoors: Set<string>
  clinicBeds: Map<string, ClinicBedOccupant>
  seats: Map<string, string>
  pub: PubState
  /** Job station id -> sessionId of the player working there (or about to: the API is opening the shift). */
  jobStations: Map<string, string>
  /** Shifts being worked or still settling their last completed periods. */
  jobShifts: Set<JobShift>
  clients: readonly GameClient[]
  clock: { setTimeout(handler: () => void, ms: number): unknown }
  forEachClient(callback: (client: GameClient) => void, exceptClient?: GameClient): void
  broadcastMove(client: GameClient, player: Player): void
  refreshHouseFurniture(token: string): Promise<void>
}
