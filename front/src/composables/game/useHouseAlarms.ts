import { ref, shallowRef, watch, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import { takeAlarmReport } from '../../api/houseAlarms'
import { withAlert, type AlarmAlert } from '../../game/watch/alarms'

export interface HouseAlarmsDeps {
  gameRoomRef: ShallowRef<Room | null>
  say: (text: string) => void
  ring: () => void
  liveMessage: () => string
  awayMessage: (count: number) => string
}

export function useHouseAlarms(deps: HouseAlarmsDeps) {
  const alerts = shallowRef<AlarmAlert[]>([])
  const unseen = ref(false)

  async function readAbsence(): Promise<void> {
    const report = await takeAlarmReport()
    if (report.count === 0 || !report.lastAt) return
    alerts.value = withAlert(alerts.value, { kind: 'away', at: report.lastAt, count: report.count })
    unseen.value = true
    deps.say(deps.awayMessage(report.count))
  }

  watch(deps.gameRoomRef, (room) => {
    if (room) readAbsence().catch((err: unknown) => console.error('[alarm] could not read the alarms of your absence', err))
  })

  function onLive(): void {
    alerts.value = withAlert(alerts.value, { kind: 'live', at: new Date().toISOString(), count: 1 })
    unseen.value = true
    deps.say(deps.liveMessage())
    deps.ring()
  }

  function markSeen(): void {
    unseen.value = false
  }

  return { alerts, unseen, onLive, markSeen }
}
