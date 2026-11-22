<script setup lang="ts">
/**
 * The reply suggested by the AI for a conversation to reply to. The person reads it,
 * adapts it (saved as they type), copies it and posts it themself: Glimr posts nothing.
 */
import type { Conversation } from '@glimr/shared'
import { useMutation, useQueryCache } from '@pinia/colada'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { toast } from '../lib/toast'
import Icon from './Icon.vue'
import TextSaver from './TextSaver.vue'

const props = defineProps<{ conversation: Conversation }>()
const { t } = useI18n()
const queryCache = useQueryCache()

const c = computed(() => props.conversation)
/** Bluesky caps a post at 300 characters; elsewhere, a reply stays short. */
const limit = computed(() => (c.value.meta.platform === 'bluesky' ? 300 : 2000))
/** The text as last saved, for "Copy": a new suggestion replaces it. */
const text = ref(c.value.reply_draft ?? '')
watch(
  () => c.value.reply_draft,
  (value) => (text.value = value ?? ''),
)
async function save(value: string) {
  await api.saveReply(c.value.topic_id, c.value.item_id, value)
  text.value = value
}

const { mutate: request, isLoading: requesting } = useMutation({
  mutation: () => api.requestReply(c.value.topic_id, c.value.item_id),
  async onSettled() {
    await queryCache.invalidateQueries({ key: ['conversations', c.value.topic_id] })
  },
  onError(err) {
    toast(t('engagement.reply.failed', { message: describeError(err.message, t).text }))
  },
})
const pending = computed(() => requesting.value || c.value.reply_status === 'pending')

async function copy() {
  try {
    await navigator.clipboard.writeText(text.value)
    toast(t('engagement.reply.copied'))
  } catch {
    toast(t('engagement.reply.copyFailed'))
  }
}
</script>

<template>
  <div class="reply">
    <p v-if="pending" role="status" class="pending">{{ t('engagement.reply.pending') }}</p>
    <template v-else>
      <p v-if="c.reply_status === 'failed'" class="notice notice-inline" data-tone="danger">
        <Icon name="alert-circle" />
        <span>{{
          t('engagement.reply.failed', {
            message: describeError(c.reply_error ?? 'unexpected', t).text,
          })
        }}</span>
      </p>
      <template v-if="c.reply_status === 'ready' && c.reply_draft !== null">
        <TextSaver
          :label="t('engagement.reply.title')"
          :description="t('engagement.reply.hint')"
          :value="c.reply_draft"
          :lang="c.source_lang ?? undefined"
          :limit="limit"
          :limit-name="c.meta.platform ? t(`engagement.platforms.${c.meta.platform}`) : undefined"
          length-key="engagement.reply.length"
          :save="save"
        />
      </template>
      <div class="reply-actions">
        <button
          v-if="c.reply_status === 'ready'"
          type="button"
          class="button"
          data-size="small"
          @click="copy"
        >
          {{ t('engagement.reply.copy') }}
        </button>
        <button
          type="button"
          class="button"
          data-size="small"
          :aria-describedby="c.reply_status === 'ready' ? `again-${c.item_id}` : undefined"
          @click="request()"
        >
          {{
            c.reply_status === 'ready' ? t('engagement.reply.again') : t('engagement.reply.request')
          }}
        </button>
        <span v-if="c.reply_status === 'ready'" :id="`again-${c.item_id}`" class="visually-hidden">
          {{ t('engagement.reply.againConfirm') }}
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.reply {
  display: grid;
  gap: var(--space-2);
  padding-block: var(--space-3);
  border-block: 1px solid var(--color-border-subtle);
}

.pending {
  margin: 0;
  color: var(--color-text-muted);
}

.reply-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
