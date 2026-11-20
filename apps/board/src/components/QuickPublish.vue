<script setup lang="ts">
/**
 * Diffusion within thumb's reach on small screens: once the page is scrolled a little,
 * a floating island offers "schedule on the next slot" and "publish now" as icon
 * buttons, so a long item (summaries, posts) need not be read to the end to publish it.
 * Either opens a drawer, grown from the island, that asks to confirm. The island hides
 * while the diffusion section itself is on screen: its buttons are then right there.
 */
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'

type When = 'next_slot' | 'now'

const props = defineProps<{
  /** Posts to queue: offers "schedule". */
  canSchedule: boolean
  /** Only failed posts to queue again. */
  retry: boolean
  canPublishNow: boolean
  busy: boolean
  /** The diffusion section: the island hides while it is on screen. */
  target: HTMLElement | null
  /** Where focus goes when the island is gone after an action. */
  fallbackFocus: HTMLElement | null
}>()
const emit = defineEmits<{ confirm: [when: When] }>()
const { t } = useI18n()

/** Scrolled past the top of the page: below it, the island would cover the item. */
const SCROLLED_PX = 240
const scrolled = ref(false)
const targetInView = ref(false)
const action = ref<When | null>(null)
const open = ref(false)
const shown = computed(
  () => (props.canSchedule || props.canPublishNow) && scrolled.value && !targetInView.value,
)

const onScroll = () => (scrolled.value = window.scrollY > SCROLLED_PX)
let observer: IntersectionObserver | undefined
onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})
watch(
  () => props.target,
  (el) => {
    observer?.disconnect()
    targetInView.value = false
    if (!el) return
    observer = new IntersectionObserver(([entry]) => (targetInView.value = !!entry?.isIntersecting))
    observer.observe(el)
  },
  { immediate: true },
)
// While shown, the page keeps focused fields and toasts clear of it (styles below).
watch(shown, (value) => document.documentElement.toggleAttribute('data-island', value))
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  observer?.disconnect()
  document.documentElement.removeAttribute('data-island')
})

/** The island becomes the drawer and back (View Transitions), unless motion is reduced. */
function morph(change: () => void) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduce) return change()
  document.startViewTransition(async () => {
    change()
    await nextTick()
  })
}

function ask(when: When) {
  if (props.busy) return
  morph(() => {
    action.value = when
    open.value = true
  })
}
function setOpen(value: boolean) {
  if (!value) morph(() => (open.value = false))
}

/**
 * Once confirmed, the button that opened the drawer may go (posts queued: no more
 * "schedule"). When the action is over, focus moves to what is left of the island, or,
 * the island gone, to the diffusion heading, by the outcome.
 */
const island = ref<HTMLElement | null>(null)
let refocus = false
function confirm() {
  if (!action.value) return
  refocus = true
  emit('confirm', action.value)
}
watch(
  () => [props.busy, props.canSchedule, props.canPublishNow],
  async () => {
    if (!refocus || props.busy) return
    await nextTick()
    const active = document.activeElement
    if (active && active !== document.body && active.isConnected) return
    refocus = false
    const left = island.value?.querySelector<HTMLElement>('button')
    if (left) left.focus()
    else props.fallbackFocus?.focus({ preventScroll: true })
  },
  { flush: 'post' },
)

const title = computed(() =>
  action.value === 'now'
    ? t('diffusion.confirmNowTitle')
    : props.retry
      ? t('diffusion.confirmRetryTitle')
      : t('diffusion.confirmScheduleTitle'),
)
const text = computed(() =>
  action.value === 'now' ? t('diffusion.confirmNowText') : t('diffusion.confirmScheduleText'),
)
const confirmLabel = computed(() =>
  action.value === 'now' ? t('diffusion.publishNow') : t('diffusion.confirmSchedule'),
)
</script>

<template>
  <div
    v-if="shown"
    ref="island"
    class="island"
    role="group"
    :aria-label="t('diffusion.quickLabel')"
    :data-open="open || undefined"
  >
    <button
      v-if="canSchedule"
      type="button"
      class="island-button"
      data-quick="next_slot"
      :aria-label="retry ? t('diffusion.retry') : t('diffusion.schedule')"
      :aria-disabled="busy || undefined"
      @click="ask('next_slot')"
    >
      <Icon name="calendar" :size="22" />
    </button>
    <button
      v-if="canPublishNow"
      type="button"
      class="island-button"
      data-variant="primary"
      data-quick="now"
      :aria-label="t('diffusion.publishNow')"
      :aria-disabled="busy || undefined"
      @click="ask('now')"
    >
      <Icon name="send" :size="22" />
    </button>
  </div>

  <AlertDialogRoot :open="open" @update:open="setOpen">
    <AlertDialogPortal>
      <AlertDialogOverlay class="dialog-overlay" />
      <AlertDialogContent class="drawer">
        <AlertDialogTitle class="dialog-title">{{ title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ text }}</AlertDialogDescription>
        <div class="drawer-actions">
          <AlertDialogAction class="button" data-variant="primary" @click="confirm">
            <Icon :name="action === 'now' ? 'send' : 'calendar'" :size="18" />
            {{ confirmLabel }}
          </AlertDialogAction>
          <AlertDialogCancel class="button">{{ t('common.cancel') }}</AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>

<style scoped>
/* Small screens only: on wider ones the diffusion buttons stay where they are. */
.island {
  display: none;
}

@media (max-width: 40rem) {
  .island {
    position: fixed;
    bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
    left: 50%;
    z-index: 20;
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--color-border-subtle);
    border-radius: 999px;
    background: var(--color-surface);
    box-shadow: var(--shadow-raised);
    transform: translateX(-50%);
    view-transition-name: quick-publish;
    animation: island-in 0.2s ease-out;
  }

  /* The drawer takes its place (and its transition name). Still focusable, unlike
     hidden: focus comes back to it once the drawer closes. */
  .island[data-open] {
    opacity: 0;
    pointer-events: none;
    view-transition-name: none;
  }
}

.island-button {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}

.island-button[data-variant='primary'] {
  border-color: var(--color-accent-fill);
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
}

.island-button[aria-disabled='true'] {
  opacity: 0.6;
  cursor: progress;
}

.island-button:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

@keyframes island-in {
  from {
    opacity: 0;
    transform: translate(-50%, 1rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .island {
    animation: none;
  }
}

@media (forced-colors: active) {
  .island,
  .island-button {
    border: 2px solid ButtonText;
  }
}
</style>

<style>
/* Teleported out of the component: not scoped. A sheet at the bottom of the screen. */
.drawer {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 50;
  display: grid;
  gap: var(--space-3);
  max-height: 85vh;
  overflow-y: auto;
  padding: var(--space-6) var(--space-5) calc(var(--space-5) + env(safe-area-inset-bottom, 0px));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 -10px 40px rgb(0 0 0 / 0.25);
  view-transition-name: quick-publish;
}

.drawer .dialog-title,
.drawer p {
  margin: 0;
}

/* Full-width buttons, the confirmation first, within thumb's reach. */
.drawer-actions {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.drawer-actions .button {
  justify-content: center;
}

/* Focused fields scroll clear of the island; toasts sit above it. */
@media (max-width: 40rem) {
  :root[data-island] {
    scroll-padding-bottom: 6rem;
  }

  :root[data-island] .toaster {
    bottom: calc(var(--space-4) + 5rem + env(safe-area-inset-bottom, 0px));
  }
}

::view-transition-group(quick-publish) {
  animation-duration: 0.3s;
  animation-timing-function: cubic-bezier(0.2, 0.7, 0.2, 1);
}
</style>
