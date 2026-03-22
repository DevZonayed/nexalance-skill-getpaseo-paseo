import { useMemo } from "react";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { chordStringToShortcutKeys } from "@/keyboard/shortcut-string";
import { getBindingIdForAction, getDefaultKeysForAction } from "@/keyboard/keyboard-shortcuts";
import { useKeyboardShortcutOverrides } from "@/hooks/use-keyboard-shortcut-overrides";
import { getShortcutOs } from "@/utils/shortcut-platform";
import { getIsDesktop } from "@/constants/layout";

export function useShortcutKeys(actionId: string): ShortcutKey[][] | null {
  const { overrides } = useKeyboardShortcutOverrides();
  const isMac = getShortcutOs() === "mac";
  const isDesktop = getIsDesktop();

  return useMemo(() => {
    const platform = { isMac, isDesktop };
    const bindingId = getBindingIdForAction(actionId, platform);
    if (!bindingId) return null;

    const override = overrides[bindingId];
    if (override) {
      return chordStringToShortcutKeys(override);
    }

    const defaultKeys = getDefaultKeysForAction(actionId, platform);
    return defaultKeys ? [defaultKeys] : null;
  }, [actionId, overrides, isMac, isDesktop]);
}
