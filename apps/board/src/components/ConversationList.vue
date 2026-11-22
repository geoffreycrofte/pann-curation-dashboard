<script setup lang="ts">
import { communityOf, type Conversation, type ItemTopicStatus } from '@glimr/shared'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import CollectNow from './CollectNow.vue'
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

// Same query as the page: the weekly limit of replies per community.
const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
// Under the 'conversations' key: marking a reply refreshes it.
const { data: week } = useQuery({
  key: () => ['conversations', props.topicId, 'week'],
  query: () => api.repliesThisWeek(props.topicId),
  enabled: () => props.status === 'new' || props.status === 'validated',
})

// A reply is drafted in the background: refresh while one of the list is being written.
let poller: ReturnType<typeof setInterval> | undefined
watch(conversations, (list) => {
  const drafting = list?.some((c) => c.reply_status === 'pending')
  if (drafting && !poller) {
    poller = setInterval(
      () => queryCache.invalidateQueries({ key: ['conversations', props.topicId, props.status] }),
      3000,
    )
  } else if (!drafting && poller) {
    clearInterval(poller)
    poller = undefined
  }
})
onBeforeUnmount(() => poller && clearInterval(poller))

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
    <CollectNow
      v-if="!conversations?.length && status === 'new'"
      :topic-id="topicId"
      module="engagement"
      @announce="emit('announce', $event)"
    />
    <p v-else-if="!conversations?.length">{{ t(`engagement.empty.${status}`) }}</p>
    <ul v-else class="list">
      <li v-for="conversation in conversations" :key="conversation.item_id">
        <ConversationCard
          :conversation="conversation"
          :busy="isLoading"
          :week-count="week?.[communityOf(conversation.meta)] ?? 0"
          :week-limit="topic?.config.engagement.weekly_replies ?? null"
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
