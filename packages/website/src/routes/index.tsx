import { createFileRoute } from '@tanstack/react-router'
import { LandingPage } from '~/components/landing-page'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Paseo – Run Claude Code, Codex, and OpenCode from everywhere' },
      {
        name: 'description',
        content:
          'A self-hosted daemon for Claude Code, Codex, and OpenCode. Agents run on your machine with your full dev environment. Connect from phone, desktop, or web.',
      },
    ],
  }),
  component: Home,
})

function Home() {
  return (
    <LandingPage
      title={<>All your coding agents,<br className="hidden md:block" /> from anywhere</>}
      subtitle="Run any coding agent from your phone, desktop, or terminal. Self-hosted, multi-provider, open source."
    />
  )
}
