import { useState, useCallback, useEffect, useMemo, type ReactElement } from "react";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCheckoutGitActionsStore } from "@/stores/checkout-git-actions-store";
import { useCheckoutStatusQuery } from "@/hooks/use-checkout-status-query";
import { useCheckoutPrStatusQuery } from "@/hooks/use-checkout-pr-status-query";
import { shouldShowMergeFromBaseAction } from "@/components/git-action-visibility";
import { buildNewAgentRoute, resolveNewAgentWorkingDir } from "@/utils/new-agent-routing";
import { openExternalUrl } from "@/utils/open-external-url";
import type { ActionStatus } from "@/components/ui/dropdown-menu";

export type GitActionId =
  | "commit"
  | "push"
  | "view-pr"
  | "create-pr"
  | "merge-branch"
  | "merge-from-base"
  | "archive-worktree";

export interface GitAction {
  id: GitActionId;
  label: string;
  pendingLabel: string;
  successLabel: string;
  disabled: boolean;
  status: ActionStatus;
  description?: string;
  icon?: ReactElement;
  handler: () => void;
}

export interface GitActions {
  primary: GitAction | null;
  secondary: GitAction[];
  menu: GitAction[];
}

function openURLInNewTab(url: string): void {
  void openExternalUrl(url);
}

interface UseGitActionsInput {
  serverId: string;
  cwd: string;
  icons: {
    commit: ReactElement;
    push: ReactElement;
    viewPr: ReactElement;
    createPr: ReactElement;
    merge: ReactElement;
    mergeFromBase: ReactElement;
    archive: ReactElement;
  };
}

interface UseGitActionsResult {
  gitActions: GitActions;
  branchLabel: string;
  actionError: string | null;
  isGit: boolean;
}

export function useGitActions({ serverId, cwd, icons }: UseGitActionsInput): UseGitActionsResult {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [postShipArchiveSuggested, setPostShipArchiveSuggested] = useState(false);
  const [shipDefault, setShipDefault] = useState<"merge" | "pr">("merge");

  const { status, isLoading: isStatusLoading } =
    useCheckoutStatusQuery({ serverId, cwd });
  const gitStatus = status && status.isGit ? status : null;
  const isGit = Boolean(gitStatus);
  const notGit = status !== null && !status.isGit && !status.error;
  const baseRef = gitStatus?.baseRef ?? undefined;

  const hasUncommittedChanges = Boolean(gitStatus?.isDirty);

  const {
    status: prStatus,
    githubFeaturesEnabled,
  } = useCheckoutPrStatusQuery({
    serverId,
    cwd,
    enabled: isGit,
  });

  // Ship default persistence
  const shipDefaultStorageKey = useMemo(() => {
    if (!gitStatus?.repoRoot) {
      return null;
    }
    return `@paseo:changes-ship-default:${gitStatus.repoRoot}`;
  }, [gitStatus?.repoRoot]);

  useEffect(() => {
    if (!shipDefaultStorageKey) {
      return;
    }
    let isActive = true;
    AsyncStorage.getItem(shipDefaultStorageKey)
      .then((value) => {
        if (!isActive) return;
        if (value === "pr" || value === "merge") {
          setShipDefault(value);
        }
      })
      .catch(() => undefined);
    return () => {
      isActive = false;
    };
  }, [shipDefaultStorageKey]);

  const persistShipDefault = useCallback(
    async (next: "merge" | "pr") => {
      setShipDefault(next);
      if (!shipDefaultStorageKey) return;
      try {
        await AsyncStorage.setItem(shipDefaultStorageKey, next);
      } catch {
        // Ignore persistence failures; default will reset to "merge".
      }
    },
    [shipDefaultStorageKey]
  );

  useEffect(() => {
    setPostShipArchiveSuggested(false);
  }, [cwd]);

  // Store selectors
  const commitStatus = useCheckoutGitActionsStore((state) =>
    state.getStatus({ serverId, cwd, actionId: "commit" })
  );
  const pushStatus = useCheckoutGitActionsStore((state) =>
    state.getStatus({ serverId, cwd, actionId: "push" })
  );
  const prCreateStatus = useCheckoutGitActionsStore((state) =>
    state.getStatus({ serverId, cwd, actionId: "create-pr" })
  );
  const mergeStatus = useCheckoutGitActionsStore((state) =>
    state.getStatus({ serverId, cwd, actionId: "merge-branch" })
  );
  const mergeFromBaseStatus = useCheckoutGitActionsStore((state) =>
    state.getStatus({ serverId, cwd, actionId: "merge-from-base" })
  );
  const archiveStatus = useCheckoutGitActionsStore((state) =>
    state.getStatus({ serverId, cwd, actionId: "archive-worktree" })
  );

  const runCommit = useCheckoutGitActionsStore((state) => state.commit);
  const runPush = useCheckoutGitActionsStore((state) => state.push);
  const runCreatePr = useCheckoutGitActionsStore((state) => state.createPr);
  const runMergeBranch = useCheckoutGitActionsStore((state) => state.mergeBranch);
  const runMergeFromBase = useCheckoutGitActionsStore((state) => state.mergeFromBase);
  const runArchiveWorktree = useCheckoutGitActionsStore((state) => state.archiveWorktree);

  // Handlers
  const handleCommit = useCallback(() => {
    setActionError(null);
    void runCommit({ serverId, cwd }).catch((err) => {
      const message = err instanceof Error ? err.message : "Failed to commit";
      setActionError(message);
    });
  }, [runCommit, serverId, cwd]);

  const handlePush = useCallback(() => {
    setActionError(null);
    void runPush({ serverId, cwd }).catch((err) => {
      const message = err instanceof Error ? err.message : "Failed to push";
      setActionError(message);
    });
  }, [runPush, serverId, cwd]);

  const handleCreatePr = useCallback(() => {
    void persistShipDefault("pr");
    setActionError(null);
    void runCreatePr({ serverId, cwd }).catch((err) => {
      const message = err instanceof Error ? err.message : "Failed to create PR";
      setActionError(message);
    });
  }, [persistShipDefault, runCreatePr, serverId, cwd]);

  const handleMergeBranch = useCallback(() => {
    if (!baseRef) {
      setActionError("Base ref unavailable");
      return;
    }
    void persistShipDefault("merge");
    setActionError(null);
    void runMergeBranch({ serverId, cwd, baseRef })
      .then(() => {
        setPostShipArchiveSuggested(true);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Failed to merge";
        setActionError(message);
      });
  }, [baseRef, persistShipDefault, runMergeBranch, serverId, cwd]);

  const handleMergeFromBase = useCallback(() => {
    if (!baseRef) {
      setActionError("Base ref unavailable");
      return;
    }
    setActionError(null);
    void runMergeFromBase({ serverId, cwd, baseRef }).catch((err) => {
      const message = err instanceof Error ? err.message : "Failed to merge from base";
      setActionError(message);
    });
  }, [baseRef, runMergeFromBase, serverId, cwd]);

  const handleArchiveWorktree = useCallback(() => {
    const worktreePath = status?.cwd;
    if (!worktreePath) {
      setActionError("Worktree path unavailable");
      return;
    }
    setActionError(null);
    const targetWorkingDir = resolveNewAgentWorkingDir(cwd, status ?? null);
    void runArchiveWorktree({ serverId, cwd, worktreePath })
      .then(() => {
        router.replace(buildNewAgentRoute(serverId, targetWorkingDir) as any);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Failed to archive worktree";
        setActionError(message);
      });
  }, [runArchiveWorktree, router, serverId, cwd, status]);

  // Derived state
  const actionsDisabled = !isGit || Boolean(status?.error) || isStatusLoading;
  const aheadCount = gitStatus?.aheadBehind?.ahead ?? 0;
  const aheadOfOrigin = gitStatus?.aheadOfOrigin ?? 0;
  const behindOfOrigin = gitStatus?.behindOfOrigin ?? 0;
  const baseRefLabel = useMemo(() => {
    if (!baseRef) return "base";
    const trimmed = baseRef.replace(/^refs\/(heads|remotes)\//, "").trim();
    return trimmed.startsWith("origin/") ? trimmed.slice("origin/".length) : trimmed;
  }, [baseRef]);
  const hasPullRequest = Boolean(prStatus?.url);
  const hasRemote = gitStatus?.hasRemote ?? false;
  const isPaseoOwnedWorktree = gitStatus?.isPaseoOwnedWorktree ?? false;
  const isMergedPullRequest = Boolean(prStatus?.isMerged);
  const currentBranch = gitStatus?.currentBranch;
  const isOnBaseBranch = currentBranch === baseRefLabel;
  const shouldPromoteArchive =
    isPaseoOwnedWorktree &&
    !hasUncommittedChanges &&
    (postShipArchiveSuggested || isMergedPullRequest);

  const commitDisabled = actionsDisabled || commitStatus === "pending";
  const prDisabled = actionsDisabled || prCreateStatus === "pending";
  const mergeDisabled =
    actionsDisabled || mergeStatus === "pending" || hasUncommittedChanges || !baseRef;
  const mergeFromBaseDisabled =
    actionsDisabled ||
    mergeFromBaseStatus === "pending" ||
    hasUncommittedChanges ||
    !baseRef ||
    (isOnBaseBranch && !hasRemote);
  const pushDisabled =
    actionsDisabled || pushStatus === "pending" || !(gitStatus?.hasRemote ?? false);
  const archiveDisabled =
    actionsDisabled ||
    archiveStatus === "pending" ||
    !gitStatus?.isPaseoOwnedWorktree;

  const branchLabel =
    gitStatus?.currentBranch && gitStatus.currentBranch !== "HEAD"
      ? gitStatus.currentBranch
      : notGit
        ? "Not a git repository"
        : "Unknown";

  // Build actions
  const gitActions: GitActions = useMemo(() => {
    if (!isGit) {
      return { primary: null, secondary: [], menu: [] };
    }

    const allActions = new Map<GitActionId, GitAction>();

    allActions.set("commit", {
      id: "commit",
      label: "Commit",
      pendingLabel: "Committing...",
      successLabel: "Committed",
      disabled: commitDisabled,
      status: commitStatus,
      icon: icons.commit,
      handler: handleCommit,
    });

    if (hasRemote) {
      allActions.set("push", {
        id: "push",
        label: "Push",
        pendingLabel: "Pushing...",
        successLabel: "Pushed",
        disabled: pushDisabled,
        status: pushStatus,
        description: !hasRemote ? "No remote configured" : undefined,
        icon: icons.push,
        handler: handlePush,
      });
    }

    if (githubFeaturesEnabled && hasPullRequest && prStatus?.url) {
      const prUrl = prStatus.url;
      allActions.set("view-pr", {
        id: "view-pr",
        label: "View PR",
        pendingLabel: "View PR",
        successLabel: "View PR",
        disabled: false,
        status: "idle",
        icon: icons.viewPr,
        handler: () => openURLInNewTab(prUrl),
      });
    }

    if (githubFeaturesEnabled && aheadCount > 0 && !hasPullRequest) {
      allActions.set("create-pr", {
        id: "create-pr",
        label: "Create PR",
        pendingLabel: "Creating PR...",
        successLabel: "PR Created",
        disabled: prDisabled,
        status: prCreateStatus,
        icon: icons.createPr,
        handler: handleCreatePr,
      });
    }

    if (aheadCount > 0) {
      allActions.set("merge-branch", {
        id: "merge-branch",
        label: `Merge into ${baseRefLabel}`,
        pendingLabel: "Merging...",
        successLabel: "Merged",
        disabled: mergeDisabled,
        status: mergeStatus,
        description: hasUncommittedChanges ? "Requires clean working tree" : undefined,
        icon: icons.merge,
        handler: handleMergeBranch,
      });
    }

    if (
      shouldShowMergeFromBaseAction({
        isOnBaseBranch,
        hasRemote,
        aheadOfOrigin,
        behindOfOrigin,
      })
    ) {
      allActions.set("merge-from-base", {
        id: "merge-from-base",
        label: isOnBaseBranch ? "Sync" : `Update from ${baseRefLabel}`,
        pendingLabel: "Updating...",
        successLabel: "Updated",
        disabled: mergeFromBaseDisabled,
        status: mergeFromBaseStatus,
        description:
          hasUncommittedChanges
            ? "Requires clean working tree"
            : isOnBaseBranch && !hasRemote
              ? "No remote configured"
              : undefined,
        icon: icons.mergeFromBase,
        handler: handleMergeFromBase,
      });
    }

    if (isPaseoOwnedWorktree) {
      allActions.set("archive-worktree", {
        id: "archive-worktree",
        label: "Archive worktree",
        pendingLabel: "Archiving...",
        successLabel: "Archived",
        disabled: archiveDisabled,
        status: archiveStatus,
        icon: icons.archive,
        handler: handleArchiveWorktree,
      });
    }

    // Select primary action (priority rules)
    let primaryActionId: GitActionId | null = null;

    if (shouldPromoteArchive && allActions.has("archive-worktree")) {
      primaryActionId = "archive-worktree";
    } else if (hasUncommittedChanges) {
      primaryActionId = "commit";
    } else if (aheadOfOrigin > 0 && allActions.has("push")) {
      primaryActionId = "push";
    } else if (hasPullRequest) {
      primaryActionId = "view-pr";
    } else if (isOnBaseBranch && allActions.has("merge-from-base")) {
      primaryActionId = "merge-from-base";
    } else if (aheadCount > 0) {
      const preferred: GitActionId = shipDefault === "merge" ? "merge-branch" : "create-pr";
      const fallback: GitActionId = shipDefault === "merge" ? "create-pr" : "merge-branch";

      const preferredAction = allActions.get(preferred);
      const fallbackAction = allActions.get(fallback);

      if (preferredAction && !preferredAction.disabled) {
        primaryActionId = preferred;
      } else if (fallbackAction && !fallbackAction.disabled) {
        primaryActionId = fallback;
      } else if (preferredAction) {
        primaryActionId = preferred;
      }
    }

    const primary = primaryActionId ? allActions.get(primaryActionId) ?? null : null;

    const secondaryIds: GitActionId[] = [
      "merge-branch",
      "create-pr",
      "view-pr",
      "merge-from-base",
      "push",
      "archive-worktree",
    ];
    const secondary = secondaryIds
      .filter(id => id !== primaryActionId && allActions.has(id))
      .map(id => allActions.get(id)!);

    const menu: GitAction[] = [];

    return { primary, secondary, menu };
  }, [
    isGit, hasRemote, hasPullRequest, prStatus?.url, aheadCount, isPaseoOwnedWorktree, isOnBaseBranch, githubFeaturesEnabled,
    hasUncommittedChanges, aheadOfOrigin, behindOfOrigin, shipDefault, baseRefLabel, shouldPromoteArchive,
    commitDisabled, pushDisabled, prDisabled, mergeDisabled, mergeFromBaseDisabled, archiveDisabled,
    commitStatus, pushStatus, prCreateStatus, mergeStatus, mergeFromBaseStatus, archiveStatus,
    handleCommit, handlePush, handleCreatePr, handleMergeBranch, handleMergeFromBase, handleArchiveWorktree,
    icons, baseRef,
  ]);

  return { gitActions, branchLabel, actionError, isGit };
}
