<script setup lang="ts">
/**
 * Admin space: the affiliate sign-up link of each service a workspace pays itself. The
 * Connections page shows it, with a disclosure, while the service is not connected. An
 * empty field means no link.
 */
import { PROVIDERS, type Provider } from '@glimr/shared'
import { useQuery, useQueryCache } from '@pinia/colada'
import { reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../lib/api'
import { describeError } from '../../lib/errors'
import { toast } from '../../lib/toast'
import Icon from '../Icon.vue'

const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()
const { data: settings } = useQuery({ key: ['admin', 'settings'], query: api.adminSettings })

const links = reactive<Record<Provider, string>>(
  Object.fromEntries(PROVIDERS.map((p) => [p, ''])) as Record<Provider, string>,
)
watch(
  settings,
  (value) => {
    for (const p of PROVIDERS) links[p] = value?.affiliate_links?.[p] ?? ''
  },
  { immediate: true },
)

const saving = ref(false)
const error = ref('')
async function save() {
  saving.value = true
  error.value = ''
  try {
    await api.updateAdminSettings({
      affiliate_links: Object.fromEntries(PROVIDERS.map((p) => [p, links[p].trim()])),
    })
    toast(t('admin.affiliates.saved'))
    await queryCache.invalidateQueries({ key: ['admin', 'settings'] })
    await queryCache.invalidateQueries({ key: ['affiliate-links'] })
  } catch (err) {
    error.value = describeError((err as Error).message, t).text
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="section-card block" :aria-labelledby="`${id}-title`" @submit.prevent="save">
    <h2 :id="`${id}-title`" class="section-title">{{ t('admin.affiliates.title') }}</h2>
    <p :id="`${id}-intro`" class="hint">{{ t('admin.affiliates.intro') }}</p>
    <div class="links">
      <div v-for="provider in PROVIDERS" :key="provider" class="form-row">
        <label :for="`${id}-${provider}`">{{ t(`connections.providers.${provider}.name`) }}</label>
        <input
          :id="`${id}-${provider}`"
          v-model="links[provider]"
          class="field"
          type="url"
          inputmode="url"
          autocomplete="off"
          spellcheck="false"
          pattern="https://\S+"
          placeholder="https://…"
          :aria-describedby="`${id}-intro`"
        />
      </div>
    </div>
    <div class="section-actions">
      <button type="submit" class="button" data-variant="primary" :disabled="saving">
        {{ saving ? t('common.saving') : t('common.save') }}
      </button>
    </div>
    <p v-if="error" class="notice notice-inline" data-tone="danger" role="alert">
      <Icon name="alert-circle" />
      <span>{{ error }}</span>
    </p>
  </form>
</template>

<style scoped>
.links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
  gap: var(--space-4);
}

.links .field {
  width: 100%;
}

p {
  margin: 0;
}
</style>
