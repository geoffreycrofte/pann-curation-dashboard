<script setup lang="ts">
import type { BoardItem, ItemTopicStatus } from '@pann/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import ItemCard from './ItemCard.vue'

const props = defineProps<{ topicId: string; status: ItemTopicStatus }>()
const emit = defineEmits<{ announce: [message: string] }>()
const { t } = useI18n()
const queryCache = useQueryCache()
const listEl = ref<HTMLElement>()

const {
  data: items,
  isPending,
  error,
} = useQuery({
  key: () => ['items', props.topicId, props.status],
  query: () => api.items(props.topicId, props.status),
})

// Drafting runs in the background: refresh while an item of the list is being drafted.
let poller: ReturnType<typeof setInterval> | undefined
watch(items, (list) => {
  const drafting = list?.some((i) => i.draft_status === 'pending')
  if (drafting && !poller) {
    poller = setInterval(
      () => queryCache.invalidateQueries({ key: ['items', props.topicId, props.status] }),
      4000,
    )
  } else if (!drafting && poller) {
    clearInterval(poller)
    poller = undefined
  }
})
onBeforeUnmount(() => poller && clearInterval(poller))

const { mutate, isLoading } = useMutation({
  mutation: (vars: { item: BoardItem; to: ItemTopicStatus }) =>
    api.setStatus(props.topicId, vars.item.item_id, vars.to),
  async onSuccess(_data, { item, to }) {
    emit('announce', t('board.statusChanged', { title: item.title, status: t(`statusOne.${to}`) }))
    // Keep keyboard focus in the list: move to the next card, or the list itself.
    const cards = [...(listEl.value?.querySelectorAll<HTMLElement>('[data-item-id]') ?? [])]
    const index = cards.findIndex((el) => el.dataset.itemId === item.item_id)
    const nextId = (cards[index + 1] ?? cards[index - 1])?.dataset.itemId
    await queryCache.invalidateQueries({ key: ['items', props.topicId] })
    await nextTick()
    const target = nextId
      ? listEl.value?.querySelector<HTMLElement>(`[data-item-id="${nextId}"]`)
      : listEl.value
    target?.focus()
  },
  onError(err) {
    emit('announce', err.message)
  },
})

const { mutate: excludeSite, isLoading: excluding } = useMutation({
  mutation: (vars: { item: BoardItem; domain: string }) =>
    api.excludeSite(props.topicId, vars.domain, vars.item.item_id),
  async onSuccess(result) {
    emit('announce', t('reject.siteDone', { site: result.domain, count: result.rejected }))
    await queryCache.invalidateQueries({ key: ['items', props.topicId] })
    await queryCache.invalidateQueries({ key: ['topic', props.topicId] })
    await nextTick()
    listEl.value?.focus()
  },
  onError(err) {
    emit('announce', err.message)
  },
})
</script>

<template>
  <p v-if="isPending" role="status">{{ t('board.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <div v-else ref="listEl" tabindex="-1" class="list-wrapper">
    <p v-if="!items?.length">{{ t('board.empty') }}</p>
    <ul v-else class="list">
      <li v-for="item in items" :key="item.item_id">
        <ItemCard
          :item="item"
          :busy="isLoading || excluding"
          @set-status="(to) => mutate({ item, to })"
          @exclude-site="(domain) => excludeSite({ item, domain })"
        />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
