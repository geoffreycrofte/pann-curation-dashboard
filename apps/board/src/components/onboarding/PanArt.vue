<script setup lang="ts">
/**
 * Illustration of the topic creation: the gold pan of the public page, where it is
 * empty, fills as the person answers. Each answer drops a flake; at the summary, the
 * flakes melt into the nugget of the logo (the topic is born). Decorative only: the
 * progress is also given in words, in the header.
 */
import { computed } from 'vue'

const props = defineProps<{ progress: number; complete?: boolean }>()

/** Where the flakes settle, the first ones nearest the center of the floor. */
const FLAKES = [
  { x: 214, y: 170, r: 12, s: 1.1 },
  { x: 196, y: 176, r: -28, s: 0.9 },
  { x: 230, y: 180, r: 40, s: 0.8 },
  { x: 184, y: 162, r: 70, s: 0.75 },
  { x: 244, y: 166, r: -10, s: 0.95 },
  { x: 208, y: 188, r: 95, s: 0.7 },
  { x: 168, y: 176, r: -60, s: 0.8 },
  { x: 258, y: 182, r: 25, s: 0.7 },
  { x: 226, y: 156, r: -45, s: 0.65 },
  { x: 190, y: 194, r: 15, s: 0.85 },
  { x: 154, y: 166, r: 110, s: 0.6 },
  { x: 272, y: 170, r: -80, s: 0.65 },
]
const shown = computed(() => Math.round(Math.max(0, Math.min(1, props.progress)) * FLAKES.length))
</script>

<template>
  <svg
    class="pan-art"
    :data-complete="complete || undefined"
    viewBox="0 0 400 300"
    aria-hidden="true"
    focusable="false"
  >
    <ellipse class="shadow" cx="204" cy="262" rx="176" ry="26" />
    <!-- Side wall, then rim, inner wall and floor: a pan seen from above, slightly tilted. -->
    <path class="wall" d="M22 144 C30 210 96 254 204 254 C312 254 378 210 386 144 Z" />
    <ellipse class="rim" cx="204" cy="144" rx="182" ry="80" />
    <ellipse class="inner" cx="204" cy="150" rx="164" ry="70" />
    <ellipse class="floor" cx="210" cy="174" rx="100" ry="40" />
    <g class="riffles">
      <path d="M153.4 89.7 A148 62 0 0 0 108.9 195.5" />
      <path d="M157.5 97.4 A136 57 0 0 0 116.6 194.7" />
      <path d="M161.6 105.1 A124 52 0 0 0 124.3 193.8" />
      <path d="M165.7 112.8 A112 47 0 0 0 132.0 193.0" />
    </g>
    <path class="sheen" d="M92 98 C130 76 190 68 248 72" />

    <g class="flakes">
      <g
        v-for="(flake, index) in FLAKES"
        :key="index"
        class="flake"
        :data-on="index < shown || undefined"
        :style="{
          '--x': `${flake.x}px`,
          '--y': `${flake.y}px`,
          '--delay': `${(index % 3) * 60}ms`,
        }"
      >
        <g :transform="`rotate(${flake.r}) scale(${flake.s})`">
          <path d="M-7 1 L-3 -5 L5 -4 L8 2 L2 6 L-5 5 Z" fill="#FFC72C" />
          <path d="M-3 -5 L5 -4 L1 0 Z" fill="#FFE38A" />
          <path d="M1 0 L8 2 L2 6 Z" fill="#C98A00" />
        </g>
      </g>
    </g>

    <!-- The nugget of the logo, with its sparkle: the topic is ready. -->
    <g class="nugget">
      <g transform="translate(210 168) scale(1.9) translate(-33.5 -30)">
        <path d="M18 34 L22 22 L32 16 L44 19 L49 30 L45 40 L33 44 L22 42 Z" fill="#FFC72C" />
        <path d="M22 22 L32 16 L34 27 L25 30 Z" fill="#FFE38A" />
        <path d="M32 16 L44 19 L41 28 L34 27 Z" fill="#FFD75A" />
        <path d="M44 19 L49 30 L45 40 L41 28 Z" fill="#E0A100" />
        <path d="M41 28 L45 40 L33 44 Z" fill="#C98A00" />
        <path d="M18 34 L25 30 L22 42 Z" fill="#F2B400" />
      </g>
      <path
        class="sparkle"
        d="M262 112 L265 121 L274 124 L265 127 L262 136 L259 127 L250 124 L259 121 Z"
      />
    </g>
  </svg>
</template>

<style scoped>
/* The slate of the pan on the public page, a fixed illustration palette in both themes. */
.pan-art {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.shadow {
  fill: rgb(0 0 0 / 0.12);
}

.wall {
  fill: #3c4147;
}

.rim {
  fill: #6b7178;
}

.inner {
  fill: #50565c;
}

.floor {
  fill: #454a50;
}

.riffles path {
  fill: none;
  stroke: #767c83;
  stroke-width: 4;
  stroke-linecap: round;
}

.sheen {
  fill: none;
  stroke: rgb(255 255 255 / 0.22);
  stroke-width: 5;
  stroke-linecap: round;
}

.flake {
  opacity: 0;
  transform: translate(var(--x), calc(var(--y) - 70px));
}

.flake[data-on] {
  opacity: 1;
  transform: translate(var(--x), var(--y));
}

.nugget {
  opacity: 0;
  transform: scale(0.4);
  transform-box: fill-box;
  transform-origin: center;
}

.sparkle {
  fill: var(--color-text);
}

[data-complete] .flake[data-on] {
  opacity: 0;
  transform: translate(210px, 170px) scale(0.2);
}

[data-complete] .nugget {
  opacity: 1;
  transform: none;
}

@media (prefers-reduced-motion: no-preference) {
  .flake {
    transition:
      opacity 400ms ease-out var(--delay),
      transform 700ms cubic-bezier(0.3, 1.4, 0.5, 1) var(--delay);
  }

  .nugget {
    transition:
      opacity 500ms ease-out 300ms,
      transform 700ms cubic-bezier(0.3, 1.4, 0.5, 1) 300ms;
  }
}
</style>
