import { createFileRoute } from '@tanstack/react-router'
import { LandingPage } from '~/components/landing-page'

export const Route = createFileRoute('/opencode')({
  head: () => ({
    meta: [
      { title: 'OpenCode Mobile App – Code from anywhere | Paseo' },
      {
        name: 'description',
        content:
          'Run OpenCode from your phone. Launch agents, watch them work, and ship code from wherever you are. Self-hosted, open source, your code stays local.',
      },
    ],
  }),
  component: OpenCodePage,
})

function OpenCodePage() {
  return (
    <LandingPage
      title="Run OpenCode from your phone"
      subtitle="Launch agents, check on builds, and ship code from anywhere. Same setup, same machine, just not at your desk."
    />
  )
}
