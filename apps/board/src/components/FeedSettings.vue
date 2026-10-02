<script setup lang="ts">
import { feedPath, PUBLIC_FEED_FORMATS, type Lang, type TopicConfig } from '@pann/shared'
import { useMutation, useQueryCache } from '@pinia/colada'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogTrigger,
} from 'reka-ui'
import { ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'

const props = defineProps<{ topicId: string; config: TopicConfig; feedKey: string | null }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const FORMAT_NAMES = { xml: 'RSS', json: 'JSON Feed' } as const
const url = (lang: Lang, format: 'xml' | 'json') =>
  `${window.location.origin}${feedPath(props.feedKey!, lang, format)}`

const form = ref<TopicConfig['feed']>(structuredClone(props.config.feed))
watch(
  () => props.config.feed,
  (feed) => (form.value = structuredClone(feed)),
)

const message = ref('')
const isError = ref(false)
function fail(err: Error) {
  isError.value = true
  message.value = describeError(err.message, t).text
}
async function refresh() {
  await queryCache.invalidateQueries({ key: ['topic', props.topicId] })
}

const { mutate: setFeed, isLoading: switching } = useMutation({
  mutation: (change: { enabled: boolean; regenerate?: boolean }) =>
    api.setFeed(props.topicId, change.enabled, change.regenerate),
  async onSuccess(_, change) {
    isError.value = false
    message.value = !change.enabled
      ? t('settings.feedDisabled')
      : change.regenerate
        ? t('settings.feedRegenerated')
        : t('settings.feedEnabled')
    await refresh()
  },
  onError: fail,
})

const { mutate: save, isLoading: saving } = useMutation({
  mutation: () => api.updateConfig(props.topicId, { feed: form.value }),
  async onSuccess() {
    isError.value = false
    message.value = t('common.saved')
    await refresh()
  },
  onError: fail,
})

async function copy(lang: Lang, format: 'xml' | 'json') {
  try {
    await navigator.clipboard.writeText(url(lang, format))
    isError.value = false
    message.value = t('settings.feedCopied')
  } catch (err) {
    fail(err as Error)
  }
}
</script>

<template>
  <section class="feed" :aria-labelledby="`${id}-title`">
    <h2 :id="`${id}-title`">{{ t('settings.feed') }}</h2>
    <p class="hint">{{ t('settings.feedHint') }}</p>

    <template v-if="!feedKey">
      <p>{{ t('settings.feedOff') }}</p>
      <div>
        <button
          type="button"
          class="button"
          data-variant="primary"
          :disabled="switching"
          @click="setFeed({ enabled: true })"
        >
          {{ t('settings.feedEnable') }}
        </button>
      </div>
    </template>

    <template v-else>
      <p class="hint">{{ t('settings.feedPrivacy') }}</p>
      <h3 :id="`${id}-urls`">{{ t('settings.feedUrls') }}</h3>
      <ul class="urls" :aria-labelledby="`${id}-urls`">
        <template v-for="lang in config.output_langs" :key="lang">
          <li v-for="format in PUBLIC_FEED_FORMATS" :key="format">
            <span class="url-label">
              {{
                t('settings.feedUrl', {
                  format: FORMAT_NAMES[format],
                  lang: t(`draft.langs.${lang}`),
                })
              }}
            </span>
            <a class="url" :href="url(lang, format)" target="_blank" rel="noopener">{{
              url(lang, format)
            }}</a>
            <button
              type="button"
              class="button"
              :aria-label="
                t('settings.feedCopyLabel', {
                  format: FORMAT_NAMES[format],
                  lang: t(`draft.langs.${lang}`),
                })
              "
              @click="copy(lang, format)"
            >
              {{ t('settings.feedCopy') }}
            </button>
          </li>
        </template>
      </ul>

      <div class="row">
        <AlertDialogRoot>
          <AlertDialogTrigger as-child>
            <button type="button" class="button" :disabled="switching">
              {{ t('settings.feedRegenerate') }}
            </button>
          </AlertDialogTrigger>
          <AlertDialogPortal>
            <AlertDialogOverlay class="dialog-overlay" />
            <AlertDialogContent class="dialog">
              <AlertDialogTitle class="dialog-title">
                {{ t('settings.feedRegenerateTitle') }}
              </AlertDialogTitle>
              <AlertDialogDescription>{{
                t('settings.feedRegenerateText')
              }}</AlertDialogDescription>
              <div class="dialog-actions">
                <AlertDialogCancel class="button">{{ t('common.cancel') }}</AlertDialogCancel>
                <AlertDialogAction
                  class="button"
                  data-variant="primary"
                  @click="setFeed({ enabled: true, regenerate: true })"
                >
                  {{ t('settings.feedRegenerate') }}
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialogRoot>
        <button
          type="button"
          class="button"
          :disabled="switching"
          @click="setFeed({ enabled: false })"
        >
          {{ t('settings.feedDisable') }}
        </button>
      </div>
    </template>

    <form class="form" @submit.prevent="save()">
      <fieldset v-for="lang in config.output_langs" :key="lang" class="lang-block">
        <legend>{{ t(`draft.langs.${lang}`) }}</legend>
        <div class="form-row">
          <label :for="`${id}-title-${lang}`">
            {{ t('settings.feedTitle', { lang: t(`draft.langs.${lang}`) }) }}
          </label>
          <input
            :id="`${id}-title-${lang}`"
            v-model="form[lang === 'fr' ? 'title_fr' : 'title_en']"
            class="field"
            type="text"
            maxlength="120"
            :lang="lang"
            :aria-describedby="`${id}-title-${lang}-hint`"
          />
          <p :id="`${id}-title-${lang}-hint`" class="hint">{{ t('settings.feedTitleHint') }}</p>
        </div>
        <div class="form-row">
          <label :for="`${id}-description-${lang}`">
            {{ t('settings.feedDescription', { lang: t(`draft.langs.${lang}`) }) }}
          </label>
          <textarea
            :id="`${id}-description-${lang}`"
            v-model="form[lang === 'fr' ? 'description_fr' : 'description_en']"
            class="field"
            rows="2"
            maxlength="500"
            :lang="lang"
          ></textarea>
        </div>
      </fieldset>
      <div class="form-row">
        <label :for="`${id}-site`">{{ t('settings.feedSiteUrl') }}</label>
        <input
          :id="`${id}-site`"
          v-model.trim="form.site_url"
          class="field"
          type="url"
          inputmode="url"
          :aria-describedby="`${id}-site-hint`"
        />
        <p :id="`${id}-site-hint`" class="hint">{{ t('settings.feedSiteUrlHint') }}</p>
      </div>
      <div>
        <button type="submit" class="button" data-variant="primary" :disabled="saving">
          {{ saving ? t('common.saving') : t('common.save') }}
        </button>
      </div>
    </form>
    <p role="status" :class="{ error: isError }">{{ message }}</p>
  </section>
</template>

<style scoped>
.feed {
  display: grid;
  gap: var(--space-4);
  max-width: 40rem;
  margin-top: var(--space-8);
}

.feed h2,
.feed h3,
.feed p {
  margin: 0;
}

.feed h3 {
  font-size: 1rem;
}

.urls {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.urls li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-1) var(--space-3);
}

.url-label {
  grid-column: 1 / -1;
  font-weight: 650;
}

.url {
  overflow-wrap: anywhere;
  font-size: 0.875rem;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.form {
  display: grid;
  gap: var(--space-4);
}

.lang-block {
  display: grid;
  gap: var(--space-4);
}

.lang-block legend::first-letter {
  text-transform: uppercase;
}

textarea.field,
input.field {
  width: 100%;
}
</style>
