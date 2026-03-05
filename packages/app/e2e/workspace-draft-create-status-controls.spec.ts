import { test, expect } from './fixtures'
import { ensureHostSelected, gotoHome, setWorkingDirectory } from './helpers/app'
import { createTempGitRepo } from './helpers/workspace'
import {
  ensureWorkspaceAgentPaneVisible,
  getWorkspaceTabTestIds,
  waitForWorkspaceTabsVisible,
} from './helpers/workspace-tabs'
import { switchWorkspaceViaSidebar } from './helpers/workspace-ui'

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('workspace draft tab uses input status controls with optimistic create and in-place transition', async ({
  page,
}) => {
  const serverId = process.env.E2E_SERVER_ID
  if (!serverId) {
    throw new Error('E2E_SERVER_ID is not set.')
  }

  const repo = await createTempGitRepo('paseo-e2e-workspace-draft-')
  const seedPrompt = `seed workspace ${Date.now()}`
  const createPrompt = `workspace draft prompt ${Date.now()}`

  try {
    await gotoHome(page)
    await ensureHostSelected(page)

    // Force the setup onto the global draft surface. In slow runs the app can
    // still be on a previously opened agent/workspace view where the placement
    // form is not rendered.
    await page.goto(`/h/${serverId}/new-agent`)
    await expect(page.locator('[data-testid="working-directory-select"]:visible').first()).toBeVisible({
      timeout: 30_000,
    })

    await setWorkingDirectory(page, repo.path)
    const seedComposer = page.getByRole('textbox', { name: 'Message agent...' }).first()
    await seedComposer.fill(seedPrompt)
    await page.getByRole('button', { name: /send message/i }).first().click()
    await expect(page.getByText(seedPrompt, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })
    await expect(page).toHaveURL(/\/workspace\//, { timeout: 60_000 })

    await switchWorkspaceViaSidebar({ page, serverId, targetWorkspacePath: repo.path })
    const workspaceRouteToken = page.url().match(/\/workspace\/([^/?#]+)/)?.[1] ?? null
    expect(workspaceRouteToken).toBeTruthy()
    await waitForWorkspaceTabsVisible(page)
    await ensureWorkspaceAgentPaneVisible(page)

    const beforeDraftIds = await getWorkspaceTabTestIds(page)
    await page.getByTestId('workspace-new-agent-tab').first().click()
    await ensureWorkspaceAgentPaneVisible(page)

    const withDraftIds = await getWorkspaceTabTestIds(page)
    const draftTabTestId = withDraftIds.find((id) => !beforeDraftIds.includes(id))
    if (!draftTabTestId) {
      throw new Error('Expected a draft workspace tab to be created.')
    }

    const draftId = draftTabTestId.replace('workspace-tab-', '')
    const draftCloseButton = page.getByTestId(`workspace-draft-close-${draftId}`).first()
    await expect(draftCloseButton).toBeVisible({ timeout: 30_000 })

    await expect(page.getByTestId('working-directory-select').first()).not.toBeVisible()
    await expect(page.getByTestId('worktree-select-trigger').first()).not.toBeVisible()

    const providerSelector = page.getByTestId('agent-provider-selector').first()
    const modeSelector = page.getByTestId('agent-mode-selector').first()
    const modelSelector = page.getByTestId('agent-model-selector').first()
    const thinkingSelector = page.getByTestId('agent-thinking-selector').first()

    await expect(providerSelector).toBeVisible({ timeout: 30_000 })
    await expect(modeSelector).toBeVisible({ timeout: 30_000 })
    await expect(modelSelector).toBeVisible({ timeout: 30_000 })
    await expect(thinkingSelector).toBeVisible({ timeout: 30_000 })

    const selectedMode = ((await modeSelector.innerText()) ?? '').trim()
    const selectedModel = ((await modelSelector.innerText()) ?? '').trim()
    const selectedThinking = ((await thinkingSelector.innerText()) ?? '').trim()

    const composer = page.getByRole('textbox', { name: 'Message agent...' }).first()
    await composer.fill(createPrompt)
    await composer.press('Enter')

    await expect(page.getByText(createPrompt, { exact: true }).first()).toBeVisible({ timeout: 5_000 })
    await expect(draftCloseButton).not.toBeVisible({ timeout: 30_000 })

    const finalIds = await getWorkspaceTabTestIds(page)
    expect(finalIds).toContain(draftTabTestId)

    await expect(modelSelector).toContainText(new RegExp(escapeRegex(selectedModel), 'i'))
    await expect(modeSelector).toContainText(new RegExp(escapeRegex(selectedMode), 'i'))
    await expect(thinkingSelector).toContainText(new RegExp(escapeRegex(selectedThinking), 'i'))

    const currentUrl = page.url()
    if (!workspaceRouteToken) {
      throw new Error('Expected workspace route token to be present.')
    }
    expect(currentUrl).toContain(`/workspace/${workspaceRouteToken}`)
  } finally {
    await repo.cleanup()
  }
})
