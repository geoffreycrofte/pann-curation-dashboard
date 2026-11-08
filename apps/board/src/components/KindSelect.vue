<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useTopicKinds } from '../lib/kinds'

/** Choice among the kinds of content of the topic (Settings, Kinds of content). */
const props = defineProps<{ topicId: string }>()
const model = defineModel<string | null>({ required: true })
const { t } = useI18n()
const { kinds, label } = useTopicKinds(() => props.topicId)
</script>

<template>
  <select v-model="model" class="field">
    <option :value="null">{{ t('kindSelect.none') }}</option>
    <option v-for="kind in kinds" :key="kind.key" :value="kind.key">{{ label(kind.key) }}</option>
    <!-- A kind removed from the topic but still set here stays visible until changed. -->
    <option v-if="model && !kinds.some((k) => k.key === model)" :value="model">{{ model }}</option>
  </select>
</template>
