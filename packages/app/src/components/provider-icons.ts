import { Bot } from "lucide-react-native";
import { ClaudeIcon } from "@/components/icons/claude-icon";
import { CodexIcon } from "@/components/icons/codex-icon";

const PROVIDER_ICONS: Record<string, typeof Bot> = {
  claude: ClaudeIcon as unknown as typeof Bot,
  codex: CodexIcon as unknown as typeof Bot,
};

export function getProviderIcon(provider: string): typeof Bot {
  return PROVIDER_ICONS[provider] ?? Bot;
}
