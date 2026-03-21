import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { PaseoLogo } from "@/components/icons/paseo-logo";
import { useDesktopDragHandlers } from "@/utils/desktop-window";

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.surface0,
  },
  status: {
    marginTop: theme.spacing[8],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.lg,
  },
}));

export function StartupSplashScreen() {
  const dragHandlers = useDesktopDragHandlers();

  return (
    <View style={styles.container} {...dragHandlers}>
      <PaseoLogo size={96} />
      <Text style={styles.status}>Starting up…</Text>
    </View>
  );
}
