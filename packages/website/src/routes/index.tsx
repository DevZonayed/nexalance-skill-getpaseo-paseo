import { createFileRoute } from '@tanstack/react-router'
import { LandingPage } from '~/components/landing-page'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Paseo – Manage coding agents from your phone and desktop' },
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
      title="One interface for all your coding agents"
      subtitle="Run agents in parallel on your own machines. Ship from your phone or your desk."
    />
  )
}
