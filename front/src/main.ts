import { createApp } from 'vue'
// Self-hosted fonts (no request to Google: GDPR) — weights match tailwind.config.js usage.
import '@fontsource/lilita-one/400.css'
import '@fontsource/nunito/500.css'
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/700.css'
import '@fontsource/nunito/800.css'
import '@fontsource/nunito/900.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import './style.css'
import App from './App.vue'
import { i18n } from './i18n'
import router from './router'

createApp(App).use(i18n).use(router).mount('#app')
