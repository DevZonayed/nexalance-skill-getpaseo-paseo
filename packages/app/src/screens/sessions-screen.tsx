import { useMemo, useState, useCallback, useEffect } from "react";
import { View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { StyleSheet } from "react-native-unistyles";
import { MenuHeader } from "@/components/headers/menu-header";
import { AgentList } from "@/components/agent-list";
import { useAllAgentsList } from "@/hooks/use-all-agents-list";

export function SessionsScreen({ serverId }: { serverId: string }) {
  const isFocused = useIsFocused();

  if (!isFocused) {
    return <View style={styles.container} />;
  }

  return <SessionsScreenContent serverId={serverId} />;
}

function SessionsScreenContent({ serverId }: { serverId: string }) {
  const { agents, isRevalidating, refreshAll } = useAllAgentsList({
    serverId,
    includeArchived: true,
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
    return [...agents].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [agents]);

  return (
    <View style={styles.container}>
      <MenuHeader title="Sessions" />
      <AgentList
        agents={sortedAgents}
        showCheckoutInfo={false}
        isRefreshing={isManualRefresh && isRevalidating}
        onRefresh={handleRefresh}
        showAttentionIndicator={false}
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
