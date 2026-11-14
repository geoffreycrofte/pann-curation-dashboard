<script setup lang="ts">
/**
 * Pann mark: the faceted gold nugget on its own, with a sparkle.
 * Transparent, so it sits on any background; the sparkle takes the text
 * colour (`currentColor`), which keeps it visible in light and dark modes.
 * Sources and exports: docs/brand/logo/.
 */
defineProps<{ size?: number }>()
</script>

<template>
  <svg
    class="pann-mark"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    :width="size ?? 40"
    :height="size ?? 40"
    aria-hidden="true"
    focusable="false"
  >
    <g transform="translate(32 32) scale(1.3) translate(-33.5 -30)">
      <path d="M18 34 L22 22 L32 16 L44 19 L49 30 L45 40 L33 44 L22 42 Z" fill="#FFC72C" />
      <path d="M22 22 L32 16 L34 27 L25 30 Z" fill="#FFE38A" />
      <path d="M32 16 L44 19 L41 28 L34 27 Z" fill="#FFD75A" />
      <path d="M44 19 L49 30 L45 40 L41 28 Z" fill="#E0A100" />
      <path d="M41 28 L45 40 L33 44 Z" fill="#C98A00" />
      <path d="M18 34 L25 30 L22 42 Z" fill="#F2B400" />
    </g>
    <path
      d="M54 3 L55.5 7.5 L60 9 L55.5 10.5 L54 15 L52.5 10.5 L48 9 L52.5 7.5 Z"
      fill="currentColor"
    />
  </svg>
</template>
