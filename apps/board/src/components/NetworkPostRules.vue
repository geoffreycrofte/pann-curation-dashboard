<script setup lang="ts">
/**
 * Length and hashtags of the posts, per network the topic writes for (Settings, Drafting).
 * Every network starts from Glimr's defaults; a value changed here is kept for this topic
 * (ai.network_rules). The written post rules still win where they say otherwise.
 */
import {
  draftChannels,
  MAX_HASHTAGS_SETTING,
  NETWORK_POST_DEFAULTS,
  networkPostRule,
  POST_LIMITS,
  type DraftChannel,
  type TopicConfig,
} from '@glimr/shared'
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'

const props = defineProps<{ config: TopicConfig }>()
const rules = defineModel<TopicConfig['ai']['network_rules']>({ required: true })
const { t } = useI18n()
const id = useId()

const channels = computed(() => draftChannels(props.config))
/** The rule as it applies now: this topic's own setting, else the default. */
const current = (channel: DraftChannel) =>
  networkPostRule(
    { ...props.config, ai: { ...props.config.ai, network_rules: rules.value ?? {} } },
    channel,
  )

function set(
  channel: DraftChannel,
  field: 'min_chars' | 'max_chars' | 'max_hashtags',
  raw: string,
) {
  const value = raw === '' ? null : Math.max(0, Math.round(Number(raw)))
  const rule = { ...current(channel) }
  if (field === 'min_chars') rule.min_chars = value
  else if (value !== null) rule[field] = value
  rules.value = { ...(rules.value ?? {}), [channel]: rule }
}

const isDefault = (channel: DraftChannel) => {
  const own = rules.value?.[channel]
  const base = NETWORK_POST_DEFAULTS[channel]
  return (
    !own ||
    (own.min_chars === base.min_chars &&
      own.max_chars === base.max_chars &&
      own.max_hashtags === base.max_hashtags)
  )
}

function reset(channel: DraftChannel) {
  const next = { ...(rules.value ?? {}) }
  delete next[channel]
  rules.value = next
}
</script>

<template>
  <div class="network-rules" role="group" :aria-labelledby="`${id}-title`">
    <h3 :id="`${id}-title`" class="rules-title">{{ t('networkRules.title') }}</h3>
    <p class="hint">{{ t('networkRules.hint') }}</p>
    <fieldset v-for="channel in channels" :key="channel" class="network">
      <legend>
        <Icon :name="channel" class="network-logo" />{{ t(`draft.channels.${channel}`) }}
      </legend>
      <div class="fields">
        <div class="form-row">
          <label :for="`${id}-${channel}-min`">{{ t('networkRules.min') }}</label>
          <input
            :id="`${id}-${channel}-min`"
            :value="current(channel).min_chars ?? ''"
            class="field"
            type="number"
            min="0"
            :max="POST_LIMITS[channel]"
            step="10"
            inputmode="numeric"
            :placeholder="t('networkRules.none')"
            @change="set(channel, 'min_chars', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="form-row">
          <label :for="`${id}-${channel}-max`">{{ t('networkRules.max') }}</label>
          <input
            :id="`${id}-${channel}-max`"
            :value="current(channel).max_chars"
            class="field"
            type="number"
            min="50"
            :max="POST_LIMITS[channel]"
            step="10"
            inputmode="numeric"
            required
            :aria-describedby="`${id}-${channel}-limit`"
            @change="set(channel, 'max_chars', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="form-row">
          <label :for="`${id}-${channel}-tags`">{{ t('networkRules.hashtags') }}</label>
          <input
            :id="`${id}-${channel}-tags`"
            :value="current(channel).max_hashtags"
            class="field"
            type="number"
            min="0"
            :max="MAX_HASHTAGS_SETTING"
            inputmode="numeric"
            required
            @change="set(channel, 'max_hashtags', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
      <p class="limit">
        <span :id="`${id}-${channel}-limit`">{{
          t('networkRules.limit', { limit: POST_LIMITS[channel] })
        }}</span>
        <button
          v-if="!isDefault(channel)"
          type="button"
          class="button"
          data-size="small"
          @click="reset(channel)"
        >
          {{ t('networkRules.reset') }}
          <span class="visually-hidden">{{ t(`draft.channels.${channel}`) }}</span>
        </button>
      </p>
    </fieldset>
  </div>
</template>

<style scoped>
.network-rules {
  display: grid;
  gap: var(--space-3);
}

.rules-title {
  margin: 0;
  font-size: 1rem;
}

.network {
  margin: 0;
  padding: var(--space-3) 0 0;
  border: 0;
  border-top: 1px solid var(--color-border-subtle);
  border-radius: 0;
  background: none;
  box-shadow: none;
}

.network legend {
  float: left;
  width: 100%;
  margin-bottom: var(--space-2);
  padding: 0;
  font-weight: 650;
}

.fields {
  clear: both;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--space-2) var(--space-3);
}

.fields .field {
  width: 100%;
}

.limit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.hint {
  margin: 0;
}
</style>
