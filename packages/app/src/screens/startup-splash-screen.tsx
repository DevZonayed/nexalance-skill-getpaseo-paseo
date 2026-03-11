import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { PaseoLogo } from "@/components/icons/paseo-logo";
import { useTauriDragHandlers } from "@/utils/tauri-window";

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.surface0,
  },
  status: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));

export function StartupSplashScreen() {
  const dragHandlers = useTauriDragHandlers();

  return (
    <View style={styles.container} {...dragHandlers}>
      <PaseoLogo size={96} />
      <Text style={styles.status}>Starting up…</Text>
    </View>
  );
}
