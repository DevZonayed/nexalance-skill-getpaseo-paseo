import { expect, test } from "./fixtures";
import { gotoHome } from "./helpers/app";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("working directory combobox stays visually stable while typing search", async ({ page }) => {
  await gotoHome(page);

  const workingDirectorySelect = page
    .locator('[data-testid="working-directory-select"]:visible')
    .first();
  await expect(workingDirectorySelect).toBeVisible();
  await workingDirectorySelect.click({ force: true });

  const searchInput = page.getByRole("textbox", { name: /search directories/i }).first();
  await expect(searchInput).toBeVisible();

  await page.evaluate(() => {
    const trigger = document.querySelector('[data-testid="working-directory-select"]');
    const searchInput = document.querySelector('input[placeholder="Search directories..."]');
    const container = document.querySelector('[data-testid="combobox-desktop-container"]');
    if (!(trigger instanceof HTMLElement)) {
      throw new Error("Missing working-directory-select trigger.");
    }
    if (!(searchInput instanceof HTMLInputElement)) {
      throw new Error("Missing working directory search input.");
    }
    if (!(container instanceof HTMLElement)) {
      throw new Error("Missing combobox desktop container.");
    }

    const state = {
      samples: 0,
      underTriggerSamples: 0,
      emptyWhileSearchingSamples: 0,
      minSearchDelta: Number.POSITIVE_INFINITY,
      maxSearchDelta: Number.NEGATIVE_INFINITY,
      minContainerDelta: Number.POSITIVE_INFINITY,
      maxContainerDelta: Number.NEGATIVE_INFINITY,
      logs: [] as Array<{
        reason: string;
        query: string;
        searchDelta: number;
        containerDelta: number;
        hasEmpty: boolean;
        containerTop: number;
        containerBottom: number;
        triggerTop: number;
        searchBottom: number;
      }>,
    };

    const sample = (reason: string) => {
      if (!document.body.contains(trigger) || !document.body.contains(searchInput) || !document.body.contains(container)) {
        return;
      }
      const query = searchInput.value.trim();
      if (!query) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const searchRect = searchInput.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const hasEmpty = Boolean(container.querySelector('[data-testid="combobox-empty-text"]'));
      const searchDelta = searchRect.bottom - triggerRect.top;
      const containerDelta = containerRect.bottom - triggerRect.top;

      state.samples += 1;
      state.minSearchDelta = Math.min(state.minSearchDelta, searchDelta);
      state.maxSearchDelta = Math.max(state.maxSearchDelta, searchDelta);
      state.minContainerDelta = Math.min(state.minContainerDelta, containerDelta);
      state.maxContainerDelta = Math.max(state.maxContainerDelta, containerDelta);
      if (searchDelta > 2 || containerDelta > 2) {
        state.underTriggerSamples += 1;
      }
      if (hasEmpty) {
        state.emptyWhileSearchingSamples += 1;
      }
      if (state.logs.length < 80) {
        state.logs.push({
          reason,
          query,
          searchDelta,
          containerDelta,
          hasEmpty,
          containerTop: containerRect.top,
          containerBottom: containerRect.bottom,
          triggerTop: triggerRect.top,
          searchBottom: searchRect.bottom,
        });
      }
    };

    const mutationObserver = new MutationObserver(() => sample("mutation"));
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    const resizeObserver = new ResizeObserver(() => sample("resize"));
    resizeObserver.observe(container);
    resizeObserver.observe(searchInput);

    let rafId = 0;
    const loop = () => {
      sample("raf");
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    (window as any).__paseoComboboxObserver = {
      stop: () => {
        cancelAnimationFrame(rafId);
        mutationObserver.disconnect();
        resizeObserver.disconnect();
        sample("stop");
        return {
          ...state,
          minSearchDelta: state.samples > 0 ? state.minSearchDelta : 0,
          maxSearchDelta: state.samples > 0 ? state.maxSearchDelta : 0,
          minContainerDelta: state.samples > 0 ? state.minContainerDelta : 0,
          maxContainerDelta: state.samples > 0 ? state.maxContainerDelta : 0,
        };
      },
    };
  });

  const queries = [
    "/tmp/paseo-stability-a",
    "/tmp/paseo-stability-ab",
    "/tmp/paseo-stability-abc",
    "/tmp/paseo-stability-longer-branch",
    "/tmp/paseo-stability-z",
  ];

  for (const query of queries) {
    await searchInput.fill("");
    await searchInput.type(query, { delay: 20 });
    const customOption = page.getByText(new RegExp(`^${escapeRegex(query)}$`)).first();
    await expect(customOption).toBeVisible();
    await page.waitForTimeout(100);
  }

  const stats = await page.evaluate(() => (window as any).__paseoComboboxObserver.stop());
  const debug = JSON.stringify(stats.logs.slice(-10));

  expect(stats.samples, debug).toBeGreaterThan(20);
  expect(stats.underTriggerSamples, debug).toBe(0);
  expect(stats.emptyWhileSearchingSamples, debug).toBe(0);
  expect(stats.maxSearchDelta - stats.minSearchDelta, debug).toBeLessThanOrEqual(3);
  expect(stats.maxContainerDelta - stats.minContainerDelta, debug).toBeLessThanOrEqual(3);
  expect(stats.maxContainerDelta, debug).toBeLessThanOrEqual(2);
});
