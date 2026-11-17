import type { WearModels } from '../../avatar/modularCharacterLogic'

export const CLIMBING_SHOES_WEAR_URL = '/assets/wear/shoes/climbing_shoes/model.glb'

export function climbingWear(models: WearModels, shoesLent: boolean): WearModels {
  return shoesLent ? { ...models, shoes: CLIMBING_SHOES_WEAR_URL } : models
}
