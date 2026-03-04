import {
  View,
  Text,
  Pressable,
  Image,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
  type GestureResponderEvent,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useQueries } from '@tanstack/react-query'
import {
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
  type ReactElement,
  type MutableRefObject,
} from 'react'
import { router, usePathname, useSegments } from 'expo-router'
import { StyleSheet, UnistylesRuntime, useUnistyles } from 'react-native-unistyles'
import { type GestureType } from 'react-native-gesture-handler'
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react-native'
import { DraggableList, type DraggableRenderItemInfo } from './draggable-list'
import type { DraggableListDragHandleProps } from './draggable-list.types'
import { getHostRuntimeStore, isHostRuntimeConnected } from '@/runtime/host-runtime'
import { getIsTauri } from '@/constants/layout'
import { projectIconQueryKey } from '@/hooks/use-project-icon-query'
import {
  buildHostWorkspaceRoute,
  parseHostWorkspaceRouteFromPathname,
} from '@/utils/host-routes'
import {
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
  type SidebarStateBucket,
} from '@/hooks/use-sidebar-workspaces-list'
import { useSidebarOrderStore } from '@/stores/sidebar-order-store'
import { useKeyboardShortcutsStore } from '@/stores/keyboard-shortcuts-store'
import { formatTimeAgo } from '@/utils/time'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  useContextMenu,
} from '@/components/ui/context-menu'
import { useToast } from '@/contexts/toast-context'
import { useCheckoutGitActionsStore } from '@/stores/checkout-git-actions-store'
import { buildSidebarShortcutModel } from '@/utils/sidebar-shortcuts'
import { hasVisibleOrderChanged, mergeWithRemainder } from '@/utils/sidebar-reorder'

const PASEO_WORKTREE_PATH_MARKER = '/.paseo/worktrees'

function toProjectIconDataUri(icon: { mimeType: string; data: string } | null): string | null {
  if (!icon) {
    return null
  }
  return `data:${icon.mimeType};base64,${icon.data}`
}

interface SidebarWorkspaceListProps {
  isOpen?: boolean
  projects: SidebarProjectEntry[]
  serverId: string | null
  isRefreshing?: boolean
  onRefresh?: () => void
  onWorkspacePress?: () => void
  listFooterComponent?: ReactElement | null
  /** Gesture ref for coordinating with parent gestures (e.g., sidebar close) */
  parentGestureRef?: MutableRefObject<GestureType | undefined>
}

interface ProjectHeaderRowProps {
  project: SidebarProjectEntry
  displayName: string
  iconDataUri: string | null
  collapsed: boolean
  onToggle: () => void
  drag: () => void
  isDragging: boolean
  dragHandleProps?: DraggableListDragHandleProps
}

interface WorkspaceRowInnerProps {
  workspace: SidebarWorkspaceEntry
  selected: boolean
  shortcutNumber: number | null
  showShortcutBadge: boolean
  onPress: () => void
  drag: () => void
  isDragging: boolean
  isArchiving: boolean
  dragHandleProps?: DraggableListDragHandleProps
  menuController: ReturnType<typeof useContextMenu> | null
}

function resolveWorkspaceCreatedAtLabel(workspace: SidebarWorkspaceEntry): string | null {
  if (!workspace.activityAt) {
    return null
  }
  return formatTimeAgo(workspace.activityAt)
}

function resolveStatusDotColor(input: {
  theme: ReturnType<typeof useUnistyles>['theme']
  bucket: SidebarStateBucket
}) {
  const { theme, bucket } = input
  return bucket === 'needs_input'
    ? theme.colors.palette.amber[500]
    : bucket === 'failed'
      ? theme.colors.palette.red[500]
      : bucket === 'running'
        ? theme.colors.palette.blue[500]
        : bucket === 'attention'
          ? theme.colors.palette.green[500]
          : theme.colors.border
}

function isPaseoOwnedWorktreePath(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/')
  const markerIndex = normalizedPath.indexOf(PASEO_WORKTREE_PATH_MARKER)
  if (markerIndex <= 0) {
    return false
  }
  const nextChar = normalizedPath[markerIndex + PASEO_WORKTREE_PATH_MARKER.length]
  return !nextChar || nextChar === '/'
}

function WorkspaceStatusIndicator({
  bucket,
  loading = false,
}: {
  bucket: SidebarWorkspaceEntry['statusBucket']
  loading?: boolean
}) {
  const { theme } = useUnistyles()
  const color = resolveStatusDotColor({ theme, bucket })

  return (
    <View style={styles.workspaceStatusDot}>
      {loading ? (
        <ActivityIndicator size={8} color={theme.colors.foregroundMuted} />
      ) : (
        <View style={[styles.workspaceStatusDotFill, { backgroundColor: color }]} />
      )}
    </View>
  )
}

function useLongPressDragInteraction(input: {
  drag: () => void
}) {
  const didLongPressRef = useRef(false)

  const handleLongPress = useCallback(() => {
    console.log('[sidebar-dnd-debug] long-press armed')
    void Haptics.selectionAsync().catch(() => {})
    didLongPressRef.current = true
  }, [])

  const handlePressIn = useCallback((event: GestureResponderEvent) => {
    didLongPressRef.current = false
    console.log('[sidebar-dnd-debug] press-in', {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    })
  }, [])

  const handlePressOut = useCallback(() => {
    console.log('[sidebar-dnd-debug] press-out no context-menu', {
      didLongPress: didLongPressRef.current,
    })
  }, [])

  return {
    didLongPressRef,
    handleLongPress,
    handlePressIn,
    handlePressOut,
  }
}

function ProjectHeaderRow({
  project,
  displayName,
  iconDataUri,
  collapsed,
  onToggle,
  drag,
  isDragging,
  dragHandleProps,
}: ProjectHeaderRowProps) {
  const interaction = useLongPressDragInteraction({
    drag,
  })

  const handlePress = useCallback(() => {
    if (interaction.didLongPressRef.current) {
      interaction.didLongPressRef.current = false
      return
    }
    onToggle()
  }, [interaction.didLongPressRef, onToggle])

  const handleDragHandlePressIn = useCallback(() => {
    console.log('[sidebar-dnd-debug] project drag-handle press-in')
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    drag()
  }, [drag])

  const trigger = (
    <ContextMenuTrigger
      enabledOnMobile
      style={({ pressed, hovered = false }) => [
        styles.projectRow,
        isDragging && styles.projectRowDragging,
        hovered && styles.projectRowHovered,
        pressed && styles.projectRowPressed,
      ]}
      onPressIn={interaction.handlePressIn}
      onPressOut={interaction.handlePressOut}
      onPress={handlePress}
      onLongPress={interaction.handleLongPress}
      delayLongPress={350}
      testID={`sidebar-project-row-${project.projectKey}`}
    >
      <View style={styles.projectRowLeft}>
        {collapsed ? (
          <ChevronRight size={14} color="#9ca3af" />
        ) : (
          <ChevronDown size={14} color="#9ca3af" />
        )}

        {iconDataUri ? (
          <Image source={{ uri: iconDataUri }} style={styles.projectIcon} />
        ) : (
          <View style={styles.projectIconFallback}>
            <Text style={styles.projectIconFallbackText}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <Text style={styles.projectTitle} numberOfLines={1}>
          {displayName}
        </Text>
      </View>
      <Pressable
        {...(dragHandleProps?.attributes as any)}
        {...(dragHandleProps?.listeners as any)}
        ref={dragHandleProps?.setActivatorNodeRef as any}
        hitSlop={8}
        onPressIn={handleDragHandlePressIn}
        onLongPress={handleDragHandlePressIn}
        delayLongPress={120}
        onPress={(event) => (event as any).stopPropagation?.()}
        style={({ pressed }) => [styles.dragHandle, pressed && styles.dragHandlePressed]}
        testID={`sidebar-project-drag-handle-${project.projectKey}`}
      >
        <GripVertical size={14} color="#9ca3af" />
      </Pressable>
    </ContextMenuTrigger>
  )

  return trigger
}

function ProjectHeaderRowWithMenu(props: ProjectHeaderRowProps) {
  return (
    <ContextMenu>
      <ProjectHeaderRow {...props} />
      <ContextMenuContent align="start" width={220} testID={`sidebar-project-context-${props.project.projectKey}`}>
        <ContextMenuItem
          testID={`sidebar-project-context-${props.project.projectKey}-toggle`}
          onSelect={props.onToggle}
        >
          {props.collapsed ? 'Expand project' : 'Collapse project'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function WorkspaceRowInner({
  workspace,
  selected,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  drag,
  isDragging,
  isArchiving,
  dragHandleProps,
  menuController,
}: WorkspaceRowInnerProps) {
  const { theme } = useUnistyles()
  const createdAtLabel = resolveWorkspaceCreatedAtLabel(workspace)
  const interaction = useLongPressDragInteraction({
    drag,
  })

  const handlePress = useCallback(() => {
    if (interaction.didLongPressRef.current) {
      interaction.didLongPressRef.current = false
      return
    }
    onPress()
  }, [interaction.didLongPressRef, onPress])

  const handleDragHandlePressIn = useCallback(() => {
    console.log('[sidebar-dnd-debug] workspace drag-handle press-in', {
      workspaceKey: workspace.workspaceKey,
    })
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    drag()
  }, [drag, workspace.workspaceKey])

  const rowChildren = (
    <>
      <View
        style={styles.workspaceRowLeft}
      >
        <WorkspaceStatusIndicator bucket={workspace.statusBucket} loading={isArchiving} />
        <Text style={styles.workspaceBranchText} numberOfLines={1}>
          {workspace.name}
        </Text>
      </View>
      <View style={styles.workspaceRowRight}>
        {createdAtLabel ? (
          <Text style={styles.workspaceCreatedAtText} numberOfLines={1}>
            {createdAtLabel}
          </Text>
        ) : null}
        {showShortcutBadge && shortcutNumber !== null ? (
          <View style={styles.shortcutBadge}>
            <Text style={styles.shortcutBadgeText}>{shortcutNumber}</Text>
          </View>
        ) : null}
        <Pressable
          {...(dragHandleProps?.attributes as any)}
          {...(dragHandleProps?.listeners as any)}
          ref={dragHandleProps?.setActivatorNodeRef as any}
          hitSlop={8}
          onPressIn={handleDragHandlePressIn}
          onLongPress={handleDragHandlePressIn}
          delayLongPress={120}
          onPress={(event) => (event as any).stopPropagation?.()}
          style={({ pressed }) => [styles.dragHandle, pressed && styles.dragHandlePressed]}
          testID={`sidebar-workspace-drag-handle-${workspace.workspaceKey}`}
        >
          <GripVertical size={14} color="#9ca3af" />
        </Pressable>
      </View>
    </>
  )

  const trigger = menuController ? (
    <ContextMenuTrigger
      enabledOnMobile
      disabled={isArchiving}
      style={({ pressed, hovered = false }) => [
        styles.workspaceRow,
        isDragging && styles.workspaceRowDragging,
        selected && styles.workspaceRowSelected,
        hovered && styles.workspaceRowHovered,
        pressed && styles.workspaceRowPressed,
      ]}
      onPressIn={interaction.handlePressIn}
      onPressOut={interaction.handlePressOut}
      onPress={handlePress}
      onLongPress={interaction.handleLongPress}
      delayLongPress={350}
      testID={`sidebar-workspace-row-${workspace.workspaceKey}`}
    >
      {rowChildren}
    </ContextMenuTrigger>
  ) : (
    <Pressable
      disabled={isArchiving}
      style={({ pressed, hovered = false }) => [
        styles.workspaceRow,
        isDragging && styles.workspaceRowDragging,
        selected && styles.workspaceRowSelected,
        hovered && styles.workspaceRowHovered,
        pressed && styles.workspaceRowPressed,
      ]}
      onPressIn={interaction.handlePressIn}
      onPressOut={interaction.handlePressOut}
      onPress={handlePress}
      onLongPress={interaction.handleLongPress}
      delayLongPress={350}
      testID={`sidebar-workspace-row-${workspace.workspaceKey}`}
    >
      {rowChildren}
    </Pressable>
  )

  const content = trigger

  return (
    <View style={styles.workspaceRowContainer}>
      {content}
      {isArchiving ? (
        <View style={styles.workspaceArchivingOverlay} testID={`sidebar-workspace-archiving-${workspace.workspaceKey}`}>
          <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
          <Text style={styles.workspaceArchivingText}>Archiving</Text>
        </View>
      ) : null}
    </View>
  )
}

function WorkspaceRowWithMenu({
  workspace,
  selected,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  drag,
  isDragging,
  dragHandleProps,
}: {
  workspace: SidebarWorkspaceEntry
  selected: boolean
  shortcutNumber: number | null
  showShortcutBadge: boolean
  onPress: () => void
  drag: () => void
  isDragging: boolean
  dragHandleProps?: DraggableListDragHandleProps
}) {
  const toast = useToast()
  const contextMenu = useContextMenu()
  const archiveWorktree = useCheckoutGitActionsStore((state) => state.archiveWorktree)
  const archiveStatus = useCheckoutGitActionsStore((state) =>
    state.getStatus({
      serverId: workspace.serverId,
      cwd: workspace.workspaceId,
      actionId: 'archive-worktree',
    })
  )
  const isArchiving = archiveStatus === 'pending'

  const handleArchiveWorktree = useCallback(() => {
    if (isArchiving) {
      return
    }

    Alert.alert(
      'Archive worktree?',
      `Archive "${workspace.name}"?\n\nThis removes the worktree from the sidebar.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => {
            void archiveWorktree({
              serverId: workspace.serverId,
              cwd: workspace.workspaceId,
              worktreePath: workspace.workspaceId,
            }).catch((error) => {
              const message = error instanceof Error ? error.message : 'Failed to archive worktree'
              toast.error(message)
            })
          },
        },
      ],
      { cancelable: true }
    )
  }, [archiveWorktree, isArchiving, toast, workspace.name, workspace.serverId, workspace.workspaceId])

  return (
    <>
      <WorkspaceRowInner
        workspace={workspace}
        selected={selected}
        shortcutNumber={shortcutNumber}
        showShortcutBadge={showShortcutBadge}
        onPress={onPress}
        drag={drag}
        isDragging={isDragging}
        isArchiving={isArchiving}
        dragHandleProps={dragHandleProps}
        menuController={contextMenu}
      />
      <ContextMenuContent align="start" width={220} testID={`sidebar-workspace-context-${workspace.workspaceKey}`}>
        <ContextMenuItem
          testID={`sidebar-workspace-context-${workspace.workspaceKey}-archive`}
          status={archiveStatus}
          pendingLabel="Archiving..."
          destructive
          onSelect={handleArchiveWorktree}
        >
          Archive worktree
        </ContextMenuItem>
      </ContextMenuContent>
    </>
  )
}

function WorkspaceRowPlain({
  workspace,
  selected,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  drag,
  isDragging,
  dragHandleProps,
}: {
  workspace: SidebarWorkspaceEntry
  selected: boolean
  shortcutNumber: number | null
  showShortcutBadge: boolean
  onPress: () => void
  drag: () => void
  isDragging: boolean
  dragHandleProps?: DraggableListDragHandleProps
}) {
  return (
    <WorkspaceRowInner
      workspace={workspace}
      selected={selected}
      shortcutNumber={shortcutNumber}
      showShortcutBadge={showShortcutBadge}
      onPress={onPress}
      drag={drag}
      isDragging={isDragging}
      isArchiving={false}
      dragHandleProps={dragHandleProps}
      menuController={null}
    />
  )
}

function WorkspaceRow({
  workspace,
  selected,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  drag,
  isDragging,
  dragHandleProps,
}: {
  workspace: SidebarWorkspaceEntry
  selected: boolean
  shortcutNumber: number | null
  showShortcutBadge: boolean
  onPress: () => void
  drag: () => void
  isDragging: boolean
  dragHandleProps?: DraggableListDragHandleProps
}) {
  if (!isPaseoOwnedWorktreePath(workspace.workspaceId)) {
    return (
      <WorkspaceRowPlain
        workspace={workspace}
        selected={selected}
        shortcutNumber={shortcutNumber}
        showShortcutBadge={showShortcutBadge}
        onPress={onPress}
        drag={drag}
        isDragging={isDragging}
        dragHandleProps={dragHandleProps}
      />
    )
  }

  return (
    <ContextMenu>
      <WorkspaceRowWithMenu
        workspace={workspace}
        selected={selected}
        shortcutNumber={shortcutNumber}
        showShortcutBadge={showShortcutBadge}
        onPress={onPress}
        drag={drag}
        isDragging={isDragging}
        dragHandleProps={dragHandleProps}
      />
    </ContextMenu>
  )
}

function ProjectBlock({
  project,
  collapsed,
  displayName,
  iconDataUri,
  serverId,
  activeWorkspaceSelection,
  shouldReplaceWorkspaceNavigation,
  showShortcutBadges,
  shortcutIndexByWorkspaceKey,
  parentGestureRef,
  onToggleCollapsed,
  onWorkspacePress,
  onWorkspaceReorder,
  onAnyDragBegin,
  onAnyDragEnd,
  drag,
  isDragging,
  dragHandleProps,
  useNestable,
}: {
  project: SidebarProjectEntry
  collapsed: boolean
  displayName: string
  iconDataUri: string | null
  serverId: string | null
  activeWorkspaceSelection: { serverId: string; workspaceId: string } | null
  shouldReplaceWorkspaceNavigation: boolean
  showShortcutBadges: boolean
  shortcutIndexByWorkspaceKey: Map<string, number>
  parentGestureRef?: MutableRefObject<GestureType | undefined>
  onToggleCollapsed: () => void
  onWorkspacePress?: () => void
  onWorkspaceReorder: (projectKey: string, workspaces: SidebarWorkspaceEntry[]) => void
  onAnyDragBegin: () => void
  onAnyDragEnd: () => void
  drag: () => void
  isDragging: boolean
  dragHandleProps?: DraggableListDragHandleProps
  useNestable: boolean
}) {
  const renderWorkspace = useCallback(
    ({
      item,
      drag: workspaceDrag,
      isActive,
      dragHandleProps: workspaceDragHandleProps,
    }: DraggableRenderItemInfo<SidebarWorkspaceEntry>) => {
      const workspaceRoute = buildHostWorkspaceRoute(serverId ?? '', item.workspaceId)
      const navigate = shouldReplaceWorkspaceNavigation ? router.replace : router.push
      const isSelected =
        Boolean(serverId) &&
        activeWorkspaceSelection?.serverId === serverId &&
        activeWorkspaceSelection.workspaceId === item.workspaceId

      return (
        <WorkspaceRow
          workspace={item}
          selected={isSelected}
          shortcutNumber={shortcutIndexByWorkspaceKey.get(item.workspaceKey) ?? null}
          showShortcutBadge={showShortcutBadges}
          onPress={() => {
            if (!serverId) {
              return
            }
            onWorkspacePress?.()
            navigate(workspaceRoute as any)
          }}
          drag={workspaceDrag}
          isDragging={isActive}
          dragHandleProps={workspaceDragHandleProps}
        />
      )
    },
    [
      activeWorkspaceSelection,
      onWorkspacePress,
      serverId,
      shouldReplaceWorkspaceNavigation,
      shortcutIndexByWorkspaceKey,
      showShortcutBadges,
    ]
  )

  return (
    <View style={styles.projectBlock}>
      <ProjectHeaderRowWithMenu
        project={project}
        displayName={displayName}
        iconDataUri={iconDataUri}
        collapsed={collapsed}
        onToggle={onToggleCollapsed}
        drag={drag}
        isDragging={isDragging}
        dragHandleProps={dragHandleProps}
      />

      {!collapsed ? (
        <DraggableList
          testID={`sidebar-workspace-list-${project.projectKey}`}
          data={project.workspaces}
          keyExtractor={(workspace) => workspace.workspaceKey}
          renderItem={renderWorkspace}
          onDragIntent={onAnyDragBegin}
          onDragBegin={onAnyDragBegin}
          onDragRelease={onAnyDragEnd}
          onDragEnd={(workspaces) => {
            onWorkspaceReorder(project.projectKey, workspaces)
            onAnyDragEnd()
          }}
          scrollEnabled={false}
          useDragHandle
          nestable={useNestable}
          simultaneousGestureRef={parentGestureRef}
          containerStyle={styles.workspaceListContainer}
        />
      ) : null}
    </View>
  )
}

export function SidebarWorkspaceList({
  isOpen = true,
  projects,
  serverId,
  isRefreshing = false,
  onRefresh,
  onWorkspacePress,
  listFooterComponent,
  parentGestureRef,
}: SidebarWorkspaceListProps) {
  const isMobile = UnistylesRuntime.breakpoint === 'xs' || UnistylesRuntime.breakpoint === 'sm'
  const segments = useSegments()
  const pathname = usePathname()
  const shouldReplaceWorkspaceNavigation = segments[0] === 'h'
  const [collapsedProjectKeys, setCollapsedProjectKeys] = useState<Set<string>>(new Set())
  const [outerScrollEnabled, setOuterScrollEnabled] = useState(true)
  const isTauri = getIsTauri()
  const altDown = useKeyboardShortcutsStore((state) => state.altDown)
  const cmdOrCtrlDown = useKeyboardShortcutsStore((state) => state.cmdOrCtrlDown)
  const setSidebarShortcutWorkspaceTargets = useKeyboardShortcutsStore(
    (state) => state.setSidebarShortcutWorkspaceTargets
  )
  const showShortcutBadges = altDown || (isTauri && cmdOrCtrlDown)

  const getProjectOrder = useSidebarOrderStore((state) => state.getProjectOrder)
  const setProjectOrder = useSidebarOrderStore((state) => state.setProjectOrder)
  const getWorkspaceOrder = useSidebarOrderStore((state) => state.getWorkspaceOrder)
  const setWorkspaceOrder = useSidebarOrderStore((state) => state.setWorkspaceOrder)

  const activeWorkspaceSelection = useMemo(() => {
    if (!pathname) {
      return null
    }
    const parsed = parseHostWorkspaceRouteFromPathname(pathname)
    if (!parsed) {
      return null
    }
    return {
      serverId: parsed.serverId,
      workspaceId: parsed.workspaceId,
    }
  }, [pathname])

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

  const projectIconRequests = useMemo(() => {
    if (!isOpen || !serverId) {
      return []
    }
    const unique = new Map<string, { serverId: string; cwd: string }>()
    for (const project of projects) {
      const cwd = project.iconWorkingDir.trim()
      if (!cwd) {
        continue
      }
      unique.set(`${serverId}:${cwd}`, { serverId, cwd })
    }
    return Array.from(unique.values())
  }, [isOpen, projects, serverId])

  const projectIconQueries = useQueries({
    queries: projectIconRequests.map((request) => ({
      queryKey: projectIconQueryKey(request.serverId, request.cwd),
      queryFn: async () => {
        const client = getHostRuntimeStore().getClient(request.serverId)
        if (!client) {
          return null
        }
        const result = await client.requestProjectIcon(request.cwd)
        return result.icon
      },
      select: toProjectIconDataUri,
      enabled: Boolean(
        isOpen &&
        getHostRuntimeStore().getClient(request.serverId) &&
        isHostRuntimeConnected(getHostRuntimeStore().getSnapshot(request.serverId)) &&
        request.cwd
      ),
      staleTime: Infinity,
      gcTime: 1000 * 60 * 60,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  })

  const projectIconByProjectKey = useMemo(() => {
    const iconByServerAndCwd = new Map<string, string | null>()
    for (let index = 0; index < projectIconRequests.length; index += 1) {
      const request = projectIconRequests[index]
      if (!request) {
        continue
      }
      iconByServerAndCwd.set(
        `${request.serverId}:${request.cwd}`,
        projectIconQueries[index]?.data ?? null
      )
    }

    const byProject = new Map<string, string | null>()
    for (const project of projects) {
      const cwd = project.iconWorkingDir.trim()
      if (!cwd || !serverId) {
        byProject.set(project.projectKey, null)
        continue
      }
      byProject.set(project.projectKey, iconByServerAndCwd.get(`${serverId}:${cwd}`) ?? null)
    }

    return byProject
  }, [projectIconQueries, projectIconRequests, projects, serverId])

  const shortcutModel = useMemo(
    () =>
      buildSidebarShortcutModel({
        projects,
        collapsedProjectKeys,
      }),
    [collapsedProjectKeys, projects]
  )

  useEffect(() => {
    setSidebarShortcutWorkspaceTargets(shortcutModel.shortcutTargets)
  }, [setSidebarShortcutWorkspaceTargets, shortcutModel.shortcutTargets])

  useEffect(() => {
    return () => {
      setSidebarShortcutWorkspaceTargets([])
    }
  }, [setSidebarShortcutWorkspaceTargets])

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

  const lockOuterScrollForDrag = useCallback((source: string) => {
    console.log('[sidebar-dnd-debug] outer scroll locked', { source })
    setOuterScrollEnabled(false)
  }, [])

  const unlockOuterScrollForDrag = useCallback((source: string) => {
    console.log('[sidebar-dnd-debug] outer scroll unlocked', { source })
    setOuterScrollEnabled(true)
  }, [])

  const handleProjectDragEnd = useCallback(
    (reorderedProjects: SidebarProjectEntry[]) => {
      if (!serverId) {
        return
      }

      const reorderedProjectKeys = reorderedProjects.map((project) => project.projectKey)
      const currentProjectOrder = getProjectOrder(serverId)
      if (
        !hasVisibleOrderChanged({
          currentOrder: currentProjectOrder,
          reorderedVisibleKeys: reorderedProjectKeys,
        })
      ) {
        return
      }

      setProjectOrder(
        serverId,
        mergeWithRemainder({
          currentOrder: currentProjectOrder,
          reorderedVisibleKeys: reorderedProjectKeys,
        })
      )
    },
    [getProjectOrder, serverId, setProjectOrder]
  )

  const handleWorkspaceReorder = useCallback(
    (projectKey: string, reorderedWorkspaces: SidebarWorkspaceEntry[]) => {
      if (!serverId) {
        return
      }

      const reorderedWorkspaceKeys = reorderedWorkspaces.map((workspace) => workspace.workspaceKey)
      const currentWorkspaceOrder = getWorkspaceOrder(serverId, projectKey)
      if (
        !hasVisibleOrderChanged({
          currentOrder: currentWorkspaceOrder,
          reorderedVisibleKeys: reorderedWorkspaceKeys,
        })
      ) {
        return
      }

      setWorkspaceOrder(
        serverId,
        projectKey,
        mergeWithRemainder({
          currentOrder: currentWorkspaceOrder,
          reorderedVisibleKeys: reorderedWorkspaceKeys,
        })
      )
    },
    [getWorkspaceOrder, serverId, setWorkspaceOrder]
  )

  const renderProject = useCallback(
    ({ item, drag, isActive, dragHandleProps }: DraggableRenderItemInfo<SidebarProjectEntry>) => {
      return (
        <ProjectBlock
          project={item}
          collapsed={collapsedProjectKeys.has(item.projectKey)}
          displayName={item.projectName}
          iconDataUri={projectIconByProjectKey.get(item.projectKey) ?? null}
          serverId={serverId}
          activeWorkspaceSelection={activeWorkspaceSelection}
          shouldReplaceWorkspaceNavigation={shouldReplaceWorkspaceNavigation}
          showShortcutBadges={showShortcutBadges}
          shortcutIndexByWorkspaceKey={shortcutModel.shortcutIndexByWorkspaceKey}
          parentGestureRef={parentGestureRef}
          onToggleCollapsed={() => toggleProjectCollapsed(item.projectKey)}
          onWorkspacePress={onWorkspacePress}
          onWorkspaceReorder={handleWorkspaceReorder}
          onAnyDragBegin={() => lockOuterScrollForDrag(`workspace:${item.projectKey}`)}
          onAnyDragEnd={() => unlockOuterScrollForDrag(`workspace:${item.projectKey}`)}
          drag={drag}
          isDragging={isActive}
          dragHandleProps={dragHandleProps}
          useNestable={false}
        />
      )
    },
    [
      activeWorkspaceSelection,
      collapsedProjectKeys,
      handleWorkspaceReorder,
      onWorkspacePress,
      parentGestureRef,
      projectIconByProjectKey,
      serverId,
      shortcutModel.shortcutIndexByWorkspaceKey,
      shouldReplaceWorkspaceNavigation,
      showShortcutBadges,
      toggleProjectCollapsed,
      lockOuterScrollForDrag,
      unlockOuterScrollForDrag,
    ]
  )

  const content = (
    <>
      {projects.length === 0 ? (
        <Text style={styles.emptyText}>No projects yet</Text>
      ) : (
        <DraggableList
          testID="sidebar-project-list"
          data={projects}
          keyExtractor={(project) => project.projectKey}
          renderItem={renderProject}
          onDragIntent={() => lockOuterScrollForDrag('project-list-intent')}
          onDragBegin={() => lockOuterScrollForDrag('project-list-begin')}
          onDragRelease={() => unlockOuterScrollForDrag('project-list-release')}
          onDragEnd={(reorderedProjects) => {
            handleProjectDragEnd(reorderedProjects)
            unlockOuterScrollForDrag('project-list-end')
          }}
          scrollEnabled={false}
          useDragHandle
          nestable={false}
          simultaneousGestureRef={parentGestureRef}
          containerStyle={styles.projectListContainer}
        />
      )}
      {listFooterComponent}
    </>
  )

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={outerScrollEnabled}
        onScrollBeginDrag={() =>
          console.log('[sidebar-dnd-debug] outer scroll begin', { outerScrollEnabled })
        }
        testID="sidebar-project-workspace-list-scroll"
      >
        {content}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[4],
  },
  projectListContainer: {
    width: '100%',
  },
  projectBlock: {
    marginBottom: theme.spacing[1],
  },
  workspaceListContainer: {
    marginLeft: theme.spacing[4],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    textAlign: 'center',
    marginTop: theme.spacing[8],
    marginHorizontal: theme.spacing[2],
  },
  projectRow: {
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[1],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[2],
  },
  projectRowHovered: {
    backgroundColor: theme.colors.surface1,
  },
  projectRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  projectRowDragging: {
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ scale: 1.02 }],
    zIndex: 3,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  projectRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    flex: 1,
    minWidth: 0,
  },
  projectIcon: {
    width: theme.iconSize.sm,
    height: theme.iconSize.sm,
    borderRadius: theme.borderRadius.sm,
  },
  projectIconFallback: {
    width: theme.iconSize.sm,
    height: theme.iconSize.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectIconFallbackText: {
    color: theme.colors.foregroundMuted,
    fontSize: 9,
  },
  projectTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    flex: 1,
    minWidth: 0,
  },
  workspaceRow: {
    minHeight: 36,
    marginBottom: theme.spacing[1],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[2],
  },
  workspaceRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    flex: 1,
    minWidth: 0,
  },
  workspaceRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  workspaceRowHovered: {
    backgroundColor: theme.colors.surface1,
  },
  workspaceRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  workspaceRowDragging: {
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ scale: 1.02 }],
    zIndex: 3,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  workspaceRowSelected: {
    backgroundColor: theme.colors.surface2,
  },
  workspaceRowContainer: {
    position: 'relative',
  },
  workspaceStatusDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  workspaceStatusDotFill: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
  },
  workspaceArchivingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: `${theme.colors.surface0}cc`,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: theme.spacing[2],
    zIndex: 1,
  },
  workspaceArchivingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  workspaceBranchText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    flex: 1,
    minWidth: 0,
  },
  dragHandle: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    flexShrink: 0,
  },
  dragHandlePressed: {
    backgroundColor: theme.colors.surface2,
    borderColor: theme.colors.foregroundMuted,
    transform: [{ scale: 0.96 }],
  },
  workspaceCreatedAtText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    flexShrink: 0,
  },
  shortcutBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutBadgeText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    lineHeight: 14,
  },
}))
