<script setup lang="ts">
/**
 * Help kept out of the way: a (?) button beside a label opens the text in a bubble. A
 * button, not a hover tooltip, so it works with a click, a tap and the keyboard; Escape
 * closes it and focus goes back to the button. Its name says which field it explains.
 */
import { PopoverArrow, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'

defineProps<{ label: string; text: string }>()
const { t } = useI18n()
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger class="icon-button help-tip" :aria-label="t('common.helpFor', { label })">
      <Icon name="help" :size="16" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="help-bubble" side="top" :side-offset="6" :collision-padding="16">
        {{ text }}
        <PopoverArrow class="help-arrow" :width="12" :height="6" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style>
/* Unscoped: the bubble is rendered in a portal, outside the component. */
.help-tip.icon-button {
  width: 1.75rem;
  height: 1.75rem;
  vertical-align: middle;
}

.help-bubble {
  z-index: 50;
  max-width: min(22rem, calc(100vw - 2rem));
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
  color: var(--color-text);
  font-size: 0.875rem;
  line-height: 1.5;
}

.help-arrow {
  fill: var(--color-surface);
}
</style>
