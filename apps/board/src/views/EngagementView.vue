<script setup lang="ts">
import type { ItemTopicStatus } from '@pann/shared'
import { useQuery } from '@pinia/colada'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import ConversationList from '../components/ConversationList.vue'
import EngagementSettings from '../components/EngagementSettings.vue'
import EngagementSources from '../components/EngagementSources.vue'
import { api } from '../lib/api'
import { useTopicName } from '../lib/topic-name'

const props = defineProps<{ topicId: string }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const topicName = useTopicName(() => props.topicId)

// Same query as the other pages of the topic: shared cache.
const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
const engagementOff = computed(() => topic.value?.config.modules.engagement === false)

/** Statuses of a conversation: to review, to reply, dismissed, archived by the triage. */
const STATUSES = [
  'new',
  'validated',
  'rejected',
  'archived',
] as const satisfies readonly ItemTopicStatus[]
const SECTIONS = ['conversations', 'sources', 'settings'] as const
type Section = (typeof SECTIONS)[number]

const section = computed<Section>({
  get: () => {
    const value = route.query.tab
    return (SECTIONS as readonly unknown[]).includes(value) ? (value as Section) : 'conversations'
  },
  set: (value) => void router.replace({ query: { ...route.query, tab: value } }),
})
const status = computed<ItemTopicStatus>({
  get: () => {
    const value = route.query.status
    return (STATUSES as readonly unknown[]).includes(value) ? (value as ItemTopicStatus) : 'new'
  },
  set: (value) => void router.replace({ query: { ...route.query, status: value } }),
})

// Under the 'conversations' key: a status change refreshes the counters too.
const { data: counts } = useQuery({
  key: () => ['conversations', props.topicId, 'counts'],
  query: () => api.counts(props.topicId, 'engagement'),
})

const announcement = ref('')
</script>

<template>
  <h1 tabindex="-1">{{ t('engagement.heading', { topic: topicName }) }}</h1>

  <p v-if="engagementOff" class="notice" role="note">
    {{ t('engagement.off') }}
    <RouterLink :to="{ name: 'settings', params: { topicId } }">{{
      t('modules.turnOn')
    }}</RouterLink>
  </p>

  <TabsRoot v-else-if="topic" v-model="section" activation-mode="manual">
    <TabsList :aria-label="t('engagement.sectionsLabel')" v-scroll-active class="subtabs tab-row">
      <TabsTrigger v-for="name in SECTIONS" :key="name" :value="name" class="subtab">
        {{ t(`engagement.sections.${name}`) }}
      </TabsTrigger>
    </TabsList>

    <TabsContent value="conversations" class="subpanel">
      <!-- The rule of the tool, always in view: Pann never posts a reply. -->
      <p class="notice" role="note">{{ t('engagement.neverPosted') }}</p>
      <TabsRoot v-model="status" activation-mode="manual">
        <TabsList :aria-label="t('engagement.statusFilter')" v-scroll-active class="tabs tab-row">
          <TabsTrigger v-for="s in STATUSES" :key="s" :value="s" class="button tab">
            {{ t(`engagement.status.${s}`) }}
            <span v-if="counts?.[s] !== undefined" class="count">
              <span class="visually-hidden">(</span>{{ counts[s]
              }}<span class="visually-hidden">)</span>
            </span>
          </TabsTrigger>
        </TabsList>
        <TabsContent v-for="s in STATUSES" :key="s" :value="s">
          <ConversationList :topic-id="topicId" :status="s" @announce="announcement = $event" />
        </TabsContent>
      </TabsRoot>
    </TabsContent>

    <TabsContent value="sources" class="subpanel">
      <EngagementSources :topic-id="topicId" />
    </TabsContent>

    <TabsContent value="settings" class="subpanel">
      <EngagementSettings :key="topic.id" :topic="topic" />
    </TabsContent>
  </TabsRoot>

  <div role="status" class="visually-hidden">{{ announcement }}</div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
}

.tab {
  border-color: var(--color-border-subtle);
  white-space: nowrap;
}

/* Current status: ink fill, light text and bold (not color alone). */
.tab[data-state='active'] {
  border-color: var(--color-text);
  background: var(--color-text);
  color: var(--color-surface);
  font-weight: 750;
}

.count {
  min-width: 1.5rem;
  padding: 0 var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-surface-2);
  color: var(--color-text);
  font-size: 0.8125rem;
  font-weight: 700;
  text-align: center;
}

.tab[data-state='active'] .count {
  background: var(--color-surface);
}

@media (forced-colors: active) {
  .tab[data-state='active'] {
    border: 3px solid Highlight;
  }
}
</style>
