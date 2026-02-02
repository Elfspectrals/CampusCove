import { createRouter, createWebHistory } from 'vue-router'
import { getStoredAuth, validateStoredAuth } from '../api/auth'
import ForgotPasswordView from '../views/ForgotPasswordView.vue'
import FriendsView from '../views/FriendsView.vue'
import GameView from '../views/GameView.vue'
import HomeView from '../views/HomeView.vue'
import LandingView from '../views/LandingView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'landing', component: LandingView, meta: { guest: true } },
    { path: '/login', name: 'login', component: LoginView, meta: { guest: true } },
    { path: '/register', name: 'register', component: RegisterView, meta: { guest: true } },
    { path: '/forgot-password', name: 'forgot-password', component: ForgotPasswordView, meta: { guest: true } },
    { path: '/home', name: 'home', component: HomeView, meta: { requiresAuth: true } },
    { path: '/friends', name: 'friends', component: FriendsView, meta: { requiresAuth: true } },
    { path: '/game', name: 'game', component: GameView, meta: { requiresAuth: true } },
  ],
})

router.beforeEach(async (to) => {
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
