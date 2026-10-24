<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatInterval, intervalOptions } from '../lib/intervals'

/** `inheritedHours` adds a "topic setting" option, selected when the value is null. */
const props = defineProps<{ inheritedHours?: number }>()
const model = defineModel<number | null>({ required: true })
const { t } = useI18n()

const options = computed(() => intervalOptions(model.value))
</script>

<template>
  <select v-model="model" class="field">
    <option v-if="props.inheritedHours !== undefined" :value="null">
      {{ t('interval.topicDefault', { value: formatInterval(props.inheritedHours, t) }) }}
    </option>
    <option v-for="hours in options" :key="hours" :value="hours">
      {{ formatInterval(hours, t) }}
    </option>
  </select>
</template>
