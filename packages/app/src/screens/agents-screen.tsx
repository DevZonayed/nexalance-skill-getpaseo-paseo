import { useMemo, useState, useCallback, useEffect } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { BackHeader } from "@/components/headers/back-header";
import { AgentList } from "@/components/agent-list";
import { useAllAgentsList } from "@/hooks/use-all-agents-list";
import { router } from "expo-router";
import { buildHostRootRoute } from "@/utils/host-routes";

export function AgentsScreen({ serverId }: { serverId: string }) {
  const { agents, isRevalidating, refreshAll } = useAllAgentsList({
    serverId,
  });

  // Track user-initiated refresh to avoid showing spinner on background revalidation
  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsManualRefresh(true);
    refreshAll();
  }, [refreshAll]);

  // Reset manual refresh flag when revalidation completes
  useEffect(() => {
    if (!isRevalidating && isManualRefresh) {
      setIsManualRefresh(false);
    }
  }, [isRevalidating, isManualRefresh]);

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      const aNeedsInput = (a.pendingPermissionCount ?? 0) > 0;
      const bNeedsInput = (b.pendingPermissionCount ?? 0) > 0;
      if (aNeedsInput && !bNeedsInput) return -1;
      if (!aNeedsInput && bNeedsInput) return 1;

      if (a.requiresAttention && !b.requiresAttention) return -1;
      if (!a.requiresAttention && b.requiresAttention) return 1;
      return 0;
    });
  }, [agents]);

  return (
    <View style={styles.container}>
      <BackHeader
        title="All agents"
        onBack={() => router.replace(buildHostRootRoute(serverId) as any)}
      />
      <AgentList
        agents={sortedAgents}
        showCheckoutInfo={false}
        isRefreshing={isManualRefresh && isRevalidating}
        onRefresh={handleRefresh}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
}));
