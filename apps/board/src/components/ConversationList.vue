<script setup lang="ts">
import type { Conversation, ItemTopicStatus } from '@pann/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import ConversationCard from './ConversationCard.vue'

const props = defineProps<{ topicId: string; status: ItemTopicStatus }>()
const emit = defineEmits<{ announce: [message: string] }>()
const { t } = useI18n()
const queryCache = useQueryCache()
const listEl = ref<HTMLElement>()

const {
  data: conversations,
  isPending,
  error,
} = useQuery({
  key: () => ['conversations', props.topicId, props.status],
  query: () => api.conversations(props.topicId, props.status),
})

const { mutate, isLoading } = useMutation({
  mutation: (vars: { conversation: Conversation; to: ItemTopicStatus }) =>
    api.setStatus(props.topicId, vars.conversation.item_id, vars.to),
  async onSuccess(_data, { conversation, to }) {
    emit(
      'announce',
      t('engagement.statusChanged', {
        title: conversation.title,
        status: t(`engagement.statusOne.${to}`),
      }),
    )
    // Keep keyboard focus in the list: move to the next card, or the list itself.
    const cards = [...(listEl.value?.querySelectorAll<HTMLElement>('[data-item-id]') ?? [])]
    const index = cards.findIndex((el) => el.dataset.itemId === conversation.item_id)
    const nextId = (cards[index + 1] ?? cards[index - 1])?.dataset.itemId
    await queryCache.invalidateQueries({ key: ['conversations', props.topicId] })
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
  <div v-else ref="listEl" tabindex="-1">
    <p v-if="!conversations?.length">{{ t(`engagement.empty.${status}`) }}</p>
    <ul v-else class="list">
      <li v-for="conversation in conversations" :key="conversation.item_id">
        <ConversationCard
          :conversation="conversation"
          :busy="isLoading"
          @set-status="(to) => mutate({ conversation, to })"
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
