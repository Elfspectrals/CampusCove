// Shared shapes of the realtime server. Room helpers take a GameRoom (not CityRoom) so tests can pass fakes.
import type { DrinkFastSim } from './drinkFastSim.ts'
import type { PubQuiz } from './pubQuiz.ts'

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
  badges: string[]
  ip: string
}

export interface Player extends Vec3 {
  sessionId: string
  accountId: number
  pseudo: string
  token: string | null
  isAdmin: boolean
  badges: string[]
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
  lastChatAt: number
  lastAtmAt: number
  lastMarketAt: number
  lastCashBagPickAt: number
  voiceMuted: ReadonlySet<string>
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
  orchardPick: { tree: number, startedAt: number, tool: string | null, durationMs: number } | null
  farmPick: { plant: number, startedAt: number } | null
  lockpick: LockpickSession | null
  lastPickStartAt: number
  lastStorageAt: number
  /** Job tool in hand, checked against the inventory (src/tools.ts, docs/TOOLS.md). */
  heldTool: string | null
  wantedTool: string | null
  holdSyncing: boolean
  lastHoldCheckAt: number
  decoratedTemplateKey?: string | null
  appearance: Record<AppearanceSlot, number | null>
  slotHexes: Record<AppearanceSlot, string>
  bodyModelGlb: string | null
  slotModels: Record<WearSlot, string | null>
  /** Body built in the character creator (docs/CHARACTER.md); null until the player has made one. */
  character: CharacterLook | null
  wantedStars: number
  wantedDecayMs: number
  wantedDirty: boolean
  lastHitAt: Map<number, number>
  lastAssaultAt: Map<number, number>
  jail: JailSentence | null
  jailDirty: boolean
  jailPayPending: boolean
  lastJailPayAt: number
  mealTrayInMs: number | null
  policeLicence: boolean | null
  policeLicencePrice: number | null
  onDuty: boolean
  policePending: boolean
  lastPoliceActionAt: number
  lastStepAt: number
  cuffAttempt: CuffAttempt | null
  cuffedBy: Cuffs | null
  pickpocket: PickpocketGame | null
  lastPickpocketAt: number
}

export type JailKind = 'npc' | 'officer'

export interface JailSentence {
  kind: JailKind
  stars: number
  msLeft: number
  cellId: string | null
}

export interface CuffAttempt {
  targetSessionId: string
  startedAt: number
}

export interface Cuffs {
  officerSessionId: string
  since: number
}

export interface PickpocketWindow {
  center: number
  width: number
}

export interface PickpocketLootItem {
  code: string
  name: string
  kind: string
  quantity: number
  previewImage: string | null
}

interface PickpocketTarget {
  victimSessionId: string
  victimAccountId: number
  victimPseudo: string
}

export type PickpocketGame =
  | PickpocketTarget & { phase: 'checking' }
  | PickpocketTarget & { phase: 'playing', attemptId: number, windows: PickpocketWindow[], startedAt: number, stops: number }
  | PickpocketTarget & { phase: 'looting', attemptId: number, witnessed: boolean, loot: PickpocketLootItem[] | null, endsAt: number, taking: boolean }

export type CharacterSex = 'm' | 'f'
export type CharacterBuild = 'slim' | 'normal' | 'broad'

export interface CharacterLook {
  sex: CharacterSex
  /** 1..CHARACTER_FACE_COUNT */
  face: number
  build: CharacterBuild
}

/** A house as the Laravel API lists it (GET /housing/units). */
export interface LockpickPin {
  period: number
  phase: number
  shownAt: number
}

export interface LockpickSession {
  unitId: string
  attemptId: number | null
  pins: number
  pinsSet: number
  misses: number
  pin: LockpickPin
  readyAt: number
  busy: boolean
}

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
  objectId: string
  objectKey: string
  x: number
  y: number
  z: number
  rotY?: number
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
  /** Server replay of the balance game, advanced from the steps where the player pressed or released. */
  sim: DrinkFastSim
  /** Simulation steps already replayed. */
  step: number
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
  free: boolean
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
  quiz: PubQuiz | null
  quizSchedule: number
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

export interface CashBag {
  id: number
  x: number
  y: number
  z: number
  expiresAt: number
  murderVictimAccountId: number | null
  tools: string[]
}

export interface MarketLotView {
  lot_id: number
  code: string
  quantity: number
}

export interface MarketStallView {
  stall_no: number
  account_id: number
  lots: MarketLotView[]
}

export interface MarketSnapshot {
  open: boolean
  opens_at: string
  closes_at: string
  stalls: MarketStallView[]
}

export interface GameRoom {
  roomId: string
  players: Map<string, Player>
  market: MarketSnapshot | null
  cashBags: Map<number, CashBag>
  housingUnits: HousingUnit[]
  houseFurniture: HouseFurniture[]
  openDoors: Set<string>
  clinicBeds: Map<string, ClinicBedOccupant>
  seats: Map<string, string>
  pub: PubState
  clients: readonly GameClient[]
  clock: { setTimeout(handler: () => void, ms: number): unknown }
  forEachClient(callback: (client: GameClient) => void, exceptClient?: GameClient): void
  broadcastMove(client: GameClient, player: Player): void
  refreshHouseFurniture(token: string): Promise<void>
}
