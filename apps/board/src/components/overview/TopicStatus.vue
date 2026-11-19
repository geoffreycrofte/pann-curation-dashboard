<script setup lang="ts">
/**
 * What runs for this topic, said plainly from the real state (sources, AI key, accounts),
 * and the switch to pause it or resume it. Paused: nothing is collected, sorted, drafted
 * by itself or published; scheduled posts wait and go out once the topic is resumed.
 */
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../lib/api'
import { describeError } from '../../lib/errors'
import { toast } from '../../lib/toast'
import { useWorkspace } from '../../lib/workspace'
import Icon from '../Icon.vue'

const props = defineProps<{ topicId: string }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()
const { workspaceId } = useWorkspace()

const { data: topic } = useQuery({
  key: () => ['topic', props.topicId],
  query: () => api.topic(props.topicId),
})
const modules = computed(() => topic.value?.config.modules)
const { data: credentials } = useQuery({
  key: () => ['credentials', workspaceId.value ?? ''],
  query: () => api.credentials(workspaceId.value!),
  enabled: () => !!workspaceId.value,
})
const { data: curationSources } = useQuery({
  key: () => ['sources', props.topicId, 'curation'],
  query: () => api.sources(props.topicId, 'curation'),
  enabled: () => !!modules.value?.curation,
})
const { data: engagementSources } = useQuery({
  key: () => ['sources', props.topicId, 'engagement'],
  query: () => api.sources(props.topicId, 'engagement'),
  enabled: () => !!modules.value?.engagement,
})

const active = computed(() => topic.value?.active !== false)
const hasAi = computed(
  () => !!credentials.value?.some((c) => c.provider === 'anthropic' && c.status !== 'invalid'),
)
const publishes = computed(() => !!modules.value?.curation || !!modules.value?.compose)

interface Line {
  key: string
  icon: string
  ok: boolean
  text: string
}
const lines = computed<Line[]>(() => {
  const config = topic.value?.config
  if (!config) return []
  const list: Line[] = []
  if (config.modules.curation) {
    const n = (curationSources.value ?? []).filter((s) => s.active).length
    list.push({
      key: 'collect',
      icon: 'rss',
      ok: n > 0,
      text: n ? t('topicStatus.collect', n) : t('topicStatus.noSources'),
    })
  }
  if (config.modules.engagement) {
    const n = (engagementSources.value ?? []).filter((s) => s.active).length
    list.push({
      key: 'listen',
      icon: 'messages',
      ok: n > 0,
      text: n ? t('topicStatus.listen', n) : t('topicStatus.noSearches'),
    })
  }
  list.push({
    key: 'ai',
    icon: 'sparkles',
    ok: hasAi.value,
    text: hasAi.value ? t('topicStatus.ai') : t('topicStatus.noAi'),
  })
  if (publishes.value) {
    const n = config.channels.length
    list.push({
      key: 'publish',
      icon: 'send',
      ok: n > 0,
      text: n ? t('topicStatus.publish', n) : t('topicStatus.noAccounts'),
    })
  }
  return list
})

const { mutate, isLoading } = useMutation({
  mutation: (next: boolean) => api.updateTopic(props.topicId, { active: next }),
  async onSuccess(_data, next) {
    toast(next ? t('topicStatus.resumed') : t('topicStatus.paused'))
    await queryCache.invalidateQueries({ key: ['topic', props.topicId] })
    await queryCache.invalidateQueries({ key: ['topics'] })
  },
  onError(err) {
    toast(describeError(err.message, t).text)
  },
})
</script>

<template>
  <section
    v-if="topic"
    class="status card"
    :data-active="active || undefined"
    :aria-labelledby="`${id}-title`"
  >
    <div class="head">
      <h2 :id="`${id}-title`">
        <span class="dot" aria-hidden="true"></span>
        {{ active ? t('topicStatus.running') : t('topicStatus.pausedTitle') }}
      </h2>
      <button
        type="button"
        class="button"
        :disabled="isLoading"
        :aria-describedby="`${id}-effect`"
        @click="mutate(!active)"
      >
        <Icon :name="active ? 'player-pause' : 'player-play'" />
        {{ active ? t('topicStatus.pause') : t('topicStatus.resume') }}
      </button>
    </div>
    <p :id="`${id}-effect`" class="hint">
      {{ active ? t('topicStatus.pauseEffect') : t('topicStatus.resumeEffect') }}
    </p>
    <ul v-if="active" class="lines">
      <li v-for="line in lines" :key="line.key" :data-ok="line.ok || undefined">
        <Icon :name="line.ok ? 'circle-check' : 'alert-circle'" class="state" />
        <span class="visually-hidden">{{
          line.ok ? t('topicStatus.okLabel') : t('topicStatus.todoLabel')
        }}</span>
        <Icon :name="line.icon" class="kind" />
        <span>{{ line.text }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.status {
  display: grid;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
  padding: var(--space-4) var(--space-5);
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-4);
}

.head h2 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: 1.25rem;
}

.dot {
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid var(--color-text-muted);
  border-radius: 50%;
}

[data-active] .dot {
  border-color: var(--color-success);
  background: var(--color-success);
}

.hint {
  margin: 0;
}

.lines {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.lines li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.state {
  color: var(--color-text-muted);
}

[data-ok] .state {
  color: var(--color-success);
}

.kind {
  color: var(--color-text-muted);
}
</style>
