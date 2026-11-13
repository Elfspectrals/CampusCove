import { computed, ref } from 'vue'
import type * as THREE from 'three'
import { acceptRequest, getFriends, getPending, sendRequest } from '../../api/friends'
import { parseRecipient } from '../../game/bank'
import { contactRows, type ContactFriend, type ContactRequest } from '../../game/watch/contacts'
import { groundDistance } from '../../game/watch/gps'

export interface WatchContactsDeps {
  players: () => Array<{ sessionId: string; accountId: string; pseudo: string }>
  positionOf: (sessionId: string) => THREE.Vector3 | null
  me: { x: number; z: number }
  isOpen: () => boolean
  say: (text: string) => void
  acceptedText: (name: string) => string
  askedText: (pseudo: string) => string
}

const REFRESH_MS = 1000

export function useWatchContacts(deps: WatchContactsDeps) {
  const friends = ref<ContactFriend[] | null>(null)
  const requests = ref<ContactRequest[]>([])
  const error = ref<string | null>(null)
  const tick = ref(0)
  let timer: number | undefined

  const rows = computed(() => {
    void tick.value
    if (!friends.value) return null
    const players = deps.players().flatMap((p) => {
      const position = deps.positionOf(p.sessionId)
      return position ? [{ ...p, distance: groundDistance(deps.me, position) }] : []
    })
    return contactRows(friends.value, requests.value, players)
  })

  async function load(): Promise<void> {
    error.value = null
    try {
      const [{ friends: list }, { pending }] = await Promise.all([getFriends(), getPending()])
      friends.value = list.map((f) => ({ accountId: String(f.account_id), name: f.display_name }))
      requests.value = pending.map((p) => ({ accountId: String(p.account_id), name: p.display_name, incoming: p.incoming }))
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    }
    window.clearInterval(timer)
    timer = window.setInterval(() => {
      if (deps.isOpen()) tick.value++
      else window.clearInterval(timer)
    }, REFRESH_MS)
  }

  async function run(action: () => Promise<unknown>, done: string): Promise<void> {
    error.value = null
    try {
      await action()
      deps.say(done)
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    }
    await load()
  }

  function accept(accountId: string, name: string): Promise<void> {
    return run(() => acceptRequest(Number(accountId)), deps.acceptedText(name))
  }

  function ask(pseudo: string): Promise<void> {
    const recipient = parseRecipient(pseudo)
    if (!recipient) throw new Error(`[watchContacts] no name#tag in "${pseudo}"`)
    return run(() => sendRequest(recipient.username, recipient.tag), deps.askedText(pseudo))
  }

  return { rows, error, load, accept, ask }
}
