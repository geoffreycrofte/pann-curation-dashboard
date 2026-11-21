<script setup lang="ts">
/**
 * Above a list to sort: the scheduled collection of this tool waits, as too much is
 * left to sort (`pause_above`). Text first; the link leads to the limit.
 */
import { backlogLimitOf, isBacklogFull, type TopicConfig } from '@pann/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  topicId: string
  config: TopicConfig
  module: 'curation' | 'engagement'
  /** Items (or conversations) still to sort. */
  toSort: number | undefined
}>()
const { t } = useI18n()
const limit = computed(() => backlogLimitOf(props.config, props.module))
const full = computed(() => props.toSort !== undefined && isBacklogFull(props.toSort, limit.value))
</script>

<template>
  <p v-if="full" class="notice" role="note">
    {{ t(`backlog.notice.${module}`, { count: toSort, limit }) }}
    <RouterLink
      :to="{
        name: 'settings',
        params: { topicId },
        query: { tab: module === 'curation' ? 'triage' : 'conversations' },
      }"
      >{{ t('backlog.change') }}</RouterLink
    >
  </p>
</template>
