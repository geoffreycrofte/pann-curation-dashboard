<script setup lang="ts">
/**
 * The prospector of the public page, with the nugget catching the light and grains of
 * gold falling into his pan. Shared by the public page and the creation of a topic,
 * the one place of the board where the gold-panning metaphor lives. The decorations are
 * placed on the picture itself; still when motion is reduced.
 */
import LandingFigure from './LandingFigure.vue'
import { ILLUSTRATIONS } from '../lib/landing-images'

defineProps<{ alt: string; sizes: string; onScene?: boolean; eager?: boolean }>()
</script>

<template>
  <LandingFigure
    :image="ILLUSTRATIONS.hero"
    :on-scene="onScene"
    :alt="alt"
    :sizes="sizes"
    :eager="eager"
  >
    <span class="sparkle" aria-hidden="true"></span>
    <span class="grains" aria-hidden="true"><i></i><i></i><i></i></span>
  </LandingFigure>
</template>

<style scoped>
/* The nugget catches the light; grains of sand fall from the rim of the pan. */
.sparkle {
  position: absolute;
  top: 53.5%;
  left: 63.5%;
  width: 9%;
  aspect-ratio: 1;
  background:
    radial-gradient(circle, #fff 0 12%, transparent 13%),
    conic-gradient(
      from 45deg,
      transparent 0 20deg,
      rgb(255 255 255 / 0.95) 45deg,
      transparent 70deg 110deg,
      rgb(255 255 255 / 0.95) 135deg,
      transparent 160deg 200deg,
      rgb(255 255 255 / 0.95) 225deg,
      transparent 250deg 290deg,
      rgb(255 255 255 / 0.95) 315deg,
      transparent 340deg
    );
  border-radius: 50%;
  mask: radial-gradient(circle, #000 35%, transparent 70%);
  opacity: 0;
  animation: twinkle 3.2s ease-in-out 0.6s infinite;
}

.grains {
  position: absolute;
  top: 63.5%;
  left: 69%;
  width: 6%;
  height: 10%;
}

.grains i {
  position: absolute;
  top: 0;
  width: 0.3rem;
  aspect-ratio: 1;
  border-radius: 50%;
  background: #b98f4e;
  opacity: 0;
  animation: fall 2.4s ease-in infinite;
}

.grains i:nth-child(1) {
  left: 10%;
}

.grains i:nth-child(2) {
  left: 45%;
  animation-delay: 0.8s;
}

.grains i:nth-child(3) {
  left: 75%;
  animation-delay: 1.6s;
}

@keyframes twinkle {
  0%,
  55%,
  100% {
    opacity: 0;
    transform: scale(0.4) rotate(0deg);
  }

  70% {
    opacity: 1;
    transform: scale(1) rotate(25deg);
  }
}

@keyframes fall {
  0% {
    opacity: 0;
    transform: translateY(0);
  }

  15% {
    opacity: 0.9;
  }

  100% {
    opacity: 0;
    transform: translateY(5rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sparkle,
  .grains {
    animation: none;
  }

  .grains {
    display: none;
  }
}
</style>
