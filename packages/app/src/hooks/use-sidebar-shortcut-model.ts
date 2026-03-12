import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SidebarProjectEntry } from '@/hooks/use-sidebar-workspaces-list'
import { useKeyboardShortcutsStore } from '@/stores/keyboard-shortcuts-store'
import { buildSidebarShortcutModel } from '@/utils/sidebar-shortcuts'

export function useSidebarShortcutModel(projects: SidebarProjectEntry[]) {
  const [collapsedProjectKeys, setCollapsedProjectKeys] = useState<Set<string>>(new Set())
  const setSidebarShortcutWorkspaceTargets = useKeyboardShortcutsStore(
    (state) => state.setSidebarShortcutWorkspaceTargets
  )
  const setVisibleWorkspaceTargets = useKeyboardShortcutsStore(
    (state) => state.setVisibleWorkspaceTargets
  )

  const shortcutModel = useMemo(
    () =>
      buildSidebarShortcutModel({
        projects,
        collapsedProjectKeys,
      }),
    [collapsedProjectKeys, projects]
  )

  useEffect(() => {
    setCollapsedProjectKeys((prev) => {
      const validProjectKeys = new Set(projects.map((project) => project.projectKey))
      const next = new Set<string>()
      for (const key of prev) {
        if (validProjectKeys.has(key)) {
          next.add(key)
        }
      }
      return next
    })
  }, [projects])

  useEffect(() => {
    setSidebarShortcutWorkspaceTargets(shortcutModel.shortcutTargets)
    setVisibleWorkspaceTargets(shortcutModel.visibleTargets)
  }, [
    setSidebarShortcutWorkspaceTargets,
    setVisibleWorkspaceTargets,
    shortcutModel.shortcutTargets,
    shortcutModel.visibleTargets,
  ])

  useEffect(() => {
    return () => {
      setSidebarShortcutWorkspaceTargets([])
      setVisibleWorkspaceTargets([])
    }
  }, [setSidebarShortcutWorkspaceTargets, setVisibleWorkspaceTargets])

  const toggleProjectCollapsed = useCallback((projectKey: string) => {
    setCollapsedProjectKeys((prev) => {
      const next = new Set(prev)
      if (next.has(projectKey)) {
        next.delete(projectKey)
      } else {
        next.add(projectKey)
      }
      return next
    })
  }, [])

  return {
    collapsedProjectKeys,
    shortcutIndexByWorkspaceKey: shortcutModel.shortcutIndexByWorkspaceKey,
    toggleProjectCollapsed,
  }
}
