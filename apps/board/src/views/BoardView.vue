<script setup lang="ts">
import { ITEM_TOPIC_STATUSES, type ItemTopicStatus } from '@pann/shared'
import { useQuery } from '@pinia/colada'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import ItemList from '../components/ItemList.vue'
import { api } from '../lib/api'

const props = defineProps<{ topicId: string }>()
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const { data: topics } = useQuery({ key: ['topics'], query: api.topics })
const topic = computed(() => topics.value?.find((tp) => tp.id === props.topicId))
const topicName = computed(() =>
  topic.value ? (locale.value === 'fr' ? topic.value.name_fr : topic.value.name_en) : '',
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
