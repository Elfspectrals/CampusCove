import { ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import { applyCachedBalanceAfterPurchase } from '../../api/session'
import type { AdminGrantedPayload, AdminItem, AdminItemsPayload, AdminMenuPayload, AdminPlayerPayload, AdminResultPayload, AdminSummonedPayload, AdminWallet } from '../../types/gameRealtime'

const LOG_SIZE = 5

export interface AdminLogEntry {
  at: number
  result: AdminResultPayload
}

export interface AdminWatchDeps {
  gameRoomRef: ShallowRef<Room | null>
  say: (text: string) => void
  grantedMessage: (data: AdminGrantedPayload) => string
  refreshInventory: () => void
}

/**
 * The watch's Admin app, only for accounts the API flags is_admin (told by the server at join): teleport to a public
 * place, or bring a player next to you. The server checks the flag again on every message and moves the players.
 */
export function useAdminWatch(deps: AdminWatchDeps) {
  const isAdmin = ref(false)
  const menu = ref<AdminMenuPayload | null>(null)
  const error = ref<string | null>(null)
  const panelOpen = ref(false)
  const items = ref<AdminItem[] | null>(null)
  const result = ref<AdminResultPayload | null>(null)
  const log = ref<AdminLogEntry[]>([])
  const sheet = ref<AdminPlayerPayload | null>(null)
  const recentPlace = ref<string | null>(null)

  const send = (type: string, payload?: unknown) => deps.gameRoomRef.value?.send(type, payload)

  /** Asks for the places and the online players; the app shows them when 'admin_menu' answers. */
  function load(): void {
    if (!isAdmin.value) return
    error.value = null
    send('admin_open')
  }

  function teleport(key: string): void {
    error.value = null
    recentPlace.value = key
    send('admin_teleport', { key })
  }

  function goTo(sessionId: string): void {
    error.value = null
    send('admin_goto', { sessionId })
  }

  function loadPlayer(sessionId: string): void {
    error.value = null
    sheet.value = null
    send('admin_player', { sessionId })
  }

  function loadItems(): void {
    if (items.value === null) send('admin_items')
  }

  function summon(sessionId: string): void {
    error.value = null
    send('admin_summon', { sessionId })
  }

  function startStorageSale(): void {
    error.value = null
    result.value = null
    send('admin_storage_sale')
  }

  function openPanel(): void {
    if (!isAdmin.value) return
    panelOpen.value = true
    result.value = null
    load()
    loadItems()
  }

  function closePanel(): void {
    panelOpen.value = false
  }

  function act(type: string, payload?: unknown): void {
    error.value = null
    result.value = null
    send(type, payload)
  }

  const giveMoney = (sessionId: string, wallet: AdminWallet, amount: number) => act('admin_give_money', { sessionId, wallet, amount })
  const giveItem = (sessionId: string, code: string, quantity: number) => act('admin_give_item', { sessionId, code, quantity })
  const openMarket = (minutes: number) => act('admin_market', { action: 'open', minutes })
  const closeMarket = () => act('admin_market', { action: 'close' })
  const collectTaxes = () => act('admin_taxes')
  function startQuiz(): void {
    act('admin_quiz_start')
    load()
  }

  return {
    isAdmin,
    menu,
    error,
    load,
    teleport,
    summon,
    goTo,
    loadPlayer,
    loadItems,
    sheet,
    log,
    recentPlace,
    startStorageSale,
    panelOpen,
    items,
    result,
    openPanel,
    closePanel,
    giveMoney,
    giveItem,
    openMarket,
    closeMarket,
    collectTaxes,
    startQuiz,
    handlers: {
      onInit: (admin: boolean) => {
        isAdmin.value = admin
      },
      onMenu: (data: AdminMenuPayload) => {
        menu.value = {
          destinations: Array.isArray(data.destinations) ? data.destinations : [],
          players: Array.isArray(data.players) ? data.players : [],
          events: data.events,
        }
      },
      onError: (data: { message: string }) => {
        error.value = data.message
      },
      onSummoned: (data: AdminSummonedPayload) => deps.say(`${data.byPseudo} brought you here.`),
      onItems: (data: AdminItemsPayload) => {
        items.value = data.items
      },
      onResult: (data: AdminResultPayload) => {
        result.value = data
        log.value = [{ at: Date.now(), result: data }, ...log.value].slice(0, LOG_SIZE)
        if (data.ok && data.action === 'money' && sheet.value?.sessionId === data.sessionId) sheet.value = { ...sheet.value, cash: data.cash, bank: data.bank }
        if (data.ok && (data.action === 'market_open' || data.action === 'market_close')) load()
      },
      onPlayer: (data: AdminPlayerPayload) => {
        sheet.value = data
      },
      onGranted: (data: AdminGrantedPayload) => {
        if (data.kind === 'money') {
          applyCachedBalanceAfterPurchase('cash', data.cash)
          applyCachedBalanceAfterPurchase('coins', data.bank)
        } else {
          deps.refreshInventory()
        }
        deps.say(deps.grantedMessage(data))
      },
    },
  }
}
