<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import {
  equipAdminBodySkin,
  fetchAdminInventoryPlayers,
  fetchAdminPlayerInventory,
  grantAdminInventoryItem,
  removeAdminInventoryItem,
  resetAdminInventory,
  setAdminInventoryQuantity,
  type AdminInventoryPlayer,
  type AdminInventoryRow,
} from '../../api/adminInventories'

const players = ref<AdminInventoryPlayer[]>([])
const playersLoading = ref(true)
const playersError = ref<string | null>(null)
const playerSearch = ref('')
const selectedPlayerId = ref<number | null>(null)

const items = ref<AdminInventoryRow[]>([])
const inventoryLoading = ref(false)
const inventoryError = ref<string | null>(null)
const message = ref<string | null>(null)
const actionLoading = ref(false)

const grantItemDefId = ref<number | null>(null)
const grantQuantity = ref<number>(1)
const setQuantityItemDefId = ref<number | null>(null)
const setQuantity = ref<number>(1)
const equipItemDefId = ref<number | null>(null)

let playerSearchDebounce: ReturnType<typeof setTimeout> | null = null

async function loadPlayers(): Promise<void> {
  playersLoading.value = true
  playersError.value = null
  try {
    const response = await fetchAdminInventoryPlayers({ q: playerSearch.value })
    players.value = response.players
    if (selectedPlayerId.value === null && players.value.length > 0) {
      const firstPlayer = players.value[0]
      if (firstPlayer) {
        selectedPlayerId.value = firstPlayer.account_id
      }
    }
  } catch (caught) {
    playersError.value = caught instanceof Error ? caught.message : 'Could not load players'
    players.value = []
  } finally {
    playersLoading.value = false
  }
}

async function loadInventory(): Promise<void> {
  if (selectedPlayerId.value === null) {
    items.value = []
    return
  }
  inventoryLoading.value = true
  inventoryError.value = null
  try {
    const response = await fetchAdminPlayerInventory(selectedPlayerId.value)
    items.value = response.items
  } catch (caught) {
    inventoryError.value = caught instanceof Error ? caught.message : 'Could not load inventory'
    items.value = []
  } finally {
    inventoryLoading.value = false
  }
}

async function grant(): Promise<void> {
  if (selectedPlayerId.value === null || grantItemDefId.value === null || grantQuantity.value < 1) return
  actionLoading.value = true
  inventoryError.value = null
  try {
    await grantAdminInventoryItem(selectedPlayerId.value, { item_def_id: grantItemDefId.value, quantity: grantQuantity.value })
    message.value = 'Item granted.'
    await loadInventory()
  } catch (caught) {
    inventoryError.value = caught instanceof Error ? caught.message : 'Could not grant item'
  } finally {
    actionLoading.value = false
  }
}

async function applySetQuantity(): Promise<void> {
  if (selectedPlayerId.value === null || setQuantityItemDefId.value === null || setQuantity.value < 0) return
  actionLoading.value = true
  inventoryError.value = null
  try {
    await setAdminInventoryQuantity(selectedPlayerId.value, { item_def_id: setQuantityItemDefId.value, quantity: setQuantity.value })
    message.value = 'Quantity updated.'
    await loadInventory()
  } catch (caught) {
    inventoryError.value = caught instanceof Error ? caught.message : 'Could not set quantity'
  } finally {
    actionLoading.value = false
  }
}

async function remove(itemDefId: number, quantity: number): Promise<void> {
  if (selectedPlayerId.value === null) return
  actionLoading.value = true
  inventoryError.value = null
  try {
    await removeAdminInventoryItem(selectedPlayerId.value, itemDefId, quantity)
    message.value = 'Item removed.'
    await loadInventory()
  } catch (caught) {
    inventoryError.value = caught instanceof Error ? caught.message : 'Could not remove item'
  } finally {
    actionLoading.value = false
  }
}

async function equipBodySkin(): Promise<void> {
  if (selectedPlayerId.value === null || equipItemDefId.value === null) return
  actionLoading.value = true
  inventoryError.value = null
  try {
    await equipAdminBodySkin(selectedPlayerId.value, equipItemDefId.value)
    message.value = 'Body skin equipped.'
  } catch (caught) {
    inventoryError.value = caught instanceof Error ? caught.message : 'Could not equip body skin'
  } finally {
    actionLoading.value = false
  }
}

async function resetInventory(): Promise<void> {
  if (selectedPlayerId.value === null) return
  if (!window.confirm('Reset this player inventory?')) return
  actionLoading.value = true
  inventoryError.value = null
  try {
    await resetAdminInventory(selectedPlayerId.value)
    message.value = 'Inventory reset complete.'
    await loadInventory()
  } catch (caught) {
    inventoryError.value = caught instanceof Error ? caught.message : 'Could not reset inventory'
  } finally {
    actionLoading.value = false
  }
}

onMounted(() => {
  void loadPlayers()
})

watch(playerSearch, () => {
  if (playerSearchDebounce) clearTimeout(playerSearchDebounce)
  playerSearchDebounce = setTimeout(() => {
    void loadPlayers()
  }, 300)
})

watch(selectedPlayerId, () => {
  void loadInventory()
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-7xl flex-col gap-4">
    <div>
      <h1 class="cc-display m-0 text-3xl text-fog">Admin inventories</h1>
      <p class="mt-1 text-sm text-mist">Select a player, inspect inventory, then grant, adjust, equip, or reset.</p>
    </div>

    <p v-if="message" class="cc-alert cc-alert-success">{{ message }}</p>
    <p v-if="playersError || inventoryError" class="cc-alert cc-alert-error">{{ playersError ?? inventoryError }}</p>

    <div class="grid gap-4 lg:grid-cols-3">
      <section class="cc-panel p-4 lg:col-span-1">
        <label for="admin-player-search" class="cc-label">Find player</label>
        <input
          id="admin-player-search"
          v-model="playerSearch"
          type="search"
          class="cc-input cc-input-sm w-full"
          placeholder="username/email"
        />
        <div v-if="playersLoading" class="py-6 text-sm text-mist">Loading players...</div>
        <ul v-else class="mt-3 max-h-[60vh] space-y-2 overflow-y-auto">
          <li v-for="player in players" :key="player.account_id">
            <button
              type="button"
              class="w-full rounded-xl border-2 px-3 py-2 text-left text-sm transition"
              :class="selectedPlayerId === player.account_id ? 'border-sun bg-sun/10 text-sun' : 'border-ink-600 bg-ink-950/40 text-fog hover:border-ink-500'"
              @click="selectedPlayerId = player.account_id"
            >
              <p class="m-0 font-semibold">{{ player.username }}</p>
              <p class="m-0 text-xs text-mist">{{ player.email }}</p>
            </button>
          </li>
        </ul>
      </section>

      <section class="cc-panel p-4 lg:col-span-2">
        <div class="grid gap-3 md:grid-cols-2">
          <div class="cc-panel-flat p-3">
            <p class="m-0 mb-2 font-display text-base text-fog">Grant item</p>
            <div class="space-y-2">
              <input v-model.number="grantItemDefId" type="number" min="1" class="cc-input cc-input-sm w-full" placeholder="Item def ID" />
              <input v-model.number="grantQuantity" type="number" min="1" class="cc-input cc-input-sm w-full" placeholder="Quantity" />
              <button type="button" class="cc-btn cc-btn-sm cc-btn-sun w-full" :disabled="actionLoading" @click="grant">
                Grant
              </button>
            </div>
          </div>

          <div class="cc-panel-flat p-3">
            <p class="m-0 mb-2 font-display text-base text-fog">Set quantity</p>
            <div class="space-y-2">
              <input v-model.number="setQuantityItemDefId" type="number" min="1" class="cc-input cc-input-sm w-full" placeholder="Item def ID" />
              <input v-model.number="setQuantity" type="number" min="0" class="cc-input cc-input-sm w-full" placeholder="Quantity" />
              <button type="button" class="cc-btn cc-btn-sm cc-btn-pool w-full" :disabled="actionLoading" @click="applySetQuantity">
                Apply
              </button>
            </div>
          </div>

          <div class="cc-panel-flat p-3">
            <p class="m-0 mb-2 font-display text-base text-fog">Equip body skin</p>
            <div class="space-y-2">
              <input v-model.number="equipItemDefId" type="number" min="1" class="cc-input cc-input-sm w-full" placeholder="Item def ID" />
              <button type="button" class="cc-btn cc-btn-sm cc-btn-mint w-full" :disabled="actionLoading" @click="equipBodySkin">
                Equip
              </button>
            </div>
          </div>

          <div class="cc-panel-flat border-coral/50 bg-coral/5 p-3">
            <p class="m-0 mb-2 font-display text-base text-coral">Reset inventory</p>
            <button type="button" class="cc-btn cc-btn-sm cc-btn-coral w-full" :disabled="actionLoading" @click="resetInventory">
              Reset player inventory
            </button>
          </div>
        </div>

        <div class="mt-4">
          <h2 class="cc-display m-0 mb-2 text-xl text-fog">Inventory items</h2>
          <div v-if="inventoryLoading" class="cc-panel-flat px-3 py-10 text-center text-sm font-bold text-mist">Loading inventory...</div>
          <div v-else-if="items.length === 0" class="cc-panel-flat px-3 py-10 text-center text-sm font-bold text-mist">No items for this player.</div>
          <div v-else class="overflow-x-auto rounded-2xl border-2 border-ink-600/50">
            <table class="cc-table">
              <thead>
                <tr>
                  <th class="px-3 py-2 text-left">Item</th>
                  <th class="px-3 py-2 text-left">Kind</th>
                  <th class="px-3 py-2 text-left">Qty</th>
                  <th class="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in items" :key="item.item_def_id">
                  <td class="px-3 py-2">
                    <p class="m-0 font-semibold text-fog">{{ item.name }}</p>
                    <p class="m-0 text-xs text-mist">{{ item.code }} / #{{ item.item_def_id }}</p>
                  </td>
                  <td class="px-3 py-2 text-fog/90">{{ item.kind }}</td>
                  <td class="px-3 py-2 text-fog/90">{{ item.quantity }}</td>
                  <td class="px-3 py-2 text-right">
                    <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost text-coral" :disabled="actionLoading" @click="remove(item.item_def_id, item.quantity)">
                      Remove
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
