const API_BASE = import.meta.env.VITE_API_URL || '/api'

function getAuthHeaders(): HeadersInit {
  const raw = localStorage.getItem('campus_cove_auth')
  const auth = raw ? (JSON.parse(raw) as { token: string }) : null
  return {
    Accept: 'application/json',
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
  }
}

export interface RefereeProgress {
  account_age_ok: boolean
  other_friends: number
  has_coin_purchase: boolean
  qualified: boolean
}

export interface Referee {
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
  const res = await fetch(`${API_BASE}/referrals`, { headers: getAuthHeaders() })
  if (!res.ok) throw new Error('Failed to load referrals')
  return res.json()
}
