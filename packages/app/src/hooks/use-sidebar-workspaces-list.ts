import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useSessionStore } from '@/stores/session-store'
import { getHostRuntimeStore } from '@/runtime/host-runtime'
import { useSidebarOrderStore } from '@/stores/sidebar-order-store'
import type { WorkspaceDescriptor } from '@/stores/session-store'
import { projectDisplayNameFromProjectId } from '@/utils/project-display-name'

const EMPTY_ORDER: string[] = []
const EMPTY_PROJECTS: SidebarProjectEntry[] = []

export type SidebarStateBucket = WorkspaceDescriptor['status']

export interface SidebarWorkspaceEntry {
  workspaceKey: string
  serverId: string
  workspaceId: string
  name: string
  activityAt: Date | null
  statusBucket: SidebarStateBucket
}

export interface SidebarProjectEntry {
  projectKey: string
  projectName: string
  iconWorkingDir: string
  statusBucket: SidebarStateBucket
  activeCount: number
  totalWorkspaces: number
  latestActivityAt: Date | null
  workspaces: SidebarWorkspaceEntry[]
}

export interface SidebarWorkspacesListResult {
  projects: SidebarProjectEntry[]
  isLoading: boolean
  isInitialLoad: boolean
  isRevalidating: boolean
  refreshAll: () => void
}

const SIDEBAR_BUCKET_PRIORITY: Record<SidebarStateBucket, number> = {
  done: 0,
  attention: 1,
  running: 2,
  failed: 3,
  needs_input: 4,
}

function aggregateBucket(
  current: SidebarStateBucket,
  candidate: SidebarStateBucket
): SidebarStateBucket {
  return SIDEBAR_BUCKET_PRIORITY[candidate] > SIDEBAR_BUCKET_PRIORITY[current] ? candidate : current
}

function compareWorkspaceBaseline(
  left: SidebarWorkspaceEntry,
  right: SidebarWorkspaceEntry
): number {
  if (left.activityAt && right.activityAt) {
    const dateDelta = right.activityAt.getTime() - left.activityAt.getTime()
    if (dateDelta !== 0) {
      return dateDelta
    }
  } else if (left.activityAt || right.activityAt) {
    return left.activityAt ? -1 : 1
  }

  const nameDelta = left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
  if (nameDelta !== 0) {
    return nameDelta
  }

  return left.workspaceId.localeCompare(right.workspaceId, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function compareProjectBaseline(left: SidebarProjectEntry, right: SidebarProjectEntry): number {
  if (left.latestActivityAt && right.latestActivityAt) {
    const dateDelta = right.latestActivityAt.getTime() - left.latestActivityAt.getTime()
    if (dateDelta !== 0) {
      return dateDelta
    }
  } else if (left.latestActivityAt || right.latestActivityAt) {
    return left.latestActivityAt ? -1 : 1
  }

  return left.projectName.localeCompare(right.projectName, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

export function buildSidebarProjectsFromWorkspaces(input: {
  serverId: string
  workspaces: Iterable<WorkspaceDescriptor>
  projectOrder: string[]
  workspaceOrderByScope: Record<string, string[]>
}): SidebarProjectEntry[] {
  const byProject = new Map<string, SidebarProjectEntry>()

  for (const workspace of input.workspaces) {
    const project =
      byProject.get(workspace.projectId) ??
      ({
        projectKey: workspace.projectId,
        projectName: projectDisplayNameFromProjectId(workspace.projectId),
        iconWorkingDir: workspace.id,
        statusBucket: 'done',
        activeCount: 0,
        totalWorkspaces: 0,
        latestActivityAt: null,
        workspaces: [],
      } satisfies SidebarProjectEntry)

    const row: SidebarWorkspaceEntry = {
      workspaceKey: `${input.serverId}:${workspace.id}`,
      serverId: input.serverId,
      workspaceId: workspace.id,
      name: workspace.name,
      activityAt: workspace.activityAt,
      statusBucket: workspace.status,
    }

    project.workspaces.push(row)
    project.totalWorkspaces += 1
    if (workspace.status !== 'done') {
      project.activeCount += 1
    }
    project.statusBucket = aggregateBucket(project.statusBucket, workspace.status)
    if (
      !project.latestActivityAt ||
      (workspace.activityAt && workspace.activityAt.getTime() > project.latestActivityAt.getTime())
    ) {
      project.latestActivityAt = workspace.activityAt
    }

    byProject.set(workspace.projectId, project)
  }

  const baselineProjects = Array.from(byProject.values()).map((project) => {
    const baselineWorkspaces = [...project.workspaces]
    baselineWorkspaces.sort(compareWorkspaceBaseline)

    const workspaceOrderScopeKey = getWorkspaceOrderScopeKey(input.serverId, project.projectKey)
    const orderedWorkspaces = applyStoredOrdering({
      items: baselineWorkspaces,
      storedOrder: input.workspaceOrderByScope[workspaceOrderScopeKey] ?? EMPTY_ORDER,
      getKey: (workspace) => workspace.workspaceKey,
    })

    return {
      ...project,
      workspaces: orderedWorkspaces,
    }
  })

  baselineProjects.sort(compareProjectBaseline)

  return applyStoredOrdering({
    items: baselineProjects,
    storedOrder: input.projectOrder,
    getKey: (project) => project.projectKey,
  })
}

export function applyStoredOrdering<T>(input: {
  items: T[]
  storedOrder: string[]
  getKey: (item: T) => string
}): T[] {
  if (input.items.length <= 1 || input.storedOrder.length === 0) {
    return input.items
  }

  const itemByKey = new Map<string, T>()
  for (const item of input.items) {
    itemByKey.set(input.getKey(item), item)
  }

  const prunedOrder: string[] = []
  const seen = new Set<string>()
  for (const key of input.storedOrder) {
    if (!itemByKey.has(key) || seen.has(key)) {
      continue
    }
    seen.add(key)
    prunedOrder.push(key)
  }

  if (prunedOrder.length === 0) {
    return input.items
  }

  const orderedSet = new Set(prunedOrder)
  const ordered: T[] = []
  let orderedIndex = 0

  for (const item of input.items) {
    const key = input.getKey(item)
    if (!orderedSet.has(key)) {
      ordered.push(item)
      continue
    }

    const targetKey = prunedOrder[orderedIndex] ?? key
    orderedIndex += 1
    ordered.push(itemByKey.get(targetKey) ?? item)
  }

  return ordered
}

function getWorkspaceOrderScopeKey(serverId: string, projectKey: string): string {
  return `${serverId.trim()}::${projectKey.trim()}`
}

function toWorkspaceDescriptor(payload: {
  id: string
  projectId: string
  name: string
  status: WorkspaceDescriptor['status']
  activityAt: string | null
}): WorkspaceDescriptor {
  const activityAt = payload.activityAt ? new Date(payload.activityAt) : null
  return {
    id: payload.id,
    projectId: payload.projectId,
    name: payload.name,
    status: payload.status,
    activityAt: activityAt && !Number.isNaN(activityAt.getTime()) ? activityAt : null,
  }
}

export function useSidebarWorkspacesList(options?: {
  serverId?: string | null
  enabled?: boolean
}): SidebarWorkspacesListResult {
  const runtime = getHostRuntimeStore()

  const serverId = useMemo(() => {
    const value = options?.serverId
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
  }, [options?.serverId])
  const enabled = options?.enabled ?? true

  const persistedProjectOrder = useSidebarOrderStore((state) =>
    serverId ? (state.projectOrderByServerId[serverId] ?? EMPTY_ORDER) : EMPTY_ORDER
  )
  const persistedWorkspaceOrderByScope = useSidebarOrderStore((state) =>
    serverId ? state.workspaceOrderByServerAndProject : {}
  )

  const isActive = Boolean(serverId)
  const sessionWorkspaces = useSessionStore((state) =>
    isActive && serverId ? (state.sessions[serverId]?.workspaces ?? null) : null
  )
  const hasHydratedWorkspaces = useSessionStore(
    (state) => (isActive && serverId ? (state.sessions[serverId]?.hasHydratedWorkspaces ?? false) : false)
  )

  const connectionStatus = useSyncExternalStore(
    (onStoreChange) =>
      isActive && serverId ? runtime.subscribe(serverId, onStoreChange) : () => {},
    () => {
      if (!isActive || !serverId) {
        return 'idle'
      }
      const snapshot = runtime.getSnapshot(serverId)
      return snapshot?.connectionStatus ?? 'idle'
    },
    () => {
      if (!isActive || !serverId) {
        return 'idle'
      }
      const snapshot = runtime.getSnapshot(serverId)
      return snapshot?.connectionStatus ?? 'idle'
    }
  )

  const projects = useMemo(() => {
    if (!sessionWorkspaces || sessionWorkspaces.size === 0 || !serverId) {
      return EMPTY_PROJECTS
    }
    return buildSidebarProjectsFromWorkspaces({
      serverId,
      workspaces: sessionWorkspaces.values(),
      projectOrder: persistedProjectOrder,
      workspaceOrderByScope: persistedWorkspaceOrderByScope,
    })
  }, [persistedProjectOrder, persistedWorkspaceOrderByScope, serverId, sessionWorkspaces])

  const refreshAll = useCallback(() => {
    if (!isActive || !serverId || connectionStatus !== 'online' || !enabled) {
      return
    }
    const client = runtime.getClient(serverId)
    if (!client) {
      return
    }
    void client
      .fetchWorkspaces({ page: { limit: 200 } })
      .then((payload) => {
        const next = new Map<string, WorkspaceDescriptor>()
        for (const entry of payload.entries) {
          const workspace = toWorkspaceDescriptor(entry)
          next.set(workspace.id, workspace)
        }
        const store = useSessionStore.getState()
        store.setWorkspaces(serverId, next)
        store.setHasHydratedWorkspaces(serverId, true)
      })
      .catch(() => undefined)
  }, [connectionStatus, enabled, isActive, runtime, serverId])

  const isLoading = isActive && Boolean(serverId) && connectionStatus === 'online' && !hasHydratedWorkspaces
  const isInitialLoad = isLoading && projects.length === 0
  const isRevalidating = false

  return {
    projects,
    isLoading,
    isInitialLoad,
    isRevalidating,
    refreshAll,
  }
}
