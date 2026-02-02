<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as friendsApi from '../api/friends'
import type { Friend, PendingFriend } from '../api/friends'

const router = useRouter()
const friends = ref<Friend[]>([])
const pending = ref<PendingFriend[]>([])
const friendsLoading = ref(false)
const addUsername = ref('')
const addTag = ref('')
const addError = ref('')
const addLoading = ref(false)
const friendsTab = ref<'all' | 'online' | 'pending'>('all')

const onlineCount = computed(() => friends.value.filter((f) => f.status === 'online' || f.status === 'playing').length)
const incomingPending = computed(() => pending.value.filter((p) => p.incoming))
const outgoingPending = computed(() => pending.value.filter((p) => !p.incoming))
const filteredFriends = computed(() => {
  if (friendsTab.value === 'online') return friends.value.filter((f) => f.status === 'online' || f.status === 'playing')
  if (friendsTab.value === 'pending') return []
  return friends.value
})

onMounted(async () => {
  await loadFriends()
})

async function loadFriends() {
  friendsLoading.value = true
  try {
    const [friendsRes, pendingRes] = await Promise.all([
      friendsApi.getFriends(),
      friendsApi.getPending(),
    ])
    friends.value = friendsRes.friends
    pending.value = pendingRes.pending
  } catch {
    friends.value = []
    pending.value = []
  } finally {
    friendsLoading.value = false
  }
}

async function sendFriendRequest() {
  const username = addUsername.value.trim()
  const tagRaw = addTag.value.trim()
  if (!username || !tagRaw) {
    addError.value = 'Enter username and handle.'
    return
  }
  const tag = parseInt(tagRaw, 10)
  if (Number.isNaN(tag) || tag < 0 || tag > 9999) {
    addError.value = 'Handle must be 0–9999 (same as on their profile).'
    return
  }
  addError.value = ''
  addLoading.value = true
  try {
    await friendsApi.sendRequest(username, tag)
    addUsername.value = ''
    addTag.value = ''
    await loadFriends()
  } catch (e) {
    addError.value = e instanceof Error ? e.message : 'Failed to send request'
  } finally {
    addLoading.value = false
  }
}

async function acceptFriend(accountId: number) {
  try {
    await friendsApi.acceptRequest(accountId)
    await loadFriends()
  } catch {
    // ignore
  }
}

async function declineFriend(accountId: number) {
  try {
    await friendsApi.removeFriend(accountId)
    await loadFriends()
  } catch {
    // ignore
  }
}

async function blockFriend(accountId: number) {
  try {
    await friendsApi.blockUser(accountId)
    await loadFriends()
  } catch {
    // ignore
  }
}

async function cancelSentRequest(accountId: number) {
  try {
    await friendsApi.removeFriend(accountId)
    await loadFriends()
  } catch {
    // ignore
  }
}

async function removeFriend(accountId: number) {
  try {
    await friendsApi.removeFriend(accountId)
    await loadFriends()
  } catch {
    // ignore
  }
}

function friendInitial(name: string): string {
  return name ? name[0].toUpperCase() : '?'
}

function statusDotClass(status: string): string {
  if (status === 'online') return 'bg-green-500'
  if (status === 'playing') return 'bg-blue-500'
  return 'bg-gray-500'
}

function statusLabel(status: string): string {
  if (status === 'online') return 'Online'
  if (status === 'playing') return 'Playing CampusCove'
  return 'Offline'
}

function goBack() {
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="min-h-screen bg-slate-100">
    <!-- Header -->
    <header class="bg-slate-800 text-white border-b border-white/10 px-4 py-3">
      <div class="flex items-center gap-4 max-w-6xl mx-auto">
        <button
          type="button"
          class="p-2 rounded-lg hover:bg-white/10"
          aria-label="Go back"
          @click="goBack"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="text-xl font-bold">Friends</h1>
      </div>
    </header>

    <main class="max-w-6xl mx-auto p-4 md:p-6">
      <!-- Add friend: username + handle (same as on HomeView profile) -->
      <div class="bg-white rounded-2xl p-6 mb-6 shadow-sm">
        <h2 class="text-lg font-bold text-slate-800 mb-4">Add Friend</h2>
        <p class="text-sm text-slate-500 mb-4">Ask your friend for their username and handle (the 4-digit number after # on their profile, e.g. <strong>tryme#7559</strong>).</p>
        <div class="flex flex-wrap gap-3 items-end">
          <div class="flex-1 min-w-[140px]">
            <label for="add-username" class="block text-sm font-medium text-slate-700 mb-1">Username</label>
            <input
              id="add-username"
              v-model="addUsername"
              type="text"
              placeholder="e.g. tryme"
              class="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
              @keydown.enter="sendFriendRequest"
            />
          </div>
          <div class="w-28">
            <label for="add-tag" class="block text-sm font-medium text-slate-700 mb-1">Handle</label>
            <input
              id="add-tag"
              v-model="addTag"
              type="text"
              inputmode="numeric"
              placeholder="7559"
              maxlength="4"
              class="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
              @keydown.enter="sendFriendRequest"
            />
          </div>
          <button
            type="button"
            class="rounded-lg bg-gradient-to-r from-[#DA62C4] to-[#A744E3] px-6 py-3 text-white font-semibold hover:opacity-90 disabled:opacity-50 shrink-0"
            :disabled="addLoading || !addUsername.trim() || !addTag.trim()"
            @click="sendFriendRequest"
          >
            {{ addLoading ? 'Adding...' : 'Add Friend' }}
          </button>
        </div>
        <p v-if="addError" class="m-0 mt-2 text-sm text-red-600">{{ addError }}</p>
      </div>

      <!-- Tabs: All | Online | Pending -->
      <div class="flex gap-2 mb-4">
        <button
          type="button"
          :class="[
            'px-4 py-2 rounded-lg font-medium transition-colors',
            friendsTab === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
          ]"
          @click="friendsTab = 'all'"
        >
          All ({{ friends.length }})
        </button>
        <button
          type="button"
          :class="[
            'px-4 py-2 rounded-lg font-medium transition-colors',
            friendsTab === 'online' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
          ]"
          @click="friendsTab = 'online'"
        >
          Online ({{ onlineCount }})
        </button>
        <button
          type="button"
          :class="[
            'px-4 py-2 rounded-lg font-medium transition-colors relative',
            friendsTab === 'pending' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
          ]"
          @click="friendsTab = 'pending'"
        >
          Pending
          <span v-if="incomingPending.length > 0" class="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-slate-900 text-xs font-bold flex items-center justify-center">{{ incomingPending.length }}</span>
        </button>
      </div>

      <!-- Content -->
      <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
        <!-- Pending tab -->
        <template v-if="friendsTab === 'pending'">
          <div v-if="friendsLoading" class="p-12 text-center text-slate-500">Loading…</div>
          <div v-else-if="pending.length === 0" class="p-12 text-center text-slate-500">No pending requests</div>
          <div v-else class="divide-y divide-slate-100">
            <div v-if="incomingPending.length > 0" class="p-4">
              <h3 class="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Incoming Requests</h3>
              <div class="space-y-2">
                <div
                  v-for="p in incomingPending"
                  :key="p.account_id"
                  class="flex items-center gap-4 p-4 rounded-lg bg-slate-50 hover:bg-slate-100"
                >
                  <div class="w-12 h-12 rounded-full bg-gradient-to-br from-[#DA62C4] to-[#A744E3] flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {{ friendInitial(p.display_name) }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="m-0 font-semibold text-slate-800 text-base">{{ p.display_name }}</p>
                    <p class="m-0 text-sm text-slate-500">Wants to be your friend</p>
                  </div>
                  <div class="flex gap-2 shrink-0">
                    <button
                      type="button"
                      class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                      @click="acceptFriend(p.account_id)"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      class="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
                      @click="declineFriend(p.account_id)"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      class="rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
                      @click="blockFriend(p.account_id)"
                    >
                      Block
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="outgoingPending.length > 0" class="p-4">
              <h3 class="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Outgoing Requests</h3>
              <div class="space-y-2">
                <div
                  v-for="p in outgoingPending"
                  :key="p.account_id"
                  class="flex items-center gap-4 p-4 rounded-lg bg-slate-50 hover:bg-slate-100"
                >
                  <div class="w-12 h-12 rounded-full bg-gradient-to-br from-[#DA62C4] to-[#A744E3] flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {{ friendInitial(p.display_name) }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="m-0 font-semibold text-slate-800 text-base">{{ p.display_name }}</p>
                    <p class="m-0 text-sm text-slate-500">Pending request</p>
                  </div>
                  <button
                    type="button"
                    class="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 shrink-0"
                    @click="cancelSentRequest(p.account_id)"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- All / Online: friend list -->
        <template v-else>
          <div v-if="friendsLoading" class="p-12 text-center text-slate-500">Loading…</div>
          <div v-else-if="filteredFriends.length === 0" class="p-12 text-center text-slate-500">
            {{ friendsTab === 'online' ? 'No friends online' : 'No friends yet. Add some friends to get started!' }}
          </div>
          <div v-else class="divide-y divide-slate-100">
            <div
              v-for="f in filteredFriends"
              :key="f.account_id"
              class="flex items-center gap-4 p-4 hover:bg-slate-50 group"
            >
              <div class="relative shrink-0">
                <div class="w-12 h-12 rounded-full bg-gradient-to-br from-[#DA62C4] to-[#A744E3] flex items-center justify-center text-white font-bold text-lg">
                  {{ friendInitial(f.display_name) }}
                </div>
                <span
                  :class="['absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white', statusDotClass(f.status)]"
                  :title="statusLabel(f.status)"
                />
              </div>
              <div class="flex-1 min-w-0">
                <p class="m-0 font-semibold text-slate-800 text-base">{{ f.display_name }}</p>
                <p class="m-0 text-sm text-slate-500">{{ statusLabel(f.status) }}</p>
              </div>
              <button
                type="button"
                class="shrink-0 p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove friend"
                @click="removeFriend(f.account_id)"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>
