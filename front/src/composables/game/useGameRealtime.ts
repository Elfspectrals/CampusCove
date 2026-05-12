import { ref, type Ref, type ShallowRef } from 'vue'
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
import { createTintedCharacterFromUrl } from '../../avatar/glbCharacter'
import { buildCompositeAvatar, disposeObject3D } from '../../avatar/compositeAvatar'
import { APARTMENT_SPAWN } from '../../game/gameRoomConstants'
import type {
  ApartmentInitPayload,
  ApartmentInventoryItem,
  ApartmentObjectPayload,
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

function placeAvatar(group: THREE.Group, x: number, y: number, z: number) {
  group.position.set(x, y, z)
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

  setRoomEnvironment: (kind: 'city' | 'apartment') => void
  onApartmentActionErrorBanner?: () => void
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

  function isRemoteVisible(zone: 'city' | 'apartment', apartmentOwnerId: number | null): boolean {
    if (deps.currentRoomLabel.value === 'city') return zone === 'city'
    return zone === 'apartment' && apartmentOwnerId === getStoredAuth()?.user.account_id
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

    if (!isRemoteVisible(data.zone, data.apartmentOwnerId)) {
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
    placeAvatar(group, data.x, data.y, data.z)
    scene.add(group)
    otherUsers.value.set(sessionId, {
      userId: data.id,
      group,
      x: data.x,
      y: data.y,
      z: data.z,
      zone: data.zone,
      apartmentOwnerId: data.apartmentOwnerId,
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
    if (!isRemoteVisible(entry.zone, entry.apartmentOwnerId)) {
      removeOtherUser(sessionId)
      return
    }
    const renderToken = nextRenderToken(renderTokenBySessionId, sessionId)
    const bodyTintColors = parseBodyTintColors(slotHexes)
    const parsedBodyModelGlb = parseBodyModelGlb(bodyModelGlb)
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
    placeAvatar(group, latestEntry.x, latestEntry.y, latestEntry.z)
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
    })

    room.onMessage('user_joined', (data: RemoteUserPayload) => {
      if (data.sessionId === room.sessionId) return
      void upsertOtherUser(data.sessionId, data)
    })

    room.onMessage('user_moved', (data: { sessionId: string; x: number; y: number; z: number }) => {
      const entry = otherUsers.value.get(data.sessionId)
      if (!entry) return
      if (!isRemoteVisible(entry.zone, entry.apartmentOwnerId)) {
        removeOtherUser(data.sessionId)
        return
      }
      entry.x = data.x
      entry.y = data.y
      entry.z = data.z
      entry.group.position.set(data.x, data.y, data.z)
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
        x: number
        y: number
        z: number
      }) => {
        if (data.sessionId === room.sessionId) {
          deps.currentRoomLabel.value = data.zone
          deps.setRoomEnvironment(data.zone)
          deps.myPosition.x = data.x
          deps.myPosition.y = data.y
          deps.myPosition.z = data.z
          resolveCamera()?.position.set(data.x, data.y, data.z)
          for (const [sid, entry] of [...otherUsers.value.entries()]) {
            if (!isRemoteVisible(entry.zone, entry.apartmentOwnerId)) {
              removeOtherUser(sid)
            }
          }
          if (data.zone === 'city') {
            deps.apartment.clearApartmentObjects()
            finishApartmentTransition()
          }
          return
        }
        const entry = otherUsers.value.get(data.sessionId)
        if (!entry) return
        entry.zone = data.zone
        entry.apartmentOwnerId = data.apartmentOwnerId
        entry.x = data.x
        entry.y = data.y
        entry.z = data.z
        entry.group.position.set(data.x, data.y, data.z)
        if (!isRemoteVisible(entry.zone, entry.apartmentOwnerId)) {
          removeOtherUser(data.sessionId)
        }
      },
    )

    room.onMessage('apartment_init', (payload: ApartmentInitPayload) => {
      previousQuantityByCode = {}
      isInitialInventoryLoad = true
      deps.currentRoomLabel.value = 'apartment'
      deps.setRoomEnvironment('apartment')
      deps.myPosition.x = APARTMENT_SPAWN.x
      deps.myPosition.y = APARTMENT_SPAWN.y
      deps.myPosition.z = APARTMENT_SPAWN.z
      resolveCamera()?.position.set(APARTMENT_SPAWN.x, APARTMENT_SPAWN.y, APARTMENT_SPAWN.z)
      for (const [sid, entry] of [...otherUsers.value.entries()]) {
        if (!isRemoteVisible(entry.zone, entry.apartmentOwnerId)) {
          removeOtherUser(sid)
        }
      }
      deps.apartment.ensureApartmentObjectsFromServer(payload.objects)
      deps.apartment.attachSelectedPlacedObject()
      deps.inventoryLoading.value = true
      room.send('apartment_inventory_request')
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
      userId: auth.user.account_id,
      pseudo: auth.user.display_name || auth.user.username,
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

    const refreshAppearanceFromApi = async () => {
      try {
        const latest = await fetchCharacterCosmetics()
        deps.gameRoomRef.value?.send('appearance', {
          slots: { body: appearanceIdsFromLoadout(latest.slots).body },
          slotHexes: { body: latest.colors.body },
          bodyModelGlb: bodyModelGlbFromLoadout(latest.slots),
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

  return {
    connectRealtime,
    clearRemoteUsers,
    refreshMyAppearance: deps.refreshMyAppearance,
  }
}
