<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { logout as logoutApi } from '../api/auth'
import { clearAuth, getCachedWalletBalances, getStoredAuth, isAdminUser, subscribeAuth } from '../api/session'
import { setAdminModeEnabled, syncAdminModeForUser, useAdminMode } from '../composables/useAdminMode'
import { activeLayout } from '../composables/useTheme'
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

const showHeader = computed(() => !bareRoute.value && !immersive.value)
const navLayout = computed(() => activeLayout.value.nav)
const tabMark = computed(() => activeLayout.value.tabMark)

const headerClass = computed(() => ({
  bar: 'sticky top-0',
  side: 'sticky top-0 lg:h-screen lg:cc-bar-side',
  floating: 'sticky top-0 lg:top-4 lg:mx-auto lg:mt-4 lg:w-max lg:max-w-[calc(100%-2rem)] lg:cc-bar-floating',
})[navLayout.value])

const headerRowClass = computed(() => ({
  bar: 'mx-auto max-w-[1680px] px-3 sm:px-5',
  side: 'px-3 sm:px-5 lg:h-full lg:flex-col lg:items-stretch lg:gap-6 lg:px-3 lg:py-6',
  floating: 'px-3 sm:px-5 lg:h-14 lg:gap-4 lg:pl-5 lg:pr-2',
})[navLayout.value])

const desktopNavClass = computed(() => ({
  bar: 'ml-2 h-full flex-1 items-stretch gap-0.5',
  side: 'flex-col gap-1',
  floating: 'h-full items-center gap-1',
})[navLayout.value])

function navLinkClass(active: boolean): string {
  if (navLayout.value === 'side') {
    return active ? 'min-h-11 px-3 bg-ink-800 text-fog' : 'min-h-11 px-3 text-mist hover:bg-line/5 hover:text-fog'
  }
  if (tabMark.value === 'pill') {
    return active ? 'my-auto h-10 rounded-full px-4 cc-tab-active' : 'my-auto h-10 rounded-full px-4 text-mist hover:bg-line/5 hover:text-fog'
  }
  return active ? 'px-3 text-fog xl:px-4' : 'px-3 text-mist hover:text-fog xl:px-4'
}

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
    ...(isLoggedIn.value
      ? [{ name: 'friends', icon: 'users', label: t('nav.friends') } as NavItem]
      : []),
    { name: 'settings', icon: 'settings', label: t('nav.settings') },
  ]
})

const adminNavItems: NavItem[] = [
  { name: 'admin-users', icon: 'user', label: 'Users' },
  { name: 'admin-shop', icon: 'chair', label: 'Shop Items' },
  { name: 'admin-shop-skin', icon: 'shirt', label: 'Shop Skins' },
  { name: 'admin-inventories', icon: 'backpack', label: 'Inventories' },
  { name: 'admin-housing', icon: 'home', label: 'Housing' },
  { name: 'admin-planner', icon: 'map', label: 'World Planner' },
  { name: 'admin-editor', icon: 'grid', label: 'Editor' },
  { name: 'admin-npc', icon: 'users', label: 'NPC Interface' },
  { name: 'admin-security', icon: 'shield', label: 'Security' },
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
  <div
    class="flex flex-col"
    :class="[
      immersive ? 'cc-world h-dvh overflow-hidden' : 'min-h-screen bg-ink-950',
      showHeader && navLayout === 'side' ? 'lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]' : '',
    ]"
  >
    <a v-if="!immersive" href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-sun focus:px-4 focus:py-2 focus:font-extrabold focus:text-ink-950">
      {{ t('a11y.skip') }}
    </a>
    <header
      v-if="showHeader"
      class="cc-bar z-50"
      :class="[headerClass, isAdminMode ? 'shadow-[inset_0_3px_0_rgb(var(--cc-coral))]' : '']"
    >
      <div class="flex h-16 items-center gap-3" :class="headerRowClass">
        <button
          type="button"
          :class="['grid h-11 w-11 place-items-center rounded-lg text-mist transition-colors hover:bg-line/5 hover:text-fog', 'lg:hidden']"
          :aria-label="t('nav.openMenu')"
          @click="drawerOpen = true"
        >
          <UiIcon name="menu" />
        </button>

        <RouterLink :to="isLoggedIn ? '/home' : '/'" class="shrink-0" :class="navLayout === 'side' ? 'lg:px-3' : ''" aria-label="CampusCove home">
          <UiLogo size="sm" class="hidden sm:inline-flex" />
          <UiLogo size="sm" mark class="sm:hidden" />
        </RouterLink>

        <span v-if="isAdminMode" class="cc-chip cc-chip-coral hidden md:inline-flex">
          <UiIcon name="shield" :size="14" /> Admin
        </span>

        <!-- lobby tabs -->
        <nav class="hidden lg:flex" :class="desktopNavClass" aria-label="Main navigation">
          <RouterLink
            v-for="link in navItems"
            :key="link.name"
            :to="{ name: link.name }"
            class="cc-navlink relative flex items-center gap-2 transition-colors"
            :class="navLinkClass(route.name === link.name)"
          >
            <UiIcon :name="link.icon" :size="18" :stroke-width="1.75" />
            <span>{{ link.label }}</span>
            <template v-if="route.name === link.name">
              <span v-if="navLayout === 'side'" class="absolute inset-y-0 left-0 w-[3px] bg-sun" />
              <span v-else-if="tabMark === 'underline'" class="absolute inset-x-3 bottom-0 h-[3px] bg-sun" />
              <span v-else-if="tabMark === 'dot'" class="absolute bottom-3 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-sun" />
            </template>
          </RouterLink>
        </nav>
        <div class="flex-1 lg:hidden" />

        <div v-if="isLoggedIn" class="flex items-center gap-2 sm:gap-3" :class="navLayout === 'side' ? 'lg:mt-auto lg:flex-col lg:items-stretch' : ''">
          <div class="hidden items-center gap-2 md:flex">
            <RouterLink :to="{ name: 'game' }" title="Coins: spend them on furniture at Cove Home" class="transition hover:brightness-110">
              <UiCurrency currency="coins" :amount="balances.coins" pill />
            </RouterLink>
            <RouterLink :to="{ name: 'gems' }" :title="t('gems.getGems')" :aria-label="`${t('gems.getGems')} (${balances.premium ?? '—'})`" class="transition hover:brightness-110">
              <UiCurrency currency="premium" :amount="balances.premium" pill />
            </RouterLink>
          </div>

          <RouterLink
            v-if="route.name !== 'game'"
            :to="{ name: 'game' }"
            class="cc-btn cc-btn-sun hidden sm:inline-flex"
          >
            <UiIcon name="play" :size="16" fill /> {{ t('nav.play') }}
          </RouterLink>

          <div ref="profileRef" class="relative">
            <button
              type="button"
              class="flex min-h-11 items-center gap-2 rounded-xl border border-line/10 py-1 pl-1 pr-2 transition-colors hover:bg-line/5"
              :aria-expanded="profileOpen"
              aria-haspopup="menu"
              @click="profileOpen = !profileOpen"
            >
              <span class="grid place-items-center rounded-lg bg-ink-700 font-display text-fog h-9 w-9 text-lg">
                {{ initial }}
              </span>
              <span class="hidden min-w-0 max-w-[130px] text-left xl:block">
                <span class="block truncate text-sm font-semibold leading-tight text-fog">{{ displayName }}</span>
                <span class="block truncate font-mono text-[11px] text-mist">{{ userSubtitle }}</span>
              </span>
              <UiIcon name="chevron-down" :size="16" class="text-mist" />
            </button>

            <div
              v-if="profileOpen"
              role="menu"
              class="absolute z-10 w-64 rounded-xl border border-line/10 bg-ink-900 p-2 shadow-[0_12px_32px_rgb(0_0_0/0.4)]"
              :class="navLayout === 'side' ? 'right-0 top-[calc(100%+8px)] lg:bottom-[calc(100%+8px)] lg:left-0 lg:right-auto lg:top-auto' : 'right-0 top-[calc(100%+8px)]'"
            >
              <div class="flex items-center gap-3 px-2 pb-3 pt-1">
                <span class="grid place-items-center rounded-lg bg-ink-700 font-display text-fog h-11 w-11 text-xl">{{ initial }}</span>
                <div class="min-w-0">
                  <p class="m-0 truncate font-semibold">{{ displayName }}</p>
                  <p class="m-0 truncate font-mono text-xs text-mist">{{ userSubtitle }}</p>
                </div>
              </div>
              <div class="mb-2 flex gap-2 px-2 md:hidden">
                <UiCurrency currency="coins" :amount="balances.coins" pill />
                <RouterLink :to="{ name: 'gems' }" role="menuitem" :aria-label="`${t('gems.getGems')} (${balances.premium ?? '—'})`">
                  <UiCurrency currency="premium" :amount="balances.premium" pill />
                </RouterLink>
              </div>
              <RouterLink :to="{ name: 'home' }" role="menuitem" class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-fog transition-colors hover:bg-line/5">
                <UiIcon name="user" :size="18" :stroke-width="1.75" class="text-mist" /> {{ t('nav.profile') }}
              </RouterLink>
              <button
                v-if="showAdmin"
                type="button"
                role="menuitem"
                class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-fog transition-colors hover:bg-line/5 w-full justify-between text-left"
                @click="toggleAdminMode"
              >
                <span class="flex items-center gap-3"><UiIcon name="shield" :size="18" :stroke-width="1.75" class="text-mist" /> Admin mode</span>
                <span class="font-mono text-xs" :class="isAdminMode ? 'text-mint' : 'text-mist'">{{ isAdminMode ? 'On' : 'Off' }}</span>
              </button>
              <div class="my-2 h-px bg-line/10" />
              <button
                type="button"
                role="menuitem"
                class="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-coral transition-colors hover:bg-coral/10"
                @click="logout"
              >
                <UiIcon name="logout" :size="18" :stroke-width="1.75" /> {{ t('nav.logout') }}
              </button>
            </div>
          </div>
        </div>

        <div v-else class="flex items-center gap-2" :class="navLayout === 'side' ? 'lg:mt-auto lg:flex-col lg:items-stretch' : ''">
          <RouterLink :to="{ name: 'login' }" class="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-fog transition-colors hover:text-sun">{{ t('nav.signIn') }}</RouterLink>
          <RouterLink :to="{ name: 'register' }" class="cc-btn cc-btn-sun cc-btn-sm">{{ t('landing.playFree') }}</RouterLink>
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
      <div v-if="drawerOpen" class="fixed inset-0 z-[60] bg-ink-950/70 lg:hidden" @click.self="drawerOpen = false">
        <aside class="absolute inset-y-0 left-0 flex w-[min(300px,calc(100%-3rem))] flex-col border-r border-line/10 bg-ink-900 p-3" aria-label="Main navigation">
          <div class="mb-3 flex items-center justify-between px-1">
            <UiLogo size="sm" />
            <button type="button" class="grid h-11 w-11 place-items-center rounded-lg text-mist transition-colors hover:bg-line/5 hover:text-fog" :aria-label="t('nav.closeMenu')" @click="drawerOpen = false">
              <UiIcon name="x" :size="18" :stroke-width="1.75" />
            </button>
          </div>
          <nav class="flex flex-1 flex-col gap-1 overflow-y-auto">
            <RouterLink
              v-for="link in navItems"
              :key="link.name"
              :to="{ name: link.name }"
              class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-base font-semibold transition-colors"
              :class="route.name === link.name ? 'bg-line/5 text-fog' : 'text-mist hover:bg-line/5 hover:text-fog'"
            >
              <UiIcon :name="link.icon" :size="18" :stroke-width="1.75" />
              {{ link.label }}
            </RouterLink>
          </nav>
          <RouterLink v-if="isLoggedIn" :to="{ name: 'game' }" class="cc-btn cc-btn-sun cc-btn-lg mt-3 w-full">
            <UiIcon name="play" fill /> {{ t('nav.play') }}
          </RouterLink>
        </aside>
      </div>
    </Transition>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
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
    </div>
    <ConsentManager />
    <TermsUpdateDialog v-if="auth?.user.terms_current === false" @logout="logout" />
  </div>
</template>
