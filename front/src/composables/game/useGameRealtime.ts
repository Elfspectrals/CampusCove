import { ref, type Ref, type ShallowRef } from 'vue'
import type { Router } from 'vue-router'
import type * as THREE from 'three'
import { Client as ColyseusClient, type Room } from '@colyseus/sdk'
import {
  appearanceIdsFromLoadout,
  bodyModelGlbFromLoadout,
  fetchCharacterCosmetics,
  type CharacterCosmeticsState,
} from '../../api/characterCosmetics'
import { parseHousingUnitList } from '../../api/housing'
import { getStoredAuth } from '../../api/session'
import type { SfxName } from '../../game/sfx'
import type {
  ApartmentInventoryItem,
  HouseFurniturePayload,
  HousingUnitPayload,
  PunchTiredPayload,
  RemoteUserPayload,
  RoomInitPayload,
  UserActionPayload,
  UserPunchedPayload,
} from '../../types/gameRealtime'
import { useRemoteAvatars } from './useRemoteAvatars'
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
  onMyBodyModel: (bodyModelGlb: string | null) => void
  onPunched: (data: UserPunchedPayload, mySessionId: string) => void
  onPunchTired: (data: PunchTiredPayload) => void
  playSoundOn: (name: SfxName, object: THREE.Object3D, delayS: number) => void
  punchHitTiming: (data: UserPunchedPayload, mySessionId: string) => { delay: number; hitStop: number }
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
        if (u.sessionId !== room.sessionId) void remotes.upsert(u.sessionId, u)
      }
      if (payload.housingUnits !== undefined) syncHousingUnits(payload.housingUnits)
      if (payload.houseFurniture !== undefined) deps.onHouseFurnitureSync(payload.houseFurniture)
      if (payload.openDoors !== undefined) deps.onDoorsSync(payload.openDoors)
    })

    room.onMessage('housing_units_sync', (data: { units?: unknown }) => syncHousingUnits(data.units))
    room.onMessage('house_furniture_sync', (data: { houses: HouseFurniturePayload[] }) => deps.onHouseFurnitureSync(data.houses))
    room.onMessage('doors_sync', (data: { openDoors: string[] }) => deps.onDoorsSync(data.openDoors))
    room.onMessage('position_correction', (data: { x: number; y: number; z: number }) => {
      setMyPosition(data.x, data.y, data.z)
    })
    room.onMessage('door_error', (data: { message: string }) => {
      deps.roomMessage.value = data.message
    })

    room.onMessage('user_joined', (data: RemoteUserPayload) => {
      if (data.sessionId !== room.sessionId) void remotes.upsert(data.sessionId, data)
    })

    room.onMessage('user_moved', (data: { sessionId: string; x: number; y: number; z: number; ry?: number }) => {
      remotes.setTarget(data.sessionId, data.x, data.y, data.z, data.ry)
    })

    room.onMessage(
      'appearance_updated',
      (data: { sessionId: string; slotHexes?: Record<string, string>; bodyModelGlb?: string | null }) => {
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

  /**
   * Window focus re-checks the equipped skin (it may have changed in the locker): throttled, and only sent when
   * the look actually changed, since each 'appearance' message makes every other client rebuild our avatar.
   */
  function installAppearanceRefresh(state: CharacterCosmeticsState): void {
    const signatureOf = (s: CharacterCosmeticsState) =>
      JSON.stringify({
        body: appearanceIdsFromLoadout(s.slots).body ?? null,
        hex: s.colors.body,
        glb: bodyModelGlbFromLoadout(s.slots),
      })
    let lastRefreshAt = 0
    let lastSentSignature = signatureOf(state)
    deps.refreshMyAppearance.value = () => {
      const now = Date.now()
      if (now - lastRefreshAt < APPEARANCE_REFRESH_MIN_INTERVAL_MS) return
      lastRefreshAt = now
      void fetchCharacterCosmetics()
        .then((latest) => {
          const signature = signatureOf(latest)
          if (signature === lastSentSignature) return
          lastSentSignature = signature
          deps.onMyBodyModel(bodyModelGlbFromLoadout(latest.slots))
          deps.gameRoomRef.value?.send('appearance', {
            slots: { body: appearanceIdsFromLoadout(latest.slots).body },
            slotHexes: { body: latest.colors.body },
            bodyModelGlb: bodyModelGlbFromLoadout(latest.slots),
          })
        })
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
        appearance: appearanceIdsFromLoadout(state.slots),
        slotHexes: { body: state.colors.body },
        bodyModelGlb: bodyModelGlbFromLoadout(state.slots),
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
    switchingRoom,
    clearRemoteUsers: remotes.clear,
    tickRemoteAvatars: remotes.tick,
  }
}
