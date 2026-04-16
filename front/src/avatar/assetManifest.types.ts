export const AVATAR_RUNTIME_KINDS = ['full-body', 'slot'] as const

export type AvatarRuntimeKind = (typeof AVATAR_RUNTIME_KINDS)[number]

export const AVATAR_RUNTIME_SLOTS = ['head', 'torso', 'legs'] as const

export type AvatarRuntimeSlot = (typeof AVATAR_RUNTIME_SLOTS)[number]

export interface AvatarRuntimeAssetBase {
  id: string
  label: string
  version: string
  fileName: `${string}.glb`
  src: string
  kind: AvatarRuntimeKind
}

export interface AvatarFullBodyAsset extends AvatarRuntimeAssetBase {
  kind: 'full-body'
}

export interface AvatarSlotAsset extends AvatarRuntimeAssetBase {
  kind: 'slot'
  slot: AvatarRuntimeSlot
}

export type AvatarRuntimeAsset = AvatarFullBodyAsset | AvatarSlotAsset
