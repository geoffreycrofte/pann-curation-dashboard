<script setup lang="ts">
/**
 * Full screen while the Stripe page is being prepared (a few seconds): what is happening,
 * then the browser leaves for Stripe. On failure, the reason and two ways out. A modal
 * dialog: focus stays inside, Escape closes it only once the wait is over.
 */
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { useI18n } from 'vue-i18n'
import GlimrMark from './GlimrMark.vue'
import Icon from './Icon.vue'

const props = defineProps<{
  open: boolean
  kind: 'checkout' | 'portal'
  /** The reason, once it failed; null while it is being prepared. */
  error: string | null
}>()
const emit = defineEmits<{ retry: []; close: [] }>()
const { t } = useI18n()

function onOpenChange(value: boolean) {
  if (!value && props.error) emit('close')
}
</script>

<template>
  <DialogRoot :open="open" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="billing-overlay" />
      <DialogContent
        class="billing-screen"
        @escape-key-down="(e) => !error && e.preventDefault()"
        @pointer-down-outside="(e) => e.preventDefault()"
        @interact-outside="(e) => e.preventDefault()"
      >
        <GlimrMark :size="56" />
        <template v-if="!error">
          <span class="spinner" aria-hidden="true"></span>
          <DialogTitle class="billing-title">{{ t(`billing.wait.${kind}.title`) }}</DialogTitle>
          <DialogDescription class="billing-text" role="status">
            {{ t(`billing.wait.${kind}.text`) }}
          </DialogDescription>
        </template>
        <template v-else>
          <DialogTitle class="billing-title">{{ t('billing.wait.failed') }}</DialogTitle>
          <DialogDescription as="div">
            <p class="notice notice-inline" data-tone="danger" role="alert">
              <Icon name="alert-circle" />
              <span>{{ error }}</span>
            </p>
          </DialogDescription>
          <div class="billing-actions">
            <button type="button" class="button" data-variant="primary" @click="emit('retry')">
              {{ t('billing.wait.retry') }}
            </button>
            <button type="button" class="button" @click="emit('close')">
              {{ t('common.close') }}
            </button>
          </div>
        </template>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
/* Unscoped: rendered in a portal. */
.billing-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: var(--color-bg);
}

.billing-screen {
  position: fixed;
  inset: 0;
  z-index: 61;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--space-4);
  padding: var(--space-6);
  background: var(--color-bg);
  color: var(--color-text);
  text-align: center;
}

.billing-title {
  margin: 0;
  font-size: clamp(1.5rem, 4vw, 2rem);
}

.billing-text {
  max-width: 32rem;
  margin: 0;
  color: var(--color-text-muted);
  font-size: 1.0625rem;
}

.billing-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-3);
}

.billing-screen .notice {
  max-width: 34rem;
  margin: 0;
  text-align: start;
}

.spinner {
  width: 2.5rem;
  height: 2.5rem;
  border: 4px solid var(--color-border-subtle);
  border-top-color: var(--color-accent-fill);
  border-radius: 50%;
  animation: billing-spin 0.9s linear infinite;
}

@keyframes billing-spin {
  to {
    transform: rotate(360deg);
  }
}

/* No spinning for those who asked for less motion: the text says it all. */
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
    border-top-color: var(--color-border-subtle);
  }
}
</style>
