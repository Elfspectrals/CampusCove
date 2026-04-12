<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  clearAuth,
  getCachedWalletBalances,
  getStoredAuth,
  isAdminUser,
  logout as logoutApi,
  subscribeAuth,
} from '../api/auth'

const router = useRouter()
const route = useRoute()

const shellTick = ref(0)
let unsubAuth: (() => void) | undefined

onMounted(() => {
  unsubAuth = subscribeAuth(() => {
    shellTick.value++
  })
})

onUnmounted(() => {
  unsubAuth?.()
})

const auth = computed(() => {
  void shellTick.value
  return getStoredAuth()
})

const balances = computed(() => {
  void shellTick.value
  return getCachedWalletBalances()
})

const isLoggedIn = computed(() => Boolean(auth.value?.token))
const showAdmin = computed(() => isAdminUser(auth.value?.user))
const displayName = computed(() => {
  const u = auth.value?.user
  if (!u) return ''
  return u.display_name || u.username
})

const userSubtitle = computed(() => {
  const u = auth.value?.user
  if (!u) return ''
  return `${u.username}#${String(u.tag).padStart(4, '0')}`
})

const pageTitle = computed(() => {
  const t = route.meta.title
  return typeof t === 'string' ? t : ''
})

const fullBleed = computed(() => route.meta.fullBleed === true)

const sidebarOpen = ref(false)

function closeSidebar() {
  sidebarOpen.value = false
}

function formatMoney(n: number | null): string {
  if (n === null) return '—'
  return n.toLocaleString()
}

async function logout() {
  const token = auth.value?.token
  if (token) {
    try {
      await logoutApi(token)
    } catch {
      // still clear local session
    }
  }
  clearAuth()
  closeSidebar()
  await router.push({ name: 'landing' })
}

const navLink = (active: boolean) =>
  [
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    active ? 'bg-white/15 text-white' : 'text-white/85 hover:bg-white/10 hover:text-white',
  ].join(' ')
</script>

<template>
  <div class="min-h-screen bg-slate-100">
    <aside
      :class="[
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/10 bg-[#191C28] text-white shadow-lg transition-transform duration-200 ease-out md:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      ]"
      aria-label="Main navigation"
    >
      <div class="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-4">
        <RouterLink
          :to="isLoggedIn ? '/home' : '/'"
          class="text-sm font-bold tracking-wider text-white/95"
          @click="closeSidebar"
        >
          CampusCove
        </RouterLink>
        <button
          type="button"
          class="rounded-lg p-2 hover:bg-white/10 md:hidden"
          aria-label="Close menu"
          @click="closeSidebar"
        >
          <span class="text-lg leading-none" aria-hidden="true">×</span>
        </button>
      </div>

      <nav class="flex-1 space-y-1 overflow-y-auto p-3">
        <RouterLink
          v-if="!isLoggedIn"
          :to="{ name: 'landing' }"
          :class="navLink(route.name === 'landing')"
          @click="closeSidebar"
        >
          <span aria-hidden="true">🏠</span>
          Home
        </RouterLink>
        <RouterLink
          v-else
          :to="{ name: 'home' }"
          :class="navLink(route.name === 'home')"
          @click="closeSidebar"
        >
          <span aria-hidden="true">🏠</span>
          Home
        </RouterLink>

        <RouterLink
          :to="{ name: 'item-shop' }"
          :class="navLink(route.name === 'item-shop')"
          @click="closeSidebar"
        >
          <span aria-hidden="true">🛒</span>
          Item Shop
        </RouterLink>

        <RouterLink
          v-if="isLoggedIn"
          :to="{ name: 'inventory' }"
          :class="navLink(route.name === 'inventory')"
          @click="closeSidebar"
        >
          <span aria-hidden="true">🎒</span>
          Inventory
        </RouterLink>

        <RouterLink
          v-if="isLoggedIn"
          :to="{ name: 'friends' }"
          :class="navLink(route.name === 'friends')"
          @click="closeSidebar"
        >
          <span aria-hidden="true">👥</span>
          Friends
        </RouterLink>
        <RouterLink
          v-if="isLoggedIn"
          :to="{ name: 'game' }"
          :class="navLink(route.name === 'game')"
          @click="closeSidebar"
        >
          <span aria-hidden="true">🎮</span>
          Game
        </RouterLink>

        <RouterLink
          v-if="showAdmin"
          :to="{ name: 'admin-shop' }"
          :class="navLink(route.name === 'admin-shop')"
          @click="closeSidebar"
        >
          <span aria-hidden="true">🛠</span>
          Admin shop
        </RouterLink>

        <template v-if="!isLoggedIn">
          <RouterLink
            :to="{ name: 'login' }"
            :class="navLink(route.name === 'login')"
            class="mt-4"
            @click="closeSidebar"
          >
            <span aria-hidden="true">🔑</span>
            Sign in
          </RouterLink>
          <RouterLink
            :to="{ name: 'register' }"
            :class="navLink(route.name === 'register')"
            @click="closeSidebar"
          >
            <span aria-hidden="true">✨</span>
            Register
          </RouterLink>
        </template>
      </nav>

      <div v-if="isLoggedIn" class="shrink-0 border-t border-white/10 p-3">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-400 hover:bg-red-500/15"
          @click="logout"
        >
          <span aria-hidden="true">🚪</span>
          Log out
        </button>
      </div>
    </aside>

    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-30 bg-black/50 md:hidden"
      aria-hidden="true"
      @click="closeSidebar"
    />

    <div class="flex min-h-screen flex-col md:ml-64">
      <header
        class="sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b border-white/10 bg-slate-800 px-3 py-3 text-white shadow-sm sm:px-4"
      >
        <button
          type="button"
          class="rounded-lg p-2 hover:bg-white/10 md:hidden"
          aria-label="Open menu"
          @click="sidebarOpen = true"
        >
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div class="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
          <RouterLink :to="isLoggedIn ? '/home' : '/'" class="truncate text-base font-bold tracking-tight text-white">
            CampusCove
          </RouterLink>
          <span v-if="pageTitle" class="hidden text-sm text-white/50 sm:inline">/</span>
          <span v-if="pageTitle" class="truncate text-sm font-medium text-white/80">{{ pageTitle }}</span>
        </div>

        <div
          v-if="isLoggedIn"
          class="flex flex-wrap items-center justify-end gap-2 sm:gap-3"
          :title="userSubtitle"
        >
          <div
            class="flex items-center gap-1.5 rounded-lg bg-amber-500/95 px-2.5 py-1.5 text-xs font-semibold text-slate-900"
            title="Coins (updates after purchases)"
          >
            <span aria-hidden="true">🪙</span>
            <span>{{ formatMoney(balances.coins) }}</span>
          </div>
          <div
            class="flex items-center gap-1.5 rounded-lg bg-fuchsia-500/90 px-2.5 py-1.5 text-xs font-semibold text-white"
            title="Premium (updates after purchases)"
          >
            <span aria-hidden="true">✨</span>
            <span>{{ formatMoney(balances.premium) }}</span>
          </div>

          <div class="hidden min-w-0 max-w-[140px] text-right sm:block">
            <p class="truncate text-sm font-semibold leading-tight">{{ displayName }}</p>
            <p class="truncate text-xs text-white/55">{{ userSubtitle }}</p>
          </div>

          <RouterLink
            :to="{ name: 'inventory' }"
            class="hidden rounded-lg px-2 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white lg:inline"
          >
            Inventory
          </RouterLink>
          <RouterLink
            :to="{ name: 'friends' }"
            class="hidden rounded-lg px-2 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white xl:inline"
          >
            Friends
          </RouterLink>
          <RouterLink
            :to="{ name: 'game' }"
            class="hidden rounded-lg px-2 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white xl:inline"
          >
            Play
          </RouterLink>

          <button
            type="button"
            class="hidden rounded-lg border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10 sm:inline"
            @click="logout"
          >
            Log out
          </button>
        </div>

        <div v-else class="flex flex-wrap items-center justify-end gap-2">
          <span class="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/80">Guest</span>
          <RouterLink
            :to="{ name: 'login' }"
            class="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-500"
          >
            Sign in
          </RouterLink>
          <RouterLink
            :to="{ name: 'register' }"
            class="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10"
          >
            Register
          </RouterLink>
        </div>
      </header>

      <main
        :class="[
          'min-h-0 flex-1',
          fullBleed ? 'flex flex-col overflow-hidden' : 'overflow-y-auto px-4 py-6 md:px-6',
        ]"
      >
        <router-view class="min-h-0 flex-1" />
      </main>
    </div>
  </div>
</template>
