import invariant from "tiny-invariant";
import { PaneProvider } from "@/panels/pane-context";
import { getPanelRegistration } from "@/panels/panel-registry";
import { ensurePanelsRegistered } from "@/panels/register-panels";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";

export interface WorkspacePaneContentProps {
  tab: WorkspaceTabDescriptor;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  onOpenTab: (target: WorkspaceTabDescriptor["target"]) => void;
  onCloseCurrentTab: () => void;
  onRetargetCurrentTab: (target: WorkspaceTabDescriptor["target"]) => void;
  onOpenWorkspaceFile: (filePath: string) => void;
}

export function WorkspacePaneContent({
  tab,
  normalizedServerId,
  normalizedWorkspaceId,
  onOpenTab,
  onCloseCurrentTab,
  onRetargetCurrentTab,
  onOpenWorkspaceFile,
}: WorkspacePaneContentProps) {
  ensurePanelsRegistered();
  const registration = getPanelRegistration(tab.kind);
  invariant(registration, `No panel registration for kind: ${tab.kind}`);
  const Component = registration.component;

  return (
    <PaneProvider
      value={{
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
        tabId: tab.tabId,
        target: tab.target,
        openTab: onOpenTab,
        closeCurrentTab: onCloseCurrentTab,
        retargetCurrentTab: onRetargetCurrentTab,
        openFileInWorkspace: onOpenWorkspaceFile,
      }}
    >
      <Component key={`${normalizedServerId}:${normalizedWorkspaceId}:${tab.tabId}`} />
    </PaneProvider>
  );
}
