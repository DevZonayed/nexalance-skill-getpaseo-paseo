import { slugify } from "./worktree.js";

export function buildServiceHostname(branchName: string | null, serviceName: string): string {
  const serviceHostnameLabel = slugify(serviceName);
  const isDefaultBranch =
    branchName === null || branchName === "main" || branchName === "master";

  if (isDefaultBranch) {
    return `${serviceHostnameLabel}.localhost`;
  }

  return `${slugify(branchName)}.${serviceHostnameLabel}.localhost`;
}
