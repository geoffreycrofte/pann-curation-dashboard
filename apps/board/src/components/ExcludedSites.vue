<script setup lang="ts">
import { useMutation, useQueryCache } from '@pinia/colada'
import { nextTick, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'

/** Sites never proposed for the topic: added here or from "Reject" on the board. */
const props = defineProps<{ topicId: string; domains: string[] }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const domain = ref('')
const message = ref('')
const isError = ref(false)
const input = ref<HTMLInputElement>()

async function refresh() {
  await queryCache.invalidateQueries({ key: ['topic', props.topicId] })
  await queryCache.invalidateQueries({ key: ['items', props.topicId] })
}

const { mutate: add, isLoading: adding } = useMutation({
  mutation: () => api.excludeSite(props.topicId, domain.value),
  async onSuccess(result) {
    isError.value = false
    message.value = t('reject.siteDone', { site: result.domain, count: result.rejected })
    domain.value = ''
    await refresh()
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})

const { mutate: remove } = useMutation({
  mutation: (site: string) => api.removeExcludedSite(props.topicId, site).then(() => site),
  async onSuccess(site) {
    isError.value = false
    message.value = t('exclusions.removed', { site })
    await refresh()
    // The removed row and its button are gone: go back to the field.
    await nextTick()
    input.value?.focus()
  },
  onError(err) {
    isError.value = true
    message.value = describeError(err.message, t).text
  },
})
</script>

<template>
  <section class="exclusions" :aria-labelledby="`${id}-title`">
    <h2 :id="`${id}-title`">{{ t('exclusions.title') }}</h2>
    <p class="hint">{{ t('exclusions.intro') }}</p>

    <form class="add" @submit.prevent="add()">
      <div class="form-row">
        <label :for="`${id}-domain`">{{ t('exclusions.add') }}</label>
        <div class="add-row">
          <input
            :id="`${id}-domain`"
            ref="input"
            v-model="domain"
            class="field"
            type="text"
            inputmode="url"
            autocomplete="off"
            spellcheck="false"
            required
            :placeholder="t('exclusions.placeholder')"
            :aria-describedby="`${id}-domain-hint`"
          />
          <button type="submit" class="button" data-variant="primary" :disabled="adding">
            {{ t('exclusions.submit') }}
          </button>
        </div>
        <p :id="`${id}-domain-hint`" class="hint">{{ t('exclusions.addHint') }}</p>
      </div>
    </form>

    <p v-if="!domains.length">{{ t('exclusions.empty') }}</p>
    <ul v-else class="sites" :aria-label="t('exclusions.listLabel')">
      <li v-for="site in domains" :key="site">
        <span class="site">{{ site }}</span>
        <button
          type="button"
          class="button"
          :aria-label="t('exclusions.removeLabel', { site })"
          @click="remove(site)"
        >
          {{ t('exclusions.remove') }}
        </button>
      </li>
    </ul>
    <p role="status" :class="{ error: isError }">{{ message }}</p>
  </section>
</template>

<style scoped>
.exclusions {
  display: grid;
  gap: var(--space-4);
  max-width: 40rem;
}

.exclusions h2,
.exclusions p {
  margin: 0;
}

.add-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.add-row .field {
  flex: 1 1 16rem;
}

.sites {
  display: grid;
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  list-style: none;
}

.sites li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-5);
}

.sites li + li {
  border-top: 1px solid var(--color-border-subtle);
}

.site {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.9375rem;
  overflow-wrap: anywhere;
}
</style>
