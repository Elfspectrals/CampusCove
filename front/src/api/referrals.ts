import { apiRequest } from './http'

interface RefereeProgress {
  account_age_ok: boolean
  other_friends: number
  has_coin_purchase: boolean
  qualified: boolean
}

interface Referee {
  account_id: number
  display_name: string
  qualified: boolean
  rewarded: boolean
  progress: RefereeProgress | null
}

export interface ReferralSummary {
  code: string
  rewards: { referrer: number; referee: number }
  requirements: { min_account_age_hours: number; min_other_friends: number; min_coin_purchases: number }
  referees: Referee[]
}

export async function getReferrals(): Promise<ReferralSummary> {
  return (await apiRequest('/referrals', { errorMessage: 'Failed to load referrals' })) as ReferralSummary
}
