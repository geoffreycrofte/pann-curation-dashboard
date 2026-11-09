import { PiniaColada } from '@pinia/colada'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { vScrollActive } from './lib/scroll-active'
import { i18n } from './i18n'
import './lib/theme'
import { router } from './router'
import './styles/base.css'

createApp(App)
  .directive('scroll-active', vScrollActive)
  .use(createPinia())
  .use(PiniaColada)
  .use(i18n)
  .use(router)
  .mount('#app')
