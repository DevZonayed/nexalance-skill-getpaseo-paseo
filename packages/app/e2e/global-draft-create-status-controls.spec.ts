import { test, expect } from './fixtures'
import { createTempGitRepo } from './helpers/workspace'
import { ensureHostSelected, gotoHome, setWorkingDirectory } from './helpers/app'

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('global draft create uses input status controls and preserves optimistic flow', async ({ page }) => {
  const repo = await createTempGitRepo('paseo-e2e-global-draft-')
  const prompt = `global draft prompt ${Date.now()}`

  try {
    await gotoHome(page)
    await ensureHostSelected(page)
    await setWorkingDirectory(page, repo.path)

    await expect(page.getByTestId('working-directory-select').first()).toBeVisible({ timeout: 30_000 })

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
    await composer.fill(prompt)
    await composer.press('Enter')

    await expect(page.getByText(prompt, { exact: true }).first()).toBeVisible({ timeout: 5_000 })
    await expect(page).toHaveURL(/\/workspace\//, { timeout: 30_000 })

    await expect(modelSelector).toContainText(new RegExp(escapeRegex(selectedModel), 'i'))
    await expect(modeSelector).toContainText(new RegExp(escapeRegex(selectedMode), 'i'))
    await expect(thinkingSelector).toContainText(new RegExp(escapeRegex(selectedThinking), 'i'))
  } finally {
    await repo.cleanup()
  }
})
