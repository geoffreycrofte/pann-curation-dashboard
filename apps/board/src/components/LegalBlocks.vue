<script setup lang="ts">
/** The paragraphs, lists and tables of a legal page, in order. */
import type { LegalBlock } from '../legal/types'
import LegalText from './LegalText.vue'

defineProps<{ blocks: LegalBlock[] }>()
</script>

<template>
  <template v-for="(block, i) in blocks" :key="i">
    <p v-if="'p' in block" class="legal-p"><LegalText :text="block.p" /></p>
    <ul v-else-if="'list' in block" class="legal-list">
      <li v-for="(item, j) in block.list" :key="j"><LegalText :text="item" /></li>
    </ul>
    <div v-else class="table-wrap">
      <table>
        <caption class="visually-hidden">
          {{
            block.table.caption
          }}
        </caption>
        <thead>
          <tr>
            <th v-for="head in block.table.head" :key="head" scope="col">{{ head }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, r) in block.table.rows" :key="r">
            <template v-for="(cell, c) in row" :key="c">
              <th v-if="c === 0" scope="row">{{ cell }}</th>
              <td v-else>{{ cell }}</td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>

<style scoped>
.legal-p,
.legal-list {
  margin: 0;
  line-height: 1.6;
}

.legal-list {
  display: grid;
  gap: var(--space-2);
  padding-inline-start: 1.25rem;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9375rem;
}

th,
td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
  text-align: start;
  vertical-align: top;
}

thead th {
  border-bottom-color: var(--color-border);
  font-weight: 700;
}

tbody th {
  font-weight: 650;
}
</style>
