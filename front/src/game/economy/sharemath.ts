import { PICK_MS } from '../orchard.ts'

export interface SaleCurve {
  price: number
  quota: number
  overPrice: number
}

export interface Payout {
  coins: number
  fullPriceLeft: number
}

export const APPLE_SALE: SaleCurve = { price: 3, quota: 300, overPrice: 0 }
export const PICKS_PER_HOUR = 3_600_000 / PICK_MS

export function salePayout(curve: SaleCurve, soldToday: number, quantity: number): Payout {
  const fullPriceLeft = Math.max(0, curve.quota - soldToday)
  const atFullPrice = Math.min(quantity, fullPriceLeft)
  return { coins: atFullPrice * curve.price + (quantity - atFullPrice) * curve.overPrice, fullPriceLeft: fullPriceLeft - atFullPrice }
}

export function coinsAfter(curve: SaleCurve, itemsPerHour: number, hours: number): number {
  return salePayout(curve, 0, Math.floor(itemsPerHour * hours)).coins
}

export function dayCurve(curve: SaleCurve, itemsPerHour: number, hours: number, steps: number): Array<[hours: number, coins: number]> {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const at = (hours * i) / steps
    return [at, coinsAfter(curve, itemsPerHour, at)]
  })
}
