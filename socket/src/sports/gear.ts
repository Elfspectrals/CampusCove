import { callRealtimeBackend } from '../backend.ts'
import type { Player } from '../types.ts'

type GearChangeListener = (player: Player) => void

const listeners: GearChangeListener[] = []

export function parseGear(raw: unknown): string[] {
  if (!Array.isArray(raw) || !raw.every((code) => typeof code === 'string' && code !== '')) {
    throw new Error(`invalid sports gear from the API: ${JSON.stringify(raw)}`)
  }
  return raw
}

export function parseRentalPrices(raw: unknown): Map<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`invalid sports gear rental prices from the API: ${JSON.stringify(raw)}`)
  const prices = new Map<string, number>()
  for (const [code, price] of Object.entries(raw)) {
    if (typeof price !== 'number' || !Number.isInteger(price) || price <= 0) throw new Error(`invalid rental price for ${code}: ${JSON.stringify(price)}`)
    prices.set(code, price)
  }
  return prices
}

export async function usableGear(player: Pick<Player, 'token' | 'sportsLoans'>): Promise<string[]> {
  const data = await callRealtimeBackend(player.token, '/sports/gear', 'GET')
  return [...new Set([...parseGear(data?.gear), ...player.sportsLoans.keys()])]
}

export async function rentalPrice(player: Pick<Player, 'token'>, code: string): Promise<{ owned: boolean, price: number | null }> {
  const data = await callRealtimeBackend(player.token, '/sports/gear', 'GET')
  return { owned: parseGear(data?.gear).includes(code), price: parseRentalPrices(data?.rental).get(code) ?? null }
}

export function onGearChanged(listener: GearChangeListener): void {
  listeners.push(listener)
}

export function gearChanged(player: Player): void {
  for (const listener of listeners) listener(player)
}
