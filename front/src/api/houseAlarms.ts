import { apiRequest, isRecord } from './http.ts'

export interface AlarmReport {
  count: number
  lastAt: string | null
}

export async function takeAlarmReport(): Promise<AlarmReport> {
  const data = await apiRequest('/house-alarms/report', { method: 'POST' })
  if (!isRecord(data) || typeof data.count !== 'number' || (data.last_at !== null && typeof data.last_at !== 'string')) throw new Error('Invalid alarm report')
  return { count: data.count, lastAt: data.last_at }
}
