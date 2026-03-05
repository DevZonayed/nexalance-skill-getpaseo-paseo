import { test, expect } from './fixtures';
import { createAgentInRepo } from './helpers/app';
import { createTempGitRepo } from './helpers/workspace';

test('create agent in a temp repo', async ({ page }) => {
  const repo = await createTempGitRepo();
  const prompt = "Respond with exactly: Hello";

  try {
    await createAgentInRepo(page, { directory: repo.path, prompt });

    // Verify user message is shown in the stream
    await expect(page.getByText(prompt, { exact: true })).toBeVisible();

    // Verify we used the seeded fast model (do not fall back to other defaults).
    const modelPicker = page.getByRole("button", { name: /select agent model/i }).first();
    await expect(modelPicker).toBeVisible({ timeout: 30000 });
    await expect(modelPicker).toContainText(/gpt-5\.1-codex-mini/i);

    // Verify the assistant response is rendered.
    await expect(page.getByText("Hello", { exact: true }).first()).toBeVisible({
      timeout: 30000,
    });
  } finally {
    await repo.cleanup();
  }
});
