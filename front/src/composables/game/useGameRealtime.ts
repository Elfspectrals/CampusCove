import { ADMIN_KICK_CLOSE_CODE } from '../../game/gameRoomConstants'
import { ref, type Ref, type ShallowRef } from 'vue'
import type { Router } from 'vue-router'
import type * as THREE from 'three'
import { Client as ColyseusClient, type Room } from '@colyseus/sdk'
import type { VoiceTokenPayload } from './useProximityVoice'
import {
  appearanceIdsFromLoadout,
  bodyModelGlbFromLoadout,
  fetchCharacterCosmetics,
  wearModelsFromLoadout,
  type CharacterCosmeticsState,
} from '../../api/characterCosmetics'
import type { WearModels } from '../../avatar/modularCharacterLogic'
import { parseHousingUnitList } from '../../api/housing'
import { getStoredAuth } from '../../api/session'
import type { SfxName } from '../../game/sfx'
import type {
  AdminMenuPayload,
  AdminGrantedPayload,
  AdminInventoryPayload,
  AdminPlayerPayload,
  AdminPowersPayload,
  AdminItemsPayload,
  AdminResultPayload,
  AdminSummonedPayload,
  ApartmentInventoryItem,
  DoorSoundPayload,
  HouseFurniturePayload,
  HousingUnitPayload,
  PubBellPayload,
  PubQuizAnnouncePayload,
  PubQuizAnsweredPayload,
  PubQuizCancelledPayload,
  PubQuizLobbyPayload,
  PubQuizPrizePayload,
  PubQuizQuestionPayload,
  PubQuizResultsPayload,
  PubQuizRevealPayload,
  PubBouncerBlockPayload,
  PubDartsEndPayload,
  PubDartsLobbyPayload,
  PubDartsStatePayload,
  PubErrorPayload,
  PubPouringPayload,
  PubRaceChallengeCancelledPayload,
  PubRaceChallengedPayload,
  PubRaceChallengeResultPayload,
  PubRaceChallengeSentPayload,
  PubRaceEndPayload,
  PubRaceLobbyPayload,
  PubRaceStartPayload,
  PubRaceStatePayload,
  PubSecretDoorPayload,
  PubSecretResultPayload,
  PubServedPayload,
  PubShotsReadyPayload,
  PubShotsResultPayload,
  PunchTiredPayload,
  RemoteUserPayload,
  RoomInitPayload,
  TeleportedPayload,
  TradeClosedPayload,
  TradeCompletedPayload,
  TradeErrorPayload,
  TradeNearbyPlayer,
  TradePendingPayload,
  TradeRequestedPayload,
  TradeStatePayload,
  UserActionPayload,
  UserPickingPayload,
  UserPunchedPayload,
  UserSeatedPayload,
  OrchardErrorPayload,
  FarmErrorPayload,
  FarmPickedPayload,
  OrchardPickedPayload,
  ZoneSellErrorPayload,
  ZoneSoldPayload,
  AtmDonePayload,
  TaskDonePayload,

  LockpickErrorPayload,
  LockpickPinPayload,
  LockpickResultPayload,
  BedErrorPayload,
  StorageErrorPayload,
  StorageScreenPayload,
  AtmErrorPayload,
  MarketDonePayload,
  MarketErrorPayload,
  MarketSnapshot,
  MarketSoldPayload,
  CashBagErrorPayload,
  CashBagPayload,
  StorageOpenedPayload,
  StorageSalePayload,
  CashBagPickedPayload,
  WantedPayload,
  JailStatePayload,
  JailReleasedPayload,
  JailErrorPayload,
  JailTrayPayload,
  PoliceDutyEndedPayload,
  PoliceBountyPayload,
  PoliceCuffCancelledPayload,
  PoliceCuffStartedPayload,
  PoliceCuffsPayload,
  PoliceErrorPayload,
  PoliceLicenceBoughtPayload,
  PoliceStatePayload,
  SportsErrorPayload,
  SportsLobbyClosedPayload,
  SportsLobbyPayload,
  SportsLoansPayload,
  SportsRunResultPayload,
  SportsRunStatePayload,
  GymEndPayload,
  GymErrorPayload,
  GymFreePayload,
  GymEventPayload,
  GymStatePayload,
  TennisFreePayload,
  TennisStrokePayload,
  TennisStatePayload,
  SkateBumpPayload,
  SkateFallPayload,
  SkateMovePayload,
  SkateRacePayload,
  SkateResultPayload,
  SportsPassBoughtPayload,
  SportsPassStatePayload,
  PickpocketAlertPayload,
  PickpocketErrorPayload,
  PickpocketFailedPayload,
  PickpocketLootPayload,
  PickpocketMissingPayload,
  PickpocketProgressPayload,
  PickpocketStartedPayload,
  PickpocketSucceededPayload,
  PickpocketTakenPayload,
} from '../../types/gameRealtime'
import { type BoxingBagHitPayload, type BoxingDodgedPayload, type BoxingHitPayload, type BoxingStatePayload, boxerPose } from '../../game/sports/boxing'
import { punchClip } from '../../avatar/boxingAnimLogic'
import { useRemoteAvatars, type SeatPose } from './useRemoteAvatars'
import { PUNCH_DAMAGE } from '../../game/punch'
import { applySportsLoans, clearSportsLoans, forgetSportsLoans } from '../../game/sports/sportsLoans'
import type { UserEmotePayload } from './useEmoteWheel'
import { EMOTE_TIME_SCALE } from '../../game/sports/danceEmotes'
import { RHYTHM_DANCE_CLIP, danceTimeScale, parseDanceStart, type DanceEnd, type DanceJudge, type DanceStart } from '../../game/sports/danceHud'
import type { ClimbErrorPayload, ClimbStatePayload } from '../../game/sports/climbing'
import type { PoolDive, PoolRaceResult, PoolRaceStart, PoolRaceState, StrokeResult, Trick } from '../../game/sports/pool/poolRace'
import type { usePoolRace } from './usePoolRace'

const REALTIME_HTTP_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

/** Minimum delay between two cosmetics re-checks triggered by window focus. */
const APPEARANCE_REFRESH_MIN_INTERVAL_MS = 10_000
const BOXER_UNDRESS_MS = 6000

function toWsUrl(rawUrl: string): string {
  if (rawUrl.startsWith('https://')) return `wss://${rawUrl.slice('https://'.length)}`
  if (rawUrl.startsWith('http://')) return `ws://${rawUrl.slice('http://'.length)}`
  return rawUrl
}

export interface GameRealtimeDeps {
  router: Router
  /** Current Colyseus room; set when the join succeeds. */
  gameRoomRef: ShallowRef<Room | null>
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.PerspectiveCamera | undefined
  myPosition: { x: number; y: number; z: number }

  roomMessage: Ref<string | null>
  /** Assigned in `connectRealtime`; called on window focus. */
  refreshMyAppearance: Ref<(() => void) | null>

  inventory: {
    loading: Ref<boolean>
    error: Ref<string | null>
    applyServerPayload: (items: ApartmentInventoryItem[]) => void
    /** A newly received item goes straight to a free hotbar slot. */
    pickupCodeToHotbar: (code: string) => void
  }
  apartment: {
    detachForRoomSwitch: () => void
    clearApartmentObjects: () => void
    /** The server refused a spawn / move / pickup. */
    onActionError: () => void
  }
  loadTown: () => void
  onHousingUnitsSync: (units: HousingUnitPayload[]) => void
  onHouseFurnitureSync: (houses: HouseFurniturePayload[]) => void
  onDoorsSync: (openDoorIds: string[]) => void
  onDoorSound: (data: DoorSoundPayload) => void
  onMyOutfit: (models: WearModels) => void
  onMyShownTop: (top: string | null) => void
  onPunched: (data: UserPunchedPayload, mySessionId: string) => void
  onPunchTired: (data: PunchTiredPayload) => void
  onMyWanted: (stars: number) => void
  playSoundOn: (name: SfxName, object: THREE.Object3D, delayS: number) => void
  punchHitTiming: (data: UserPunchedPayload, mySessionId: string) => { delay: number; hitStop: number }
  /** Player trades (useTrade). */
  trade: {
    onNearby: (players: TradeNearbyPlayer[]) => void
    onRequested: (data: TradeRequestedPayload) => void
    onPending: (data: TradePendingPayload) => void
    onState: (data: TradeStatePayload) => void
    onClosed: (data: TradeClosedPayload) => void
    onCompleted: (data: TradeCompletedPayload) => void
    onError: (data: TradeErrorPayload) => void
  }
  /** Admin tools on the watch (useAdminWatch). */
  admin: {
    onInit: (isAdmin: boolean) => void
    onMenu: (data: AdminMenuPayload) => void
    onError: (data: { message: string }) => void
    onSummoned: (data: AdminSummonedPayload) => void
    onItems: (data: AdminItemsPayload) => void
    onResult: (data: AdminResultPayload) => void
    onGranted: (data: AdminGrantedPayload) => void
    onPlayer: (data: AdminPlayerPayload) => void
    onPowers: (data: AdminPowersPayload) => void
    onInventory: (data: AdminInventoryPayload) => void
    onChatMuted: () => void
    /** The text shown in place of the usual disconnect message. */
    kickedMessage: () => string
  }
  /** The server moved this player (admin teleport / summon): place the camera and the look. */
  onTeleported: (data: TeleportedPayload) => void
  /** Pub seats (useSeats): where a seat is, and this player's own seat changes. */
  seats: {
    seatPose: (seatId: string | null | undefined) => SeatPose | null
    onSeated: (data: UserSeatedPayload, mySessionId: string) => void
  }
  /** The Salty Shamrock bar (usePub). */
  pub: {
    onPouring: (data: PubPouringPayload, mySessionId: string) => void
    onServed: (data: PubServedPayload) => void
    onError: (data: PubErrorPayload) => void
    onSecretResult: (data: PubSecretResultPayload) => void
    onSecretDoor: (data: PubSecretDoorPayload) => void
    onBouncerBlock: (data: PubBouncerBlockPayload, mySessionId: string) => void
    onBell: (data: PubBellPayload) => void
  }
  pubQuiz: {
    onInit: (data: PubQuizAnnouncePayload | null) => void
    onAnnounce: (data: PubQuizAnnouncePayload) => void
    onLobby: (data: PubQuizLobbyPayload) => void
    onCancelled: (data: PubQuizCancelledPayload) => void
    onQuestion: (data: PubQuizQuestionPayload) => void
    onAnswered: (data: PubQuizAnsweredPayload) => void
    onReveal: (data: PubQuizRevealPayload) => void
    onResults: (data: PubQuizResultsPayload) => void
    onPrize: (data: PubQuizPrizePayload) => void
  }
  /** Drink Fast, Meter Shot and Darts (usePubGames). */
  pubGames: {
    onRaceLobby: (data: PubRaceLobbyPayload) => void
    onRaceStart: (data: PubRaceStartPayload) => void
    onRaceState: (data: PubRaceStatePayload) => void
    onRaceEnd: (data: PubRaceEndPayload) => void
    onShotsReady: (data: PubShotsReadyPayload) => void
    onShotsResult: (data: PubShotsResultPayload) => void
    onDartsLobby: (data: PubDartsLobbyPayload) => void
    onDartsState: (data: PubDartsStatePayload) => void
    onDartsEnd: (data: PubDartsEndPayload) => void
  }
  /** Drink Fast challenges between two seated players (usePubChallenge). */
  pubChallenge: {
    onChallenged: (data: PubRaceChallengedPayload) => void
    onSent: (data: PubRaceChallengeSentPayload) => void
    onResult: (data: PubRaceChallengeResultPayload) => void
    onCancelled: (data: PubRaceChallengeCancelledPayload) => void
  }
  zoneBuyers: {
    onSold: (data: ZoneSoldPayload) => void
    onError: (data: ZoneSellErrorPayload) => void
  }
  atm: {
    onDone: (data: AtmDonePayload) => void
    onError: (data: AtmErrorPayload) => void
  }
  bed: {
    onDone: () => void
    onError: (data: BedErrorPayload) => void
  }
  storage: {
    onScreen: (data: StorageScreenPayload) => void
    onError: (data: StorageErrorPayload) => void
  }
  lockpick: {
    onPin: (data: LockpickPinPayload) => void
    onResult: (data: LockpickResultPayload) => void
    onError: (data: LockpickErrorPayload) => void
    onReinforced: () => void
    onReinforceError: (data: LockpickErrorPayload) => void
    onAlarmSiren: (data: { door: string }) => void
    onHouseAlarm: () => void
  }
  market: {
    onSync: (data: MarketSnapshot) => void
    onDone: (data: MarketDonePayload) => void
    onError: (data: MarketErrorPayload) => void
    onSold: (data: MarketSoldPayload) => void
  }
  voice: {
    onToken: (payload: VoiceTokenPayload) => void
    disconnect: () => Promise<void>
  }
  storageAuction: {
    onSale: (data: StorageSalePayload) => void
    onSoon: () => void
    onStarted: (data: { count: number }) => void
    onEnded: () => void
    onOpened: (data: StorageOpenedPayload) => void
    onError: (data: { message: string }) => void
  }
  cashBags: {
    onSync: (bags: CashBagPayload[]) => void
    onDropped: (bag: CashBagPayload) => void
    onRemoved: (data: { id: number }) => void
    onPicked: (data: CashBagPickedPayload) => void
    onError: (data: CashBagErrorPayload) => void
  }
  jail: {
    onState: (data: JailStatePayload) => void
    onReleased: (data: JailReleasedPayload) => void
    onError: (data: JailErrorPayload) => void
    onTray: (data: JailTrayPayload) => void
  }
  police: {
    onState: (data: PoliceStatePayload) => void
    onBought: (data: PoliceLicenceBoughtPayload) => void
    onDutyEnded: (data: PoliceDutyEndedPayload) => void
    onError: (data: PoliceErrorPayload) => void
    onCuffStarted: (data: PoliceCuffStartedPayload) => void
    onCuffCancelled: (data: PoliceCuffCancelledPayload) => void
    onCuffs: (data: PoliceCuffsPayload) => void
    onBounty: (data: PoliceBountyPayload) => void
  }
  sports: {
    onPassState: (data: SportsPassStatePayload) => void
    onPassBought: (data: SportsPassBoughtPayload) => void
    onPassError: (data: SportsErrorPayload) => void
    onCorrection: (reason: string | undefined) => void
    onLobby: (data: SportsLobbyPayload) => void
    onLobbyClosed: (data: SportsLobbyClosedPayload) => void
    onError: (data: SportsErrorPayload) => void
    onRoomJoined: () => void
    onTennisState: (data: TennisStatePayload) => void
    onTennisFree: (data: TennisFreePayload) => void
    onRunState: (data: SportsRunStatePayload) => void
    onRunResult: (data: SportsRunResultPayload) => void
  }
  gym: {
    onState: (data: GymStatePayload) => void
    onEvent: (data: GymEventPayload) => void
    onEnd: (data: GymEndPayload) => void
    onFree: (data: GymFreePayload) => void
    onError: (data: GymErrorPayload) => void
  }
  dance: {
    onStart: (data: DanceStart) => void
    onJudge: (data: DanceJudge) => void
    onStray: () => void
    onEnd: (data: DanceEnd) => void
  }
  emotes: {
    clipOf: (id: string) => string | null
    onUserEmote: (data: UserEmotePayload, mySessionId: string) => void
    onList: (data: { unlocked: string[] }) => void
    onError: (data: { message: string }) => void
  }
  climbing: {
    onState: (data: ClimbStatePayload) => void
    onError: (data: ClimbErrorPayload) => void
    onRoomJoined: () => void
  }
  boxing: {
    onState: (data: BoxingStatePayload) => void
    onHit: (data: BoxingHitPayload, mySessionId: string) => void
    onDodged: (data: BoxingDodgedPayload) => void
    onTired: () => void
    onBagHit: (data: BoxingBagHitPayload) => void
    onNoGloves: () => void
    onRoomLeft: () => void
  }
  skating: {
    onRace: (data: SkateRacePayload) => void
    onFall: (data: SkateFallPayload) => void
    onBump: (data: SkateBumpPayload) => void
    isOnIce: (x: number, z: number) => boolean
    onResult: (data: SkateResultPayload) => void
    onCorrection: (reason: string | undefined) => void
    onRoomJoined: () => void
  }
  pool: ReturnType<typeof usePoolRace>['handlers']
  pickpocket: {
    onStarted: (data: PickpocketStartedPayload) => void
    onProgress: (data: PickpocketProgressPayload) => void
    onFailed: (data: PickpocketFailedPayload) => void
    onSucceeded: (data: PickpocketSucceededPayload) => void
    onLoot: (data: PickpocketLootPayload) => void
    onTaken: (data: PickpocketTakenPayload) => void
    onLootClosed: () => void
    onAlert: (data: PickpocketAlertPayload) => void
    onMissing: (data: PickpocketMissingPayload) => void
    onError: (data: PickpocketErrorPayload) => void
  }
  orchard: {
    onPickStarted: (data: { tree: number; durationMs: number }) => void
    onPicked: (data: OrchardPickedPayload) => void
    onError: (data: OrchardErrorPayload) => void
  }
  farm: {
    onPicked: (data: FarmPickedPayload) => void
    onError: (data: FarmErrorPayload) => void
  }
  tasks: {
    onDone: (data: TaskDonePayload) => void
  }
  tutorial: {
    onState: (data: unknown) => void
  }
}

/** Colyseus 'city' room: connection, server message bindings and other players' avatars. */
export function useGameRealtime(deps: GameRealtimeDeps) {
  let colyseusClient: ColyseusClient | null = null
  const switchingRoom = ref(false)

  let previousQuantityByCode: Record<string, number> = {}
  let isInitialInventoryLoad = true

  const remotes = useRemoteAvatars({ getScene: deps.getScene, myPosition: deps.myPosition, playSoundOn: deps.playSoundOn, onIce: deps.skating.isOnIce })
  let dressedBoxers = new Set<string>()
  let undressTimer: ReturnType<typeof setTimeout> | null = null

  function setMyPosition(x: number, y: number, z: number): void {
    deps.myPosition.x = x
    deps.myPosition.y = y
    deps.myPosition.z = z
    deps.getCamera()?.position.set(x, y, z)
  }

  // ------------------------------------------------------------ server messages

  function syncHousingUnits(raw: unknown): void {
    if (Array.isArray(raw)) deps.onHousingUnitsSync(parseHousingUnitList(raw))
  }

  function onInventory(items: ApartmentInventoryItem[]): void {
    const quantityByCode: Record<string, number> = {}
    for (const it of items) {
      if (it?.code) quantityByCode[it.code] = it.quantity
    }
    if (!isInitialInventoryLoad) {
      for (const [code, qty] of Object.entries(quantityByCode)) {
        if (qty > (previousQuantityByCode[code] ?? 0)) deps.inventory.pickupCodeToHotbar(code)
      }
    }
    isInitialInventoryLoad = false
    previousQuantityByCode = quantityByCode
    deps.inventory.applyServerPayload(items)
  }

  function bindRoomEvents(room: Room) {
    room.onMessage('init', (payload: RoomInitPayload) => {
      remotes.clear()
      deps.apartment.clearApartmentObjects()
      deps.roomMessage.value = null
      deps.loadTown()
      setMyPosition(payload.me.x, payload.me.y, payload.me.z)
      for (const u of payload.users) {
        if (u.sessionId !== room.sessionId) void remotes.upsert(u.sessionId, u, deps.seats.seatPose(u.seatId))
        deps.seats.onSeated({ sessionId: u.sessionId, seatId: u.seatId ?? null }, room.sessionId)
      }
      if (payload.housingUnits !== undefined) syncHousingUnits(payload.housingUnits)
      if (payload.houseFurniture !== undefined) deps.onHouseFurnitureSync(payload.houseFurniture)
      if (payload.openDoors !== undefined) deps.onDoorsSync(payload.openDoors)
      deps.pub.onSecretDoor({ open: payload.pubSecretOpen === true })
      deps.pubQuiz.onInit(payload.pubQuiz ?? null)
      deps.cashBags.onSync(payload.cashBags ?? [])
      deps.admin.onInit(payload.isAdmin === true)
      clearSportsLoans()
      deps.sports.onRoomJoined()
      deps.climbing.onRoomJoined()
      deps.boxing.onRoomLeft()
      deps.skating.onRoomJoined()
      deps.pool.onRoomJoined()
    })

    room.onMessage('housing_units_sync', (data: { units?: unknown }) => syncHousingUnits(data.units))
    room.onMessage('house_furniture_sync', (data: { houses: HouseFurniturePayload[] }) => deps.onHouseFurnitureSync(data.houses))
    room.onMessage('doors_sync', (data: { openDoors: string[] }) => deps.onDoorsSync(data.openDoors))
    room.onMessage('door_sound', (data: DoorSoundPayload) => deps.onDoorSound(data))
    room.onMessage('position_correction', (data: { x: number; y: number; z: number; reason?: string }) => {
      setMyPosition(data.x, data.y, data.z)
      deps.sports.onCorrection(data.reason)
      deps.skating.onCorrection(data.reason)
      deps.pool.onCorrection(data.reason)
    })
    room.onMessage('door_error', (data: { message: string }) => {
      deps.roomMessage.value = data.message
    })

    room.onMessage('user_joined', (data: RemoteUserPayload) => {
      if (data.sessionId !== room.sessionId) void remotes.upsert(data.sessionId, data, deps.seats.seatPose(data.seatId))
      deps.seats.onSeated({ sessionId: data.sessionId, seatId: data.seatId ?? null }, room.sessionId)
    })

    room.onMessage('user_seated', (data: UserSeatedPayload) => {
      if (data.sessionId !== room.sessionId) remotes.setSeated(data.sessionId, deps.seats.seatPose(data.seatId))
      deps.seats.onSeated(data, room.sessionId)
    })

    room.onMessage('user_held', (data: { sessionId: string; code: string | null }) => {
      if (data.sessionId !== room.sessionId) remotes.setHeldTool(data.sessionId, typeof data.code === 'string' ? data.code : null)
    })

    room.onMessage('user_picking', (data: UserPickingPayload) => {
      if (data.sessionId !== room.sessionId) remotes.setPicking(data.sessionId, data.picking === true)
    })

    room.onMessage('user_moved', (data: { sessionId: string; x: number; y: number; z: number; ry?: number }) => {
      remotes.setTarget(data.sessionId, data.x, data.y, data.z, data.ry)
    })

    room.onMessage(
      'appearance_updated',
      (data: { sessionId: string; slotHexes?: Record<string, string>; bodyModelGlb?: string | null; slotModels?: Record<string, string | null>; character?: unknown }) => {
        if (data.sessionId !== room.sessionId) void remotes.updateAppearance(data.sessionId, data)
        else if (data.slotModels) deps.onMyShownTop(data.slotModels.top ?? null)
      },
    )

    room.onMessage('user_left', (data: { sessionId: string }) => {
      remotes.remove(data.sessionId)
      forgetSportsLoans(data.sessionId)
    })

    room.onMessage('user_action', (data: UserActionPayload) => {
      if (data.sessionId !== room.sessionId && (data.action === 'eat' || data.action === 'drink')) {
        remotes.showAction(data.sessionId, data.action, typeof data.code === 'string' ? data.code : null)
      }
    })

    room.onMessage('user_chat', (data: { sessionId: string; text: string }) => {
      if (data.sessionId !== room.sessionId && typeof data.text === 'string') remotes.showChat(data.sessionId, data.text)
    })

    room.onMessage('user_punched', (data: UserPunchedPayload) => {
      if (data.sessionId !== room.sessionId) remotes.showPunch(data.sessionId)
      if (data.targetSessionId && data.targetSessionId !== room.sessionId) {
        remotes.showHit(
          data.targetSessionId,
          data.dirX,
          data.dirZ,
          data.damage ?? PUNCH_DAMAGE,
          deps.punchHitTiming(data, room.sessionId),
        )
      }
      deps.onPunched(data, room.sessionId)
    })

    room.onMessage('punch_tired', (data: PunchTiredPayload) => deps.onPunchTired(data))

    room.onMessage('wanted', (data: WantedPayload) => {
      if (data.sessionId === room.sessionId) deps.onMyWanted(data.stars)
      else remotes.setWantedStars(data.sessionId, data.stars)
    })

    room.onMessage('trade_nearby', (data: { players: TradeNearbyPlayer[] }) => deps.trade.onNearby(Array.isArray(data.players) ? data.players : []))
    room.onMessage('trade_requested', (data: TradeRequestedPayload) => deps.trade.onRequested(data))
    room.onMessage('trade_pending', (data: TradePendingPayload) => deps.trade.onPending(data))
    room.onMessage('trade_state', (data: TradeStatePayload) => deps.trade.onState(data))
    room.onMessage('trade_closed', (data: TradeClosedPayload) => deps.trade.onClosed(data))
    room.onMessage('trade_completed', (data: TradeCompletedPayload) => deps.trade.onCompleted(data))
    room.onMessage('trade_error', (data: TradeErrorPayload) => deps.trade.onError(data))
    room.onMessage('teleported', (data: TeleportedPayload) => deps.onTeleported(data))
    room.onMessage('admin_menu', (data: AdminMenuPayload) => deps.admin.onMenu(data))
    room.onMessage('admin_error', (data: { message: string }) => deps.admin.onError(data))
    room.onMessage('admin_summoned', (data: AdminSummonedPayload) => deps.admin.onSummoned(data))
    room.onMessage('admin_items', (data: AdminItemsPayload) => deps.admin.onItems(data))
    room.onMessage('admin_result', (data: AdminResultPayload) => deps.admin.onResult(data))
    room.onMessage('admin_granted', (data: AdminGrantedPayload) => deps.admin.onGranted(data))
    room.onMessage('admin_player', (data: AdminPlayerPayload) => deps.admin.onPlayer(data))
    room.onMessage('admin_powers', (data: AdminPowersPayload) => deps.admin.onPowers(data))
    room.onMessage('admin_inventory', (data: AdminInventoryPayload) => deps.admin.onInventory(data))
    room.onMessage('chat_muted', () => deps.admin.onChatMuted())

    room.onMessage('pub_pouring', (data: PubPouringPayload) => deps.pub.onPouring(data, room.sessionId))
    room.onMessage('pub_served', (data: PubServedPayload) => deps.pub.onServed(data))
    room.onMessage('pub_error', (data: PubErrorPayload) => deps.pub.onError(data))
    room.onMessage('pub_secret_result', (data: PubSecretResultPayload) => deps.pub.onSecretResult(data))
    room.onMessage('pub_secret_door', (data: PubSecretDoorPayload) => deps.pub.onSecretDoor(data))
    room.onMessage('pub_bouncer_block', (data: PubBouncerBlockPayload) => deps.pub.onBouncerBlock(data, room.sessionId))
    room.onMessage('pub_bell', (data: PubBellPayload) => deps.pub.onBell(data))
    room.onMessage('pub_race_lobby', (data: PubRaceLobbyPayload) => deps.pubGames.onRaceLobby(data))
    room.onMessage('pub_race_start', (data: PubRaceStartPayload) => deps.pubGames.onRaceStart(data))
    room.onMessage('pub_race_state', (data: PubRaceStatePayload) => deps.pubGames.onRaceState(data))
    room.onMessage('pub_race_end', (data: PubRaceEndPayload) => deps.pubGames.onRaceEnd(data))
    room.onMessage('pub_race_challenged', (data: PubRaceChallengedPayload) => deps.pubChallenge.onChallenged(data))
    room.onMessage('pub_race_challenge_sent', (data: PubRaceChallengeSentPayload) => deps.pubChallenge.onSent(data))
    room.onMessage('pub_race_challenge_result', (data: PubRaceChallengeResultPayload) => deps.pubChallenge.onResult(data))
    room.onMessage('pub_race_challenge_cancelled', (data: PubRaceChallengeCancelledPayload) => deps.pubChallenge.onCancelled(data))
    room.onMessage('orchard_pick_started', (data: { tree: number; durationMs: number }) => deps.orchard.onPickStarted(data))
    room.onMessage('orchard_picked', (data: OrchardPickedPayload) => deps.orchard.onPicked(data))
    room.onMessage('orchard_error', (data: OrchardErrorPayload) => deps.orchard.onError(data))
    room.onMessage('zone_sold', (data: ZoneSoldPayload) => deps.zoneBuyers.onSold(data))
    room.onMessage('zone_sell_error', (data: ZoneSellErrorPayload) => deps.zoneBuyers.onError(data))
    room.onMessage('atm_done', (data: AtmDonePayload) => deps.atm.onDone(data))
    room.onMessage('atm_error', (data: AtmErrorPayload) => deps.atm.onError(data))
    room.onMessage('storage_sale', (data: StorageSalePayload) => deps.storageAuction.onSale(data))
    room.onMessage('storage_sale_soon', () => deps.storageAuction.onSoon())
    room.onMessage('storage_sale_started', (data: { count: number }) => deps.storageAuction.onStarted(data))
    room.onMessage('storage_sale_ended', () => deps.storageAuction.onEnded())
    room.onMessage('storage_opened', (data: StorageOpenedPayload) => deps.storageAuction.onOpened(data))
    room.onMessage('storage_sale_error', (data: { message: string }) => deps.storageAuction.onError(data))
    room.onMessage('task_done', (data: TaskDonePayload) => deps.tasks.onDone(data))
    room.onMessage('tutorial_state', (data: unknown) => deps.tutorial.onState(data))
    room.onMessage('user_badges', (data: { sessionId: string; badges: string[] }) => remotes.setBadges(data.sessionId, data.badges))
    room.onMessage('lockpick_pin', (data: LockpickPinPayload) => deps.lockpick.onPin(data))
    room.onMessage('lockpick_result', (data: LockpickResultPayload) => deps.lockpick.onResult(data))
    room.onMessage('lockpick_error', (data: LockpickErrorPayload) => deps.lockpick.onError(data))
    room.onMessage('door_reinforced', () => deps.lockpick.onReinforced())
    room.onMessage('door_reinforce_error', (data: LockpickErrorPayload) => deps.lockpick.onReinforceError(data))
    room.onMessage('alarm_siren', (data: { door: string }) => deps.lockpick.onAlarmSiren(data))
    room.onMessage('house_alarm', () => deps.lockpick.onHouseAlarm())
    room.onMessage('storage_screen', (data: StorageScreenPayload) => deps.storage.onScreen(data))
    room.onMessage('storage_error', (data: StorageErrorPayload) => deps.storage.onError(data))
    room.onMessage('bed_set_done', () => deps.bed.onDone())
    room.onMessage('bed_error', (data: BedErrorPayload) => deps.bed.onError(data))
    room.onMessage('market_sync', (data: MarketSnapshot) => deps.market.onSync(data))
    room.onMessage('market_done', (data: MarketDonePayload) => deps.market.onDone(data))
    room.onMessage('market_error', (data: MarketErrorPayload) => deps.market.onError(data))
    room.onMessage('market_sold', (data: MarketSoldPayload) => deps.market.onSold(data))
    room.onMessage('cash_bag_dropped', (data: CashBagPayload) => deps.cashBags.onDropped(data))
    room.onMessage('cash_bag_removed', (data: { id: number }) => deps.cashBags.onRemoved(data))
    room.onMessage('cash_bag_picked', (data: CashBagPickedPayload) => deps.cashBags.onPicked(data))
    room.onMessage('cash_bag_error', (data: CashBagErrorPayload) => deps.cashBags.onError(data))
    room.onMessage('jail_state', (data: JailStatePayload) => deps.jail.onState(data))
    room.onMessage('jail_released', (data: JailReleasedPayload) => deps.jail.onReleased(data))
    room.onMessage('jail_error', (data: JailErrorPayload) => deps.jail.onError(data))
    room.onMessage('jail_tray', (data: JailTrayPayload) => deps.jail.onTray(data))
    room.onMessage('police_state', (data: PoliceStatePayload) => deps.police.onState(data))
    room.onMessage('police_licence_bought', (data: PoliceLicenceBoughtPayload) => deps.police.onBought(data))
    room.onMessage('police_duty_ended', (data: PoliceDutyEndedPayload) => deps.police.onDutyEnded(data))
    room.onMessage('police_error', (data: PoliceErrorPayload) => deps.police.onError(data))
    room.onMessage('police_cuff_started', (data: PoliceCuffStartedPayload) => deps.police.onCuffStarted(data))
    room.onMessage('police_cuff_cancelled', (data: PoliceCuffCancelledPayload) => deps.police.onCuffCancelled(data))
    room.onMessage('police_cuffs', (data: PoliceCuffsPayload) => deps.police.onCuffs(data))
    room.onMessage('police_bounty', (data: PoliceBountyPayload) => deps.police.onBounty(data))
    room.onMessage('sports_pass_state', (data: SportsPassStatePayload) => deps.sports.onPassState(data))
    room.onMessage('sports_pass_bought', (data: SportsPassBoughtPayload) => deps.sports.onPassBought(data))
    room.onMessage('sports_pass_error', (data: SportsErrorPayload) => deps.sports.onPassError(data))
    room.onMessage('sports_lobby', (data: SportsLobbyPayload) => deps.sports.onLobby(data))
    room.onMessage('sports_lobby_closed', (data: SportsLobbyClosedPayload) => deps.sports.onLobbyClosed(data))
    room.onMessage('sports_error', (data: SportsErrorPayload) => deps.sports.onError(data))
    room.onMessage('climb_state', (data: ClimbStatePayload) => deps.climbing.onState(data))
    room.onMessage('climb_error', (data: ClimbErrorPayload) => deps.climbing.onError(data))
    room.onMessage('sports_loans', (data: SportsLoansPayload) => applySportsLoans(data))
    room.onMessage('sports_run_state', (data: SportsRunStatePayload) => deps.sports.onRunState(data))
    room.onMessage('sports_run_result', (data: SportsRunResultPayload) => deps.sports.onRunResult(data))
    room.onMessage('gym_state', (data: GymStatePayload) => deps.gym.onState(data))
    room.onMessage('gym_event', (data: GymEventPayload) => deps.gym.onEvent(data))
    room.onMessage('gym_end', (data: GymEndPayload) => deps.gym.onEnd(data))
    room.onMessage('gym_free', (data: GymFreePayload) => deps.gym.onFree(data))
    room.onMessage('gym_error', (data: GymErrorPayload) => deps.gym.onError(data))
    room.onMessage('tennis_state', (data: TennisStatePayload) => deps.sports.onTennisState(data))
    room.onMessage('tennis_free', (data: TennisFreePayload) => deps.sports.onTennisFree(data))
    room.onMessage('tennis_stroke', (data: TennisStrokePayload) => {
      if (data.sessionId !== room.sessionId) remotes.tennisStroke(data.sessionId, data.stroke)
    })
    room.onMessage('dance_start', (raw: unknown) => {
      const start = parseDanceStart(raw)
      for (const d of start.dancers) if (d.sessionId !== room.sessionId) remotes.setDancing(d.sessionId, { clip: RHYTHM_DANCE_CLIP, timeScale: danceTimeScale(start.bpm) })
      deps.dance.onStart(start)
    })
    room.onMessage('dance_judge', (data: DanceJudge) => {
      if (data.sessionId !== room.sessionId && data.judgement === 'miss') remotes.stumble(data.sessionId)
      else if (data.sessionId !== room.sessionId) remotes.danceMove(data.sessionId, data.lane)
      deps.dance.onJudge(data)
    })
    room.onMessage('dance_stray', () => deps.dance.onStray())
    const showEmote = (data: UserEmotePayload) => {
      if (data.sessionId !== room.sessionId) {
        const clip = data.emote === null ? null : deps.emotes.clipOf(data.emote)
        remotes.setDancing(data.sessionId, clip === null ? null : { clip, timeScale: EMOTE_TIME_SCALE })
      }
      deps.emotes.onUserEmote(data, room.sessionId)
    }
    room.onMessage('user_emote', showEmote)
    room.onMessage('user_emotes', (data: { emotes: UserEmotePayload[] }) => data.emotes.forEach(showEmote))
    room.onMessage('emote_list', (data: { unlocked: string[] }) => deps.emotes.onList(data))
    room.onMessage('emote_error', (data: { message: string }) => deps.emotes.onError(data))
    room.onMessage('dance_end', (data: DanceEnd) => {
      for (const d of data.dancers) if (d.sessionId !== room.sessionId) remotes.setDancing(d.sessionId, null)
      deps.dance.onEnd(data)
    })
    room.onMessage('boxing_state', (data: BoxingStatePayload) => {
      const boxers = new Set(data.boxers.flatMap((b) => (b.sessionId && b.sessionId !== room.sessionId ? [b.sessionId] : [])))
      for (const sessionId of dressedBoxers) if (!boxers.has(sessionId)) remotes.setBoxer(sessionId, false)
      if (undressTimer) clearTimeout(undressTimer)
      undressTimer = null
      for (const b of data.boxers) {
        if (!b.sessionId || !boxers.has(b.sessionId)) continue
        remotes.setBoxer(b.sessionId, true)
        remotes.boxerPose(b.sessionId, boxerPose(data, b))
      }
      dressedBoxers = boxers
      if (data.phase === 'over') {
        undressTimer = setTimeout(() => {
          for (const sessionId of dressedBoxers) remotes.setBoxer(sessionId, false)
          dressedBoxers = new Set()
        }, BOXER_UNDRESS_MS)
      }
      deps.boxing.onState(data)
    })
    room.onMessage('boxing_hit', (data: BoxingHitPayload) => {
      if (data.sessionId !== room.sessionId) remotes.boxerShot(data.sessionId, punchClip(data.kind))
      if (data.outcome === 'landed' && data.targetSessionId !== room.sessionId) {
        const from = remotes.positionOf(data.sessionId)
        const to = remotes.positionOf(data.targetSessionId)
        const dx = from && to ? to.x - from.x : 0
        const dz = from && to ? to.z - from.z : 0
        const len = Math.hypot(dx, dz) || 1
        remotes.showHit(data.targetSessionId, dx / len, dz / len, data.damage, { delay: 0, hitStop: 0 }, 'glove_hit')
        remotes.boxerShot(data.targetSessionId, 'HitReact')
      }
      deps.boxing.onHit(data, room.sessionId)
    })
    room.onMessage('boxing_dodged', (data: BoxingDodgedPayload) => {
      if (data.sessionId !== room.sessionId) remotes.boxerShot(data.sessionId, data.side === 'left' ? 'DodgeL' : 'DodgeR')
      deps.boxing.onDodged(data)
    })
    room.onMessage('boxing_tired', () => deps.boxing.onTired())
    room.onMessage('boxing_bag_hit', (data: BoxingBagHitPayload) => deps.boxing.onBagHit(data))
    room.onMessage('boxing_no_gloves', () => deps.boxing.onNoGloves())
    room.onMessage('skate_race', (data: SkateRacePayload) => deps.skating.onRace(data))
    room.onMessage('skate_fall', (data: SkateFallPayload) => {
      if (data.sessionId === room.sessionId) deps.skating.onFall(data)
      else remotes.skateMove(data.sessionId, 'fall')
    })
    room.onMessage('skate_move', (data: SkateMovePayload) => {
      if (data.move === 'push') remotes.skatePushed(data.sessionId)
      else remotes.skateMove(data.sessionId, data.move)
    })
    room.onMessage('skate_bump', (data: SkateBumpPayload) => deps.skating.onBump(data))
    room.onMessage('skate_result', (data: SkateResultPayload) => deps.skating.onResult(data))
    room.onMessage('pool_race_start', (data: PoolRaceStart) => deps.pool.onStart(data))
    room.onMessage('pool_race_beep', () => deps.pool.onBeep())
    room.onMessage('pool_race_state', (data: PoolRaceState) => deps.pool.onState(data))
    room.onMessage('pool_stroke_result', (data: { result: StrokeResult }) => deps.pool.onStrokeResult(data))
    room.onMessage('pool_race_result', (data: PoolRaceResult) => deps.pool.onResult(data))
    room.onMessage('pool_dive', (data: PoolDive) => deps.pool.onDive(data))
    room.onMessage('pool_dive_trick', (data: { sessionId: string; name: string; trick: Trick }) => deps.pool.onTrick(data))
    room.onMessage('pickpocket_started', (data: PickpocketStartedPayload) => deps.pickpocket.onStarted(data))
    room.onMessage('pickpocket_progress', (data: PickpocketProgressPayload) => deps.pickpocket.onProgress(data))
    room.onMessage('pickpocket_failed', (data: PickpocketFailedPayload) => deps.pickpocket.onFailed(data))
    room.onMessage('pickpocket_succeeded', (data: PickpocketSucceededPayload) => deps.pickpocket.onSucceeded(data))
    room.onMessage('pickpocket_loot', (data: PickpocketLootPayload) => deps.pickpocket.onLoot(data))
    room.onMessage('pickpocket_taken', (data: PickpocketTakenPayload) => deps.pickpocket.onTaken(data))
    room.onMessage('pickpocket_loot_closed', () => deps.pickpocket.onLootClosed())
    room.onMessage('pickpocket_alert', (data: PickpocketAlertPayload) => deps.pickpocket.onAlert(data))
    room.onMessage('pickpocket_missing', (data: PickpocketMissingPayload) => deps.pickpocket.onMissing(data))
    room.onMessage('pickpocket_error', (data: PickpocketErrorPayload) => deps.pickpocket.onError(data))
    room.onMessage('farm_picked', (data: FarmPickedPayload) => deps.farm.onPicked(data))
    room.onMessage('farm_error', (data: FarmErrorPayload) => deps.farm.onError(data))
    room.onMessage('pub_shots_ready', (data: PubShotsReadyPayload) => deps.pubGames.onShotsReady(data))
    room.onMessage('pub_shots_result', (data: PubShotsResultPayload) => deps.pubGames.onShotsResult(data))
    room.onMessage('pub_darts_lobby', (data: PubDartsLobbyPayload) => deps.pubGames.onDartsLobby(data))
    room.onMessage('pub_darts_state', (data: PubDartsStatePayload) => deps.pubGames.onDartsState(data))
    room.onMessage('pub_darts_end', (data: PubDartsEndPayload) => deps.pubGames.onDartsEnd(data))
    room.onMessage('pub_quiz_announce', (data: PubQuizAnnouncePayload) => deps.pubQuiz.onAnnounce(data))
    room.onMessage('pub_quiz_lobby', (data: PubQuizLobbyPayload) => deps.pubQuiz.onLobby(data))
    room.onMessage('pub_quiz_cancelled', (data: PubQuizCancelledPayload) => deps.pubQuiz.onCancelled(data))
    room.onMessage('pub_quiz_question', (data: PubQuizQuestionPayload) => deps.pubQuiz.onQuestion(data))
    room.onMessage('pub_quiz_answered', (data: PubQuizAnsweredPayload) => deps.pubQuiz.onAnswered(data))
    room.onMessage('pub_quiz_reveal', (data: PubQuizRevealPayload) => deps.pubQuiz.onReveal(data))
    room.onMessage('pub_quiz_results', (data: PubQuizResultsPayload) => deps.pubQuiz.onResults(data))
    room.onMessage('pub_quiz_prize', (data: PubQuizPrizePayload) => deps.pubQuiz.onPrize(data))

    room.onMessage('apartment_inventory', (data: { items: ApartmentInventoryItem[] }) => {
      onInventory(Array.isArray(data.items) ? data.items : [])
    })

    room.onMessage('apartment_inventory_error', (data: { message?: string }) => {
      deps.inventory.loading.value = false
      deps.inventory.error.value = data.message ?? 'Could not load apartment inventory.'
    })

    room.onMessage('apartment_action_error', (data: { message?: string }) => {
      deps.roomMessage.value = data.message ?? 'Apartment action failed.'
      deps.apartment.onActionError()
    })

    room.onMessage('voice_token', (data: VoiceTokenPayload) => deps.voice.onToken(data))
    room.onLeave((code: number) => {
      void deps.voice.disconnect()
      if (code === ADMIN_KICK_CLOSE_CODE) deps.roomMessage.value = deps.admin.kickedMessage()
      else if (!switchingRoom.value) deps.roomMessage.value = 'Disconnected from realtime room.'
    })
  }

  // ------------------------------------------------------------ connection

  let lastSentSignature: string | null = null

  function appearancePayload(state: CharacterCosmeticsState) {
    return {
      slots: appearanceIdsFromLoadout(state.slots),
      slotHexes: { ...state.colors },
      bodyModelGlb: bodyModelGlbFromLoadout(state.slots),
      slotModels: wearModelsFromLoadout(state.slots),
      character: state.character,
    }
  }

  function sendMyAppearance(state: CharacterCosmeticsState): void {
    const payload = appearancePayload(state)
    const signature = JSON.stringify(payload)
    if (signature === lastSentSignature) return
    lastSentSignature = signature
    deps.onMyOutfit(payload.slotModels)
    deps.gameRoomRef.value?.send('appearance', payload)
  }

  /**
   * Window focus re-checks the equipped outfit (it may have changed in the locker): throttled, and only sent when
   * the look actually changed, since each 'appearance' message makes every other client rebuild our avatar.
   */
  function installAppearanceRefresh(state: CharacterCosmeticsState): void {
    let lastRefreshAt = 0
    lastSentSignature = JSON.stringify(appearancePayload(state))
    deps.refreshMyAppearance.value = () => {
      const now = Date.now()
      if (now - lastRefreshAt < APPEARANCE_REFRESH_MIN_INTERVAL_MS) return
      lastRefreshAt = now
      void fetchCharacterCosmetics()
        .then(sendMyAppearance)
        .catch(() => {
          /* keep previous values if refresh fails */
        })
    }
  }

  async function connectRealtime(state: CharacterCosmeticsState): Promise<void> {
    const auth = getStoredAuth()
    if (!auth) {
      void deps.router.push({ name: 'landing' })
      return
    }
    const wsUrl = toWsUrl(REALTIME_HTTP_URL)
    colyseusClient ??= new ColyseusClient(wsUrl)

    switchingRoom.value = true
    try {
      if (deps.gameRoomRef.value) {
        await deps.gameRoomRef.value.leave()
        deps.gameRoomRef.value = null
      }
      remotes.clear()
      deps.apartment.detachForRoomSwitch()
      const room: Room = await colyseusClient.joinOrCreate('city', {
        token: auth.token,
        ...appearancePayload(state),
        appearance: appearanceIdsFromLoadout(state.slots),
      })
      deps.loadTown()
      deps.gameRoomRef.value = room
      bindRoomEvents(room)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[realtime] Colyseus join failed', { room: 'city', wsUrl, message, err })
      const devHint = import.meta.env.DEV && message.length > 0 ? ` (${message})` : ''
      deps.roomMessage.value = `Could not connect to city instance.${devHint}`
    } finally {
      switchingRoom.value = false
    }
    installAppearanceRefresh(state)
  }

  return {
    connectRealtime,
    sendMyAppearance,
    switchingRoom,
    clearRemoteUsers: remotes.clear,
    tickRemoteAvatars: remotes.tick,
    remotePseudo: remotes.pseudoOf,
    remotePosition: remotes.positionOf,
    remoteAvatar: remotes.avatarOf,
    remoteSportsMove: remotes.playSportsMove,
    setRemoteDribbling: remotes.setDribbling,
    setRemoteTopOverride: remotes.setTopOverride,
    setRemoteSwimwear: remotes.setSwimwear,
    playRemotePoolClip: remotes.playPoolClip,
    setRemoteVoiceState: remotes.setVoiceState,
    remotePlayers: remotes.players,
    remoteAccount: remotes.accountOf,
    setRemoteRacePint: remotes.setRacePint,
    setRemoteRacePose: remotes.setRacePose,
    setRemoteHeldTool: remotes.setHeldTool,
    setRemoteTennis: remotes.setTennis,
    setRemoteClimbAnimation: remotes.setClimbAnimation,
    remoteHand: remotes.handOf,
    playRemotePetanque: remotes.playPetanque,
    setRemoteCrouching: remotes.setCrouching,
  }
}
