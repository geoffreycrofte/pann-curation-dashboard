<script setup lang="ts">
import { ITEM_KINDS, type ItemKind } from '@pann/shared'
import { useI18n } from 'vue-i18n'

const model = defineModel<ItemKind | null>({ required: true })
const { t } = useI18n()
</script>

<template>
  <select v-model="model" class="field">
    <option :value="null">{{ t('kindSelect.none') }}</option>
    <option v-for="kind in ITEM_KINDS" :key="kind" :value="kind">{{ t(`kind.${kind}`) }}</option>
  </select>
</template>
