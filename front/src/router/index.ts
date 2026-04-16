import { createRouter, createWebHistory } from 'vue-router'
import { getStoredAuth, isAdminUser, validateStoredAuth } from '../api/auth'
import AdminInventoriesView from '../views/admin/AdminInventoriesView.vue'
import AdminShopView from '../views/admin/AdminShopView.vue'
import AdminUsersView from '../views/admin/AdminUsersView.vue'
import ForgotPasswordView from '../views/auth/ForgotPasswordView.vue'
import FriendsView from '../views/FriendsView.vue'
import GameView from '../views/GameView.vue'
import HomeView from '../views/HomeView.vue'
import LockerView from '../views/LockerView.vue'
import ItemShopView from '../views/ItemShopView.vue'
import LandingView from '../views/LandingView.vue'
import LoginView from '../views/auth/LoginView.vue'
import RegisterView from '../views/auth/RegisterView.vue'
import { applyRouteSeo } from '../utils/seoHead'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: LandingView,
      meta: {
        guest: true,
        title: 'Welcome',
        description:
          'Explore a virtual campus in CampusCove: meet others, customize your avatar, browse the item shop, and play together.',
        robots: 'index,follow',
      },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: {
        guest: true,
        title: 'Sign in',
        description: 'Sign in to CampusCove to open your profile, locker, friends list, and game.',
        robots: 'noindex,nofollow',
      },
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView,
      meta: {
        guest: true,
        title: 'Register',
        description: 'Create a CampusCove account to join the campus, earn items, and play with friends.',
        robots: 'noindex,nofollow',
      },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: ForgotPasswordView,
      meta: {
        guest: true,
        title: 'Reset password',
        description: 'Request a link to reset your CampusCove account password.',
        robots: 'noindex,nofollow',
      },
    },
    {
      path: '/item-shop',
      name: 'item-shop',
      component: ItemShopView,
      meta: {
        title: 'Item Shop',
        description:
          'Browse CampusCove cosmetics and items: unlock looks for your avatar and stand out on campus.',
        robots: 'index,follow',
      },
    },
    {
      path: '/home',
      name: 'home',
      component: HomeView,
      meta: {
        requiresAuth: true,
        title: 'Profile',
        description: 'Your CampusCove profile, wallet, and account overview.',
        robots: 'noindex,nofollow',
      },
    },
    {
      path: '/locker',
      name: 'locker',
      component: LockerView,
      meta: {
        requiresAuth: true,
        title: 'Locker',
        description: 'Manage equipped cosmetics and items for your CampusCove avatar.',
        robots: 'noindex,nofollow',
      },
    },
    {
      path: '/inventory',
      name: 'legacy-inventory',
      redirect: { name: 'locker' },
      meta: { requiresAuth: true },
    },
    {
      path: '/friends',
      name: 'friends',
      component: FriendsView,
      meta: {
        requiresAuth: true,
        title: 'Friends',
        description: 'See and manage your CampusCove friends list.',
        robots: 'noindex,nofollow',
      },
    },
    {
      path: '/game',
      name: 'game',
      component: GameView,
      meta: {
        requiresAuth: true,
        title: 'Game',
        fullBleed: true,
        description: 'Enter the CampusCove world and play with others in real time.',
        robots: 'noindex,nofollow',
      },
    },
    {
      path: '/admin/users',
      name: 'admin-users',
      component: AdminUsersView,
      meta: {
        requiresAdmin: true,
        title: 'Admin — Users',
        description: 'CampusCove admin: user management.',
        robots: 'noindex,nofollow',
      },
    },
    {
      path: '/admin/shop',
      name: 'admin-shop',
      component: AdminShopView,
      meta: {
        requiresAdmin: true,
        title: 'Admin — Shop',
        description: 'CampusCove admin: shop management.',
        robots: 'noindex,nofollow',
      },
    },
    {
      path: '/admin/inventories',
      name: 'admin-inventories',
      component: AdminInventoriesView,
      meta: {
        requiresAdmin: true,
        title: 'Admin — Inventories',
        description: 'CampusCove admin: inventory management.',
        robots: 'noindex,nofollow',
      },
    },
  ],
})

router.beforeEach(async (to) => {
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
  if (to.meta.guest && (to.name === 'landing' || to.name === 'login' || to.name === 'register' || to.name === 'forgot-password')) {
    if (!auth) return true
    const valid = await validateStoredAuth()
    if (!valid) return true
    return { name: 'home' }
  }
  return true
})

router.afterEach((to) => {
  applyRouteSeo(to)
})

export default router
