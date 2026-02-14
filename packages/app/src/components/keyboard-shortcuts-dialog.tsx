import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { getIsTauri } from "@/constants/layout";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Shortcut } from "@/components/ui/shortcut";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { getShortcutOs } from "@/utils/shortcut-platform";

type ShortcutHelpRow = {
  id: string;
  label: string;
  keys: ShortcutKey[];
  note?: string;
};

type ShortcutHelpSection = {
  title: string;
  rows: ShortcutHelpRow[];
};

function buildShortcutHelpSections(input: {
  isMac: boolean;
  isTauri: boolean;
}): ShortcutHelpSection[] {
  const leftSidebarKeys: ShortcutKey[] = input.isMac ? ["mod", "B"] : ["mod", "."];
  const newAgentKeys: ShortcutKey[] = input.isTauri
    ? ["mod", "N"]
    : ["mod", "alt", "N"];
  const quickAgentKeys: ShortcutKey[] = input.isTauri
    ? ["mod", "1-9"]
    : ["alt", "1-9"];

  return [
    {
      title: "Global",
      rows: [
        {
          id: "show-shortcuts",
          label: "Show keyboard shortcuts",
          keys: ["?"],
          note: "Available when focus is not in a text field or terminal.",
        },
        {
          id: "toggle-left-sidebar",
          label: "Toggle left sidebar",
          keys: leftSidebarKeys,
        },
        {
          id: "toggle-right-sidebar",
          label: "Toggle right sidebar",
          keys: ["mod", "E"],
        },
        {
          id: "toggle-command-center",
          label: "Toggle command center",
          keys: ["mod", "K"],
        },
        {
          id: "new-agent",
          label: "Create new agent",
          keys: newAgentKeys,
        },
        {
          id: "quick-open-agent",
          label: "Open sidebar agent shortcut",
          keys: quickAgentKeys,
        },
      ],
    },
    {
      title: "Agent Input",
      rows: [
        {
          id: "dictation-toggle",
          label: "Start/stop dictation",
          keys: ["mod", "D"],
        },
        {
          id: "voice-toggle",
          label: "Toggle voice mode",
          keys: ["mod", "shift", "D"],
        },
        {
          id: "voice-mute-toggle",
          label: "Mute/unmute voice mode",
          keys: ["Space"],
        },
      ],
    },
  ];
}

export function KeyboardShortcutsDialog() {
  const open = useKeyboardShortcutsStore((s) => s.shortcutsDialogOpen);
  const setOpen = useKeyboardShortcutsStore((s) => s.setShortcutsDialogOpen);

  const isMac = getShortcutOs() === "mac";
  const isTauri = getIsTauri();
  const sections = useMemo(
    () => buildShortcutHelpSections({ isMac, isTauri }),
    [isMac, isTauri]
  );

  return (
    <AdaptiveModalSheet
      title="Keyboard shortcuts"
      visible={open}
      onClose={() => setOpen(false)}
      testID="keyboard-shortcuts-dialog"
      snapPoints={["70%", "92%"]}
    >
      <View testID="keyboard-shortcuts-dialog-content" style={styles.content}>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.rows}>
              {section.rows.map((row) => (
                <View key={row.id} style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    {row.note ? <Text style={styles.rowNote}>{row.note}</Text> : null}
                  </View>
                  <Shortcut keys={row.keys} style={styles.rowShortcut} />
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.spacing[4],
  },
  section: {
    gap: theme.spacing[2],
  },
  sectionTitle: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
  },
  rows: {
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.surface2,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  rowNote: {
    marginTop: 2,
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  rowShortcut: {
    alignSelf: "flex-start",
  },
}));
