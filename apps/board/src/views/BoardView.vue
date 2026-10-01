<script setup lang="ts">
import { ITEM_TOPIC_STATUSES, type ItemTopicStatus } from '@pann/shared'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed, ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AddItemForm from '../components/AddItemForm.vue'
import ItemList from '../components/ItemList.vue'
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

const status = computed<ItemTopicStatus>({
  get: () => {
    const q = route.query.status
    return typeof q === 'string' && (ITEM_TOPIC_STATUSES as readonly string[]).includes(q)
      ? (q as ItemTopicStatus)
      : 'new'
  },
  set: (value) => router.replace({ query: { ...route.query, status: value } }),
})

const announcement = ref('')
</script>

<template>
  <h1 tabindex="-1">{{ topicName }}</h1>
  <TopicNav :topic-id="topicId" />
  <p v-if="anthropicMissing" class="notice" role="note">
    {{ t('board.noAnthropicKey') }}
    <RouterLink to="/connections">{{ t('errors.fixInConnections') }}</RouterLink>
  </p>
  <AddItemForm :topic-id="topicId" />

  <TabsRoot v-model="status" activation-mode="manual">
    <TabsList :aria-label="t('board.statusFilter')" class="tabs">
      <TabsTrigger v-for="s in ITEM_TOPIC_STATUSES" :key="s" :value="s" class="button tab">
        {{ t(`status.${s}`) }}
      </TabsTrigger>
    </TabsList>
    <TabsContent v-for="s in ITEM_TOPIC_STATUSES" :key="s" :value="s" class="panel">
      <ItemList :topic-id="topicId" :status="s" @announce="announcement = $event" />
    </TabsContent>
  </TabsRoot>

  <div role="status" class="visually-hidden">{{ announcement }}</div>
</template>

<style scoped>
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

/* Selected state does not rely on the gold fill alone (low contrast on white). */
.tab[data-state='active'] {
  border-color: var(--color-accent-text);
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
  font-weight: 700;
  box-shadow: inset 0 -3px 0 var(--color-on-accent);
}

@media (forced-colors: active) {
  .tab[data-state='active'] {
    border: 3px solid Highlight;
  }
}
</style>
