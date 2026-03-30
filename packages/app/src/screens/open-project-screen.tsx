import { useEffect } from "react";
import { View, Text } from "react-native";
import { StyleSheet, UnistylesRuntime } from "react-native-unistyles";
import { FolderOpen } from "lucide-react-native";
import { PaseoLogo } from "@/components/icons/paseo-logo";
import { Button } from "@/components/ui/button";
import { MenuHeader } from "@/components/headers/menu-header";
import { useOpenProjectPicker } from "@/hooks/use-open-project-picker";
import { usePanelStore } from "@/stores/panel-store";
import { useSessionStore } from "@/stores/session-store";
import { useDesktopDragHandlers } from "@/utils/desktop-window";

export function OpenProjectScreen({ serverId }: { serverId: string }) {
  const openAgentList = usePanelStore((s) => s.openAgentList);
  const openProjectPicker = useOpenProjectPicker(serverId);
  const hasHydrated = useSessionStore((s) => s.sessions[serverId]?.hasHydratedWorkspaces ?? false);
  const hasProjects = useSessionStore((s) => (s.sessions[serverId]?.workspaces?.size ?? 0) > 0);

  const isMobile = UnistylesRuntime.breakpoint === "xs" || UnistylesRuntime.breakpoint === "sm";
  const dragHandlers = useDesktopDragHandlers();

  useEffect(() => {
    if (!isMobile) {
      openAgentList();
    }
  }, [isMobile, openAgentList]);

  return (
    <View style={styles.container}>
      <MenuHeader borderless />
      <View style={styles.content} {...dragHandlers}>
        <View style={styles.logo}>
          <PaseoLogo size={56} />
        </View>
        <View style={styles.headingGroup}>
          <Text style={styles.heading}>What shall we build today?</Text>
          {hasHydrated && !hasProjects ? (
            <Text style={styles.subtitle}>
              Add a project folder to start running agents on your codebase
            </Text>
          ) : null}
        </View>
        <View style={styles.cta}>
          <Button variant="default" leftIcon={FolderOpen} onPress={() => void openProjectPicker()} testID="open-project-submit">
            Add a project
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
    userSelect: "none",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 0,
    padding: theme.spacing[6],
  },
  logo: {
    marginBottom: theme.spacing[8],
  },
  headingGroup: {
    alignItems: "center",
    gap: theme.spacing[3],
  },
  cta: {
    marginTop: theme.spacing[12],
  },
  heading: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize["2xl"],
    fontWeight: theme.fontWeight.normal,
    textAlign: "center",
  },
  subtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
}));
