import { ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import { applyCachedBalanceAfterPurchase } from '../../api/session'
import { isToggle } from '../../game/admin/adminPanel'
import type {
  AdminGrantedPayload,
  AdminHeldItem,
  AdminInventoryPayload,
  AdminItem,
  AdminItemsPayload,
  AdminModeration,
  AdminMenuPayload,
  AdminPlayerPayload,
  AdminPower,
  AdminPowersPayload,
  AdminResultPayload,
  AdminSummonedPayload,
  AdminToggle,
  AdminWallet,
  HousingUnitPayload,
} from '../../types/gameRealtime'

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
  /** The town's houses (housing_units_sync), for the house map. */
  houses: Ref<HousingUnitPayload[]>
  /** Translates a message key (kicked, chat muted). */
  translate: (key: string) => string
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
  /** Toggles an admin turned on for this player (any player, admin or not): fly, speed, freeze... */
  const myPowers = ref<ReadonlySet<AdminToggle>>(new Set())
  const inventory = ref<{ sessionId: string; items: AdminHeldItem[] } | null>(null)

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
  /** A toggle needs `on`; a one-shot boost sends none. */
  const power = (sessionId: string, name: AdminPower, on?: boolean) => act('admin_power', isToggle(name) ? { sessionId, power: name, on: on === true } : { sessionId, power: name })
  const giveHouse = (sessionId: string, unit: string) => act('admin_house', { sessionId, unit })
  const moderate = (sessionId: string, action: AdminModeration, extra: { minutes?: number; stars?: number; key?: string } = {}) =>
    act('admin_moderate', { sessionId, action, ...extra })
  const takeMoney = (sessionId: string, wallet: AdminWallet, amount: number) => act('admin_take_money', { sessionId, wallet, amount })
  const takeItem = (sessionId: string, code: string, quantity: number) => act('admin_take_item', { sessionId, code, quantity })
  const takeHouse = (sessionId: string) => act('admin_take_house', { sessionId })
  function loadInventory(sessionId: string): void {
    if (inventory.value?.sessionId !== sessionId) inventory.value = null
    send('admin_inventory', { sessionId })
  }
  const hasMyPower = (power: AdminToggle) => myPowers.value.has(power)
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
    power,
    giveHouse,
    houses: deps.houses,
    moderate,
    takeMoney,
    takeItem,
    takeHouse,
    inventory,
    loadInventory,
    myPowers,
    hasMyPower,
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
        if (data.ok && (data.action === 'power' || data.action === 'moderate') && sheet.value?.sessionId === data.sessionId) {
          sheet.value = { ...sheet.value, stars: data.stars, vitals: data.vitals, powers: data.powers }
        }
        if (data.ok && data.action === 'take_money' && sheet.value?.sessionId === data.sessionId) sheet.value = { ...sheet.value, cash: data.cash, bank: data.bank }
        if (data.ok && data.action === 'moderate' && data.moderation === 'kick') load()
        if (data.ok && (data.action === 'market_open' || data.action === 'market_close')) load()
      },
      onPlayer: (data: AdminPlayerPayload) => {
        sheet.value = data
      },
      onPowers: (data: AdminPowersPayload) => {
        myPowers.value = new Set(Array.isArray(data.powers) ? data.powers : [])
      },
      onInventory: (data: AdminInventoryPayload) => {
        inventory.value = { sessionId: data.sessionId, items: Array.isArray(data.items) ? data.items : [] }
      },
      onChatMuted: () => deps.say(deps.translate('adminPanel.chatMuted')),
      kickedMessage: () => deps.translate('adminPanel.kicked'),
      onGranted: (data: AdminGrantedPayload) => {
        if (data.kind === 'money' || data.kind === 'take_money') {
          applyCachedBalanceAfterPurchase('cash', data.cash)
          applyCachedBalanceAfterPurchase('coins', data.bank)
        } else if (data.kind === 'item' || data.kind === 'house' || data.kind === 'take_item' || data.kind === 'take_house') {
          deps.refreshInventory()
        }
        deps.say(deps.grantedMessage(data))
      },
    },
  }
}
