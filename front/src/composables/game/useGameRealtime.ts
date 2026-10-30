import { ref, type Ref, type ShallowRef } from 'vue'
import type { Router } from 'vue-router'
import type * as THREE from 'three'
import { Client as ColyseusClient, type Room } from '@colyseus/sdk'
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
  ApartmentInventoryItem,
  DoorSoundPayload,
  HouseFurniturePayload,
  HousingUnitPayload,
  PubBellPayload,
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
  TradeClosedPayload,
  TradeCompletedPayload,
  TradeErrorPayload,
  TradeNearbyPlayer,
  TradePendingPayload,
  TradeRequestedPayload,
  TradeStatePayload,
  UserActionPayload,
  UserPunchedPayload,
  UserSeatedPayload,
} from '../../types/gameRealtime'
import { useRemoteAvatars, type SeatPose } from './useRemoteAvatars'
import { PUNCH_DAMAGE } from '../../game/punch'

const REALTIME_HTTP_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

/** Minimum delay between two cosmetics re-checks triggered by window focus. */
const APPEARANCE_REFRESH_MIN_INTERVAL_MS = 10_000

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
  onPunched: (data: UserPunchedPayload, mySessionId: string) => void
  onPunchTired: (data: PunchTiredPayload) => void
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
}

/** Colyseus 'city' room: connection, server message bindings and other players' avatars. */
export function useGameRealtime(deps: GameRealtimeDeps) {
  let colyseusClient: ColyseusClient | null = null
  const switchingRoom = ref(false)

  let previousQuantityByCode: Record<string, number> = {}
  let isInitialInventoryLoad = true

  const remotes = useRemoteAvatars({ getScene: deps.getScene, myPosition: deps.myPosition, playSoundOn: deps.playSoundOn })

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
    })

    room.onMessage('housing_units_sync', (data: { units?: unknown }) => syncHousingUnits(data.units))
    room.onMessage('house_furniture_sync', (data: { houses: HouseFurniturePayload[] }) => deps.onHouseFurnitureSync(data.houses))
    room.onMessage('doors_sync', (data: { openDoors: string[] }) => deps.onDoorsSync(data.openDoors))
    room.onMessage('door_sound', (data: DoorSoundPayload) => deps.onDoorSound(data))
    room.onMessage('position_correction', (data: { x: number; y: number; z: number }) => {
      setMyPosition(data.x, data.y, data.z)
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

    room.onMessage('user_moved', (data: { sessionId: string; x: number; y: number; z: number; ry?: number }) => {
      remotes.setTarget(data.sessionId, data.x, data.y, data.z, data.ry)
    })

    room.onMessage(
      'appearance_updated',
      (data: { sessionId: string; slotHexes?: Record<string, string>; bodyModelGlb?: string | null; slotModels?: Record<string, string | null> }) => {
        if (data.sessionId !== room.sessionId) void remotes.updateAppearance(data.sessionId, data)
      },
    )

    room.onMessage('user_left', (data: { sessionId: string }) => remotes.remove(data.sessionId))

    room.onMessage('user_action', (data: UserActionPayload) => {
      if (data.sessionId !== room.sessionId && (data.action === 'eat' || data.action === 'drink')) {
        remotes.showAction(data.sessionId, data.action, typeof data.code === 'string' ? data.code : null)
      }
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

    room.onMessage('trade_nearby', (data: { players: TradeNearbyPlayer[] }) => deps.trade.onNearby(Array.isArray(data.players) ? data.players : []))
    room.onMessage('trade_requested', (data: TradeRequestedPayload) => deps.trade.onRequested(data))
    room.onMessage('trade_pending', (data: TradePendingPayload) => deps.trade.onPending(data))
    room.onMessage('trade_state', (data: TradeStatePayload) => deps.trade.onState(data))
    room.onMessage('trade_closed', (data: TradeClosedPayload) => deps.trade.onClosed(data))
    room.onMessage('trade_completed', (data: TradeCompletedPayload) => deps.trade.onCompleted(data))
    room.onMessage('trade_error', (data: TradeErrorPayload) => deps.trade.onError(data))

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
    room.onMessage('pub_shots_ready', (data: PubShotsReadyPayload) => deps.pubGames.onShotsReady(data))
    room.onMessage('pub_shots_result', (data: PubShotsResultPayload) => deps.pubGames.onShotsResult(data))
    room.onMessage('pub_darts_lobby', (data: PubDartsLobbyPayload) => deps.pubGames.onDartsLobby(data))
    room.onMessage('pub_darts_state', (data: PubDartsStatePayload) => deps.pubGames.onDartsState(data))
    room.onMessage('pub_darts_end', (data: PubDartsEndPayload) => deps.pubGames.onDartsEnd(data))

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

    room.onLeave(() => {
      if (!switchingRoom.value) deps.roomMessage.value = 'Disconnected from realtime room.'
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
    setRemoteRacePint: remotes.setRacePint,
  }
}
