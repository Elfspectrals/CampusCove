export const AVATAR_SLOTS = ['head', 'torso', 'legs'] as const

export type AvatarSlot = (typeof AVATAR_SLOTS)[number]

export type AvatarAssetFormat = 'glb'

export type AvatarRigType = 'skinned' | 'static'

export interface AvatarPartSource {
  provider: string
  uri: string
  checksumSha256?: string
}

export interface AvatarPartBudget {
  maxTriangles: number
  maxTextureSize: number
}

export interface AvatarPartDescriptor {
  assetId: string
  slot: AvatarSlot
  format: AvatarAssetFormat
  rigType: AvatarRigType
  profileVersion: string
  version: string
  source: AvatarPartSource
  nodeRootName: string
  requiredAnchors: readonly string[]
  requiredBones: readonly string[]
  budget: AvatarPartBudget
  tags: readonly string[]
}

export interface AvatarLoadout {
  head: string
  torso: string
  legs: string
}

export interface AvatarValidationIssue {
  code:
    | 'descriptor_invalid'
    | 'source_unreachable'
    | 'format_unsupported'
    | 'tri_budget_exceeded'
    | 'bbox_out_of_range'
    | 'required_anchor_missing'
    | 'required_bone_missing'
    | 'texture_too_large'
    | 'profile_mismatch'
  message: string
  isBlocking: boolean
}

export interface AvatarValidationResult {
  ok: boolean
  issues: AvatarValidationIssue[]
}

export interface AvatarLoadMetrics {
  loadMs: number
  triangles: number
  textureBytesEstimate: number
}

export interface AvatarLoadedPart<TObject3D> {
  descriptor: AvatarPartDescriptor
  object: TObject3D
  validation: AvatarValidationResult
  metrics: AvatarLoadMetrics
}

export type AvatarLoadedPartsBySlot<TObject3D> = Record<AvatarSlot, AvatarLoadedPart<TObject3D> | null>

export interface AvatarLoaderContract<TObject3D> {
  loadPart(descriptor: AvatarPartDescriptor): Promise<AvatarLoadedPart<TObject3D>>
}

export interface AvatarCatalogIndex {
  byId: Record<string, AvatarPartDescriptor>
  bySlot: Record<AvatarSlot, AvatarPartDescriptor[]>
}
