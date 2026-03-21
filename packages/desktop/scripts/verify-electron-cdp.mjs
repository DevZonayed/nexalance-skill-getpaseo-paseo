import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9223";
const OUTPUT_DIR = process.env.ELECTRON_VERIFY_OUTPUT_DIR ?? "/tmp/electron-verification";
const APP_URL_FRAGMENT = process.env.ELECTRON_VERIFY_APP_URL_FRAGMENT ?? "localhost:8081";
const REQUIRED_DESKTOP_KEYS = ["invoke", "events", "window", "dialog", "notification", "opener"];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function captureScreenshot(page, fileName) {
  const filePath = path.join(OUTPUT_DIR, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function findAppPage(browser) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if (page.url().includes(APP_URL_FRAGMENT) && !page.url().startsWith("devtools://")) {
          return page;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Unable to find Electron app page for ${APP_URL_FRAGMENT}`);
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  const browser = await chromium.connectOverCDP(CDP_URL);
  const page = await findAppPage(browser);
  const consoleMessages = [];
  const results = [];

  page.on("console", (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text(),
    });
  });
  page.on("pageerror", (error) => {
    consoleMessages.push({
      type: "pageerror",
      text: String(error),
    });
  });

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1000);
  if (!page.url().endsWith("/welcome")) {
    await page.goto(`http://${APP_URL_FRAGMENT}/welcome`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
  }

  const welcomeScreenshot = await captureScreenshot(page, "01-welcome.png");

  const desktopDetection = await page.evaluate(() => {
    const bridge = window.paseoDesktop;
    const keys = bridge && typeof bridge === "object" ? Object.keys(bridge) : [];
    const keyTypes =
      bridge && typeof bridge === "object"
        ? Object.fromEntries(Object.entries(bridge).map(([key, value]) => [key, typeof value]))
        : {};
    return {
      exists: Boolean(bridge && typeof bridge === "object"),
      keys,
      keyTypes,
      platform: bridge?.platform ?? null,
    };
  });

  const hasExpectedDesktopShape =
    desktopDetection.exists &&
    REQUIRED_DESKTOP_KEYS.every((key) => desktopDetection.keys.includes(key));

  results.push({
    check: "desktop-detection",
    pass: hasExpectedDesktopShape,
    details: desktopDetection,
    screenshot: welcomeScreenshot,
  });

  const desktopStatus = await page.evaluate(() =>
    window.paseoDesktop.invoke("desktop_daemon_status"),
  );
  assert(
    typeof desktopStatus?.serverId === "string" && desktopStatus.serverId.trim().length > 0,
    "desktop_daemon_status did not return a serverId",
  );

  const serverId = desktopStatus.serverId.trim();
  await page.evaluate((nextServerId) => {
    window.location.href = `/h/${nextServerId}/settings`;
  }, serverId);
  await page.waitForURL(new RegExp(`/h/${escapeRegExp(serverId)}/settings$`), {
    timeout: 30_000,
  });
  await page.getByText("Daemon management", { exact: true }).waitFor({
    timeout: 30_000,
  });

  const settingsScreenshot = await captureScreenshot(page, "02-settings-page.png");

  const sidebarSettingsButton = page.locator('[data-testid="sidebar-settings"]').first();
  const menuToggle = page.locator('[data-testid="menu-button"]').first();
  if (
    (await sidebarSettingsButton.isVisible().catch(() => false)) &&
    (await menuToggle.isVisible().catch(() => false))
  ) {
    await menuToggle.click();
    await sidebarSettingsButton
      .waitFor({ state: "hidden", timeout: 10_000 })
      .catch(() => undefined);
    await page.waitForTimeout(500);
  }

  const dragRegionCheck = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("*"));
    const annotationId = "electron-verify-drag-style";
    const existingAnnotation = document.getElementById(annotationId);
    existingAnnotation?.remove();

    const annotationStyle = document.createElement("style");
    annotationStyle.id = annotationId;
    annotationStyle.textContent = `
      [data-electron-verify-drag="true"] {
        outline: 3px solid #ff4d4f !important;
        outline-offset: -3px !important;
      }
    `;
    document.head.appendChild(annotationStyle);

    function isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0"
      );
    }

    function summarizeText(element) {
      return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    }

    const regions = [];
    let candidate = null;

    for (const element of nodes) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }
      const style = window.getComputedStyle(element);
      const appRegion = style.webkitAppRegion || style.getPropertyValue("-webkit-app-region");
      if (appRegion !== "drag" || !isVisible(element)) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const text = summarizeText(element);
      const info = {
        tagName: element.tagName.toLowerCase(),
        text,
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        paddingLeft: Number.parseFloat(style.paddingLeft || "0"),
        paddingTop: Number.parseFloat(style.paddingTop || "0"),
      };
      regions.push(info);

      const looksLikeHeader =
        rect.top < 180 &&
        rect.height >= 40 &&
        (text.includes("Settings") || text.includes("Sessions"));
      if (!candidate && looksLikeHeader) {
        candidate = { ...info };
        element.setAttribute("data-electron-verify-drag", "true");
      }
    }

    if (!candidate && regions.length > 0) {
      candidate = regions.slice().sort((left, right) => left.top - right.top)[0];

      for (const element of nodes) {
        if (!(element instanceof HTMLElement)) {
          continue;
        }
        const style = window.getComputedStyle(element);
        const appRegion = style.webkitAppRegion || style.getPropertyValue("-webkit-app-region");
        if (appRegion !== "drag" || !isVisible(element)) {
          continue;
        }
        const rect = element.getBoundingClientRect();
        if (
          Math.abs(rect.top - candidate.top) < 1 &&
          Math.abs(rect.left - candidate.left) < 1 &&
          Math.abs(rect.width - candidate.width) < 1 &&
          Math.abs(rect.height - candidate.height) < 1
        ) {
          element.setAttribute("data-electron-verify-drag", "true");
          break;
        }
      }
    }

    return {
      count: regions.length,
      candidate,
      regions: regions.slice(0, 10),
    };
  });

  const dragScreenshot = await captureScreenshot(page, "03-drag-region.png");
  const dragRegionPassed =
    dragRegionCheck.count > 0 &&
    Boolean(dragRegionCheck.candidate) &&
    dragRegionCheck.candidate.top < 180;

  results.push({
    check: "drag-regions",
    pass: dragRegionPassed,
    details: dragRegionCheck,
    screenshot: dragScreenshot,
  });

  const trafficLightScreenshot = await captureScreenshot(page, "04-traffic-light-padding.png");
  const isMac = process.platform === "darwin";
  const observedPaddingLeft = dragRegionCheck.candidate?.paddingLeft ?? null;
  const trafficLightPaddingPassed = !isMac
    ? true
    : typeof observedPaddingLeft === "number" &&
      observedPaddingLeft >= 78 &&
      observedPaddingLeft <= 110;

  results.push({
    check: "traffic-light-padding",
    pass: trafficLightPaddingPassed,
    details: {
      platform: process.platform,
      observedPaddingLeft,
      expectedApproximatePaddingLeft: 78,
      candidate: dragRegionCheck.candidate,
    },
    screenshot: trafficLightScreenshot,
  });

  const daemonManagementVisible = await Promise.all([
    page.getByText("Built-in daemon", { exact: true }).isVisible(),
    page.getByText("Daemon management", { exact: true }).isVisible(),
    page.getByRole("button", { name: "Restart daemon" }).first().isVisible(),
  ]).then((values) => values.every(Boolean));
  const daemonManagementScreenshot = await captureScreenshot(
    page,
    "05-settings-daemon-management.png",
  );

  results.push({
    check: "settings-daemon-management",
    pass: daemonManagementVisible,
    details: {
      route: page.url(),
      serverId,
      desktopStatus,
    },
    screenshot: daemonManagementScreenshot,
  });

  const desktopDetectionScreenshot = await captureScreenshot(page, "06-desktop-detection.png");
  results[0].screenshot = desktopDetectionScreenshot;

  const report = {
    cdpUrl: CDP_URL,
    outputDir: OUTPUT_DIR,
    pageUrl: page.url(),
    desktopStatus,
    results,
    consoleMessages,
  };

  const reportPath = path.join(OUTPUT_DIR, "report.json");
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const failedChecks = results.filter((result) => !result.pass);
  console.log(JSON.stringify(report, null, 2));
  await browser.close();

  if (failedChecks.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
