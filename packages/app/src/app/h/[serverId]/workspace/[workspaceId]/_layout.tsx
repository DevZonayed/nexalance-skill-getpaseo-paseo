import { useLocalSearchParams } from 'expo-router'
import { WorkspaceScreen } from '@/screens/workspace/workspace-screen'
import {
  decodeWorkspaceIdFromPathSegment,
  parseWorkspaceOpenIntent,
} from '@/utils/host-routes'

export default function HostWorkspaceLayout() {
  const params = useLocalSearchParams<{
    serverId?: string | string[]
    workspaceId?: string | string[]
    open?: string | string[]
  }>()
  const serverValue = Array.isArray(params.serverId) ? params.serverId[0] : params.serverId
  const workspaceValue = Array.isArray(params.workspaceId)
    ? params.workspaceId[0]
    : params.workspaceId
  const serverId = serverValue?.trim() ?? ''
  const workspaceId = workspaceValue ? (decodeWorkspaceIdFromPathSegment(workspaceValue) ?? '') : ''
  const openValue = Array.isArray(params.open) ? params.open[0] : params.open
  const openIntent = parseWorkspaceOpenIntent(openValue)

  return (
    <WorkspaceScreen
      key={`${serverId}:${workspaceId}`}
      serverId={serverId}
      workspaceId={workspaceId}
      openIntent={openIntent}
    />
  )
}
