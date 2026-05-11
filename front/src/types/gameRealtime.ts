import type { Group } from 'three'
import type { CosmeticColors } from '../api/characterCosmetics'

export interface RemoteUserPayload {
  sessionId: string
  id: string
  pseudo: string
  color: number
  x: number
  y: number
  z: number
  zone: 'city' | 'apartment'
  apartmentOwnerId: number | null
  slotHexes?: Record<string, string>
  bodyModelGlb?: string | null
}

export interface RoomInitPayload {
  me: RemoteUserPayload
  users: RemoteUserPayload[]
}

export interface ApartmentInitPayload {
  ownerAccountId: number
  templateKey: string
  name: string
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
}

export interface OtherUser {
  userId: string
  group: Group
  x: number
  y: number
  z: number
  zone: 'city' | 'apartment'
  apartmentOwnerId: number | null
  color: number
  bodyTintColors: CosmeticColors
  bodyModelGlb: string | null
}

export interface PendingAppearanceUpdate {
  appearance: Record<string, number | null>
  slotHexes?: Record<string, string>
  bodyModelGlb?: string | null
}

export interface TransformDragEvent {
  value: boolean
}
