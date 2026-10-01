<script setup lang="ts">
import type { BoardItem, ItemTopicStatus } from '@pann/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { nextTick, ref } from 'vue'
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
</script>

<template>
  <p v-if="isPending" role="status">{{ t('board.loading') }}</p>
  <p v-else-if="error" role="alert">{{ t('board.loadError', { message: error.message }) }}</p>
  <div v-else ref="listEl" tabindex="-1" class="list-wrapper">
    <p v-if="!items?.length">{{ t('board.empty') }}</p>
    <ul v-else class="list">
      <li v-for="item in items" :key="item.item_id">
        <ItemCard :item="item" :busy="isLoading" @set-status="(to) => mutate({ item, to })" />
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
