import path from 'node:path'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const repoRoot = path.resolve(__dirname, '../..')

export default defineConfig({
  server: {
    port: 8082,
    fs: {
      allow: [repoRoot],
    },
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tsConfigPaths(),
    tanstackStart(),
    react(),
    tailwindcss(),
  ],
})
