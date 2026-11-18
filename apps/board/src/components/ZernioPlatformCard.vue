<script setup lang="ts">
/**
 * LinkedIn and Facebook through Pann (Zernio in platform mode): no key to enter, the
 * person connects their accounts on Zernio's screen and comes back here. Preparing the
 * link runs as a job (Pann's key never reaches a request); the card waits for it, then
 * opens Zernio. Back with ?zernio=connected, the accounts are listed again.
 */
import { useQuery, useQueryCache } from '@pinia/colada'
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { api, type ZernioPlatformLink } from '../lib/api'
import { describeError } from '../lib/errors'
import { toast } from '../lib/toast'

const props = defineProps<{ workspaceId: string; link: ZernioPlatformLink }>()
const { t, d } = useI18n()
const id = useId()
const route = useRoute()
const router = useRouter()
const queryCache = useQueryCache()
const key = () => ['zernio-platform', props.workspaceId]

const waitingFor = ref<'connect' | 'refresh' | null>(null)
const message = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(timer))

const { data: fresh, refetch } = useQuery({
  key,
  query: () => api.zernioPlatform(props.workspaceId),
  initialData: () => props.link,
})

async function poll() {
  const { data } = await refetch()
  if (!data) return
  if (data.status === 'pending') {
    timer = setTimeout(() => void poll(), 1500)
    return
  }
  if (data.status === 'failed') {
    message.value = describeError(data.error ?? 'unexpected', t).text
    waitingFor.value = null
    return
  }
  if (waitingFor.value === 'connect' && data.connect_url) {
    // Zernio's own screen: sign in, pick the Page or organization, then back here.
    window.location.assign(data.connect_url)
    return
  }
  if (waitingFor.value === 'refresh') toast(t('zernioPlatform.refreshed'))
  waitingFor.value = null
  await queryCache.invalidateQueries({ key: ['credentials', props.workspaceId] })
}

async function connect(platform: 'linkedin' | 'facebook') {
  message.value = ''
  waitingFor.value = 'connect'
  try {
    await api.connectZernioPlatform(props.workspaceId, platform)
    void poll()
  } catch (err) {
    waitingFor.value = null
    message.value = describeError((err as Error).message, t).text
  }
}

async function refresh() {
  message.value = ''
  waitingFor.value = 'refresh'
  try {
    await api.refreshZernioPlatform(props.workspaceId)
    void poll()
  } catch (err) {
    waitingFor.value = null
    message.value = describeError((err as Error).message, t).text
  }
}

// Back from Zernio: list the accounts again (or say what went wrong), then clean the URL.
onMounted(() => {
  const back = route.query.zernio === 'connected'
  const failed = typeof route.query.error === 'string' ? route.query.error : null
  if (!back && !failed) return
  void router.replace({ query: {} })
  if (failed) message.value = t('zernioPlatform.connectFailed')
  void refresh()
})

watch(
  () => props.link,
  () => void refetch(),
)
</script>

<template>
  <section class="card platform" :aria-labelledby="`${id}-title`">
    <h3 :id="`${id}-title`">{{ t('zernioPlatform.title') }}</h3>
    <p class="hint">{{ t('zernioPlatform.intro') }}</p>

    <ul v-if="fresh?.accounts.length" class="accounts">
      <li v-for="account in fresh.accounts" :key="account.id">
        <strong>{{ t(`draft.channels.${account.platform}`) }}</strong>
        <span>{{ account.username }}</span>
        <span v-if="!account.active" class="badge" data-tone="danger">{{
          t('zernioPlatform.inactive')
        }}</span>
      </li>
    </ul>
    <p v-else>{{ t('zernioPlatform.none') }}</p>
    <p v-if="fresh?.refreshed_at" class="hint">
      {{
        t('zernioPlatform.listedOn', {
          date: d(new Date(fresh.refreshed_at), { dateStyle: 'medium', timeStyle: 'short' }),
        })
      }}
    </p>

    <div class="actions">
      <button type="button" class="button" :disabled="!!waitingFor" @click="connect('linkedin')">
        {{ t('zernioPlatform.connectLinkedin') }}
      </button>
      <button type="button" class="button" :disabled="!!waitingFor" @click="connect('facebook')">
        {{ t('zernioPlatform.connectFacebook') }}
      </button>
      <button type="button" class="button" :disabled="!!waitingFor" @click="refresh">
        {{ t('zernioPlatform.refresh') }}
      </button>
    </div>
    <p v-if="waitingFor" role="status">
      {{ waitingFor === 'connect' ? t('zernioPlatform.preparing') : t('zernioPlatform.listing') }}
    </p>
    <p v-if="message" class="error" role="alert">{{ message }}</p>
  </section>
</template>

<style scoped>
.platform {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-6);
}

.platform h3 {
  margin: 0;
}

.accounts {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.accounts li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
}
</style>
