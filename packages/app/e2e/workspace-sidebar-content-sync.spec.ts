import { execSync } from 'node:child_process';
import { test } from './fixtures';
import { setWorkingDirectory } from './helpers/app';
import { createTempGitRepo } from './helpers/workspace';
import {
  expectWorkspaceHeader,
  openNewAgentComposer,
  seedWorkspaceActivity,
  switchWorkspaceViaSidebar,
  workspaceLabelFromPath,
} from './helpers/workspace-ui';

test('sidebar workspace switch keeps visible content in sync with selected workspace', async ({ page }) => {
  const serverId = process.env.E2E_SERVER_ID;
  if (!serverId) {
    throw new Error('E2E_SERVER_ID is not set.');
  }

  const repoA = await createTempGitRepo('paseo-e2e-sync-a-');
  const repoB = await createTempGitRepo('paseo-e2e-sync-b-');

  const tokenA = `SYNC_A_${Date.now()}`;
  const tokenB = `SYNC_B_${Date.now()}`;

  try {
    execSync('git checkout -b sync-a-branch', { cwd: repoA.path, stdio: 'ignore' });
    execSync('git checkout -b sync-b-branch', { cwd: repoB.path, stdio: 'ignore' });

    await openNewAgentComposer(page);
    await setWorkingDirectory(page, repoA.path);
    await seedWorkspaceActivity(page, tokenA);

    await openNewAgentComposer(page);
    await setWorkingDirectory(page, repoB.path);
    await seedWorkspaceActivity(page, tokenB);

    await switchWorkspaceViaSidebar({ page, serverId, targetWorkspacePath: repoA.path });
    await expectWorkspaceHeader(page, {
      title: 'sync-a-branch',
      subtitle: workspaceLabelFromPath(repoA.path),
    });

    await switchWorkspaceViaSidebar({ page, serverId, targetWorkspacePath: repoB.path });
    await expectWorkspaceHeader(page, {
      title: 'sync-b-branch',
      subtitle: workspaceLabelFromPath(repoB.path),
    });

    await switchWorkspaceViaSidebar({ page, serverId, targetWorkspacePath: repoA.path });
    await expectWorkspaceHeader(page, {
      title: 'sync-a-branch',
      subtitle: workspaceLabelFromPath(repoA.path),
    });
  } finally {
    await repoA.cleanup();
    await repoB.cleanup();
  }
});
