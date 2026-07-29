<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { getStoredAuth } from '../api/auth'
import { useWalletBalances } from '../composables/useWalletBalances'
import * as friendsApi from '../api/friends'
import type { Friend } from '../api/friends'

const router = useRouter()
const friendsPanelOpen = ref(false)

const auth = computed(() => getStoredAuth())
const wallet = useWalletBalances()
const coinsDisplay = computed(() =>
  wallet.value.coins === null ? '—' : wallet.value.coins.toLocaleString()
)
const premiumDisplay = computed(() =>
  wallet.value.premium === null ? '—' : wallet.value.premium.toLocaleString()
)
const displayName = computed(() => auth.value?.user?.display_name || auth.value?.user?.username || 'Player')
const email = computed(() => auth.value?.user?.email ?? '')
const accountHandle = computed(() => {
  const user = auth.value?.user
  if (!user) return ''
  return `${user.username}#${String(user.tag).padStart(4, '0')}`
})
const initial = computed(() => {
  const n = displayName.value
  return n.length > 0 ? n.charAt(0).toUpperCase() : 'P'
})

const friends = ref<Friend[]>([])
const friendsLoading = ref(false)
const friendsError = ref('')

onMounted(async () => {
  await loadFriends()
})

async function loadFriends() {
  friendsLoading.value = true
  friendsError.value = ''
  try {
    const friendsRes = await friendsApi.getFriends()
    friends.value = friendsRes.friends
  } catch (caught) {
    friendsError.value = caught instanceof Error ? caught.message : 'Could not load friends'
  } finally {
    friendsLoading.value = false
  }
}

function friendInitial(name: string): string {
  return name.length > 0 ? name.charAt(0).toUpperCase() : '?'
}

function statusDotClass(status: string): string {
  if (status === 'online') return 'bg-green-500'
  if (status === 'playing') return 'bg-blue-500'
  return 'bg-gray-500'
}

function statusLabel(status: string): string {
  if (status === 'online') return 'Online'
  if (status === 'playing') return 'Playing CampusCove'
  return 'Presence unavailable'
}

function launchGame() {
  router.push({ name: 'game' })
}

function openFriends() {
  void router.push({ name: 'friends' })
}
</script>

<template>
  <div class="relative">
      <section class="overflow-auto p-2 transition-[margin] md:p-4" :class="{ 'lg:mr-80': friendsPanelOpen }">
        <div class="rounded-2xl bg-slate-800 text-white p-6 mb-6 flex flex-col md:flex-row md:items-center gap-6">
          <div class="flex items-center gap-4 flex-1">
            <div class="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center text-3xl font-bold text-white shrink-0">
              {{ initial }}
            </div>
            <div>
              <h2 class="m-0 text-xl font-bold text-white">{{ displayName }}</h2>
              <p class="m-0 text-sm text-white/70">{{ accountHandle }}</p>
              <div class="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-white/80">
                <span class="rounded-full bg-white/10 px-3 py-1.5">{{ friends.length }} friends</span>
                <span class="rounded-full bg-amber-400/15 px-3 py-1.5 text-amber-200">🪙 {{ coinsDisplay }}</span>
                <span class="rounded-full bg-fuchsia-400/15 px-3 py-1.5 text-fuchsia-200">✨ {{ premiumDisplay }}</span>
              </div>
            </div>
          </div>
          <RouterLink
            :to="{ name: 'locker' }"
            class="inline-flex shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15"
          >
            Customize character
          </RouterLink>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div class="rounded-2xl bg-slate-800 text-white p-5">
            <h3 class="m-0 mb-4 font-bold text-sm tracking-wider">ACCOUNT</h3>
            <div class="space-y-3 text-sm">
              <div>
                <p class="m-0 text-white/50 text-xs uppercase tracking-wide">HANDLE</p>
                <p class="m-0 font-semibold text-white">{{ accountHandle }}</p>
              </div>
              <div>
                <p class="m-0 text-white/50 text-xs uppercase tracking-wide">EMAIL</p>
                <p class="m-0 truncate text-white">{{ email }}</p>
              </div>
              <div>
                <p class="m-0 text-white/50 text-xs uppercase tracking-wide">COINS</p>
                <p class="m-0 font-semibold text-white flex items-center gap-2">🪙 {{ coinsDisplay }}</p>
              </div>
              <div>
                <p class="m-0 text-white/50 text-xs uppercase tracking-wide">PREMIUM</p>
                <p class="m-0 font-semibold text-white flex items-center gap-2">✨ {{ premiumDisplay }}</p>
              </div>
            </div>
          </div>

          <div class="flex min-h-44 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-500 p-6 text-center text-white">
            <div class="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mb-3">
              <svg class="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <h3 class="m-0 mb-1 font-bold text-lg">READY TO PLAY?</h3>
            <p class="m-0 mb-4 text-sm text-white/90">Jump into your virtual campus</p>
            <button
              type="button"
              class="rounded-lg bg-white px-6 py-2.5 text-base font-bold text-fuchsia-600 hover:bg-white/95 transition-colors"
              @click="launchGame"
            >
              LAUNCH GAME
            </button>
          </div>

          <div class="rounded-2xl bg-slate-800 text-white p-5">
            <h3 class="m-0 mb-4 font-bold text-sm tracking-wider">QUICK ACTIONS</h3>
            <div class="space-y-2">
              <RouterLink
                to="/shop"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium"
              >
                🛒 Visit Shop
              </RouterLink>
              <RouterLink
                to="/shop-skin"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium"
              >
                🧥 Visit Shop Skin
              </RouterLink>
              <RouterLink
                to="/locker"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium"
              >
                🎒 Open Locker
              </RouterLink>
              <RouterLink to="/friends" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium">
                👥 View Friends
              </RouterLink>
            </div>
          </div>
        </div>
      </section>

      <!-- Collapsible Friends Panel (Right Side) -->
      <aside
        :class="[
          'fixed bottom-0 right-0 top-14 z-30 flex w-80 max-w-full transform flex-col border-l border-white/10 bg-slate-800 text-white transition-transform duration-300 ease-out',
          friendsPanelOpen ? 'translate-x-0' : 'translate-x-full',
        ]"
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <h2 class="text-lg font-bold">Friends</h2>
          <div class="flex items-center gap-2">
            <RouterLink
              to="/friends"
              class="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white"
              title="Manage friends"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </RouterLink>
            <button
              type="button"
              class="p-2 rounded-lg hover:bg-white/10"
              aria-label="Close friends panel"
              @click="friendsPanelOpen = false"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto px-3 py-3 min-h-0">
          <div v-if="friendsLoading" class="py-8 text-center text-sm text-white/50">Loading friends…</div>
          <div v-else-if="friendsError" class="rounded-lg border border-rose-300/20 bg-rose-500/10 p-3 text-sm text-rose-100" role="alert">
            <p class="m-0">{{ friendsError }}</p>
            <button type="button" class="mt-2 font-bold underline underline-offset-2" @click="loadFriends">Try again</button>
          </div>
          <div v-else-if="friends.length === 0" class="py-8 text-center text-sm text-white/50">
            <p class="mb-2">No friends yet</p>
            <RouterLink to="/friends" class="text-purple-400 hover:text-purple-300 underline">Add friends</RouterLink>
          </div>
          <div v-else class="space-y-1">
            <button
              v-for="f in friends"
              :key="f.account_id"
              type="button"
              class="group flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-white/5"
              @click="openFriends"
            >
              <div class="relative shrink-0">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-[#DA62C4] to-[#A744E3] flex items-center justify-center text-white font-bold text-sm">
                  {{ friendInitial(f.display_name) }}
                </div>
                <span
                  :class="['absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-800', statusDotClass(f.status)]"
                  :title="statusLabel(f.status)"
                />
              </div>
              <div class="min-w-0 flex-1">
                <p class="m-0 font-medium text-white text-sm truncate">{{ f.display_name }}</p>
                <p class="m-0 text-xs text-white/50 truncate">{{ statusLabel(f.status) }}</p>
              </div>
              <span class="shrink-0 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white" aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <div class="px-3 py-3 border-t border-white/10 shrink-0">
          <p class="m-0 text-xs text-white/50">{{ friends.length }} {{ friends.length === 1 ? 'friend' : 'friends' }}</p>
        </div>
      </aside>

      <!-- Toggle button for friends panel -->
      <button
        type="button"
        class="fixed bottom-6 right-6 z-20 w-14 h-14 rounded-full bg-gradient-to-r from-[#DA62C4] to-[#A744E3] text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
        :class="{ 'pointer-events-none opacity-0': friendsPanelOpen }"
        :title="friendsPanelOpen ? 'Close friends' : 'Open friends'"
        @click="friendsPanelOpen = !friendsPanelOpen"
      >
        <svg v-if="!friendsPanelOpen" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-6.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
  </div>
</template>
