<script setup lang="ts">
import type { Illustration } from '../lib/landing-images'

/** An illustration on its sand plate: it blends into sand sections and frames itself elsewhere. */
defineProps<{ image: Illustration; alt: string; sizes: string; eager?: boolean }>()
</script>

<template>
  <div class="plate">
    <img
      :src="image.src"
      :srcset="image.srcset"
      :sizes="sizes"
      :width="image.width"
      :height="image.height"
      :alt="alt"
      :loading="eager ? 'eager' : 'lazy'"
      :fetchpriority="eager ? 'high' : undefined"
      decoding="async"
    />
    <slot />
  </div>
</template>

<style scoped>
.plate {
  position: relative;
  overflow: hidden;
  border-radius: 2.5rem;
  background: var(--color-plate);
}

/* Soft edges: the background of each scene melts into the plate (and into sand sections). */
img {
  display: block;
  width: 100%;
  height: auto;
  mask:
    linear-gradient(to right, transparent, #000 7%, #000 93%, transparent),
    linear-gradient(to bottom, transparent, #000 7%, #000 93%, transparent);
  mask-composite: intersect;
}
</style>
