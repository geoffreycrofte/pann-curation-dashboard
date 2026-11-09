<script setup lang="ts">
import { LANGS, type Lang } from '@pann/shared'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { setLang } from '../i18n'
import { session } from '../lib/session'
import { supabase } from '../lib/supabase'
import { isDark, setTheme } from '../lib/theme'

/** Foot of the sidebar: who is signed in, and a menu with the account controls. */
const { t, locale } = useI18n()
const router = useRouter()

const email = computed(() => session.value?.user.email ?? '')
/** Name set in the profile, else the email. */
const name = computed(
  () => (session.value?.user.user_metadata?.full_name as string | undefined)?.trim() || email.value,
)
const initial = computed(() => name.value.trim().charAt(0).toUpperCase() || '?')

const lang = computed({
  get: () => locale.value as Lang,
  set: (value: Lang) => setLang(value),
})

async function signOut() {
  await supabase.auth.signOut()
  await router.push({ name: 'login' })
}
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <button type="button" class="account">
        <span class="avatar" aria-hidden="true">{{ initial }}</span>
        <span class="who">
          <span class="visually-hidden">{{ t('nav.accountMenu') }} :</span>
          <span class="name">{{ name }}</span>
          <span v-if="name !== email" class="email">{{ email }}</span>
        </span>
        <svg class="chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" />
        </svg>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="menu account-menu" side="top" align="start" :side-offset="8">
        <DropdownMenuItem as-child class="menu-item">
          <RouterLink :to="{ name: 'profile' }">{{ t('nav.profile') }}</RouterLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator class="menu-separator" />
        <DropdownMenuCheckboxItem
          class="menu-item menu-check"
          :model-value="isDark()"
          @update:model-value="(dark) => setTheme(dark ? 'dark' : 'light')"
        >
          <DropdownMenuItemIndicator class="indicator">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3 8.5l3.5 3.5L13 5" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </DropdownMenuItemIndicator>
          {{ t('theme.dark') }}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator class="menu-separator" />
        <DropdownMenuLabel class="menu-label">{{ t('lang.label') }}</DropdownMenuLabel>
        <DropdownMenuRadioGroup v-model="lang">
          <DropdownMenuRadioItem
            v-for="value in LANGS"
            :key="value"
            :value="value"
            class="menu-item menu-check"
            :lang="value"
          >
            <DropdownMenuItemIndicator class="indicator">
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <circle cx="8" cy="8" r="3.5" fill="currentColor" />
              </svg>
            </DropdownMenuItemIndicator>
            {{ t(`lang.${value}`) }}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator class="menu-separator" />
        <DropdownMenuItem class="menu-item" @select="signOut">
          {{ t('auth.signOut') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style scoped>
.account {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 3.25rem;
  padding: var(--space-2) var(--space-3);
  border: 1px solid rgb(255 255 255 / 0.14);
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-on-ink);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.account:hover,
.account[data-state='open'] {
  background: rgb(255 255 255 / 0.06);
}

.avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: var(--color-accent-fill);
  color: var(--color-on-accent);
  font-weight: 800;
}

.who {
  display: grid;
  flex: 1;
  min-width: 0;
}

.name {
  overflow: hidden;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.email {
  overflow: hidden;
  font-size: 0.8125rem;
  color: var(--color-on-ink-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Points up while closed (the menu opens above), down while open. */
.chevron {
  flex: none;
  transition: transform 0.2s;
}

.account[data-state='open'] .chevron {
  transform: rotate(180deg);
}
</style>
