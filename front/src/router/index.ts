import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { validateStoredAuth } from '../api/auth'
import { getStoredAuth, isAdminUser } from '../api/session'
import ForgotPasswordView from '../views/auth/ForgotPasswordView.vue'
import LandingView from '../views/LandingView.vue'
import LoginView from '../views/auth/LoginView.vue'
import RegisterView from '../views/auth/RegisterView.vue'
import ResetPasswordView from '../views/auth/ResetPasswordView.vue'
import { LEGAL_SLUGS } from '../content/legal/types'
import { currentLocale, preferredLocale, setLocale } from '../i18n'
import { seoPageByRouteName } from '../seo/pages'
import { applySeoHead } from '../seo/useSeoHead'
import { localePrefix, LOCALES, type Locale } from '../seo/site'

// Heavy views (Three.js, Rapier, Colyseus) load on demand so public pages stay light.
const AdminInventoriesView = () => import('../views/admin/AdminInventoriesView.vue')
const AdminShopView = () => import('../views/admin/AdminShopView.vue')
const AdminUsersView = () => import('../views/admin/AdminUsersView.vue')
const FriendsView = () => import('../views/FriendsView.vue')
const GameView = () => import('../views/GameView.vue')
const HomeView = () => import('../views/HomeView.vue')
const ItemShopView = () => import('../views/ItemShopView.vue')
const LegalView = () => import('../views/LegalView.vue')
const NewNationView = () => import('../views/NewNationView.vue')
const NotFoundView = () => import('../views/NotFoundView.vue')
const SettingsView = () => import('../views/SettingsView.vue')

/** Indexable public pages, once per locale: English at the root, French under /fr (see seo/pages.ts). */
function publicRoutes(locale: Locale): RouteRecordRaw[] {
  const prefix = localePrefix(locale)
  const n = (name: string) => (locale === 'fr' ? `fr-${name}` : name)
  return [
    { path: prefix || '/', name: n('landing'), component: LandingView, meta: { guest: true, title: 'Welcome' } },
    { path: `${prefix}/shop-skin`, name: n('shop-skin'), component: ItemShopView, meta: { title: 'Shop Skin' } },
    ...LEGAL_SLUGS.map<RouteRecordRaw>((slug) => ({
      path: `${prefix}/legal/${slug}`,
      name: n(`legal-${slug}`),
      component: LegalView,
      props: { slug },
      meta: { title: 'Legal' },
    })),
  ]
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    ...LOCALES.flatMap(publicRoutes),
    { path: '/login', name: 'login', component: LoginView, meta: { guest: true, title: 'Sign in' } },
    { path: '/register', name: 'register', component: RegisterView, meta: { guest: true, title: 'Register' } },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: ForgotPasswordView,
      meta: { guest: true, title: 'Reset password' },
    },
    { path: '/reset-password', name: 'reset-password', component: ResetPasswordView, meta: { guest: true, title: 'New password' } },
    // Furniture is sold in the Cove Home store inside /game; the old furniture shop URL lands on the skins.
    { path: '/shop', name: 'shop', redirect: { name: 'shop-skin' } },
    { path: '/NewNation', name: 'new-nation', component: NewNationView, meta: { requiresAdmin: true, title: 'Admin — New Nation', fullBleed: true } },
    { path: '/home', name: 'home', component: HomeView, meta: { requiresAuth: true, title: 'Profile' } },
    { path: '/friends', name: 'friends', component: FriendsView, meta: { requiresAuth: true, title: 'Friends' } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { title: 'Settings' } },
    { path: '/game', name: 'game', component: GameView, meta: { requiresAuth: true, title: 'Game', fullBleed: true, immersive: true } },
    { path: '/dev/ui', name: 'dev-ui', component: () => import('../views/dev/DevUiView.vue'), meta: { title: 'Design system' } },

    { path: '/admin/users', name: 'admin-users', component: AdminUsersView, meta: { requiresAdmin: true, title: 'Admin — Users' } },
    { path: '/admin/shop', name: 'admin-shop', component: AdminShopView, meta: { requiresAdmin: true, title: 'Admin — Shop Items' } },
    { path: '/admin/shop-skin', name: 'admin-shop-skin', component: AdminShopView, meta: { requiresAdmin: true, title: 'Admin — Shop Skins' } },
    {
      path: '/admin/inventories',
      name: 'admin-inventories',
      component: AdminInventoriesView,
      meta: { requiresAdmin: true, title: 'Admin — Inventories' },
    },
    {
      path: '/admin/housing',
      name: 'admin-housing',
      component: () => import('../views/admin/AdminHousingView.vue'),
      meta: { requiresAdmin: true, title: 'Admin � Housing' },
    },
    {
      path: '/admin/planner',
      name: 'admin-planner',
      component: () => import('../views/admin/AdminWorldPlannerView.vue'),
      meta: { requiresAdmin: true, title: 'Admin — World Planner' },
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView, meta: { title: 'Not found' } },
  ],
  scrollBehavior(to, _from, saved) {
    if (saved) return saved
    if (to.hash) return { el: to.hash }
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  // English public page, French-preferring visitor: show the /fr version. Never the other way round, so crawlers
  // (which browse in English) always reach both versions.
  const page = to.name ? seoPageByRouteName(String(to.name)) : null
  if (page?.locale === 'en' && preferredLocale() === 'fr') {
    return { name: `fr-${String(to.name)}`, query: to.query, hash: to.hash, replace: true }
  }

  if (to.meta.requiresAdmin) {
    const auth = getStoredAuth()
    if (!auth) return { name: 'login' }
    const valid = await validateStoredAuth()
    if (!valid) return { name: 'login' }
    const refreshed = getStoredAuth()
    if (!refreshed || !isAdminUser(refreshed.user)) return { name: 'home' }
    return true
  }

  const auth = getStoredAuth()
  if (to.meta.requiresAuth) {
    if (!auth) return { name: 'landing' }
    const valid = await validateStoredAuth()
    if (!valid) return { name: 'landing' }
    return true
  }
  if (to.meta.guest && (to.name === 'landing' || to.name === 'fr-landing' || to.name === 'login' || to.name === 'register' || to.name === 'forgot-password')) {
    if (!auth) return true
    const valid = await validateStoredAuth()
    if (!valid) return true
    return { name: 'home' }
  }
  return true
})

router.afterEach((to) => {
  // a localized public page shows its URL's language without saving it; other pages use the preferred language
  const match = to.name ? seoPageByRouteName(String(to.name)) : null
  if (match) setLocale(match.locale, false)
  // an unknown URL under /fr gets the French "not found" page
  else if (to.name === 'not-found' && (to.path === '/fr' || to.path.startsWith('/fr/'))) setLocale('fr', false)
  else setLocale(preferredLocale(), false)
  applySeoHead(to, currentLocale())
})

export default router
