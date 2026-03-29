import path from "node:path";
import { defineConfig, type UserConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const repoRoot = path.resolve(__dirname, "../..");
const siteHost = "https://paseo.sh";
const sitemapPages = [
  "/",
  "/changelog",
  "/claude-code",
  "/codex",
  "/docs",
  "/download",
  "/opencode",
  "/privacy",
  "/docs/best-practices",
  "/docs/cli",
  "/docs/configuration",
  "/docs/security",
  "/docs/updates",
  "/docs/voice",
  "/docs/worktrees",
].map((routePath) => ({
  path: routePath,
}));

async function fetchLatestReleaseVersion(): Promise<string | undefined> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/getpaseo/paseo/releases/latest",
      { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { tag_name: string };
    return data.tag_name.replace(/^v/, "");
  } catch {
    return undefined;
  }
}

export default defineConfig(async (): Promise<UserConfig> => {
  const latestVersion = await fetchLatestReleaseVersion();

  return {
    define: {
      ...(latestVersion && { __DESKTOP_VERSION__: JSON.stringify(latestVersion) }),
    },
    server: {
      port: 8082,
      fs: {
        allow: [repoRoot],
      },
    },
    plugins: [
      cloudflare({ viteEnvironment: { name: "ssr" } }),
      tsConfigPaths(),
      tanstackStart({
        pages: sitemapPages,
        sitemap: {
          host: siteHost,
        },
      }),
      react(),
      tailwindcss(),
    ],
  };
});
