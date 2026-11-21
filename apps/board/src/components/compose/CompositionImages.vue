<script setup lang="ts">
/**
 * The person's own images for a composed post (4 at most), each with its text
 * alternative in every language of the topic: required to publish. The AI proposes the
 * empty ones; a proposed text is marked until the person edits it.
 */
import { MAX_ALT_LENGTH, MAX_COMPOSE_IMAGES } from '@pann/shared'
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, type CompositionMedia } from '../../lib/api'
import { describeError } from '../../lib/errors'
import { ImageError, prepareImage } from '../../lib/image'
import { contentLangName } from '../../lib/langs'
import { toast } from '../../lib/toast'
import Icon from '../Icon.vue'

const props = defineProps<{
  topicId: string
  compositionId: string
  media: CompositionMedia[]
  langs: string[]
  readonly?: boolean
}>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const id = useId()

const input = ref<HTMLInputElement>()
const uploading = ref(false)
const message = ref('')
const isError = ref(false)
/** Texts being edited, per image and language (saved with the image's button). */
const drafts = ref<Record<string, Record<string, string>>>({})

const textOf = (media: CompositionMedia, lang: string) =>
  drafts.value[media.id]?.[lang] ?? media.alt[lang] ?? ''
function edit(media: CompositionMedia, lang: string, value: string) {
  drafts.value = { ...drafts.value, [media.id]: { ...drafts.value[media.id], [lang]: value } }
}
const dirty = (media: CompositionMedia) =>
  Object.entries(drafts.value[media.id] ?? {}).some(([lang, v]) => v !== (media.alt[lang] ?? ''))

async function add(event: Event) {
  const files = [...((event.target as HTMLInputElement).files ?? [])]
  if (!files.length) return
  const room = MAX_COMPOSE_IMAGES - props.media.length
  uploading.value = true
  message.value = ''
  isError.value = false
  try {
    for (const file of files.slice(0, room)) {
      const image = await prepareImage(file)
      const path = `${props.topicId}/${props.compositionId}/${crypto.randomUUID()}.jpg`
      await api.uploadCompositionImage(path, image.blob, image.mime)
      await api.addCompositionMedia(props.topicId, props.compositionId, {
        storage_path: path,
        mime: image.mime,
        bytes: image.blob.size,
        width: image.width,
        height: image.height,
      })
    }
    message.value =
      files.length > room ? t('compose.images.tooMany', { max: MAX_COMPOSE_IMAGES }) : ''
    isError.value = files.length > room
    toast(t('compose.images.added', Math.min(files.length, room)))
    emit('changed')
  } catch (err) {
    isError.value = true
    message.value =
      err instanceof ImageError
        ? t(`compose.images.errors.${err.code}`)
        : describeError((err as Error).message, t).text
  } finally {
    uploading.value = false
    if (input.value) input.value.value = ''
  }
}

async function save(media: CompositionMedia) {
  const alt = { ...media.alt, ...drafts.value[media.id] }
  // An edited text is the person's own: it is no longer marked as proposed.
  const edited = Object.keys(drafts.value[media.id] ?? {})
  try {
    await api.updateCompositionMedia(props.topicId, props.compositionId, media.id, {
      alt,
      alt_proposed: media.alt_proposed.filter((lang) => !edited.includes(lang)),
    })
    const { [media.id]: _, ...rest } = drafts.value
    drafts.value = rest
    toast(t('common.saved'))
    emit('changed')
  } catch (err) {
    isError.value = true
    message.value = describeError((err as Error).message, t).text
  }
}

async function propose(media: CompositionMedia) {
  await api.describeCompositionMedia(props.topicId, props.compositionId, media.id)
  emit('changed')
}

async function remove(media: CompositionMedia) {
  await api.deleteCompositionMedia(props.topicId, props.compositionId, media.id)
  toast(t('compose.images.removed'))
  emit('changed')
}
</script>

<template>
  <section class="images" :aria-labelledby="`${id}-title`">
    <h2 :id="`${id}-title`">{{ t('compose.images.title') }}</h2>
    <p class="hint">{{ t('compose.images.hint', { max: MAX_COMPOSE_IMAGES }) }}</p>

    <ul v-if="media.length" class="list">
      <li v-for="(image, index) in media" :key="image.id" class="image">
        <!-- The preview repeats what the text alternatives below describe: decorative here. -->
        <img v-if="image.preview_url" :src="image.preview_url" alt="" class="preview" />
        <form class="alts" @submit.prevent="save(image)">
          <fieldset>
            <legend>{{ t('compose.images.altLegend', { n: index + 1 }) }}</legend>
            <p v-if="image.alt_status === 'pending'" class="hint" role="status">
              {{ t('compose.images.proposing') }}
            </p>
            <p
              v-else-if="image.alt_status === 'failed' && image.alt_error"
              class="notice notice-inline"
              data-tone="danger"
            >
              <Icon name="alert-circle" />
              <span>{{ describeError(image.alt_error, t).text }}</span>
            </p>
            <div v-for="lang in langs" :key="lang" class="form-row">
              <label :for="`${id}-${image.id}-${lang}`">
                {{ t('compose.images.altLabel', { lang: contentLangName(lang) }) }}
                <span
                  v-if="image.alt_proposed.includes(lang) && !drafts[image.id]?.[lang]"
                  class="badge proposed"
                  data-tone="accent"
                  >{{ t('compose.images.proposed') }}</span
                >
              </label>
              <textarea
                :id="`${id}-${image.id}-${lang}`"
                class="field"
                rows="2"
                :lang="lang"
                :maxlength="MAX_ALT_LENGTH"
                :readonly="readonly"
                :aria-invalid="!textOf(image, lang).trim() || undefined"
                :aria-describedby="`${id}-${image.id}-hint`"
                :value="textOf(image, lang)"
                @input="edit(image, lang, ($event.target as HTMLTextAreaElement).value)"
              ></textarea>
            </div>
            <p :id="`${id}-${image.id}-hint`" class="hint">{{ t('compose.images.altHint') }}</p>
          </fieldset>
          <div v-if="!readonly" class="actions">
            <button type="submit" class="button" data-size="small" :disabled="!dirty(image)">
              {{ t('compose.images.saveAlt') }}
            </button>
            <button
              v-if="langs.some((l) => !textOf(image, l).trim())"
              type="button"
              class="button"
              data-size="small"
              :disabled="image.alt_status === 'pending'"
              @click="propose(image)"
            >
              {{ t('compose.images.propose') }}
            </button>
            <button
              type="button"
              class="button remove"
              data-size="small"
              data-variant="danger"
              :aria-label="t('compose.images.removeLabel', { n: index + 1 })"
              @click="remove(image)"
            >
              {{ t('compose.images.remove') }}
            </button>
          </div>
        </form>
      </li>
    </ul>

    <div v-if="!readonly && media.length < MAX_COMPOSE_IMAGES" class="form-row">
      <label :for="`${id}-file`">{{ t('compose.images.add') }}</label>
      <input
        :id="`${id}-file`"
        ref="input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        :disabled="uploading"
        :aria-describedby="`${id}-file-hint`"
        @change="add"
      />
      <p :id="`${id}-file-hint`" class="hint">{{ t('compose.images.addHint') }}</p>
    </div>
    <p v-if="uploading" role="status">{{ t('compose.images.uploading') }}</p>
    <p role="status" class="message" :class="{ error: isError }">{{ message }}</p>
  </section>
</template>

<style scoped>
.images {
  display: grid;
  gap: var(--space-4);
}

.images h2,
.images p {
  margin: 0;
}

/* The intro right under the title. */
.images > h2 + .hint {
  margin-top: calc(-1 * var(--space-2));
}

.message:empty {
  position: absolute;
}

/* The native file button, drawn like a small secondary button. */
input[type='file'] {
  font: inherit;
  font-size: 0.875rem;
}

input[type='file']::file-selector-button {
  min-height: 2.25rem;
  margin-inline-end: var(--space-3);
  padding: var(--space-1) var(--space-4);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

input[type='file']::file-selector-button:hover {
  border-color: var(--color-text);
}

.list {
  display: grid;
  gap: var(--space-5);
  margin: 0;
  padding: 0;
  list-style: none;
}

.image {
  display: grid;
  gap: var(--space-4);
  align-items: start;
}

/* Wide: a narrower preview, the texts and their actions get the room. */
@media (min-width: 40rem) {
  .image {
    grid-template-columns: minmax(0, 15rem) minmax(0, 1fr);
  }
}

.preview {
  width: 100%;
  max-height: 18rem;
  object-fit: contain;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background: var(--color-surface-2);
}

.alts,
.alts fieldset {
  display: grid;
  gap: var(--space-3);
}

.alts legend {
  float: left;
  width: 100%;
  padding: 0;
  font-size: 1rem;
}

.alts fieldset {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
}

.field {
  width: 100%;
  resize: vertical;
}

.proposed {
  margin-inline-start: var(--space-2);
  vertical-align: 0.1em;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

/* Removing the image comes last, apart from the text actions. */
.actions .remove {
  margin-inline-start: auto;
}
</style>
