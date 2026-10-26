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
import { APARTMENT_SPAWN } from '../../game/gameRoomConstants'
import type {
  ApartmentInitPayload,
  ApartmentInventoryItem,
  ApartmentObjectPayload,
  HouseFurniturePayload,
  HousingUnitPayload,
  RemoteUserPayload,
  RoomInitPayload,
} from '../../types/gameRealtime'
import { useRemoteAvatars, type RemoteLocation } from './useRemoteAvatars'

const REALTIME_HTTP_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

/** Minimum delay between two cosmetics re-checks triggered by window focus. */
const APPEARANCE_REFRESH_MIN_INTERVAL_MS = 10_000

type Zone = 'city' | 'apartment'

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
  getCanvas: () => HTMLCanvasElement | null
  pointerLocked: Ref<boolean>
  requestPointerLock: () => void

  /** Where the local player is: the town, or inside a house / work building ('apartment'). */
  currentRoomLabel: Ref<Zone>
  canEditApartment: Ref<boolean>
  visitedApartmentOwnerId: Ref<number | null>
  /** Work building we are inside (business district), null in the city or a house. */
  visitedWorkKey: Ref<string | null>
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
    selectedPlacedObjectId: Ref<string>
    detachForRoomSwitch: () => void
    ensureApartmentObjectsFromServer: (objects: ApartmentObjectPayload[]) => void
    clearApartmentObjects: () => void
    upsertApartmentObjectFromRemote: (payload: ApartmentObjectPayload) => void
    removeApartmentObjectMesh: (objectId: string) => void
    /** The server refused a spawn / move / pickup. */
    onActionError: () => void
  }
  /** templateKey: apartment template ('housing_<unit_id>') so the matching house interior loads. */
  setRoomEnvironment: (kind: Zone, templateKey?: string, workKey?: string | null) => void
  onHousingUnitsSync: (units: HousingUnitPayload[]) => void
  onHouseFurnitureSync: (houses: HouseFurniturePayload[]) => void
  onDoorsSync: (openDoorIds: string[]) => void
}

/**
 * Colyseus 'city' room: connection, server message bindings, other players' avatars, and moving between the
 * town and buildings (the server answers with apartment_init / user_zone_changed).
 */
export function useGameRealtime(deps: GameRealtimeDeps) {
  let colyseusClient: ColyseusClient | null = null
  const switchingRoom = ref(false)
  /** Between a door click and the server's answer (overlay hidden meanwhile). */
  const transitioning = ref(false)
  let relockPointerAfterTransition = false

  let previousQuantityByCode: Record<string, number> = {}
  let isInitialInventoryLoad = true

  function isVisible(location: RemoteLocation): boolean {
    if (deps.currentRoomLabel.value === 'city') return location.zone === 'city'
    const myWorkKey = deps.visitedWorkKey.value
    if (myWorkKey !== null || location.workKey !== null) {
      return location.zone === 'apartment' && location.workKey === myWorkKey
    }
    const visitedOwner = deps.visitedApartmentOwnerId.value ?? getStoredAuth()?.user.account_id ?? null
    return location.zone === 'apartment' && location.apartmentOwnerId !== null && location.apartmentOwnerId === visitedOwner
  }

  const remotes = useRemoteAvatars({ getScene: deps.getScene, myPosition: deps.myPosition, isVisible })

  function setMyPosition(x: number, y: number, z: number): void {
    deps.myPosition.x = x
    deps.myPosition.y = y
    deps.myPosition.z = z
    deps.getCamera()?.position.set(x, y, z)
  }

  // ------------------------------------------------------------ building transitions

  function beginTransition(): void {
    transitioning.value = true
    relockPointerAfterTransition = deps.pointerLocked.value
  }

  function finishTransition(): void {
    transitioning.value = false
    const shouldRelock = relockPointerAfterTransition
    relockPointerAfterTransition = false
    if (!shouldRelock) return
    setTimeout(() => {
      const canvas = deps.getCanvas()
      if (!canvas || document.pointerLockElement === canvas) return
      try {
        deps.requestPointerLock()
      } catch {
        /* browsers may reject without a gesture */
      }
    }, 0)
  }

  /** Work buildings are free and public: no purchase or lease, the server just moves us inside. */
  function enterWork(workKey: string): void {
    const room = deps.gameRoomRef.value
    if (!room || transitioning.value) return
    beginTransition()
    room.send('enter_work', { workKey })
  }

  function exitBuilding(): void {
    const room = deps.gameRoomRef.value
    if (!room) return
    beginTransition()
    room.send('exit_apartment')
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
      deps.currentRoomLabel.value = payload.me.zone
      deps.setRoomEnvironment(payload.me.zone)
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
    room.onMessage('door_error', (data: { message: string }) => {
      deps.roomMessage.value = data.message
    })

    room.onMessage('user_joined', (data: RemoteUserPayload) => {
      if (data.sessionId !== room.sessionId) void remotes.upsert(data.sessionId, data)
    })

    room.onMessage('user_moved', (data: { sessionId: string; x: number; y: number; z: number; ry?: number }) => {
      remotes.setTarget(data.sessionId, data.x, data.y, data.z, data.ry)
    })

    // Players already in the zone we just entered (sent after our own user_zone_changed / apartment_init).
    room.onMessage('zone_users', (data: { users?: RemoteUserPayload[] }) => {
      for (const u of data.users ?? []) {
        if (u.sessionId !== room.sessionId) void remotes.upsert(u.sessionId, u)
      }
    })

    room.onMessage(
      'appearance_updated',
      (data: { sessionId: string; slotHexes?: Record<string, string>; bodyModelGlb?: string | null }) => {
        if (data.sessionId !== room.sessionId) void remotes.updateAppearance(data.sessionId, data)
      },
    )

    room.onMessage('user_left', (data: { sessionId: string }) => remotes.remove(data.sessionId))

    room.onMessage(
      'user_zone_changed',
      (data: {
        sessionId: string
        zone: Zone
        apartmentOwnerId: number | null
        workKey?: string | null
        x: number
        y: number
        z: number
      }) => {
        if (data.sessionId !== room.sessionId) {
          const location = { zone: data.zone, apartmentOwnerId: data.apartmentOwnerId, workKey: data.workKey ?? null }
          remotes.moveToZone(data.sessionId, location, data.x, data.y, data.z)
          return
        }
        deps.currentRoomLabel.value = data.zone
        // apartment_init already loaded the right interior (it carries the template key)
        if (data.zone === 'city') deps.setRoomEnvironment('city')
        setMyPosition(data.x, data.y, data.z)
        remotes.pruneInvisible()
        if (data.zone === 'city') {
          deps.canEditApartment.value = false
          deps.visitedApartmentOwnerId.value = null
          deps.visitedWorkKey.value = null
          deps.apartment.clearApartmentObjects()
          finishTransition()
        }
      },
    )

    room.onMessage('apartment_init', (payload: ApartmentInitPayload) => {
      previousQuantityByCode = {}
      isInitialInventoryLoad = true
      deps.canEditApartment.value = payload.canEdit === true
      deps.visitedApartmentOwnerId.value = payload.ownerAccountId
      deps.visitedWorkKey.value = payload.workKey ?? null
      deps.currentRoomLabel.value = 'apartment'
      deps.setRoomEnvironment('apartment', payload.templateKey, payload.workKey ?? null)
      setMyPosition(APARTMENT_SPAWN.x, APARTMENT_SPAWN.y, APARTMENT_SPAWN.z)
      remotes.pruneInvisible()
      deps.apartment.ensureApartmentObjectsFromServer(payload.objects)
      if (payload.workKey) {
        // work buildings have no decoration inventory
        deps.inventory.loading.value = false
      } else {
        deps.inventory.loading.value = true
        room.send('apartment_inventory_request')
      }
      finishTransition()
    })

    room.onMessage('apartment_object_upserted', (data: ApartmentObjectPayload) => {
      deps.apartment.upsertApartmentObjectFromRemote(data)
      if (!deps.apartment.selectedPlacedObjectId.value) deps.apartment.selectedPlacedObjectId.value = data.objectId
    })

    room.onMessage('apartment_object_removed', (data: { objectId: string }) => {
      deps.apartment.removeApartmentObjectMesh(data.objectId)
    })

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

    room.onMessage('apartment_error', (data: { message?: string }) => {
      deps.roomMessage.value = data.message ?? 'Could not enter apartment.'
      transitioning.value = false
      relockPointerAfterTransition = false
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
      deps.currentRoomLabel.value = 'city'
      const room: Room = await colyseusClient.joinOrCreate('city', {
        token: auth.token,
        appearance: appearanceIdsFromLoadout(state.slots),
        slotHexes: { body: state.colors.body },
        bodyModelGlb: bodyModelGlbFromLoadout(state.slots),
      })
      deps.setRoomEnvironment('city')
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
    transitioning,
    enterWork,
    exitBuilding,
    clearRemoteUsers: remotes.clear,
    tickRemoteAvatars: remotes.tick,
  }
}
