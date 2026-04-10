import type { ReactElement } from "react";

import type { ActionStatus } from "@/components/ui/dropdown-menu";

export type GitActionId =
  | "commit"
  | "pull"
  | "push"
  | "pr"
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

interface GitActionRuntimeState {
  disabled: boolean;
  status: ActionStatus;
  icon?: ReactElement;
  handler: () => void;
}

export interface BuildGitActionsInput {
  isGit: boolean;
  githubFeaturesEnabled: boolean;
  hasPullRequest: boolean;
  pullRequestUrl: string | null;
  hasRemote: boolean;
  isPaseoOwnedWorktree: boolean;
  isOnBaseBranch: boolean;
  hasUncommittedChanges: boolean;
  baseRefAvailable: boolean;
  baseRefLabel: string;
  aheadCount: number;
  behindBaseCount: number;
  aheadOfOrigin: number;
  behindOfOrigin: number;
  shouldPromoteArchive: boolean;
  shipDefault: "merge" | "pr";
  runtime: Record<GitActionId, GitActionRuntimeState>;
}

const REMOTE_ACTION_IDS: GitActionId[] = ["pull", "push"];
const FEATURE_ACTION_IDS: GitActionId[] = ["merge-from-base", "merge-branch", "pr"];

export function buildGitActions(input: BuildGitActionsInput): GitActions {
  if (!input.isGit) {
    return { primary: null, secondary: [], menu: [] };
  }

  const allActions = new Map<GitActionId, GitAction>();

  allActions.set("commit", {
    id: "commit",
    label: "Commit",
    pendingLabel: "Committing...",
    successLabel: "Committed",
    disabled: input.runtime.commit.disabled,
    status: input.runtime.commit.status,
    icon: input.runtime.commit.icon,
    handler: input.runtime.commit.handler,
  });

  allActions.set("pull", {
    id: "pull",
    label: "Pull",
    pendingLabel: "Pulling...",
    successLabel: "Pulled",
    disabled: input.runtime.pull.disabled || !canPull(input),
    status: input.runtime.pull.status,
    description: getPullDescription(input),
    icon: input.runtime.pull.icon,
    handler: input.runtime.pull.handler,
  });

  allActions.set("push", {
    id: "push",
    label: "Push",
    pendingLabel: "Pushing...",
    successLabel: "Pushed",
    disabled: input.runtime.push.disabled || !canPush(input),
    status: input.runtime.push.status,
    description: getPushDescription(input),
    icon: input.runtime.push.icon,
    handler: input.runtime.push.handler,
  });

  allActions.set("pr", buildPrAction(input));

  allActions.set("merge-branch", {
    id: "merge-branch",
    label: `Merge into ${input.baseRefLabel}`,
    pendingLabel: "Merging...",
    successLabel: "Merged",
    disabled: input.runtime["merge-branch"].disabled || !canMergeBranch(input),
    status: input.runtime["merge-branch"].status,
    description: getMergeBranchDescription(input),
    icon: input.runtime["merge-branch"].icon,
    handler: input.runtime["merge-branch"].handler,
  });

  allActions.set("merge-from-base", {
    id: "merge-from-base",
    label: `Update from ${input.baseRefLabel}`,
    pendingLabel: "Updating...",
    successLabel: "Updated",
    disabled: input.runtime["merge-from-base"].disabled || !canMergeFromBase(input),
    status: input.runtime["merge-from-base"].status,
    description: getMergeFromBaseDescription(input),
    icon: input.runtime["merge-from-base"].icon,
    handler: input.runtime["merge-from-base"].handler,
  });

  allActions.set("archive-worktree", {
    id: "archive-worktree",
    label: "Archive worktree",
    pendingLabel: "Archiving...",
    successLabel: "Archived",
    disabled: input.runtime["archive-worktree"].disabled || !input.isPaseoOwnedWorktree,
    status: input.runtime["archive-worktree"].status,
    description: input.isPaseoOwnedWorktree ? undefined : "Only for worktrees",
    icon: input.runtime["archive-worktree"].icon,
    handler: input.runtime["archive-worktree"].handler,
  });

  const primaryActionId = getPrimaryActionId(input);
  const primary = primaryActionId ? (allActions.get(primaryActionId) ?? null) : null;

  const secondaryIds = [...REMOTE_ACTION_IDS];
  if (!input.isOnBaseBranch) {
    secondaryIds.push(...FEATURE_ACTION_IDS);
  }
  if (input.isPaseoOwnedWorktree) {
    secondaryIds.push("archive-worktree");
  }

  return {
    primary,
    secondary: secondaryIds.map((id) => allActions.get(id)!),
    menu: [],
  };
}

function getPrimaryActionId(input: BuildGitActionsInput): GitActionId | null {
  if (input.shouldPromoteArchive && input.isPaseoOwnedWorktree) {
    return "archive-worktree";
  }
  if (input.hasUncommittedChanges) {
    return "commit";
  }
  if (canPull(input)) {
    return "pull";
  }
  if (canPush(input)) {
    return "push";
  }
  if (!input.isOnBaseBranch && canMergeFromBase(input)) {
    return "merge-from-base";
  }
  if (input.githubFeaturesEnabled && input.hasPullRequest && input.pullRequestUrl) {
    return "pr";
  }
  if (!input.isOnBaseBranch && input.aheadCount > 0) {
    return input.shipDefault === "merge" ? "merge-branch" : "pr";
  }
  return null;
}

function buildPrAction(input: BuildGitActionsInput): GitAction {
  if (input.hasPullRequest && input.pullRequestUrl) {
    return {
      id: "pr",
      label: "View PR",
      pendingLabel: "View PR",
      successLabel: "View PR",
      disabled: input.runtime.pr.disabled || !input.githubFeaturesEnabled,
      status: input.runtime.pr.status,
      description: input.githubFeaturesEnabled ? undefined : "GitHub unavailable",
      icon: input.runtime.pr.icon,
      handler: input.runtime.pr.handler,
    };
  }

  return {
    id: "pr",
    label: "Create PR",
    pendingLabel: "Creating PR...",
    successLabel: "PR Created",
    disabled: input.runtime.pr.disabled || !input.githubFeaturesEnabled || input.aheadCount === 0,
    status: input.runtime.pr.status,
    description: getCreatePrDescription(input),
    icon: input.runtime.pr.icon,
    handler: input.runtime.pr.handler,
  };
}

function canPull(input: BuildGitActionsInput): boolean {
  return (
    input.hasRemote &&
    !input.hasUncommittedChanges &&
    input.behindOfOrigin > 0
  );
}

function canPush(input: BuildGitActionsInput): boolean {
  return input.hasRemote && input.aheadOfOrigin > 0 && input.behindOfOrigin === 0;
}

function canMergeBranch(input: BuildGitActionsInput): boolean {
  return (
    !input.isOnBaseBranch &&
    input.baseRefAvailable &&
    !input.hasUncommittedChanges &&
    input.aheadCount > 0
  );
}

function canMergeFromBase(input: BuildGitActionsInput): boolean {
  return (
    !input.isOnBaseBranch &&
    input.baseRefAvailable &&
    !input.hasUncommittedChanges &&
    input.behindBaseCount > 0
  );
}

function getPullDescription(input: BuildGitActionsInput): string | undefined {
  if (!input.hasRemote) {
    return "No remote";
  }
  if (input.hasUncommittedChanges) {
    return "Clean tree";
  }
  if (input.behindOfOrigin === 0) {
    return "Nothing to pull";
  }
  return undefined;
}

function getPushDescription(input: BuildGitActionsInput): string | undefined {
  if (!input.hasRemote) {
    return "No remote";
  }
  if (input.behindOfOrigin > 0) {
    return "Pull first";
  }
  if (input.aheadOfOrigin === 0) {
    return "Nothing to push";
  }
  return undefined;
}

function getCreatePrDescription(input: BuildGitActionsInput): string | undefined {
  if (!input.githubFeaturesEnabled) {
    return "GitHub unavailable";
  }
  if (input.aheadCount === 0) {
    return "No new commits";
  }
  return undefined;
}

function getMergeBranchDescription(input: BuildGitActionsInput): string | undefined {
  if (!input.baseRefAvailable) {
    return "No base";
  }
  if (input.hasUncommittedChanges) {
    return "Clean tree";
  }
  if (input.aheadCount === 0) {
    return "No new commits";
  }
  return undefined;
}

function getMergeFromBaseDescription(input: BuildGitActionsInput): string | undefined {
  if (!input.baseRefAvailable) {
    return "No base";
  }
  if (input.hasUncommittedChanges) {
    return "Clean tree";
  }
  if (input.behindBaseCount === 0) {
    return "Up to date";
  }
  return undefined;
}
