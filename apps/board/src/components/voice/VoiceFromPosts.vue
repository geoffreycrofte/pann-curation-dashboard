<script setup lang="ts">
import Icon from '../Icon.vue'
/**
 * "Your voice from your posts": the person pastes a few posts they are happy with, the
 * AI proposes style and post rules from them. Each proposal is shown next to the current
 * rule and only fills the field below when the person chooses it; saving stays theirs.
 */
import { onBeforeUnmount, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../lib/api'
import { describeError } from '../../lib/errors'

const props = defineProps<{
  topicId: string
  current: { style_rules: string; post_rules: string }
}>()
const emit = defineEmits<{ apply: [field: 'style_rules' | 'post_rules', value: string] }>()
const { t, locale } = useI18n()
const id = useId()

const samples = ref('')
const status = ref<'idle' | 'pending' | 'done' | 'failed'>('idle')
const error = ref('')
const result = ref<{ style_rules: string; post_rules: string } | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(timer))

async function poll(analysisId: string) {
  try {
    const analysis = await api.voiceAnalysis(props.topicId, analysisId)
    if (analysis.status === 'pending') {
      timer = setTimeout(() => void poll(analysisId), 1500)
      return
    }
    status.value = analysis.status
    result.value = analysis.result
    error.value = analysis.error ? describeError(analysis.error, t).text : ''
  } catch (err) {
    status.value = 'failed'
    error.value = describeError((err as Error).message, t).text
  }
}

async function analyze() {
  if (samples.value.trim().length < 50) {
    status.value = 'failed'
    error.value = t('voice.tooShort')
    return
  }
  status.value = 'pending'
  error.value = ''
  result.value = null
  try {
    const created = await api.analyzeVoice(
      props.topicId,
      samples.value,
      locale.value === 'en' ? 'en' : 'fr',
    )
    void poll(created.id)
  } catch (err) {
    status.value = 'failed'
    error.value = describeError((err as Error).message, t).text
  }
}

const FIELDS = ['style_rules', 'post_rules'] as const
</script>

<template>
  <section class="section-card voice" :aria-labelledby="`${id}-title`">
    <h2 :id="`${id}-title`" class="section-title">{{ t('voice.title') }}</h2>
    <p class="hint">{{ t('voice.hint') }}</p>
    <div class="form-row">
      <label :for="`${id}-samples`">{{ t('voice.samples') }}</label>
      <textarea
        :id="`${id}-samples`"
        v-model="samples"
        class="field"
        rows="6"
        maxlength="12000"
        :aria-describedby="`${id}-samples-hint`"
      ></textarea>
      <p :id="`${id}-samples-hint`" class="hint">{{ t('voice.samplesHint') }}</p>
    </div>
    <div>
      <button
        type="button"
        class="button"
        data-size="small"
        :disabled="status === 'pending'"
        @click="analyze"
      >
        {{ t('voice.analyze') }}
      </button>
    </div>
    <p v-if="status === 'pending'" role="status">{{ t('voice.analyzing') }}</p>
    <p v-else-if="status === 'failed'" class="notice notice-inline" data-tone="danger" role="alert">
      <Icon name="alert-circle" />
      <span>{{ error }}</span>
    </p>

    <div v-if="result" class="proposals" role="region" :aria-label="t('voice.proposals')">
      <p class="hint">{{ t('voice.proposalsHint') }}</p>
      <section v-for="field in FIELDS" :key="field" class="proposal">
        <h3>{{ t(`voice.fields.${field}`) }}</h3>
        <div class="sides">
          <div>
            <p class="side-title">{{ t('voice.current') }}</p>
            <p class="value" :data-empty="!current[field].trim() || undefined">
              {{ current[field].trim() || t('voice.empty') }}
            </p>
          </div>
          <div>
            <p class="side-title">{{ t('voice.proposed') }}</p>
            <p class="value">{{ result[field] }}</p>
          </div>
        </div>
        <div>
          <button
            type="button"
            class="button"
            data-size="small"
            :disabled="!result[field].trim() || result[field] === current[field]"
            @click="emit('apply', field, result[field])"
          >
            {{ t(`voice.use.${field}`) }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.proposals,
.proposal {
  display: grid;
  gap: var(--space-3);
}

.voice p {
  margin: 0;
}

.proposal h3 {
  margin: 0;
}

.field {
  width: 100%;
  resize: vertical;
}

.sides {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
  gap: var(--space-4);
}

.side-title {
  margin: 0 0 var(--space-1);
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-weight: 650;
}

.value {
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius);
  background: var(--color-surface-2);
  white-space: pre-line;
}

.value[data-empty] {
  color: var(--color-text-muted);
  font-style: italic;
}
</style>
