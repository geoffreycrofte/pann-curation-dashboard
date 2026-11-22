<script setup lang="ts">
/**
 * The contact address behind a button: robots that harvest addresses find neither the
 * address nor a mailto link in the page or the code. Once revealed, the link takes focus,
 * so a screen reader reads the address at once.
 */
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { contactEmail } from '../legal/types'

const { t } = useI18n()
const email = ref<string | null>(null)
const link = ref<HTMLAnchorElement>()

async function reveal() {
  email.value = contactEmail()
  await nextTick()
  link.value?.focus()
}
</script>

<template>
  <a v-if="email" ref="link" :href="`mailto:${email}`">{{ email }}</a>
  <button v-else type="button" class="reveal" @click="reveal">{{ t('legal.showEmail') }}</button>
</template>

<style scoped>
/* Reads as a link in the sentence; it is a button, since it changes the page. */
.reveal {
  display: inline;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent-text);
  font: inherit;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
  cursor: pointer;
}

.reveal:hover {
  text-decoration-thickness: 2px;
}
</style>
