<script setup lang="ts">
/**
 * Tabler Icons (MIT), only those the board uses: imported one by one so that the bundle
 * carries no other. The networks show their official logo, in their colour, instead
 * (lib/network-logos.ts). Always decorative: the text next to an icon says what it means.
 */
import {
  IconAlertCircle,
  IconArrowLeft,
  IconArrowRight,
  IconCalendarEvent,
  IconCheck,
  IconCrown,
  IconExclamationMark,
  IconCircleCheck,
  IconClock,
  IconExternalLink,
  IconHelp,
  IconInbox,
  IconListCheck,
  IconMail,
  IconMinus,
  IconMessages,
  IconNews,
  IconPencil,
  IconPhoto,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconRss,
  IconSearch,
  IconSend,
  IconSettings,
  IconSparkles,
  IconTrash,
  IconWriting,
} from '@tabler/icons-vue'
import { isNetworkLogo, NETWORK_LOGOS, type NetworkLogo } from '../lib/network-logos'

const ICONS = {
  'alert-circle': IconAlertCircle,
  'arrow-left': IconArrowLeft,
  'arrow-right': IconArrowRight,
  calendar: IconCalendarEvent,
  check: IconCheck,
  crown: IconCrown,
  'circle-check': IconCircleCheck,
  clock: IconClock,
  exclamation: IconExclamationMark,
  'external-link': IconExternalLink,
  help: IconHelp,
  inbox: IconInbox,
  'list-check': IconListCheck,
  mail: IconMail,
  minus: IconMinus,
  messages: IconMessages,
  news: IconNews,
  pencil: IconPencil,
  photo: IconPhoto,
  'player-pause': IconPlayerPause,
  'player-play': IconPlayerPlay,
  plus: IconPlus,
  refresh: IconRefresh,
  rss: IconRss,
  search: IconSearch,
  send: IconSend,
  settings: IconSettings,
  sparkles: IconSparkles,
  trash: IconTrash,
  writing: IconWriting,
} as const
export type IconName = keyof typeof ICONS | NetworkLogo

defineProps<{ name: IconName | string; size?: number }>()
const pick = (name: string) => ICONS[name as keyof typeof ICONS] ?? IconAlertCircle
</script>

<template>
  <svg
    v-if="isNetworkLogo(name)"
    class="icon logo"
    viewBox="0 0 24 24"
    :width="size ?? 18"
    :height="size ?? 18"
    aria-hidden="true"
    focusable="false"
  >
    <path
      :d="NETWORK_LOGOS[name]"
      :fill="`var(--color-brand-${name})`"
      :fill-rule="name === 'linkedin' ? 'evenodd' : undefined"
    />
  </svg>
  <component
    v-else
    :is="pick(name)"
    class="icon"
    :size="size ?? 18"
    :stroke-width="1.75"
    aria-hidden="true"
    focusable="false"
  />
</template>

<style scoped>
.icon {
  flex: none;
  vertical-align: -0.2em;
}

/* High contrast: the logo takes the text colour, like the other icons. */
@media (forced-colors: active) {
  .logo path {
    fill: CanvasText;
  }
}
</style>
