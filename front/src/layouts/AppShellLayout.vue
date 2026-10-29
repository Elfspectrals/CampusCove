<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { logout as logoutApi } from '../api/auth'
import { clearAuth, getCachedWalletBalances, getStoredAuth, isAdminUser, subscribeAuth } from '../api/session'
import { setAdminModeEnabled, syncAdminModeForUser, useAdminMode } from '../composables/useAdminMode'
import UiIcon from '../components/ui/UiIcon.vue'
import type { UiIconName } from '../components/ui/icons'
import UiCurrency from '../components/ui/UiCurrency.vue'
import UiLogo from '../components/ui/UiLogo.vue'
import ConsentManager from '../components/site/ConsentManager.vue'
import TermsUpdateDialog from '../components/site/TermsUpdateDialog.vue'
import SiteFooter from '../components/site/SiteFooter.vue'
import { useI18n } from 'vue-i18n'
import { localizedName } from '../i18n/routes'
import type { Locale } from '../seo/site'

const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()

const shellTick = ref(0)
let unsubAuth: (() => void) | undefined

onMounted(() => {
  unsubAuth = subscribeAuth(() => {
    shellTick.value++
  })
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onUnmounted(() => {
  unsubAuth?.()
  document.removeEventListener('pointerdown', onDocumentPointerDown)
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
const { adminModeEnabled } = useAdminMode()
const isAdminMode = computed(() => showAdmin.value && adminModeEnabled.value)
const displayName = computed(() => {
  const u = auth.value?.user
  if (!u) return ''
  return u.display_name || u.username
})
const initial = computed(() => (displayName.value ? displayName.value.charAt(0).toUpperCase() : '?'))

const userSubtitle = computed(() => {
  const u = auth.value?.user
  if (!u) return ''
  return `${u.username}#${String(u.tag).padStart(4, '0')}`
})

const fullBleed = computed(() => route.meta.fullBleed === true)
/** The game owns the whole window: no header, no page scroll. */
const immersive = computed(() => route.meta.immersive === true)
/** Title-screen pages (landing / auth) render their own hero and skip the lobby bar chrome. */
const bareRoute = computed(() => ['landing', 'fr-landing', 'login', 'register', 'forgot-password'].includes(String(route.name)))

const drawerOpen = ref(false)
const profileOpen = ref(false)
const profileRef = ref<HTMLElement | null>(null)

function closeMenus() {
  drawerOpen.value = false
  profileOpen.value = false
}

function onDocumentPointerDown(e: PointerEvent) {
  if (!profileOpen.value) return
  if (profileRef.value && e.target instanceof Node && profileRef.value.contains(e.target)) return
  profileOpen.value = false
}

watch(() => route.fullPath, closeMenus)

function toggleAdminMode() {
  if (!showAdmin.value) return
  setAdminModeEnabled(!adminModeEnabled.value)
  profileOpen.value = false
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
  closeMenus()
  await router.push({ name: 'landing' })
}

interface NavItem {
  name: string
  icon: UiIconName
  label: string
}

const defaultNavItems = computed<NavItem[]>(() => {
  const loc = locale.value as Locale
  return [
    isLoggedIn.value
      ? { name: 'home', icon: 'home', label: t('nav.lobby') }
      : { name: localizedName('landing', loc), icon: 'home', label: t('nav.home') },
    { name: localizedName('shop-skin', loc), icon: 'shirt', label: t('nav.skins') },
    ...(isLoggedIn.value ? [{ name: 'friends', icon: 'users', label: t('nav.friends') } as NavItem] : []),
    { name: 'settings', icon: 'settings', label: t('nav.settings') },
  ]
})

const adminNavItems: NavItem[] = [
  { name: 'admin-users', icon: 'user', label: 'Users' },
  { name: 'admin-shop', icon: 'chair', label: 'Shop Items' },
  { name: 'admin-shop-skin', icon: 'shirt', label: 'Shop Skins' },
  { name: 'admin-inventories', icon: 'backpack', label: 'Inventories' },
  { name: 'admin-planner', icon: 'map', label: 'World Planner' },
  { name: 'new-nation', icon: 'globe', label: 'New Nation' },
]

const navItems = computed(() => (isAdminMode.value ? adminNavItems : defaultNavItems.value))

watch(showAdmin, (isAdmin) => {
  if (!isAdmin) {
    setAdminModeEnabled(false)
  }
})

watch(
  auth,
  (nextAuth) => {
    syncAdminModeForUser(nextAuth?.user)
  },
  { immediate: true }
)
</script>

<template>
  <div class="cc-world flex flex-col" :class="immersive ? 'h-dvh overflow-hidden' : 'min-h-screen'">
    <a v-if="!immersive" href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-sun focus:px-4 focus:py-2 focus:font-extrabold focus:text-ink-950">
      {{ t('a11y.skip') }}
    </a>
    <header
      v-if="!bareRoute && !immersive"
      class="sticky top-0 z-50 border-b-2 border-ink-600/60 bg-ink-900/90 backdrop-blur-md"
      :class="isAdminMode ? 'shadow-[inset_0_3px_0_rgb(var(--cc-coral))]' : 'shadow-[0_4px_0_rgb(var(--cc-ink-950)/0.6)]'"
    >
      <div class="mx-auto flex h-16 max-w-[1680px] items-center gap-3 px-3 sm:px-5">
        <button
          type="button"
          class="cc-btn cc-btn-ghost cc-btn-sm cc-btn-icon lg:hidden"
          aria-label="Open menu"
          @click="drawerOpen = true"
        >
          <UiIcon name="menu" />
        </button>

        <RouterLink :to="isLoggedIn ? '/home' : '/'" class="shrink-0" aria-label="CampusCove home">
          <UiLogo size="sm" class="hidden sm:inline-flex" />
          <UiLogo size="sm" mark class="sm:hidden" />
        </RouterLink>

        <span v-if="isAdminMode" class="cc-chip cc-chip-coral hidden md:inline-flex">
          <UiIcon name="shield" :size="14" /> Admin
        </span>

        <!-- lobby tabs -->
        <nav class="ml-2 hidden h-full flex-1 items-stretch gap-0.5 lg:flex" aria-label="Main navigation">
          <RouterLink
            v-for="link in navItems"
            :key="link.name"
            :to="{ name: link.name }"
            class="group relative flex items-center gap-2 px-3.5 font-display text-[15px] tracking-[0.04em] transition-colors xl:px-4"
            :class="route.name === link.name ? 'text-sun' : 'text-mist hover:text-fog'"
          >
            <UiIcon :name="link.icon" :size="18" />
            <span class="uppercase">{{ link.label }}</span>
            <span
              class="absolute inset-x-2 bottom-0 h-1 -skew-x-12 rounded-t-sm transition-all"
              :class="route.name === link.name ? 'bg-sun shadow-[0_0_14px_rgb(var(--cc-sun)/0.8)]' : 'bg-transparent group-hover:bg-white/20'"
            />
          </RouterLink>
        </nav>
        <div class="flex-1 lg:hidden" />

        <template v-if="isLoggedIn">
          <div class="hidden items-center gap-2 md:flex">
            <RouterLink :to="{ name: 'game' }" title="Coins: spend them on furniture at Cove Home" class="transition hover:brightness-110">
              <UiCurrency currency="coins" :amount="balances.coins" pill />
            </RouterLink>
            <RouterLink :to="{ name: 'shop-skin' }" title="Premium gems" class="transition hover:brightness-110">
              <UiCurrency currency="premium" :amount="balances.premium" pill />
            </RouterLink>
          </div>

          <RouterLink
            v-if="route.name !== 'game'"
            :to="{ name: 'game' }"
            class="cc-btn cc-btn-sun cc-btn-shine hidden sm:inline-flex"
          >
            <UiIcon name="play" :size="16" fill /> Play
          </RouterLink>

          <div ref="profileRef" class="relative">
            <button
              type="button"
              class="flex items-center gap-2 rounded-2xl border-2 border-ink-600/70 bg-ink-950/60 py-1 pl-1 pr-2 transition hover:border-ink-500"
              :aria-expanded="profileOpen"
              aria-haspopup="menu"
              @click="profileOpen = !profileOpen"
            >
              <span class="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-grape to-coral font-display text-lg text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.25)]">
                {{ initial }}
              </span>
              <span class="hidden min-w-0 max-w-[130px] text-left xl:block">
                <span class="block truncate text-sm font-extrabold leading-tight text-fog">{{ displayName }}</span>
                <span class="block truncate font-mono text-[11px] text-mist">{{ userSubtitle }}</span>
              </span>
              <UiIcon name="chevron-down" :size="16" class="text-mist" />
            </button>

            <div
              v-if="profileOpen"
              role="menu"
              class="cc-panel absolute right-0 top-[calc(100%+10px)] w-64 animate-cc-pop p-2"
            >
              <div class="flex items-center gap-3 px-2 pb-3 pt-1">
                <span class="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-grape to-coral font-display text-xl text-white">{{ initial }}</span>
                <div class="min-w-0">
                  <p class="m-0 truncate font-extrabold">{{ displayName }}</p>
                  <p class="m-0 truncate font-mono text-xs text-mist">{{ userSubtitle }}</p>
                </div>
              </div>
              <div class="mb-2 flex gap-2 px-2 md:hidden">
                <UiCurrency currency="coins" :amount="balances.coins" pill />
                <UiCurrency currency="premium" :amount="balances.premium" pill />
              </div>
              <RouterLink :to="{ name: 'home' }" role="menuitem" class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold text-fog hover:bg-white/5">
                <UiIcon name="user" :size="18" /> Profile
              </RouterLink>
              <button
                v-if="showAdmin"
                type="button"
                role="menuitem"
                class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-bold text-fog hover:bg-white/5"
                @click="toggleAdminMode"
              >
                <span class="flex items-center gap-3"><UiIcon name="shield" :size="18" /> Admin mode</span>
                <span :class="isAdminMode ? 'cc-chip cc-chip-mint' : 'cc-chip'">{{ isAdminMode ? 'On' : 'Off' }}</span>
              </button>
              <div class="my-2 h-0.5 bg-ink-600/50" />
              <button
                type="button"
                role="menuitem"
                class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold text-coral hover:bg-coral/10"
                @click="logout"
              >
                <UiIcon name="logout" :size="18" /> Log out
              </button>
            </div>
          </div>
        </template>

        <div v-else class="flex items-center gap-2">
          <RouterLink :to="{ name: 'login' }" class="cc-btn cc-btn-ghost cc-btn-sm">Sign in</RouterLink>
          <RouterLink :to="{ name: 'register' }" class="cc-btn cc-btn-sun cc-btn-sm">Join free</RouterLink>
        </div>
      </div>
    </header>

    <!-- mobile drawer -->
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <div v-if="drawerOpen" class="fixed inset-0 z-[60] bg-ink-950/70 backdrop-blur-sm lg:hidden" @click.self="drawerOpen = false">
        <aside class="cc-panel absolute inset-y-3 left-3 flex w-[min(300px,calc(100%-1.5rem))] animate-cc-pop flex-col p-3" aria-label="Main navigation">
          <div class="mb-3 flex items-center justify-between px-1">
            <UiLogo size="sm" />
            <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm cc-btn-icon" aria-label="Close menu" @click="drawerOpen = false">
              <UiIcon name="x" :size="18" />
            </button>
          </div>
          <nav class="flex flex-1 flex-col gap-1 overflow-y-auto">
            <RouterLink
              v-for="link in navItems"
              :key="link.name"
              :to="{ name: link.name }"
              class="flex items-center gap-3 rounded-xl px-3 py-3 font-display text-lg tracking-wide transition-colors"
              :class="route.name === link.name ? 'bg-sun text-ink-950 shadow-[inset_0_-3px_0_rgb(var(--cc-sun-edge))]' : 'text-fog hover:bg-white/5'"
            >
              <UiIcon :name="link.icon" />
              {{ link.label }}
            </RouterLink>
          </nav>
          <RouterLink v-if="isLoggedIn" :to="{ name: 'game' }" class="cc-btn cc-btn-sun cc-btn-lg mt-3 w-full">
            <UiIcon name="play" fill /> Play
          </RouterLink>
        </aside>
      </div>
    </Transition>

    <main
      id="main"
      tabindex="-1"
      :class="[
        'min-h-0 flex-1',
        fullBleed ? 'flex flex-col overflow-hidden' : bareRoute ? '' : 'px-3 py-6 sm:px-5 md:py-8',
      ]"
    >
      <router-view class="min-h-0 flex-1" />
    </main>
    <SiteFooter v-if="!fullBleed" />
    <ConsentManager />
    <TermsUpdateDialog v-if="auth?.user.terms_current === false" @logout="logout" />
  </div>
</template>
