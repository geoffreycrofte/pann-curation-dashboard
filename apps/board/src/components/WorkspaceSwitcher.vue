<script setup lang="ts">
/**
 * Choice of the current workspace, at the top of the menu, for a person who belongs to
 * several (a team they were invited to). Hidden with a single workspace. Switching shows
 * that workspace's Today page.
 */
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { setCurrentWorkspace, useWorkspace } from '../lib/workspace'

const { t } = useI18n()
const id = useId()
const router = useRouter()
const { workspaces, workspaceId } = useWorkspace()

function pick(event: Event) {
  setCurrentWorkspace((event.target as HTMLSelectElement).value)
  void router.push({ name: 'home' })
}
</script>

<template>
  <div v-if="workspaces.length > 1" class="switcher">
    <label :for="id" class="switcher-label">{{ t('nav.workspace') }}</label>
    <select :id="id" class="switcher-select" :value="workspaceId" @change="pick">
      <option v-for="m in workspaces" :key="m.workspace.id" :value="m.workspace.id">
        {{ m.workspace.name }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.switcher {
  display: grid;
  gap: var(--space-1);
  margin: var(--space-4) 0 0;
  padding: 0 var(--space-3);
}

.switcher-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-on-ink-muted);
}

/* On the ink of the menu: its own colours, a visible edge, 44 px tall. */
.switcher-select {
  min-height: 2.75rem;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-on-ink-muted);
  border-radius: var(--radius);
  background: var(--color-ink);
  color: var(--color-on-ink);
  font: inherit;
  font-weight: 650;
}

.switcher-select:focus-visible {
  outline: 2px solid var(--color-focus-on-ink);
  outline-offset: 2px;
}
</style>
