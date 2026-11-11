<script setup lang="ts">
import { computed } from 'vue'
import type { Scene } from '../lib/landing-images'
import { isDark } from '../lib/theme'

/**
 * An illustration. On a section painted with the scene's own background (`onScene`,
 * light theme), the whole scene is shown and melts into it; elsewhere (dark theme, ink,
 * gold or olive sections) the cut-out stands on the section with a soft shadow.
 */
const props = defineProps<{
  image: Scene
  alt: string
  sizes: string
  onScene?: boolean
  eager?: boolean
}>()

const cut = computed(() => !props.onScene || isDark())
const picture = computed(() => (cut.value ? props.image.cut : props.image.scene))
</script>

<template>
  <div class="figure" :data-variant="cut ? 'cut' : 'scene'">
    <!-- The frame hugs the picture: decorations in the slot are placed on it. -->
    <div class="frame">
      <img
        :key="picture.src"
        :src="picture.src"
        :srcset="picture.srcset"
        :sizes="sizes"
        :width="picture.width"
        :height="picture.height"
        :alt="alt"
        :loading="eager ? 'eager' : 'lazy'"
        :fetchpriority="eager ? 'high' : undefined"
        decoding="async"
      />
      <slot />
    </div>
  </div>
</template>

<style scoped>
.frame {
  position: relative;
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
}

[data-variant='scene'] .frame {
  width: 100%;
}

img {
  display: block;
  width: 100%;
  height: auto;
}

/* The scene's background is the section's: soft edges hide its slight vignette. */
[data-variant='scene'] img {
  mask:
    linear-gradient(to right, transparent, #000 12%, #000 88%, transparent),
    linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent);
  mask-composite: intersect;
}

/* Cut-out: the ground shadow went with the background, a drop shadow replaces it. */
[data-variant='cut'] img {
  width: auto;
  max-width: 100%;
  max-height: var(--cut-max-height, 28rem);
  margin-inline: auto;
  filter: drop-shadow(0 1.25rem 1.5rem rgb(0 0 0 / 0.35));
}
</style>
