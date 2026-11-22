<script setup lang="ts">
import { feedPath, PUBLIC_FEED_FORMATS, type Lang, type TopicConfig } from '@glimr/shared'
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
import { toast } from '../lib/toast'
import { contentLangName } from '../lib/langs'

const props = defineProps<{ topicId: string; config: TopicConfig; feedKey: string | null }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const FORMAT_NAMES = { xml: 'RSS', json: 'JSON Feed' } as const
const url = (lang: Lang, format: 'xml' | 'json') =>
  `${window.location.origin}${feedPath(props.feedKey!, lang, format)}`

/** Feed settings, with a text slot for each language of the topic (for v-model). */
function editable(config: TopicConfig): TopicConfig['feed'] {
  const feed = structuredClone(config.feed)
  for (const lang of config.output_langs) {
    feed.title[lang] ??= ''
    feed.description[lang] ??= ''
  }
  return feed
}
const form = ref<TopicConfig['feed']>(editable(props.config))
watch(
  () => props.config,
  (config) => (form.value = editable(config)),
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
    message.value = ''
    toast(t('common.saved'))
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
  <div class="section-stack feed">
    <section class="section-card" :aria-labelledby="`${id}-title`">
      <h2 :id="`${id}-title`" class="section-title">{{ t('settings.feed') }}</h2>
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
                    lang: contentLangName(lang),
                  })
                }}
              </span>
              <a class="url" :href="url(lang, format)" target="_blank" rel="noopener">{{
                url(lang, format)
              }}</a>
              <button
                type="button"
                class="button"
                data-size="small"
                :aria-label="
                  t('settings.feedCopyLabel', {
                    format: FORMAT_NAMES[format],
                    lang: contentLangName(lang),
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
              <button type="button" class="button" data-size="small" :disabled="switching">
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
            data-size="small"
            data-variant="danger"
            :disabled="switching"
            @click="setFeed({ enabled: false })"
          >
            {{ t('settings.feedDisable') }}
          </button>
        </div>
      </template>
    </section>

    <form class="section-card" :aria-labelledby="`${id}-details`" @submit.prevent="save()">
      <h2 :id="`${id}-details`" class="section-title">{{ t('settings.feedDetails') }}</h2>
      <fieldset v-for="lang in config.output_langs" :key="lang" class="subsection lang-block">
        <legend class="subsection-title">{{ contentLangName(lang) }}</legend>
        <div class="form-row">
          <label :for="`${id}-title-${lang}`">
            {{ t('settings.feedTitle', { lang: contentLangName(lang) }) }}
          </label>
          <input
            :id="`${id}-title-${lang}`"
            v-model="form.title[lang]"
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
            {{ t('settings.feedDescription', { lang: contentLangName(lang) }) }}
          </label>
          <textarea
            :id="`${id}-description-${lang}`"
            v-model="form.description[lang]"
            class="field"
            rows="2"
            maxlength="500"
            :lang="lang"
          ></textarea>
        </div>
      </fieldset>
      <div class="form-row subsection">
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
      <div class="section-actions">
        <button type="submit" class="button" data-variant="primary" :disabled="saving">
          {{ saving ? t('common.saving') : t('common.save') }}
        </button>
      </div>
    </form>
    <p role="status" :class="{ error: isError }">{{ message }}</p>
  </div>
</template>

<style scoped>
.feed h3,
.feed p {
  margin: 0;
}

.feed p:empty {
  display: none;
}

.feed h3 {
  font-size: 1rem;
}

/* The addresses as a bordered list: name and address, Copy on the right. */
.urls {
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  list-style: none;
}

.urls li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0 var(--space-3);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
}

.urls li + li {
  border-top: 1px solid var(--color-border-subtle);
}

.urls .button {
  grid-row: 1 / 3;
  grid-column: 2;
}

.url-label {
  grid-column: 1;
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

.lang-block legend::first-letter {
  text-transform: uppercase;
}

textarea.field,
input.field {
  width: 100%;
}
</style>
