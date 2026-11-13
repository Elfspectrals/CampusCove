import type { QuizChoice, QuizRankingEntry, QuizText } from '../game/pub/quiz'

export interface RemoteUserPayload {
  sessionId: string
  id: string
  pseudo: string
  badges?: string[]
  color: number
  x: number
  y: number
  z: number
  /** Camera yaw (radians), 0 = looking towards -Z. */
  ry?: number
  slotHexes?: Record<string, string>
  bodyModelGlb?: string | null
  slotModels?: Record<string, string | null>
  /** Body built in the character creator (docs/CHARACTER.md); null or absent = default body. */
  character?: unknown
  /** Pub seat the player sits on (socket/src/pub.ts), null or absent when standing. */
  seatId?: string | null
  /** Job tool in hand, checked by the socket (docs/TOOLS.md). */
  heldTool?: string | null
}

/** 'user_seated': a visible player sat down on a pub seat, or stood up (`seatId` null). */
export interface UserSeatedPayload {
  sessionId: string
  seatId: string | null
}

export interface UserPickingPayload {
  sessionId: string
  picking: boolean
}

/** Another player ate or drank (socket/src/survival.ts); `code` is the food item, null for a fountain sip. */
export interface UserActionPayload {
  sessionId: string
  action: 'eat' | 'drink'
  code: string | null
}

export interface UserPunchedPayload {
  sessionId: string
  targetSessionId: string | null
  dirX: number
  dirZ: number
  damage?: number
}

export interface PunchTiredPayload {
  stamina: number
}

export interface HousingUnitPayload {
  unit_id: number
  public_id: string
  offer_type: string
  price_coins: number
  tax_coins: number
  pos_x: number
  pos_y: number
  pos_z: number
  size: number
  base_color_hex: string
  /** House asset key (assets/houses/<model_key>/); null for legacy MVP cubes. */
  model_key: string | null
  status: string
  occupant_account_id: number | null
  occupant_name: string | null
  tax_due_at: string | null
  door_locked: boolean
  reinforced_lock: boolean
  room_public_id: string | null
  template_key: string
  key_holder_account_ids: number[]
  furniture_limit: number
}

export interface RoomInitPayload {
  me: RemoteUserPayload
  users: RemoteUserPayload[]
  housingUnits?: HousingUnitPayload[]
  houseFurniture?: HouseFurniturePayload[]
  openDoors?: string[]
  pubSecretOpen?: boolean
  pubQuiz?: PubQuizAnnouncePayload | null
  cashBags?: CashBagPayload[]
  /** The API flags this account is_admin: the watch shows its Admin app (the server re-checks every admin message). */
  isAdmin?: boolean
}

/** 'teleported': the server moved this player (admin teleport or summon); snap there and look along `ry`. */
export interface TeleportedPayload {
  x: number
  y: number
  z: number
  ry: number
}

/** 'admin_menu': what the watch's Admin app lists (answer to 'admin_open'). */
export interface AdminMenuPayload {
  destinations: { key: string; name: string }[]
  players: { sessionId: string; pseudo: string; distance: number }[]
}

/** 'admin_summoned': an admin brought this player next to them. */
export interface AdminSummonedPayload {
  byPseudo: string
}

export type AdminWallet = 'cash' | 'bank'

export interface AdminItem {
  code: string
  name: string
  kind: string
}

export interface AdminItemsPayload {
  items: AdminItem[]
}

export type AdminResultPayload =
  | { action: 'money'; ok: true; pseudo: string; wallet: AdminWallet; amount: number }
  | { action: 'item'; ok: true; pseudo: string; code: string; quantity: number }
  | { action: 'market_open'; ok: true; closesAt: string }
  | { action: 'market_close'; ok: true; returned: number }
  | { action: 'taxes'; ok: true; charged: number; seized: number }
  | { action: 'items' | 'money' | 'item' | 'market_open' | 'market_close' | 'taxes'; ok: false; message: string }

export type AdminGrantedPayload =
  | { kind: 'money'; byPseudo: string; wallet: AdminWallet; amount: number; cash: number; bank: number }
  | { kind: 'item'; byPseudo: string; code: string; quantity: number }

/** 'door_sound': only sent to players within 5 m of the door (12 m for lockpicking). `door` is the building key (house model key or work key). */
export type DoorSide = 'front' | 'back'

export interface DoorSoundPayload {
  door: string
  sound: 'open' | 'close' | 'lock' | 'unlock' | 'rattle' | 'pick_click' | 'pick_scrape'
  side?: DoorSide
}

/** 'lockpick_pin': the next pin to set (docs/LOCKPICK.md). `phase` is the needle position (0 to 1) when sent. */
export interface LockpickPinPayload {
  pinsSet: number
  pins: number
  period: number
  phase: number
  window: number
  readyInMs: number
}

export interface StorageScreenPayload {
  object_id: string
  code: string
  slots: number
  food_only: boolean
  can_deposit: boolean
  items: { code: string; name: string; kind: string; quantity: number; preview_image: string | null }[]
}

export interface BedErrorPayload {
  message: string
  code: string
}

export interface StorageErrorPayload {
  message: string
  code: string
}

export interface LockpickResultPayload {
  outcome: 'set' | 'miss' | 'broke' | 'open' | 'abandoned'
}

export interface LockpickErrorPayload {
  message: string
  code: string
}

export interface HouseFurniturePayload {
  template_key: string
  model_key: string | null
  occupant_account_id: number
  objects: ApartmentObjectPayload[]
}

export interface ApartmentObjectPayload {
  objectId: string
  objectKey: string
  modelGlb?: string | null
  variant: string | null
  color: string | null
  x: number
  y: number
  z: number
  rotX: number
  rotY: number
  rotZ: number
}

export interface ApartmentInventoryItem {
  item_def_id: number
  code: string
  name: string
  kind: string
  quantity: number
  preview_image: string | null
  model_glb: string | null
  /** Food / drinks: bites per item and bites left on the item being eaten (4/4 -> 3/4 ...). */
  portions?: number | null
  portions_left?: number | null
  /** Clothes: the wear slot (hair, top, ...); unworn clothes live in the backpack. */
  cosmetic_slot?: string | null
}

// ---------------------------------------------------------------- trades (socket/src/trade.ts)

/** 'trade_nearby': players listed by the watch's Trade app, nearest first. */
export interface TradeNearbyPlayer {
  sessionId: string
  pseudo: string
  distance: number
  /** Close enough to be asked right now. */
  inReach: boolean
  busy: boolean
}

interface TradeItemPayload {
  code: string
  name: string
  kind: string
  quantity: number
  previewImage: string | null
}

export interface TradeOfferPayload {
  coins: number
  items: TradeItemPayload[]
}

/** 'trade_state': the open trade as this player sees it. Confirm with the `revision` shown. */
export interface TradeStatePayload {
  tradeId: string
  status: 'requested' | 'open' | 'executing'
  revision: number
  me: { offer: TradeOfferPayload; confirmed: boolean }
  partner: { sessionId: string; pseudo: string; offer: TradeOfferPayload; confirmed: boolean }
}

export interface TradeRequestedPayload {
  tradeId: string
  fromSessionId: string
  fromPseudo: string
}

export interface TradePendingPayload {
  tradeId: string
  toSessionId: string
  toPseudo: string
}

export type TradeCloseReason = 'declined' | 'cancelled' | 'expired' | 'too_far' | 'left'

export interface TradeClosedPayload {
  tradeId: string
  reason: TradeCloseReason
  /** This player is the one who cancelled / declined. */
  byMe: boolean
}

/** 'trade_completed': `coins` is the new balance (null if unknown), `received` what the partner gave. */
export interface TradeCompletedPayload {
  tradeId: string
  coins: number | null
  received: TradeOfferPayload
}

export interface TradeErrorPayload {
  message: string
  code: string
}

// ---------------------------------------------------------------- The Salty Shamrock (socket/src/pub.ts, pubGames.ts)

/** 'pub_pouring': the barman pulls a drink for `sessionId`; the glass fills for `durationMs` (zone, sender included). */
export interface PubPouringPayload {
  sessionId: string
  code: string
  durationMs: number
}

/** 'pub_served': this player's drink waits on the bar. */
export interface PubServedPayload {
  code: string
}

export interface PubErrorPayload {
  message: string
  code: string
}

/** 'pub_secret_result': the bouncer's answer; `untilMs` is the server clock time when this player's access to the staff door expires. */
export interface PubSecretResultPayload {
  ok: boolean
  untilMs?: number
}

export interface PubSecretDoorPayload {
  open: boolean
}

/**
 * 'pub_bouncer_block': someone tried to slip past the bouncer into the cellar without the phrase (whole pub,
 * the blocked player included; that player also gets a `position_correction` pushing them back).
 */
export interface PubBouncerBlockPayload {
  sessionId: string
  accountId: number
  line: string
}

export interface PubBellPayload {
  sessionId: string
}

export interface PubQuizAnnouncePayload {
  startsAt: number
}

export interface PubQuizLobbyPayload {
  startsAt: number
  contestants: Array<{ sessionId: string; pseudo: string }>
}

export interface PubQuizCancelledPayload {
  reason: 'not_enough_players'
}

export interface PubQuizQuestionPayload {
  index: number
  count: number
  prompt: QuizText
  choices: [QuizText, QuizText, QuizText, QuizText]
  closesAt: number
}

export interface PubQuizRevealPayload {
  index: number
  answer: QuizChoice
  ranking: QuizRankingEntry[]
}

export interface PubQuizResultsPayload {
  ranking: QuizRankingEntry[]
}

export interface PubQuizPrizePayload {
  sessionId: string
  pseudo: string
  coins: number
  pint: boolean
}

export interface PubQuizAnsweredPayload {
  choice: QuizChoice
}

export interface PubRewardPayload {
  sessionId: string
  coins: number
}

/** 'pub_race_lobby': a Drink Fast race gathers at the bar until `startsAt` (ms epoch). */
export interface PubRaceLobbyPayload {
  hostSessionId: string
  players: string[]
  startsAt: number
}

export interface PubRaceStartPayload {
  seed: number
  players: string[]
}

/** Sent right away when a racer's `spills` go up, otherwise at most every RACE_STATE_MIN_INTERVAL_MS. */
export interface PubRaceStatePayload {
  players: Array<{ sessionId: string; progress: number; spills?: number }>
}

export interface PubRaceEndPayload {
  /** `ms` already includes the spill penalty. */
  ranking: Array<{ sessionId: string; ms: number; spills: number }>
  rewards: PubRewardPayload[]
}

/** 'pub_race_challenged': `fromSessionId` challenges this player to Drink Fast until `expiresAt` (ms epoch). */
export interface PubRaceChallengedPayload {
  fromSessionId: string
  expiresAt: number
}

/** 'pub_race_challenge_sent': the challenge reached `toSessionId`, who has until `expiresAt` to answer. */
export interface PubRaceChallengeSentPayload {
  toSessionId: string
  expiresAt: number
}

/** 'pub_race_challenge_result': the challenger learns the answer (on accept a normal race lobby follows). */
export interface PubRaceChallengeResultPayload {
  toSessionId: string
  accepted: boolean
  reason?: 'declined' | 'expired' | 'busy' | 'cancelled'
}

/** 'pub_race_challenge_cancelled': the challenge this player received is gone (challenger stood up, left...). */
export interface PubRaceChallengeCancelledPayload {
  fromSessionId: string
}

/** 'pub_shots_ready': the Meter Shot round is paid; `startedAt` is the server clock (ms epoch). */
export interface PubShotsReadyPayload {
  seed: number
  startedAt: number
}

export interface PubShotsResultPayload {
  ms: number
  coins: number
}

export interface PubDartsLobbyPayload {
  players: string[]
  startsAt: number
}

export interface PubDartPayload {
  x: number
  y: number
  score: number
}

export interface PubDartsStatePayload {
  players: Array<{ sessionId: string; darts: PubDartPayload[]; total: number }>
  turn: string | null
  throwsLeft: number
  turnEndsAt: number
}

export interface PubDartsEndPayload {
  ranking: Array<{ sessionId: string; total: number }>
  rewards: PubRewardPayload[]
}

export interface OrchardPickedPayload {
  code: string
  quantity: number
}

export interface FarmPickedPayload {
  code: string
  quantity: number
}

export interface FarmErrorPayload {
  message: string
  code: string
}

export interface OrchardErrorPayload {
  message: string
  code: string
}

export interface ZoneCheckoutDonePayload {
  balance_after: number
  request: number | null
}

export interface ZoneCheckoutErrorPayload {
  message: string
  code: string
  request: number | null
}

export interface ZoneSoldPayload {
  sold: number
  coins: number
  balance_after: number
  full_price_left: number
}

export interface ZoneSellErrorPayload {
  message: string
  code: string
}

export interface TaskDonePayload {
  task: string
  tier: 1 | 2 | 3
  threshold: number
}

export interface AtmDonePayload {
  action: 'deposit' | 'withdraw' | 'transfer'
  bank: number
  cash?: number
  request: number | null
}

export interface AtmErrorPayload {
  message: string
  code: string
  request: number | null
}

export type MarketLotContainer = 'crate' | 'basket' | 'flat'

export interface MarketLotView {
  lot_id: number
  slot: number
  code: string
  name: string
  quantity: number
  unit_price: number
  container: MarketLotContainer
  preview_image: string | null
  model_glb: string | null
}

interface MarketStallView {
  stall_no: number
  account_id: number
  canopy: string
  lots: MarketLotView[]
}

export interface MarketSnapshot {
  open: boolean
  stall_fee: number
  market_date: string
  opens_at: string
  closes_at: string
  stalls: MarketStallView[]
}

export interface MarketDonePayload {
  action: 'claim' | 'list' | 'withdraw' | 'buy'
  request: number | null
  cash?: number
}

export interface MarketErrorPayload {
  message: string
  code: string
  request: number | null
}

export interface MarketSoldPayload {
  lotId: number
  code: string
  quantity: number
}

export interface CashBagPayload {
  id: number
  x: number
  y: number
  z: number
  expiresAt: number
}

export interface WantedPayload {
  sessionId: string
  stars: number
}

export interface JailStatePayload {
  kind: 'npc' | 'officer'
  msLeft: number
  fine: number
  stars: number
}

export interface JailReleasedPayload {
  reason: 'served' | 'paid' | 'released'
  fine: number | null
  bank: number | null
  cash: number | null
}

export interface JailTrayPayload {
  cellId: string
  ready: boolean
  food: string
}

export interface PoliceStatePayload {
  licensed: boolean
  onDuty: boolean
  price: number | null
}

export interface PoliceLicenceBoughtPayload {
  price: number | null
  bank: number | null
}

export interface PoliceDutyEndedPayload {
  reason: 'off' | 'death' | 'licence_lost'
}

export interface PoliceCuffStartedPayload {
  officerSessionId: string
  suspectSessionId: string
  durationMs: number
}

export interface PoliceCuffCancelledPayload {
  officerSessionId: string
  suspectSessionId: string
  reason: 'released' | 'moved' | 'punched' | 'too_far' | 'gone' | 'off_duty'
}

export interface PoliceCuffsPayload {
  officerSessionId: string
  suspectSessionId: string
  cuffed: boolean
  reason: 'uncuffed' | 'cell' | 'off_duty' | 'officer_down' | 'officer_left' | 'suspect_down' | 'suspect_left' | 'timeout' | null
}

export interface PoliceBountyPayload {
  paid: number
  stars: number
  reason: string | null
  cash: number | null
}

export interface PoliceErrorPayload {
  code: string
  message: string
}

export interface PickpocketWindow {
  center: number
  width: number
}

export interface PickpocketStartedPayload {
  victimSessionId: string
  windows: PickpocketWindow[]
  halfSweepMs: number
  durationMs: number
}

export interface PickpocketProgressPayload {
  stops: number
}

export interface PickpocketFailedPayload {
  reason: 'missed' | 'out_of_position' | 'timeout' | 'cancelled'
}

export interface PickpocketSucceededPayload {
  witnessed: boolean
}

export interface PickpocketLootItem {
  code: string
  name: string
  kind: string
  quantity: number
  previewImage: string | null
}

export interface PickpocketLootPayload {
  items: PickpocketLootItem[]
  durationMs: number
}

export interface PickpocketTakenPayload {
  code: string
  name: string
  quantity: number
}

export interface PickpocketAlertPayload {
  kind: 'failed' | 'seen' | 'witness'
  thiefSessionId: string
  thiefPseudo: string
  victimPseudo: string
}

export interface PickpocketMissingPayload {
  name: string
  quantity: number
  thiefPseudo: string | null
}

export interface PickpocketErrorPayload {
  code: string
  message: string
}

export interface JailErrorPayload {
  message: string
  code: string
}

export interface CashBagPickedPayload {
  id: number
  amount: number
  cash: number
  /** Job tools that were in the bag, now in the picker's inventory (docs/TOOLS.md). */
  tools?: string[]
}

export interface CashBagErrorPayload {
  id: number | null
  message: string
  code: string
}

export interface StorageLotContent {
  code: string
  name: string
  rarity: number
  model_glb: string | null
  quantity: number
}

interface StorageWonBox {
  lotId: string
  unitId: string
  winnerAccountId: number
  winnerPseudo: string
}

export interface StorageSalePayload {
  active: boolean
  serverNow: number
  auctioneer: { x: number; y: number; z: number; yaw?: number } | null
  won: StorageWonBox[]
  night?: string
  phase?: 'walking' | 'preview' | 'bidding' | 'hammering' | 'result'
  endsAt?: number
  index?: number
  count?: number
  unitId?: string
  lot?: { id: string; source: 'seized' | 'generated'; formerOwnerName: string | null; openingBid: number; contents: StorageLotContent[] }
  bidZone?: { x: number; z: number; radius: number }
  leader?: { pseudo: string; amount: number } | null
  nextBid?: number
  result?: { status: 'sold' | 'listed' | 'destroyed'; winnerAccountId: number | null; price: number | null } | null
}

export interface StorageOpenedPayload {
  lotId: string
  unitId: string | null
  pseudo: string
  contents: StorageLotContent[]
}
