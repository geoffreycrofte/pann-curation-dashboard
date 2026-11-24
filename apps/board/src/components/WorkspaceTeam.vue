<script setup lang="ts">
/**
 * The team of a workspace (Profile, "My team" tab): its members and the seats of the plan;
 * for the owner, inviting a person by address (as an editor), cancelling an invitation,
 * removing a member and handing the workspace to another member (who becomes the owner;
 * the former owner stays as an editor). An editor can leave the workspace. Removals and the
 * transfer are confirmed in a dialog.
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
import { useRouter } from 'vue-router'
import { api } from '../lib/api'
import { describeError } from '../lib/errors'
import { toast } from '../lib/toast'
import Icon from './Icon.vue'

const props = defineProps<{
  workspaceId: string
  isOwner: boolean
  /** Seats of the plan, the owner included; null: no limit. */
  maxMembers: number | null
}>()
const { t } = useI18n()
const id = useId()
const router = useRouter()
const queryCache = useQueryCache()

const { data: members } = useQuery({
  key: () => ['workspace-members', props.workspaceId],
  query: () => api.workspaceMembers(props.workspaceId),
})
const { data: invitations } = useQuery({
  key: () => ['workspace-invitations', props.workspaceId],
  query: () => api.invitations(props.workspaceId),
})
const others = computed(() => (members.value ?? []).filter((m) => !m.is_me))
const used = computed(() => (members.value?.length ?? 0) + (invitations.value?.length ?? 0))
const full = computed(() => props.maxMembers !== null && used.value >= props.maxMembers)

const error = ref('')
const busy = ref(false)
async function run(action: () => Promise<unknown>, done: string) {
  busy.value = true
  error.value = ''
  try {
    await action()
    toast(done)
    await Promise.all([
      queryCache.invalidateQueries({ key: ['workspace-members', props.workspaceId] }),
      queryCache.invalidateQueries({ key: ['workspace-invitations', props.workspaceId] }),
      queryCache.invalidateQueries({ key: ['workspace-plan', props.workspaceId] }),
    ])
    return true
  } catch (err) {
    error.value = describeError((err as Error).message, t).text
    return false
  } finally {
    busy.value = false
  }
}

// Invitation: an account joins at once; otherwise Supabase sends an account invitation.
const email = ref('')
async function invite() {
  const address = email.value.trim().toLowerCase()
  if (
    await run(() => api.invite(props.workspaceId, address), t('team.invited', { email: address }))
  )
    email.value = ''
}

const cancel = (invitationId: string, address: string) =>
  run(
    () => api.cancelInvitation(props.workspaceId, invitationId),
    t('team.cancelled', { email: address }),
  )

const remove = (userId: string, address: string) =>
  run(() => api.removeMember(props.workspaceId, userId), t('team.removed', { email: address }))

async function leave(userId: string) {
  if (await run(() => api.removeMember(props.workspaceId, userId), t('team.left'))) {
    await queryCache.invalidateQueries({ key: ['me'] })
    await queryCache.invalidateQueries({ key: ['topics'] })
    await router.push({ name: 'home' })
  }
}

// Transfer of the ownership.
const chosen = ref('')
const chosenEmail = computed(() => others.value.find((m) => m.user_id === chosen.value)?.email)
async function transfer() {
  const address = chosenEmail.value ?? ''
  if (
    await run(
      () => api.transferWorkspace(props.workspaceId, chosen.value),
      t('members.transferred', { email: address }),
    )
  ) {
    chosen.value = ''
    await queryCache.invalidateQueries({ key: ['me'] })
  }
}
</script>

<template>
  <div class="team">
    <p v-if="maxMembers !== null" class="seats">
      {{ t('team.seats', { used, max: maxMembers }) }}
    </p>

    <h3 :id="`${id}-members`" class="team-title">{{ t('members.title') }}</h3>
    <ul class="member-list" :aria-labelledby="`${id}-members`">
      <li v-for="m in members" :key="m.user_id">
        <span class="who">{{ m.is_me ? `${m.email} ${t('members.you')}` : m.email }}</span>
        <span class="badge">{{ t(`profile.roles.${m.role}`) }}</span>
        <AlertDialogRoot v-if="m.role !== 'owner' && (isOwner || m.is_me)">
          <AlertDialogTrigger as-child>
            <button type="button" class="button" data-size="small" :disabled="busy">
              {{ m.is_me ? t('team.leave') : t('team.remove') }}
              <span v-if="!m.is_me" class="visually-hidden">{{ m.email }}</span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogPortal>
            <AlertDialogOverlay class="dialog-overlay" />
            <AlertDialogContent class="dialog">
              <AlertDialogTitle class="dialog-title">
                {{ m.is_me ? t('team.leaveTitle') : t('team.removeTitle', { email: m.email }) }}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {{ m.is_me ? t('team.leaveText') : t('team.removeText', { email: m.email }) }}
              </AlertDialogDescription>
              <div class="dialog-actions">
                <AlertDialogCancel class="button">{{ t('common.cancel') }}</AlertDialogCancel>
                <AlertDialogAction
                  class="button"
                  data-variant="danger"
                  @click="m.is_me ? leave(m.user_id) : remove(m.user_id, m.email)"
                >
                  {{ m.is_me ? t('team.leave') : t('team.remove') }}
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialogRoot>
      </li>
      <li v-for="inv in invitations" :key="inv.id">
        <span class="who">{{ inv.email }}</span>
        <span class="badge" :data-tone="inv.error ? 'danger' : undefined">
          {{ inv.error ? t(`errors.${inv.error}`) : t('team.pending') }}
        </span>
        <button
          v-if="isOwner"
          type="button"
          class="button"
          data-size="small"
          :disabled="busy"
          @click="cancel(inv.id, inv.email)"
        >
          {{ t('team.cancel') }}
          <span class="visually-hidden">{{ inv.email }}</span>
        </button>
      </li>
    </ul>

    <form v-if="isOwner" class="invite" @submit.prevent="invite">
      <div class="form-row">
        <label :for="`${id}-email`">{{ t('team.inviteLabel') }}</label>
        <div class="inline">
          <input
            :id="`${id}-email`"
            v-model="email"
            class="field"
            type="email"
            autocomplete="off"
            required
            maxlength="254"
            :disabled="full"
            :aria-describedby="`${id}-invite-hint`"
          />
          <button
            type="submit"
            class="button"
            data-variant="primary"
            data-size="small"
            :disabled="busy || full"
          >
            {{ t('team.invite') }}
          </button>
        </div>
        <p :id="`${id}-invite-hint`" class="hint">
          {{ full ? t('team.full') : t('team.inviteHint') }}
        </p>
      </div>
    </form>
    <p v-else class="hint">{{ t('team.ownerManages') }}</p>

    <form v-if="isOwner && others.length" class="transfer" @submit.prevent>
      <h3 class="team-title">{{ t('members.transfer') }}</h3>
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
.team {
  display: grid;
  gap: var(--space-4);
}

.seats {
  font-weight: 650;
}

.team-title {
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
  gap: var(--space-2) var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border-subtle);
  overflow-wrap: anywhere;
}

.who {
  font-weight: 600;
}

.member-list .button {
  margin-inline-start: auto;
}

.invite,
.transfer {
  display: grid;
  justify-items: start;
  gap: var(--space-2);
}

.inline {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.invite .field {
  flex: 1 1 14rem;
  max-width: 24rem;
}

.transfer {
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
}

.transfer .field {
  max-width: 24rem;
}

p {
  margin: 0;
}
</style>
