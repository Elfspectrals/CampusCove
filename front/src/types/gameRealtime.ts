export interface RemoteUserPayload {
  sessionId: string
  id: string
  pseudo: string
  color: number
  x: number
  y: number
  z: number
  /** Camera yaw (radians), 0 = looking towards -Z. */
  ry?: number
  slotHexes?: Record<string, string>
  bodyModelGlb?: string | null
  slotModels?: Record<string, string | null>
  /** Pub seat the player sits on (socket/src/pub.ts), null or absent when standing. */
  seatId?: string | null
}

/** 'user_seated': a visible player sat down on a pub seat, or stood up (`seatId` null). */
export interface UserSeatedPayload {
  sessionId: string
  seatId: string | null
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
  room_public_id: string | null
  template_key: string
  key_holder_account_ids: number[]
}

export interface RoomInitPayload {
  me: RemoteUserPayload
  users: RemoteUserPayload[]
  housingUnits?: HousingUnitPayload[]
  houseFurniture?: HouseFurniturePayload[]
  openDoors?: string[]
  pubSecretOpen?: boolean
}

/** 'door_sound': only sent to players within 5 m of the door. `door` is the building key (house model key or work key). */
export interface DoorSoundPayload {
  door: string
  sound: 'open' | 'close' | 'lock' | 'unlock' | 'rattle'
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
