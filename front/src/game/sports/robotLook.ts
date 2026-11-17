import { WEAR_SLOTS, type WearSlot } from '../../avatar/modularCharacterLogic.ts'

interface RobotPiece {
  slot: WearSlot
  key: string
  color: string
}

export interface RobotModel {
  coach: string
  body: string
  outfit: readonly RobotPiece[]
}

export const DEFAULT_ROBOT: Omit<RobotModel, 'coach'> = {
  body: '#55585f',
  outfit: [
    { slot: 'head_accessory', key: 'robot_droid', color: '#f4f6f4' },
    { slot: 'top', key: 'robot_droid', color: '#f4f6f4' },
    { slot: 'bottom', key: 'robot', color: '#f4f6f4' },
    { slot: 'shoes', key: 'robot', color: '#9fe3c0' },
  ],
}

export interface RobotAppearance {
  slotModels: Record<string, string | null>
  slotHexes: Record<string, string>
}

const TEAM_COLOURS = { red: '#d62a2a', blue: '#2457c5' } as const
const TEAM_TINTED: readonly WearSlot[] = ['head_accessory', 'top', 'bottom']

export type RobotTeam = keyof typeof TEAM_COLOURS

export function robotAppearance(models: readonly RobotModel[], coach: string | undefined, team: RobotTeam | null = null): RobotAppearance {
  const model = models.find((m) => m.coach === coach) ?? DEFAULT_ROBOT
  const slotModels: Record<string, string | null> = Object.fromEntries(WEAR_SLOTS.map((slot) => [slot, null]))
  const slotHexes: Record<string, string> = { body: model.body }
  for (const piece of model.outfit) {
    slotModels[piece.slot] = `/assets/wear/${piece.slot}/${piece.key}/model.glb`
    slotHexes[piece.slot] = team !== null && TEAM_TINTED.includes(piece.slot) ? TEAM_COLOURS[team] : piece.color
  }
  return { slotModels, slotHexes }
}
