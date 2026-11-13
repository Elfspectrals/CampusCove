export interface AlarmAlert {
  id: string
  kind: 'live' | 'away'
  at: string
  count: number
}

export const MAX_ALARM_ALERTS = 20

export function withAlert(alerts: readonly AlarmAlert[], alert: Omit<AlarmAlert, 'id'>): AlarmAlert[] {
  return [{ ...alert, id: `${alert.kind}-${alert.at}-${alerts.length}` }, ...alerts].slice(0, MAX_ALARM_ALERTS)
}
