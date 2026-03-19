import { useQuery } from '@tanstack/react-query'
import { getManagedDaemonStatus } from '@/desktop/managed-runtime/managed-runtime'
import { isTauriEnvironment } from '@/utils/tauri'

const MANAGED_DAEMON_SERVER_ID_QUERY_KEY = ['managed-daemon-server-id'] as const

interface ManagedDaemonServerIdResult {
  serverId: string | null
}

async function loadManagedDaemonServerId(): Promise<ManagedDaemonServerIdResult> {
  const status = await getManagedDaemonStatus()
  const serverId = status.serverId.trim()
  return {
    serverId: serverId.length > 0 ? serverId : null,
  }
}

export function useIsLocalDaemon(serverId: string): boolean {
  const normalizedServerId = serverId.trim()
  const isDesktop = isTauriEnvironment()

  const query = useQuery({
    queryKey: MANAGED_DAEMON_SERVER_ID_QUERY_KEY,
    queryFn: loadManagedDaemonServerId,
    enabled: isDesktop,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  })

  if (!isDesktop || normalizedServerId.length === 0) {
    return false
  }

  return query.data?.serverId === normalizedServerId
}
