import { Link, createFileRoute } from '@tanstack/react-router'
import ReactMarkdown from 'react-markdown'
import changelogMarkdown from '../../../../CHANGELOG.md?raw'
import '~/styles.css'

export const Route = createFileRoute('/changelog')({
  head: () => ({
    meta: [
      { title: 'Changelog - Paseo' },
      {
        name: 'description',
        content:
          'Product updates, fixes, and improvements shipped in each Paseo release.',
      },
    ],
  }),
  component: Changelog,
})

function Changelog() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 md:p-12">
        <header className="flex items-center justify-between gap-4 mb-8">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.svg" alt="Paseo" className="w-6 h-6" />
            <span className="text-lg font-medium">Paseo</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/docs"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Docs
            </Link>
            <a
              href="https://github.com/getpaseo/paseo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
          </div>
        </header>

        <article className="changelog-markdown rounded-xl border border-border bg-card/40 p-6 md:p-8">
          <ReactMarkdown>{changelogMarkdown}</ReactMarkdown>
        </article>
      </div>
    </div>
  )
}
