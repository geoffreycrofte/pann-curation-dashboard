import { useQuery } from '@pinia/colada'
import { computed, ref } from 'vue'
import { api } from './api'

const STORAGE_KEY = 'glimr.workspace'

function stored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** The workspace picked in the menu, kept on this device. */
const chosen = ref<string | null>(stored())

export function setCurrentWorkspace(workspaceId: string) {
  chosen.value = workspaceId
  try {
    localStorage.setItem(STORAGE_KEY, workspaceId)
  } catch {
    // Private browsing: the choice lasts until the page reloads.
  }
}

/**
 * The current workspace: the one picked in the menu, else the person's own, else the first
 * they belong to. A person invited to a team belongs to several.
 */
export function useWorkspace() {
  const query = useQuery({ key: ['me'], query: api.me })
  const workspaces = computed(() => query.data.value?.workspaces ?? [])
  const membership = computed(
    () =>
      workspaces.value.find((m) => m.workspace.id === chosen.value) ??
      workspaces.value.find((m) => m.role === 'owner') ??
      workspaces.value[0],
  )
  return {
    ...query,
    workspaces,
    membership,
    workspaceId: computed(() => membership.value?.workspace.id),
    isOwner: computed(() => membership.value?.role === 'owner'),
  }
}

/** The topics of the current workspace (the list of topics holds every workspace's). */
export function useWorkspaceTopics(enabled: () => boolean = () => true) {
  const { workspaceId } = useWorkspace()
  const query = useQuery({ key: ['topics'], query: api.topics, enabled })
  return {
    ...query,
    data: computed(() =>
      query.data.value?.filter((tp) => !workspaceId.value || tp.workspace_id === workspaceId.value),
    ),
  }
}
