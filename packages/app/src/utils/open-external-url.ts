import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { getDesktopHost } from "@/desktop/host";

export async function openExternalUrl(url: string): Promise<void> {
  if (Platform.OS === "web") {
    const opener = getDesktopHost()?.opener?.openUrl;
    if (typeof opener === "function") {
      await opener(url);
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  await Linking.openURL(url);
}
