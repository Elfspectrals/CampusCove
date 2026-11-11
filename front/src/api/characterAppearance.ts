/**
 * Character creator / editor (Laravel `GET/PUT /api/character/appearance`, docs/CHARACTER.md). Free; the first save
 * also dresses the player in the newcomer outfit.
 */
import { HAIRCUTS, parseCharacterLook, type CreatorChoice, type Haircut } from '../avatar/characterLook'
import { apiRequest, isRecord } from './http'

export interface CharacterAppearance {
  /** false: the creator must open before the player spawns. */
  created: boolean
  /** The saved choice, or null before the first save. */
  choice: CreatorChoice | null
}

const HEX = /^#[0-9A-Fa-f]{6}$/

function parseAppearance(data: unknown): CharacterAppearance {
  if (!isRecord(data) || typeof data.created !== 'boolean') throw new Error('Invalid appearance response')
  const look = parseCharacterLook(data)
  const hair = (HAIRCUTS as readonly string[]).includes(String(data.hair)) ? (data.hair as Haircut) : 'basic'
  const skinColor = typeof data.skin_color === 'string' && HEX.test(data.skin_color) ? data.skin_color : null
  const hairColor = typeof data.hair_color === 'string' && HEX.test(data.hair_color) ? data.hair_color : null
  return {
    created: data.created,
    choice: data.created && look && skinColor && hairColor ? { ...look, hair, skinColor, hairColor } : null,
  }
}

export async function fetchCharacterAppearance(): Promise<CharacterAppearance> {
  return parseAppearance(await apiRequest('/character/appearance'))
}

export async function saveCharacterAppearance(choice: CreatorChoice): Promise<CharacterAppearance> {
  const body = {
    sex: choice.sex,
    face: choice.face,
    build: choice.build,
    hair: choice.hair,
    skin_color: choice.skinColor,
    hair_color: choice.hairColor,
  }
  return parseAppearance(await apiRequest('/character/appearance', { method: 'PUT', body }))
}
