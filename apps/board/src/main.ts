import { PiniaColada } from '@pinia/colada'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { i18n } from './i18n'
import './lib/theme'
import { router } from './router'
import './styles/base.css'

createApp(App).use(createPinia()).use(PiniaColada).use(i18n).use(router).mount('#app')
