import { createRouter, createWebHistory } from 'vue-router'
import { getStoredAuth, isAdminUser, validateStoredAuth } from '../api/auth'

const AdminInventoriesView = () => import('../views/admin/AdminInventoriesView.vue')
const AdminShopView = () => import('../views/admin/AdminShopView.vue')
const AdminUsersView = () => import('../views/admin/AdminUsersView.vue')
const ForgotPasswordView = () => import('../views/auth/ForgotPasswordView.vue')
const FriendsView = () => import('../views/FriendsView.vue')
const GameView = () => import('../views/GameView.vue')
const HomeView = () => import('../views/HomeView.vue')
const LockerView = () => import('../views/LockerView.vue')
const ItemShopView = () => import('../views/ItemShopView.vue')
const LandingView = () => import('../views/LandingView.vue')
const LoginView = () => import('../views/auth/LoginView.vue')
const NotFoundView = () => import('../views/NotFoundView.vue')
const RegisterView = () => import('../views/auth/RegisterView.vue')
const ResetPasswordView = () => import('../views/auth/ResetPasswordView.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'landing',
      component: LandingView,
      meta: { guest: true, title: 'Virtual campus', standalone: true, fullBleed: true },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { guest: true, title: 'Sign in', standalone: true, fullBleed: true },
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView,
      meta: { guest: true, title: 'Register', standalone: true, fullBleed: true },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: ForgotPasswordView,
      meta: { guest: true, title: 'Reset password', standalone: true, fullBleed: true },
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: ResetPasswordView,
      meta: { guest: true, title: 'Choose a new password', standalone: true, fullBleed: true },
    },
    { path: '/item-shop', name: 'item-shop', redirect: { name: 'shop' } },
    { path: '/shop', name: 'shop', component: ItemShopView, meta: { title: 'Shop', fullBleed: true } },
    {
      path: '/shop-skin',
      name: 'shop-skin',
      component: ItemShopView,
      meta: { title: 'Shop Skin', fullBleed: true },
    },
    { path: '/home', name: 'home', component: HomeView, meta: { requiresAuth: true, title: 'Profile' } },
    { path: '/locker', name: 'locker', component: LockerView, meta: { requiresAuth: true, title: 'Locker' } },
    { path: '/inventory', name: 'legacy-inventory', redirect: { name: 'locker' }, meta: { requiresAuth: true } },
    { path: '/friends', name: 'friends', component: FriendsView, meta: { requiresAuth: true, title: 'Friends' } },
    { path: '/game', name: 'game', component: GameView, meta: { requiresAuth: true, title: 'Game', fullBleed: true } },
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
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
      meta: { title: 'Page not found', standalone: true, fullBleed: true },
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
  const title = typeof to.meta.title === 'string' ? to.meta.title : ''
  document.title = title ? `${title} · CampusCove` : 'CampusCove'
})

export default router
