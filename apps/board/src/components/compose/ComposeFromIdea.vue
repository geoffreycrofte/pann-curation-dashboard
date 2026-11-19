<script setup lang="ts">
/**
 * "Write a post from this": starts a composition from an idea of the topic (a news
 * item, a conversation), in links mode with its page as the chosen source. Shown only
 * when the topic uses the Création tool.
 */
import { useQuery } from '@pinia/colada'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { api } from '../../lib/api'
import { describeError } from '../../lib/errors'
import Icon from '../Icon.vue'

const props = defineProps<{ topicId: string; title: string; url: string; notes?: string }>()
const { t } = useI18n()
const router = useRouter()

const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
const busy = ref(false)
const error = ref('')

async function start() {
  busy.value = true
  error.value = ''
  try {
    const created = await api.createComposition(props.topicId, {
      subject: props.title.slice(0, 300),
      mode: 'links',
      notes: props.notes ?? '',
      link: props.url,
      sources: [{ url: props.url, title: props.title.slice(0, 300), selected: true }],
    })
    await router.push({
      name: 'composition',
      params: { topicId: props.topicId, compositionId: created.id },
    })
  } catch (err) {
    error.value = describeError((err as Error).message, t).text
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <template v-if="topic?.config.modules.compose">
    <button
      type="button"
      class="button"
      data-size="small"
      :disabled="busy"
      :aria-label="t('compose.ideas.startLabel', { title })"
      @click="start"
    >
      <Icon name="writing" />
      {{ t('compose.ideas.start') }}
    </button>
    <span v-if="error" class="error" role="alert">{{ error }}</span>
  </template>
</template>
