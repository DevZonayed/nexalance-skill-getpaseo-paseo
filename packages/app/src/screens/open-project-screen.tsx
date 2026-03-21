import { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { StyleSheet, UnistylesRuntime, useUnistyles } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FolderOpen } from "lucide-react-native";
import { PaseoLogo } from "@/components/icons/paseo-logo";
import { SidebarMenuToggle } from "@/components/headers/menu-header";
import { useOpenProjectPicker } from "@/hooks/use-open-project-picker";
import { usePanelStore } from "@/stores/panel-store";
import { getIsDesktopMac } from "@/constants/layout";
import { useDesktopDragHandlers, useTrafficLightPadding } from "@/utils/desktop-window";

export function OpenProjectScreen({ serverId }: { serverId: string }) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const trafficLightPadding = useTrafficLightPadding();
  const desktopAgentListOpen = usePanelStore((s) => s.desktop.agentListOpen);
  const openAgentList = usePanelStore((s) => s.openAgentList);
  const openProjectPicker = useOpenProjectPicker(serverId);

  const isMobile = UnistylesRuntime.breakpoint === "xs" || UnistylesRuntime.breakpoint === "sm";
  const needsTrafficLightInset = !isMobile && !desktopAgentListOpen && getIsDesktopMac();
  const trafficLightInset = needsTrafficLightInset ? trafficLightPadding.left : 0;
  const dragHandlers = useDesktopDragHandlers();

  useEffect(() => {
    if (!isMobile) {
      openAgentList();
    }
  }, [isMobile, openAgentList]);

  return (
    <View style={styles.container} {...dragHandlers}>
      <View style={[styles.menuToggle, { paddingTop: insets.top, paddingLeft: trafficLightInset }]}>
        <SidebarMenuToggle />
      </View>
      <View style={styles.content}>
        <PaseoLogo size={56} />
        <Text style={styles.heading}>What shall we build today?</Text>
        <Pressable
          style={({ hovered }) => [styles.openButton, hovered && styles.openButtonHovered]}
          onPress={() => {
            void openProjectPicker();
          }}
          testID="open-project-submit"
        >
          <FolderOpen size={16} color={theme.colors.foregroundMuted} />
          <Text style={styles.openButtonText}>Add a project</Text>
        </Pressable>
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
  menuToggle: {
    position: "absolute",
    top: theme.spacing[3],
    left: theme.spacing[3],
    zIndex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[6],
    padding: theme.spacing[6],
  },
  heading: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize["2xl"],
    fontWeight: theme.fontWeight.normal,
    textAlign: "center",
  },
  openButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: "transparent",
  },
  openButtonHovered: {
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface1,
  },
  openButtonText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
}));
