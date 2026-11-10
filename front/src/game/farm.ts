import type { Crop } from './world/worldManifest'

export const PICK_MS = 3000
export const PLANT_PROMPT_REACH = 1.6
export const PLANT_KEEP_REACH = 2
export const CROP_LABELS: Record<Crop, string> = { corn: 'corn', potato: 'a potato', cabbage: 'a cabbage', pumpkin: 'a pumpkin' }
