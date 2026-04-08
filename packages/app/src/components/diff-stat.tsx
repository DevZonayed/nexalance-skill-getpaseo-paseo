import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";

interface DiffStatProps {
  additions: number;
  deletions: number;
}

export function DiffStat({ additions, deletions }: DiffStatProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.additions}>+{additions.toLocaleString()}</Text>
      <Text style={styles.deletions}>-{deletions.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  additions: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.palette.green[400],
  },
  deletions: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.palette.red[500],
  },
}));
