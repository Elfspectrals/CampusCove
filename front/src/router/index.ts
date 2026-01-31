import { createRouter, createWebHistory } from 'vue-router'
import { getStoredAuth } from '../api/auth'
import GameView from '../views/GameView.vue'
import LoginView from '../views/LoginView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'login', component: LoginView, meta: { guest: true } },
    { path: '/game', name: 'game', component: GameView, meta: { requiresAuth: true } },
  ],
})

router.beforeEach((to) => {
  const auth = getStoredAuth()
  if (to.meta.requiresAuth && !auth) return { name: 'login' }
  if (to.meta.guest && auth && to.name === 'login') return { name: 'game' }
  return true
})

export default router
