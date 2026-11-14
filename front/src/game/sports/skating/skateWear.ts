import type { WearModels } from '../../../avatar/modularCharacterLogic'

export const ICE_SKATES_WEAR_URL = '/assets/wear/shoes/ice_skates/model.glb'

export function skatingWear(models: WearModels, onTheIce: boolean): WearModels {
  return onTheIce ? { ...models, shoes: ICE_SKATES_WEAR_URL } : models
}
