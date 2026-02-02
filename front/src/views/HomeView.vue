<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { getStoredAuth, clearAuth } from '../api/auth'
import * as friendsApi from '../api/friends'
import type { Friend } from '../api/friends'

const router = useRouter()
const menuOpen = ref(false)
const activeTab = ref<'about' | 'inventory' | 'achievements'>('about')
const friendsPanelOpen = ref(false)

const auth = computed(() => getStoredAuth())
const displayName = computed(() => auth.value?.user?.display_name || auth.value?.user?.username || 'Player')
const email = computed(() => auth.value?.user?.email ?? '')
const initial = computed(() => (displayName.value ? displayName.value[0].toUpperCase() : 'P'))

const friends = ref<Friend[]>([])
const friendsLoading = ref(false)

const onlineCount = computed(() => friends.value.filter((f) => f.status === 'online' || f.status === 'playing').length)

onMounted(async () => {
  await loadFriends()
})

async function loadFriends() {
  friendsLoading.value = true
  try {
    const friendsRes = await friendsApi.getFriends()
    friends.value = friendsRes.friends
  } catch {
    friends.value = []
  } finally {
    friendsLoading.value = false
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

function launchGame() {
  router.push({ name: 'game' })
}

function logout() {
  clearAuth()
  router.push({ name: 'landing' })
}

function closeMenu() {
  menuOpen.value = false
}

function openChat(friend: Friend) {
  // TODO: Implement chat functionality
  console.log('Open chat with', friend.display_name)
}

const coins = 5000
const memberSince = 'February 2026'
const lastOnline = 'Just now'
const stats = computed(() => ({
  friends: friends.value.length,
  level: 5,
  items: 24,
  achievements: 8,
}))
const recentItems = [
  { name: 'Gaming Chair Pro', color: 'bg-red-400' },
  { name: 'Modern Couch', color: 'bg-gray-400' },
  { name: 'Neon Lights', color: 'bg-pink-400' },
  { name: 'Indoor Plant', color: 'bg-green-400' },
  { name: 'LED Strip', color: 'bg-purple-400' },
  { name: 'Wall Art', color: 'bg-amber-400' },
]
</script>

<template>
  <div class="min-h-screen flex bg-slate-100">
    <!-- Sidebar (Figma 25-161: FRIENDS section + menu) -->
    <aside
      :class="[
        'fixed inset-y-0 left-0 z-40 w-64 bg-[#191C28] text-white transform transition-transform duration-200 ease-out md:translate-x-0 flex flex-col',
        menuOpen ? 'translate-x-0' : '-translate-x-full',
      ]"
    >
      <div class="flex items-center justify-between px-4 py-4 border-b border-white/10 shrink-0">
        <span class="font-bold text-sm tracking-wider">MENU</span>
        <button type="button" class="p-2 hover:bg-white/10 rounded-lg md:hidden" aria-label="Close menu" @click="closeMenu">
          <span class="text-lg">×</span>
        </button>
      </div>
      <nav class="p-3 space-y-1 shrink-0">
        <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg text-white/90 hover:bg-white/10">🛒 Item Shop</a>
        <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg text-white/90 hover:bg-white/10">⭐ Featured</a>
        <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg text-white/90 hover:bg-white/10">🏠 Furniture</a>
        <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg text-white/90 hover:bg-white/10">📦 Bundles</a>
        <RouterLink to="/friends" class="flex items-center gap-3 px-3 py-2 rounded-lg text-white/90 hover:bg-white/10" @click="closeMenu">
          👥 Friends
        </RouterLink>
        <div class="flex items-center gap-3 px-3 py-2 rounded-lg bg-amber-500 text-slate-900 font-semibold">
          👤 Profile
        </div>
        <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg text-white/90 hover:bg-white/10">🏆 Achievements</a>
        <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg text-white/90 hover:bg-white/10">⚙️ Settings</a>
      </nav>

      <div class="flex-1 shrink-0" />

      <div class="p-3 border-t border-white/10 shrink-0">
        <button
          type="button"
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/20 w-full text-left"
          @click="logout"
        >
          🚪 Logout
        </button>
      </div>
    </aside>

    <div v-if="menuOpen" class="fixed inset-0 z-30 bg-black/50 md:hidden" aria-hidden="true" @click="closeMenu" />

    <div class="flex-1 flex flex-col min-h-screen md:ml-64 relative">
      <header class="flex items-center justify-between px-4 py-3 bg-slate-800 text-white border-b border-white/10">
        <button
          type="button"
          class="p-2 rounded-lg hover:bg-white/10 md:hidden"
          aria-label="Open menu"
          @click="menuOpen = true"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 class="text-lg font-bold text-white ml-2 md:ml-0">CampusCove</h1>
        <div class="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-slate-900 font-semibold text-sm">
          <span>🪙</span>
          <span>{{ coins }}</span>
        </div>
      </header>

      <main class="flex-1 p-4 md:p-6 overflow-auto" :class="{ 'mr-80': friendsPanelOpen }">
        <div class="rounded-2xl bg-slate-800 text-white p-6 mb-6 flex flex-col md:flex-row md:items-center gap-6">
          <div class="flex items-center gap-4 flex-1">
            <div class="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center text-3xl font-bold text-white shrink-0">
              {{ initial }}
            </div>
            <div>
              <h2 class="m-0 text-xl font-bold text-white">{{ displayName }}</h2>
              <p class="m-0 text-sm text-white/70">{{ email }}</p>
              <div class="flex flex-wrap gap-4 mt-2 text-sm text-white/80">
                <span>{{ stats.friends }} Friends</span>
                <span>{{ stats.level }} Level</span>
                <span>{{ stats.items }} Items</span>
                <span>{{ stats.achievements }} Achievements</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            class="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-white font-bold text-sm hover:bg-red-500 shrink-0"
            @click="logout"
          >
            <span>→</span> LOGOUT
          </button>
          <div class="flex border-b border-white/20 -mb-2 md:border-0 md:mb-0 flex gap-1">
            <button
              type="button"
              :class="[
                'px-4 py-2 text-sm font-semibold rounded-t-lg md:rounded-lg',
                activeTab === 'about' ? 'bg-amber-500 text-slate-900 md:underline md:decoration-amber-500 md:decoration-2' : 'text-white/80 hover:bg-white/10',
              ]"
              @click="activeTab = 'about'"
            >
              ABOUT
            </button>
            <button
              type="button"
              :class="[
                'px-4 py-2 text-sm font-semibold rounded-t-lg md:rounded-lg',
                activeTab === 'inventory' ? 'bg-amber-500 text-slate-900 md:underline md:decoration-amber-500 md:decoration-2' : 'text-white/80 hover:bg-white/10',
              ]"
              @click="activeTab = 'inventory'"
            >
              INVENTORY
            </button>
            <button
              type="button"
              :class="[
                'px-4 py-2 text-sm font-semibold rounded-t-lg md:rounded-lg',
                activeTab === 'achievements' ? 'bg-amber-500 text-slate-900 md:underline md:decoration-amber-500 md:decoration-2' : 'text-white/80 hover:bg-white/10',
              ]"
              @click="activeTab = 'achievements'"
            >
              ACHIEVEMENTS
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div class="rounded-2xl bg-slate-800 text-white p-5">
            <h3 class="m-0 mb-4 font-bold text-sm tracking-wider">ABOUT</h3>
            <div class="space-y-3 text-sm">
              <div>
                <p class="m-0 text-white/50 text-xs uppercase tracking-wide">MEMBER SINCE</p>
                <p class="m-0 font-semibold text-white">{{ memberSince }}</p>
              </div>
              <div>
                <p class="m-0 text-white/50 text-xs uppercase tracking-wide">LAST ONLINE</p>
                <p class="m-0 text-white">{{ lastOnline }}</p>
              </div>
              <div>
                <p class="m-0 text-white/50 text-xs uppercase tracking-wide">COINS</p>
                <p class="m-0 font-semibold text-white flex items-center gap-2">🪙 {{ coins }}</p>
              </div>
            </div>
          </div>

          <div class="rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-500 text-white p-6 flex flex-col items-center justify-center text-center min-h-[180px]">
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
              <button type="button" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium">
                🛒 Visit Shop
              </button>
              <RouterLink to="/friends" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium">
                👥 View Friends
              </RouterLink>
              <button type="button" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium">
                🏆 Achievements
              </button>
            </div>
          </div>
        </div>

        <section>
          <h3 class="m-0 mb-4 font-bold text-slate-800 text-lg">RECENT ITEMS</h3>
          <div class="flex gap-4 overflow-x-auto pb-2">
            <div
              v-for="(item, i) in recentItems"
              :key="i"
              class="shrink-0 w-36 h-36 rounded-xl overflow-hidden bg-slate-200 cursor-pointer group"
            >
              <div :class="['w-full h-24', item.color]" />
              <div class="px-2 py-2 bg-slate-800 text-white text-xs font-medium">
                {{ item.name }}
              </div>
            </div>
          </div>
        </section>
      </main>

      <!-- Collapsible Friends Panel (Right Side) -->
      <aside
        :class="[
          'fixed top-0 right-0 bottom-0 z-30 w-80 bg-slate-800 text-white border-l border-white/10 transform transition-transform duration-300 ease-out flex flex-col',
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
          <div v-else-if="friends.length === 0" class="py-8 text-center text-sm text-white/50">
            <p class="mb-2">No friends yet</p>
            <RouterLink to="/friends" class="text-purple-400 hover:text-purple-300 underline">Add friends</RouterLink>
          </div>
          <div v-else class="space-y-1">
            <div
              v-for="f in friends"
              :key="f.account_id"
              class="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 cursor-pointer group"
              @click="openChat(f)"
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
              <button
                type="button"
                class="shrink-0 p-1.5 rounded text-white/40 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Message"
                @click.stop="openChat(f)"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div class="px-3 py-3 border-t border-white/10 shrink-0">
          <p class="m-0 mb-2 text-xs text-white/50">{{ onlineCount }} of {{ friends.length }} online</p>
        </div>
      </aside>

      <!-- Toggle button for friends panel -->
      <button
        type="button"
        class="fixed bottom-6 right-6 z-20 w-14 h-14 rounded-full bg-gradient-to-r from-[#DA62C4] to-[#A744E3] text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
        :class="{ 'right-80': friendsPanelOpen }"
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
  </div>
</template>
