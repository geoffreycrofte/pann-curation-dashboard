<script setup lang="ts">
import { ITEM_TOPIC_STATUSES, type ItemTopicStatus } from '@pann/shared'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed, ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AddItemForm from '../components/AddItemForm.vue'
import ItemList from '../components/ItemList.vue'
import ScheduledPanel from '../components/ScheduledPanel.vue'
import TopicNav from '../components/TopicNav.vue'
import { api } from '../lib/api'
import { useTopicName } from '../lib/topic-name'
import { useWorkspace } from '../lib/workspace'

const props = defineProps<{ topicId: string }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const topicName = useTopicName(() => props.topicId)

const { workspaceId } = useWorkspace()
const { data: credentials } = useQuery({
  key: () => ['credentials', workspaceId.value ?? ''],
  query: () => api.credentials(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})
const anthropicMissing = computed(
  () =>
    !!credentials.value &&
    !credentials.value.some((c) => c.provider === 'anthropic' && c.status !== 'invalid'),
)

// "Scheduled" is not a status: validated items waiting for their slot, after "Validated".
type Tab = ItemTopicStatus | 'scheduled'
const TABS: readonly Tab[] = ITEM_TOPIC_STATUSES.flatMap((s): Tab[] =>
  s === 'validated' ? [s, 'scheduled'] : [s],
)
const status = computed<Tab>({
  get: () => {
    const q = route.query.status
    return typeof q === 'string' && (TABS as readonly string[]).includes(q) ? (q as Tab) : 'new'
  },
  // The views of the scheduled tab (list, week) do not follow to another tab.
  set: (value) =>
    router.replace({ query: { ...route.query, status: value, view: undefined, week: undefined } }),
})

// Under the 'items' key: every status change or new item refreshes the counters too.
const { data: counts } = useQuery({
  key: () => ['items', props.topicId, 'counts'],
  query: () => api.counts(props.topicId),
})

const announcement = ref('')

// Same query as the settings page: shared cache.
const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
const curationOff = computed(() => topic.value?.config.modules.curation === false)
</script>

<template>
  <h1 tabindex="-1">{{ topicName }}</h1>
  <TopicNav :topic-id="topicId" />
  <p v-if="curationOff" class="notice" role="note">
    {{ t('modules.curationOff') }}
    <RouterLink :to="{ name: 'settings', params: { topicId } }">
      {{ t('modules.turnOn') }}
    </RouterLink>
  </p>
  <template v-else>
    <p v-if="anthropicMissing" class="notice" role="note">
      {{ t('board.noAnthropicKey') }}
      <RouterLink to="/connections">{{ t('errors.fixInConnections') }}</RouterLink>
    </p>
    <AddItemForm :topic-id="topicId" />

    <TabsRoot v-model="status" activation-mode="manual">
      <TabsList :aria-label="t('board.statusFilter')" v-scroll-active class="tabs tab-row">
        <TabsTrigger v-for="s in TABS" :key="s" :value="s" class="button tab">
          {{ s === 'scheduled' ? t('scheduled.tab') : t(`status.${s}`) }}
          <span v-if="counts?.[s] !== undefined" class="count">
            <span class="visually-hidden">(</span>{{ counts[s]
            }}<span class="visually-hidden">)</span>
          </span>
        </TabsTrigger>
      </TabsList>
      <TabsContent v-for="s in ITEM_TOPIC_STATUSES" :key="s" :value="s" class="panel">
        <ItemList :topic-id="topicId" :status="s" @announce="announcement = $event" />
      </TabsContent>
      <TabsContent value="scheduled" class="panel">
        <ScheduledPanel :topic-id="topicId" />
      </TabsContent>
    </TabsRoot>
  </template>

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
  color: var(--color-text);
}

/* Current tab: ink fill, light text and bold (not color alone). */
.tab[data-state='active'] {
  border-color: var(--color-text);
  background: var(--color-text);
  color: var(--color-surface);
  font-weight: 750;
}

@media (forced-colors: active) {
  .tab[data-state='active'] {
    border: 3px solid Highlight;
  }
}
</style>
