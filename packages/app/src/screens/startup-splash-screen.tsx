import { Image, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.surface0,
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: theme.spacing[6],
  },
  status: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));

export function StartupSplashScreen() {
  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/images/icon.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.status}>Starting up…</Text>
    </View>
  );
}
