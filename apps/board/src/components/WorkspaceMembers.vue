<script setup lang="ts">
/**
 * The people of a workspace, and, for its owner, handing it to another member (who becomes
 * the owner; the former owner stays as an editor). Shown only when the workspace has other
 * members than the person. Confirmed in a dialog: the owner loses the hand on billing,
 * keys and members.
 */
import { useQuery, useQueryCache } from '@pinia/colada'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogTrigger,
} from 'reka-ui'
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { toast } from '../lib/toast'
import Icon from './Icon.vue'

const props = defineProps<{ workspaceId: string; isOwner: boolean }>()
const { t } = useI18n()
const id = useId()
const queryCache = useQueryCache()

const { data: members } = useQuery({
  key: () => ['workspace-members', props.workspaceId],
  query: () => api.workspaceMembers(props.workspaceId),
})
const others = computed(() => (members.value ?? []).filter((m) => !m.is_me))
const chosen = ref('')
const chosenEmail = computed(() => others.value.find((m) => m.user_id === chosen.value)?.email)
const busy = ref(false)
const error = ref('')

async function transfer() {
  busy.value = true
  error.value = ''
  try {
    await api.transferWorkspace(props.workspaceId, chosen.value)
    toast(t('members.transferred', { email: chosenEmail.value ?? '' }))
    chosen.value = ''
    await queryCache.invalidateQueries({ key: ['workspace-members', props.workspaceId] })
    await queryCache.invalidateQueries({ key: ['me'] })
  } catch (err) {
    error.value = describeError((err as Error).message, t).text
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="others.length" class="members">
    <h3 :id="`${id}-title`" class="members-title">{{ t('members.title') }}</h3>
    <ul class="member-list" :aria-labelledby="`${id}-title`">
      <li v-for="m in members" :key="m.user_id">
        <span
          >{{ m.email }}<template v-if="m.is_me"> {{ t('members.you') }}</template></span
        >
        <span class="badge">{{ t(`profile.roles.${m.role}`) }}</span>
      </li>
    </ul>

    <form v-if="isOwner" class="transfer" @submit.prevent>
      <div class="form-row">
        <label :for="`${id}-to`">{{ t('members.transferTo') }}</label>
        <select :id="`${id}-to`" v-model="chosen" class="field" :aria-describedby="`${id}-hint`">
          <option value="">{{ t('members.choose') }}</option>
          <option v-for="m in others" :key="m.user_id" :value="m.user_id">{{ m.email }}</option>
        </select>
        <p :id="`${id}-hint`" class="hint">{{ t('members.transferHint') }}</p>
      </div>
      <AlertDialogRoot>
        <AlertDialogTrigger as-child>
          <button type="button" class="button" data-size="small" :disabled="!chosen || busy">
            {{ t('members.transfer') }}
          </button>
        </AlertDialogTrigger>
        <AlertDialogPortal>
          <AlertDialogOverlay class="dialog-overlay" />
          <AlertDialogContent class="dialog">
            <AlertDialogTitle class="dialog-title">{{
              t('members.confirmTitle')
            }}</AlertDialogTitle>
            <AlertDialogDescription>
              {{ t('members.confirmText', { email: chosenEmail ?? '' }) }}
            </AlertDialogDescription>
            <div class="dialog-actions">
              <AlertDialogCancel class="button">{{ t('common.cancel') }}</AlertDialogCancel>
              <AlertDialogAction class="button" data-variant="danger" @click="transfer">
                {{ t('members.confirm') }}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialogRoot>
    </form>
    <p v-if="error" class="notice notice-inline" data-tone="danger" role="alert">
      <Icon name="alert-circle" />
      <span>{{ error }}</span>
    </p>
  </div>
</template>

<style scoped>
.members {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
}

.members-title {
  margin: 0;
  font-size: 1rem;
}

.member-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.member-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  overflow-wrap: anywhere;
}

.transfer {
  display: grid;
  justify-items: start;
  gap: var(--space-2);
}

.transfer .field {
  max-width: 24rem;
}

p {
  margin: 0;
}
</style>
