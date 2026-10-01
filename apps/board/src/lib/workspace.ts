import { useQuery } from '@pinia/colada'
import { computed } from 'vue'
import { api } from './api'

/** The user's workspace. Single workspace per user for now (personal workspace). */
export function useWorkspace() {
  const query = useQuery({ key: ['me'], query: api.me })
  const membership = computed(() => query.data.value?.workspaces[0])
  return {
    ...query,
    workspaceId: computed(() => membership.value?.workspace.id),
    isOwner: computed(() => membership.value?.role === 'owner'),
  }
}
