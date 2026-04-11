import { createRouter, createWebHistory } from 'vue-router'
import { getStoredAuth, isAdminUser, validateStoredAuth } from '../api/auth'
import AdminShopView from '../views/AdminShopView.vue'
import ForgotPasswordView from '../views/ForgotPasswordView.vue'
import FriendsView from '../views/FriendsView.vue'
import GameView from '../views/GameView.vue'
import HomeView from '../views/HomeView.vue'
import ItemShopView from '../views/ItemShopView.vue'
import LandingView from '../views/LandingView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'landing', component: LandingView, meta: { guest: true, title: 'Welcome' } },
    { path: '/login', name: 'login', component: LoginView, meta: { guest: true, title: 'Sign in' } },
    { path: '/register', name: 'register', component: RegisterView, meta: { guest: true, title: 'Register' } },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: ForgotPasswordView,
      meta: { guest: true, title: 'Reset password' },
    },
    { path: '/item-shop', name: 'item-shop', component: ItemShopView, meta: { title: 'Item Shop' } },
    { path: '/home', name: 'home', component: HomeView, meta: { requiresAuth: true, title: 'Profile' } },
    { path: '/friends', name: 'friends', component: FriendsView, meta: { requiresAuth: true, title: 'Friends' } },
    { path: '/game', name: 'game', component: GameView, meta: { requiresAuth: true, title: 'Game', fullBleed: true } },
    { path: '/admin/shop', name: 'admin-shop', component: AdminShopView, meta: { requiresAdmin: true, title: 'Admin — Shop' } },
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

export default router
