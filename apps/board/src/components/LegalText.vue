<script setup lang="ts">
/**
 * A sentence of a legal page, with its inline links ([label](/path)): pages of Glimr open
 * in the app, e-mail and outside addresses as plain links. No HTML from the content.
 */
import { computed } from 'vue'

const props = defineProps<{ text: string }>()

type Part = { text: string } | { text: string; href: string }
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

const parts = computed<Part[]>(() => {
  const out: Part[] = []
  let last = 0
  for (const match of props.text.matchAll(LINK)) {
    if (match.index > last) out.push({ text: props.text.slice(last, match.index) })
    out.push({ text: match[1]!, href: match[2]! })
    last = match.index + match[0].length
  }
  if (last < props.text.length) out.push({ text: props.text.slice(last) })
  return out
})
const internal = (href: string) => href.startsWith('/') && !href.startsWith('//')
</script>

<template>
  <template v-for="(part, i) in parts" :key="i">
    <template v-if="!('href' in part)">{{ part.text }}</template>
    <RouterLink v-else-if="internal(part.href)" :to="part.href">{{ part.text }}</RouterLink>
    <a v-else :href="part.href">{{ part.text }}</a>
  </template>
</template>
