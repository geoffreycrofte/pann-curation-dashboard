<script setup lang="ts">
/**
 * A sentence of a legal page, with its inline links ([label](/path)): pages of Glimr open
 * in the app, outside addresses as plain links, {email} as the protected contact address.
 * No HTML from the content.
 */
import { computed } from 'vue'
import ProtectedEmail from './ProtectedEmail.vue'

const props = defineProps<{ text: string }>()

type Part = { text: string } | { text: string; href: string } | { email: true }
const TOKEN = /\[([^\]]+)\]\(([^)\s]+)\)|\{email\}/g

const parts = computed<Part[]>(() => {
  const out: Part[] = []
  let last = 0
  for (const match of props.text.matchAll(TOKEN)) {
    if (match.index > last) out.push({ text: props.text.slice(last, match.index) })
    out.push(match[0] === '{email}' ? { email: true } : { text: match[1]!, href: match[2]! })
    last = match.index + match[0].length
  }
  if (last < props.text.length) out.push({ text: props.text.slice(last) })
  return out
})
const internal = (href: string) => href.startsWith('/') && !href.startsWith('//')
</script>

<template>
  <template v-for="(part, i) in parts" :key="i">
    <ProtectedEmail v-if="'email' in part" />
    <template v-else-if="!('href' in part)">{{ part.text }}</template>
    <RouterLink v-else-if="internal(part.href)" :to="part.href">{{ part.text }}</RouterLink>
    <a v-else :href="part.href">{{ part.text }}</a>
  </template>
</template>
