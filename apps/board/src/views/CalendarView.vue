<script setup lang="ts">
/**
 * What goes out from a topic, whatever the tool: posts scheduled (list or week), what
 * already went out or failed, and the newsletter. One place instead of three pages.
 */
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import NewsletterPanel from '../components/NewsletterPanel.vue'
import QueueHistory from '../components/QueueHistory.vue'
import ScheduledPanel from '../components/ScheduledPanel.vue'
import ComposeQueue from '../components/compose/ComposeQueue.vue'
import { useTopicName } from '../lib/topic-name'
import { usePageDetail } from '../lib/page-title'

const props = defineProps<{ topicId: string }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const topicName = useTopicName(() => props.topicId)

const TABS = ['scheduled', 'history', 'newsletter'] as const
type Tab = (typeof TABS)[number]
// Kept in the address (?tab=…), like the other pages: a tab can be linked and reloaded.
const tab = computed<Tab>({
  get: () =>
    (TABS as readonly unknown[]).includes(route.query.tab) ? (route.query.tab as Tab) : 'scheduled',
  // The views of the scheduled tab (list, week) do not follow to another tab.
  set: (value) =>
    void router.replace({
      query: { tab: value === 'scheduled' ? undefined : value },
    }),
})

// The document title starts with what this page shows.
usePageDetail(() => t(`calendar.tabs.${tab.value}`))
</script>

<template>
  <h1 tabindex="-1">{{ t('calendar.heading', { topic: topicName }) }}</h1>
  <TabsRoot v-model="tab" activation-mode="manual">
    <TabsList :aria-label="t('calendar.tabsLabel')" v-scroll-active class="subtabs tab-row">
      <TabsTrigger v-for="name in TABS" :key="name" :value="name" class="subtab">
        {{ t(`calendar.tabs.${name}`) }}
      </TabsTrigger>
    </TabsList>
    <TabsContent value="scheduled" class="subpanel">
      <ComposeQueue :topic-id="topicId" status="scheduled" />
      <ScheduledPanel :topic-id="topicId" />
    </TabsContent>
    <TabsContent value="history" class="subpanel">
      <ComposeQueue :topic-id="topicId" status="published" />
      <QueueHistory :topic-id="topicId" only="recent" />
    </TabsContent>
    <TabsContent value="newsletter" class="subpanel">
      <NewsletterPanel :topic-id="topicId" />
    </TabsContent>
  </TabsRoot>
</template>
