import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from '@/hooks/use-sidebar-workspaces-list'

export interface SidebarShortcutWorkspaceTarget {
  serverId: string
  workspaceId: string
}

export interface SidebarShortcutModel {
  shortcutTargets: SidebarShortcutWorkspaceTarget[]
  shortcutIndexByWorkspaceKey: Map<string, number>
}

export function buildSidebarShortcutModel(input: {
  projects: SidebarProjectEntry[]
  collapsedProjectKeys: ReadonlySet<string>
  shortcutLimit?: number
}): SidebarShortcutModel {
  const maxShortcuts = Math.max(0, Math.floor(input.shortcutLimit ?? 9))
  const shortcutTargets: SidebarShortcutWorkspaceTarget[] = []
  const shortcutIndexByWorkspaceKey = new Map<string, number>()

  for (const project of input.projects) {
    if (input.collapsedProjectKeys.has(project.projectKey)) {
      continue
    }

    for (const workspace of project.workspaces) {
      const shortcutNumber =
        shortcutTargets.length < maxShortcuts ? shortcutTargets.length + 1 : null
      if (shortcutNumber !== null) {
        shortcutTargets.push({
          serverId: workspace.serverId,
          workspaceId: workspace.workspaceId,
        })
        shortcutIndexByWorkspaceKey.set(workspace.workspaceKey, shortcutNumber)
      }
    }
  }

  return { shortcutTargets, shortcutIndexByWorkspaceKey }
}
