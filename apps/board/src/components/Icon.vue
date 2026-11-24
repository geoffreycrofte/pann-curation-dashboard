<script setup lang="ts">
/**
 * Tabler Icons (MIT), only those the board uses: imported one by one so that the bundle
 * carries no other. Always decorative: the text next to an icon says what it means.
 */
import {
  IconAlertCircle,
  IconArrowLeft,
  IconArrowRight,
  IconBrandBluesky,
  IconBrandDiscord,
  IconBrandTelegram,
  IconBrandFacebook,
  IconBrandLinkedin,
  IconBrandMastodon,
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

const ICONS = {
  'alert-circle': IconAlertCircle,
  'arrow-left': IconArrowLeft,
  'arrow-right': IconArrowRight,
  bluesky: IconBrandBluesky,
  calendar: IconCalendarEvent,
  check: IconCheck,
  crown: IconCrown,
  'circle-check': IconCircleCheck,
  clock: IconClock,
  discord: IconBrandDiscord,
  telegram: IconBrandTelegram,
  exclamation: IconExclamationMark,
  'external-link': IconExternalLink,
  facebook: IconBrandFacebook,
  help: IconHelp,
  inbox: IconInbox,
  linkedin: IconBrandLinkedin,
  'list-check': IconListCheck,
  mail: IconMail,
  mastodon: IconBrandMastodon,
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
export type IconName = keyof typeof ICONS

defineProps<{ name: IconName | string; size?: number }>()
const pick = (name: string) => ICONS[name as IconName] ?? IconAlertCircle
</script>

<template>
  <component
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
</style>
