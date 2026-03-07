import { View, Text, Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { FolderOpen } from "lucide-react-native";
import { PaseoLogo } from "@/components/icons/paseo-logo";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";

export function OpenProjectScreen({ serverId: _serverId }: { serverId: string }) {
  const { theme } = useUnistyles();
  const setProjectPickerOpen = useKeyboardShortcutsStore(
    (s) => s.setProjectPickerOpen
  );

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <PaseoLogo size={56} />
        <Text style={styles.heading}>What shall we build today?</Text>
        <Pressable
          style={({ hovered }) => [
            styles.openButton,
            hovered && styles.openButtonHovered,
          ]}
          onPress={() => setProjectPickerOpen(true)}
          testID="open-project-submit"
        >
          <FolderOpen size={16} color={theme.colors.foregroundMuted} />
          <Text style={styles.openButtonText}>Open a project</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
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
