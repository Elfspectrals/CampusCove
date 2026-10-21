import { ref, toRaw, type Ref, type ShallowRef } from 'vue'
import type { Router } from 'vue-router'
import * as THREE from 'three'
import { Client as ColyseusClient, type Room } from '@colyseus/sdk'
import {
  SLOTS,
  fetchCharacterCosmetics,
  appearanceIdsFromLoadout,
  bodyModelGlbFromLoadout,
  DEFAULT_SLOT_COLORS,
  type CharacterCosmeticsState,
  type CosmeticColors,
} from '../../api/characterCosmetics'
import { getStoredAuth } from '../../api/auth'
import { createTintedCharacterFromUrl, updateAvatarAnimation } from '../../avatar/glbCharacter'
import { buildCompositeAvatar, disposeObject3D } from '../../avatar/compositeAvatar'
import { APARTMENT_SPAWN, EYE_HEIGHT } from '../../game/gameRoomConstants'
import type {
  ApartmentInitPayload,
  ApartmentInventoryItem,
  ApartmentObjectPayload,
  HousingUnitPayload,
  OtherUser,
  PendingAppearanceUpdate,
  RemoteUserPayload,
  RoomInitPayload,
} from '../../types/gameRealtime'

function toWsUrl(rawUrl: string): string {
  if (rawUrl.startsWith('https://')) return `wss://${rawUrl.slice('https://'.length)}`
  if (rawUrl.startsWith('http://')) return `ws://${rawUrl.slice('http://'.length)}`
  return rawUrl
}

function nextRenderToken(map: Map<string, number>, sessionId: string): number {
  const next = (map.get(sessionId) ?? 0) + 1
  map.set(sessionId, next)
  return next
}

function parseBodyTintColors(raw: Record<string, string> | null | undefined): CosmeticColors {
  const bodyHex =
    raw && typeof raw.body === 'string' && /^#[0-9A-Fa-f]{6}$/.test(raw.body) ? raw.body : DEFAULT_SLOT_COLORS.body
  const out = { ...DEFAULT_SLOT_COLORS }
  for (const s of SLOTS) out[s] = bodyHex
  return out
}

function parseBodyModelGlb(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null
}

/** Skins face +Z while the camera looks towards -Z at yaw 0, hence the half turn. */
function placeAvatar(group: THREE.Group, x: number, y: number, z: number, ry: number) {
  group.position.set(x, y - EYE_HEIGHT, z)
  group.rotation.y = ry + Math.PI
}

/** Minimum delay between two cosmetics re-checks triggered by window focus. */
const APPEARANCE_REFRESH_MIN_INTERVAL_MS = 10_000

/** How fast remote avatars catch up with their last known position (1/s; higher = snappier). */
const REMOTE_SMOOTHING = 12
/** Beyond this gap (teleport, spawn), remote avatars jump instead of gliding. */
const REMOTE_SNAP_DISTANCE = 4
/** Beyond this distance from the local player a rigged avatar's clips are not advanced (not worth the CPU). */
const ANIMATION_MAX_DISTANCE = 60

function parseYaw(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

export interface GameRealtimeDeps {
  router: Router
  realtimeHttpUrl: string

  /** Current Colyseus room; updated when join succeeds. */
  gameRoomRef: ShallowRef<Room | null>

  getScene: () => THREE.Scene | undefined

  camera: THREE.PerspectiveCamera | undefined | (() => THREE.PerspectiveCamera | undefined)

  currentRoomLabel: Ref<'city' | 'apartment'>

  myPosition: { x: number; y: number; z: number }

  roomMessage: Ref<string | null>
  switchingRoom: Ref<boolean>
  transitioningApartment: Ref<boolean>
  wasPointerLockedAtTransitionStart: Ref<boolean>

  /** Assigned in `connectRealtime`; read by movement (focus refresh). */
  refreshMyAppearance: Ref<(() => void) | null>

  getCanvas?: () => HTMLCanvasElement | null
  requestPointerLock?: () => void
  pickupCodeToHotbar?: (code: string) => void

  inventoryLoading: Ref<boolean>
  inventoryError: Ref<string | null>
  applyServerInventoryPayload: (items: ApartmentInventoryItem[]) => void

  selectedPlacedObjectId: Ref<string>

  apartment: {
    detachForRoomSwitch: () => void
    ensureApartmentObjectsFromServer: (objects: ApartmentObjectPayload[]) => void
    attachSelectedPlacedObject: () => void
    clearApartmentObjects: () => void
    upsertApartmentObjectFromRemote: (payload: ApartmentObjectPayload) => void
    removeApartmentObjectMesh: (objectId: string) => void
  }

  /** templateKey: apartment template ('housing_<unit_id>') so the matching house interior loads. */
  setRoomEnvironment: (kind: 'city' | 'apartment', templateKey?: string, workKey?: string | null) => void
  onApartmentActionErrorBanner?: () => void

  canEditApartment: Ref<boolean>
  visitedApartmentOwnerId: Ref<number | null>
  /** Work building we are inside (business district), null in the city or a house. */
  visitedWorkKey: Ref<string | null>
  onHousingUnitsSync?: (units: HousingUnitPayload[]) => void
}

/** Colyseus room wiring, remote avatars, and server message bindings. */
export function useGameRealtime(deps: GameRealtimeDeps) {
  const otherUsers = ref<Map<string, OtherUser>>(new Map())

  let colyseusClient: ColyseusClient | null = null

  const sessionByUserId = new Map<string, string>()
  const pendingAppearanceUpdates = new Map<string, PendingAppearanceUpdate>()
  const upsertTokenByUserId = new Map<string, number>()
  const renderTokenBySessionId = new Map<string, number>()

  let previousQuantityByCode: Record<string, number> = {}
  let isInitialInventoryLoad = true

  function finishApartmentTransition(): void {
    deps.transitioningApartment.value = false
    const shouldRecover = deps.wasPointerLockedAtTransitionStart.value
    setTimeout(() => {
      if (!shouldRecover) {
        deps.wasPointerLockedAtTransitionStart.value = false
        return
      }
      const canvas = deps.getCanvas?.() ?? null
      if (!canvas || document.pointerLockElement === canvas) {
        deps.wasPointerLockedAtTransitionStart.value = false
        return
      }
      try {
        deps.requestPointerLock?.()
      } catch {
        /* browsers may reject without a gesture */
      }
      deps.wasPointerLockedAtTransitionStart.value = false
    }, 0)
  }

  function resolveCamera(): THREE.PerspectiveCamera | undefined {
    const cam = deps.camera
    return typeof cam === 'function' ? cam() : cam
  }

  function isRemoteVisible(
    zone: 'city' | 'apartment',
    apartmentOwnerId: number | null,
    workKey: string | null = null,
  ): boolean {
    if (deps.currentRoomLabel.value === 'city') return zone === 'city'
    const myWorkKey = deps.visitedWorkKey.value
    if (myWorkKey !== null || workKey !== null) return zone === 'apartment' && workKey === myWorkKey
    const visitedOwner = deps.visitedApartmentOwnerId.value
    const ownerMatch =
      apartmentOwnerId !== null &&
      apartmentOwnerId === (visitedOwner ?? getStoredAuth()?.user.account_id ?? null)
    return zone === 'apartment' && ownerMatch
  }

  function parseHousingUnitsFromMessage(raw: unknown): HousingUnitPayload[] | null {
    if (!Array.isArray(raw)) return null
    const out: HousingUnitPayload[] = []
    for (const row of raw) {
      if (typeof row !== 'object' || row === null) continue
      const rec = row as Record<string, unknown>
      if (typeof rec.unit_id !== 'number') continue
      if (typeof rec.public_id !== 'string') continue
      if (typeof rec.offer_type !== 'string') continue
      if (typeof rec.price_coins !== 'number') continue
      if (typeof rec.rent_duration_hours !== 'number') continue
      if (typeof rec.pos_x !== 'number') continue
      if (typeof rec.pos_y !== 'number') continue
      if (typeof rec.pos_z !== 'number') continue
      if (typeof rec.size !== 'number') continue
      if (typeof rec.base_color_hex !== 'string') continue
      if (!(rec.model_key === undefined || rec.model_key === null || typeof rec.model_key === 'string')) continue
      if (typeof rec.status !== 'string') continue
      if (!(rec.occupant_account_id === null || typeof rec.occupant_account_id === 'number')) continue
      if (!(rec.lease_expires_at === null || typeof rec.lease_expires_at === 'string')) continue
      if (!(rec.room_public_id === null || typeof rec.room_public_id === 'string')) continue
      if (typeof rec.template_key !== 'string') continue
      out.push({
        unit_id: rec.unit_id,
        public_id: rec.public_id,
        offer_type: rec.offer_type,
        price_coins: rec.price_coins,
        rent_duration_hours: rec.rent_duration_hours,
        pos_x: rec.pos_x,
        pos_y: rec.pos_y,
        pos_z: rec.pos_z,
        size: rec.size,
        base_color_hex: rec.base_color_hex,
        model_key: typeof rec.model_key === 'string' ? rec.model_key : null,
        status: rec.status,
        occupant_account_id: rec.occupant_account_id,
        lease_expires_at: rec.lease_expires_at,
        room_public_id: rec.room_public_id,
        template_key: rec.template_key,
      })
    }
    return out
  }

  function syncHousingUnits(raw: unknown): void {
    const units = parseHousingUnitsFromMessage(raw)
    if (units === null) return
    deps.onHousingUnitsSync?.(units)
  }

  function removeSceneAvatarDuplicates(sessionId: string, userId: string) {
    const scene = deps.getScene()
    if (!scene) return

    const toRemove: THREE.Object3D[] = []
    for (const child of scene.children) {
      if (!(child instanceof THREE.Group)) continue
      const tag = child.userData as { isRemoteAvatar?: boolean; sessionId?: string; userId?: string }
      if (!tag.isRemoteAvatar) continue
      if (tag.sessionId === sessionId || tag.userId === userId) {
        toRemove.push(child)
      }
    }
    for (const obj of toRemove) {
      scene.remove(obj)
      disposeObject3D(obj)
    }
  }

  function removeOtherUser(sessionId: string) {
    const scene = deps.getScene()
    const entry = otherUsers.value.get(sessionId)
    if (!entry) return
    if (scene) {
      removeSceneAvatarDuplicates(sessionId, entry.userId)
      scene.remove(entry.group)
    }
    disposeObject3D(entry.group)
    otherUsers.value.delete(sessionId)
    if (sessionByUserId.get(entry.userId) === sessionId) {
      sessionByUserId.delete(entry.userId)
    }
    pendingAppearanceUpdates.delete(sessionId)
    renderTokenBySessionId.delete(sessionId)
  }

  function removeOtherUsersByUserIdExcept(userId: string, keepSessionId: string) {
    for (const [sid, ou] of [...otherUsers.value.entries()]) {
      if (ou.userId !== userId || sid === keepSessionId) continue
      removeOtherUser(sid)
    }
  }

  async function upsertOtherUser(sessionId: string, data: RemoteUserPayload) {
    const scene = deps.getScene()
    if (!scene) return

    const workKey = data.workKey ?? null
    if (!isRemoteVisible(data.zone, data.apartmentOwnerId, workKey)) {
      removeOtherUser(sessionId)
      return
    }

    const renderToken = nextRenderToken(renderTokenBySessionId, sessionId)
    const token = (upsertTokenByUserId.get(data.id) ?? 0) + 1
    upsertTokenByUserId.set(data.id, token)

    removeOtherUsersByUserIdExcept(data.id, sessionId)

    const knownSessionId = sessionByUserId.get(data.id)
    if (knownSessionId && knownSessionId !== sessionId) {
      removeOtherUser(knownSessionId)
    }

    const bodyTintColors = parseBodyTintColors(data.slotHexes)
    const bodyModelGlb = parseBodyModelGlb(data.bodyModelGlb)
    const existing = otherUsers.value.get(sessionId)
    if (existing) {
      scene.remove(existing.group)
      disposeObject3D(existing.group)
      otherUsers.value.delete(sessionId)
      if (sessionByUserId.get(existing.userId) === sessionId) {
        sessionByUserId.delete(existing.userId)
      }
      pendingAppearanceUpdates.delete(sessionId)
    }

    const glb = await createTintedCharacterFromUrl(bodyModelGlb, bodyTintColors)
    const group = glb ?? buildCompositeAvatar(null, data.color)

    if (upsertTokenByUserId.get(data.id) !== token) {
      disposeObject3D(group)
      return
    }
    if (renderTokenBySessionId.get(sessionId) !== renderToken) {
      disposeObject3D(group)
      return
    }

    const latestSessionId = sessionByUserId.get(data.id)
    if (latestSessionId && latestSessionId !== sessionId) {
      removeOtherUser(latestSessionId)
    }
    removeOtherUsersByUserIdExcept(data.id, sessionId)
    removeSceneAvatarDuplicates(sessionId, data.id)
    group.userData.isRemoteAvatar = true
    group.userData.sessionId = sessionId
    group.userData.userId = data.id
    const ry = parseYaw(data.ry)
    placeAvatar(group, data.x, data.y, data.z, ry)
    scene.add(group)
    otherUsers.value.set(sessionId, {
      userId: data.id,
      group,
      x: data.x,
      y: data.y,
      z: data.z,
      ry,
      zone: data.zone,
      apartmentOwnerId: data.apartmentOwnerId,
      workKey,
      color: data.color,
      bodyTintColors,
      bodyModelGlb,
    })

    sessionByUserId.set(data.id, sessionId)

    const pending = pendingAppearanceUpdates.get(sessionId)
    if (pending) {
      pendingAppearanceUpdates.delete(sessionId)
      void updateOtherAppearance(sessionId, pending.appearance, pending.slotHexes, pending.bodyModelGlb)
    }
  }

  async function updateOtherAppearance(
    sessionId: string,
    _appearance: Record<string, number | null>,
    slotHexes?: Record<string, string>,
    bodyModelGlb?: string | null,
  ) {
    const scene = deps.getScene()
    if (!scene) return

    const entry = otherUsers.value.get(sessionId)
    if (!entry) {
      pendingAppearanceUpdates.set(sessionId, { appearance: _appearance, slotHexes, bodyModelGlb })
      return
    }
    if (!isRemoteVisible(entry.zone, entry.apartmentOwnerId, entry.workKey)) {
      removeOtherUser(sessionId)
      return
    }
    const bodyTintColors = parseBodyTintColors(slotHexes)
    const parsedBodyModelGlb = parseBodyModelGlb(bodyModelGlb)
    if (
      parsedBodyModelGlb === entry.bodyModelGlb &&
      bodyTintColors.body === entry.bodyTintColors.body
    ) {
      return
    }
    const renderToken = nextRenderToken(renderTokenBySessionId, sessionId)
    const glb = await createTintedCharacterFromUrl(parsedBodyModelGlb, bodyTintColors)
    const latestEntry = otherUsers.value.get(sessionId)
    const group = glb ?? buildCompositeAvatar(null, (latestEntry ?? entry).color)
    if (!latestEntry) {
      disposeObject3D(group)
      return
    }
    if (renderTokenBySessionId.get(sessionId) !== renderToken) {
      disposeObject3D(group)
      return
    }
    removeOtherUsersByUserIdExcept(latestEntry.userId, sessionId)
    removeSceneAvatarDuplicates(sessionId, latestEntry.userId)
    group.userData.isRemoteAvatar = true
    group.userData.sessionId = sessionId
    group.userData.userId = latestEntry.userId
    scene.remove(latestEntry.group)
    disposeObject3D(latestEntry.group)
    placeAvatar(group, latestEntry.x, latestEntry.y, latestEntry.z, latestEntry.ry)
    scene.add(group)
    otherUsers.value.set(sessionId, {
      ...latestEntry,
      group,
      bodyTintColors,
      bodyModelGlb: parsedBodyModelGlb,
    })
  }

  function clearRemoteUsers() {
    for (const id of [...otherUsers.value.keys()]) {
      removeOtherUser(id)
    }
  }

  function bindRoomEvents(room: Room) {
    room.onMessage('init', (payload: RoomInitPayload) => {
      clearRemoteUsers()
      deps.apartment.clearApartmentObjects()
      deps.roomMessage.value = null
      deps.currentRoomLabel.value = payload.me.zone
      deps.setRoomEnvironment(payload.me.zone)
      deps.myPosition.x = payload.me.x
      deps.myPosition.y = payload.me.y
      deps.myPosition.z = payload.me.z

      resolveCamera()?.position.set(payload.me.x, payload.me.y, payload.me.z)

      payload.users.forEach((u) => {
        if (u.sessionId === room.sessionId) return
        void upsertOtherUser(u.sessionId, u)
      })

      if (payload.housingUnits !== undefined) {
        syncHousingUnits(payload.housingUnits)
      }
    })

    room.onMessage('housing_units_sync', (data: { units?: unknown }) => {
      syncHousingUnits(data.units)
    })

    room.onMessage('user_joined', (data: RemoteUserPayload) => {
      if (data.sessionId === room.sessionId) return
      void upsertOtherUser(data.sessionId, data)
    })

    room.onMessage('user_moved', (data: { sessionId: string; x: number; y: number; z: number; ry?: number }) => {
      const entry = otherUsers.value.get(data.sessionId)
      if (!entry) return
      if (!isRemoteVisible(entry.zone, entry.apartmentOwnerId, entry.workKey)) {
        removeOtherUser(data.sessionId)
        return
      }
      entry.x = data.x
      entry.y = data.y
      entry.z = data.z
      entry.ry = parseYaw(data.ry ?? entry.ry)
      // the avatar glides there in tickRemoteAvatars
    })

    // Players already in the zone we just entered (sent after our own user_zone_changed / apartment_init).
    room.onMessage('zone_users', (data: { users?: RemoteUserPayload[] }) => {
      for (const u of data.users ?? []) {
        if (u.sessionId === room.sessionId) continue
        void upsertOtherUser(u.sessionId, u)
      }
    })

    room.onMessage(
      'appearance_updated',
      (data: {
        sessionId: string
        appearance: Record<string, number | null>
        slotHexes?: Record<string, string>
        bodyModelGlb?: string | null
      }) => {
        if (data.sessionId === room.sessionId) return
        void updateOtherAppearance(data.sessionId, data.appearance, data.slotHexes, data.bodyModelGlb)
      },
    )

    room.onMessage('user_left', (data: { sessionId: string }) => {
      removeOtherUser(data.sessionId)
    })

    room.onMessage(
      'user_zone_changed',
      (data: {
        sessionId: string
        zone: 'city' | 'apartment'
        apartmentOwnerId: number | null
        workKey?: string | null
        x: number
        y: number
        z: number
      }) => {
        if (data.sessionId === room.sessionId) {
          deps.currentRoomLabel.value = data.zone
          // apartment_init already loaded the right interior (it carries the template key)
          if (data.zone === 'city') deps.setRoomEnvironment('city')
          deps.myPosition.x = data.x
          deps.myPosition.y = data.y
          deps.myPosition.z = data.z
          resolveCamera()?.position.set(data.x, data.y, data.z)
          for (const [sid, entry] of [...otherUsers.value.entries()]) {
            if (!isRemoteVisible(entry.zone, entry.apartmentOwnerId, entry.workKey)) {
              removeOtherUser(sid)
            }
          }
          if (data.zone === 'city') {
            deps.canEditApartment.value = false
            deps.visitedApartmentOwnerId.value = null
            deps.visitedWorkKey.value = null
            deps.apartment.clearApartmentObjects()
            finishApartmentTransition()
          }
          return
        }
        const entry = otherUsers.value.get(data.sessionId)
        if (!entry) return
        entry.zone = data.zone
        entry.apartmentOwnerId = data.apartmentOwnerId
        entry.workKey = data.workKey ?? null
        entry.x = data.x
        entry.y = data.y
        entry.z = data.z
        placeAvatar(entry.group, entry.x, entry.y, entry.z, entry.ry)
        if (!isRemoteVisible(entry.zone, entry.apartmentOwnerId, entry.workKey)) {
          removeOtherUser(data.sessionId)
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
      deps.myPosition.x = APARTMENT_SPAWN.x
      deps.myPosition.y = APARTMENT_SPAWN.y
      deps.myPosition.z = APARTMENT_SPAWN.z
      resolveCamera()?.position.set(APARTMENT_SPAWN.x, APARTMENT_SPAWN.y, APARTMENT_SPAWN.z)
      for (const [sid, entry] of [...otherUsers.value.entries()]) {
        if (!isRemoteVisible(entry.zone, entry.apartmentOwnerId, entry.workKey)) {
          removeOtherUser(sid)
        }
      }
      deps.apartment.ensureApartmentObjectsFromServer(payload.objects)
      deps.apartment.attachSelectedPlacedObject()
      if (payload.workKey) {
        // work buildings have no decoration inventory
        deps.inventoryLoading.value = false
      } else {
        deps.inventoryLoading.value = true
        room.send('apartment_inventory_request')
      }
      finishApartmentTransition()
    })

    room.onMessage('apartment_object_upserted', (data: ApartmentObjectPayload) => {
      deps.apartment.upsertApartmentObjectFromRemote(data)
      if (!deps.selectedPlacedObjectId.value) {
        deps.selectedPlacedObjectId.value = data.objectId
      }
    })

    room.onMessage('apartment_object_removed', (data: { objectId: string }) => {
      deps.apartment.removeApartmentObjectMesh(data.objectId)
    })

    room.onMessage('apartment_inventory', (data: { items: ApartmentInventoryItem[] }) => {
      const items = Array.isArray(data.items) ? data.items : []
      const newQuantityByCode: Record<string, number> = {}
      for (const it of items) {
        if (it?.code) newQuantityByCode[it.code] = it.quantity
      }
      if (!isInitialInventoryLoad) {
        for (const [code, qty] of Object.entries(newQuantityByCode)) {
          const prev = previousQuantityByCode[code] ?? 0
          if (qty > prev) deps.pickupCodeToHotbar?.(code)
        }
      }
      isInitialInventoryLoad = false
      previousQuantityByCode = { ...newQuantityByCode }
      deps.applyServerInventoryPayload(items)
    })

    room.onMessage('apartment_inventory_error', (data: { message?: string }) => {
      deps.inventoryLoading.value = false
      deps.inventoryError.value = data.message ?? 'Could not load apartment inventory.'
    })

    room.onMessage('apartment_action_error', (data: { message?: string }) => {
      deps.roomMessage.value = data.message ?? 'Apartment action failed.'
      deps.onApartmentActionErrorBanner?.()
    })

    room.onMessage('apartment_error', (data: { message?: string }) => {
      deps.roomMessage.value = data.message ?? 'Could not enter apartment.'
      deps.transitioningApartment.value = false
      deps.wasPointerLockedAtTransitionStart.value = false
    })

    room.onLeave(() => {
      if (deps.switchingRoom.value) return
      deps.roomMessage.value = 'Disconnected from realtime room.'
    })
  }

  async function connectRealtime(state: CharacterCosmeticsState): Promise<boolean> {
    const auth = getStoredAuth()
    if (!auth) {
      deps.router.push({ name: 'landing' })
      return false
    }

    const appearance = appearanceIdsFromLoadout(state.slots)
    const roomOptions: Record<string, unknown> = {
      token: auth.token,
      appearance,
      slotHexes: { body: state.colors.body },
      bodyModelGlb: bodyModelGlbFromLoadout(state.slots),
    }

    if (!colyseusClient) {
      colyseusClient = new ColyseusClient(toWsUrl(deps.realtimeHttpUrl))
    }

    deps.switchingRoom.value = true
    try {
      if (deps.gameRoomRef.value) {
        await deps.gameRoomRef.value.leave()
        deps.gameRoomRef.value = null
      }
      clearRemoteUsers()
      deps.apartment.detachForRoomSwitch()

      deps.currentRoomLabel.value = 'city'
      const nextRoom: Room = await colyseusClient.joinOrCreate('city', roomOptions)
      deps.setRoomEnvironment('city')
      deps.gameRoomRef.value = nextRoom
      bindRoomEvents(nextRoom)
    } catch (err) {
      const wsUrl = toWsUrl(deps.realtimeHttpUrl)
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('[realtime] Colyseus join failed', {
        room: 'city',
        wsUrl,
        message: errMsg,
        err,
      })
      const devHint = import.meta.env.DEV && errMsg.length > 0 ? ` (${errMsg})` : ''
      deps.roomMessage.value = `Could not connect to city instance.${devHint}`
    } finally {
      deps.switchingRoom.value = false
    }

    // Runs on every window focus: throttled, and only sent when the look actually changed, since each
    // 'appearance' message makes every other client rebuild this player's avatar model.
    let lastRefreshAt = 0
    let lastSentAppearance = JSON.stringify({
      body: appearance.body ?? null,
      hex: state.colors.body,
      glb: bodyModelGlbFromLoadout(state.slots),
    })
    const refreshAppearanceFromApi = async () => {
      const now = Date.now()
      if (now - lastRefreshAt < APPEARANCE_REFRESH_MIN_INTERVAL_MS) return
      lastRefreshAt = now
      try {
        const latest = await fetchCharacterCosmetics()
        const body = appearanceIdsFromLoadout(latest.slots).body
        const bodyModelGlb = bodyModelGlbFromLoadout(latest.slots)
        const signature = JSON.stringify({ body: body ?? null, hex: latest.colors.body, glb: bodyModelGlb })
        if (signature === lastSentAppearance) return
        lastSentAppearance = signature
        deps.gameRoomRef.value?.send('appearance', {
          slots: { body },
          slotHexes: { body: latest.colors.body },
          bodyModelGlb,
        })
      } catch {
        /** keep previous values if refresh fails */
      }
    }
    deps.refreshMyAppearance.value = () => {
      void refreshAppearanceFromApi()
    }

    return true
  }

  /**
   * Called every frame: moves each remote avatar towards its last received position/yaw, so movement
   * looks continuous between network updates (sent every 50 ms) instead of jumping.
   */
  function animateRemoteAvatar(group: THREE.Object3D, dt: number, speed: number) {
    const dx = group.position.x - deps.myPosition.x
    const dz = group.position.z - deps.myPosition.z
    if (dx * dx + dz * dz > ANIMATION_MAX_DISTANCE * ANIMATION_MAX_DISTANCE) return
    updateAvatarAnimation(group, dt, speed)
  }

  function tickRemoteAvatars(dt: number) {
    const t = 1 - Math.exp(-REMOTE_SMOOTHING * dt)
    for (const entry of toRaw(otherUsers.value).values()) {
      const group = toRaw(entry.group)
      const dx = entry.x - group.position.x
      const dy = entry.y - EYE_HEIGHT - group.position.y
      const dz = entry.z - group.position.z
      if (dx * dx + dy * dy + dz * dz > REMOTE_SNAP_DISTANCE * REMOTE_SNAP_DISTANCE) {
        placeAvatar(group, entry.x, entry.y, entry.z, entry.ry)
        animateRemoteAvatar(group, dt, 0)
        continue
      }
      const prevX = group.position.x
      const prevZ = group.position.z
      group.position.x += dx * t
      group.position.y += dy * t
      group.position.z += dz * t
      // shortest way round, so turning from 350° to 10° doesn't spin the long way
      const target = entry.ry + Math.PI
      const turn = Math.atan2(Math.sin(target - group.rotation.y), Math.cos(target - group.rotation.y))
      group.rotation.y += turn * t
      // rigged skins play Idle / Walk / Run from the speed the smoothing actually produced
      const moved = Math.hypot(group.position.x - prevX, group.position.z - prevZ)
      animateRemoteAvatar(group, dt, dt > 0 ? moved / dt : 0)
    }
  }

  return {
    connectRealtime,
    clearRemoteUsers,
    tickRemoteAvatars,
    refreshMyAppearance: deps.refreshMyAppearance,
  }
}
