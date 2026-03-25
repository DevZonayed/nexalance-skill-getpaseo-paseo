import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CursorFieldProvider } from "~/components/butterfly";
import {
  appStoreUrl,
  playStoreUrl,
  webAppUrl,
  downloadOptions,
  useDetectedPlatform,
  AppleIcon,
  AndroidIcon,
  TerminalIcon,
  GlobeIcon,
} from "~/downloads";
import "~/styles.css";

interface LandingPageProps {
  title: React.ReactNode;
  subtitle: string;
}

export function LandingPage({ title, subtitle }: LandingPageProps) {
  return (
    <CursorFieldProvider>
      {/* Hero section with background image */}
      <div className="relative bg-cover bg-center bg-no-repeat">
        <div className="absolute inset-0 bg-background/90" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-linear-to-t from-black to-transparent" />

        <div className="relative p-6 pb-10 md:px-20 md:pt-20 md:pb-12 max-w-3xl mx-auto">
          <Nav />
          <Hero title={title} subtitle={subtitle} />
          <GetStarted />
        </div>

        {/* Mockup - inside hero so it's above the gradient, positioned to overflow into black section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
          className="relative px-6 md:px-8 pb-8 md:pb-16"
        >
          <div className="max-w-6xl lg:max-w-7xl xl:max-w-[90rem] mx-auto">
            <img
              src="/paseo-mockup.png"
              alt="Paseo app showing agent management interface"
              className="w-full rounded-lg shadow-2xl"
            />
          </div>
        </motion.div>
      </div>

      {/* Content section */}
      <div className="bg-black">
        <main className="p-6 md:p-20 md:pt-8 max-w-5xl mx-auto">
          <div className="space-y-24">
            <Features />
            <CLISection />
            <FAQ />
            <SponsorCTA />
          </div>
        </main>
        <footer className="p-6 md:p-20 md:pt-0 max-w-5xl mx-auto">
          <div className="border-t border-white/10 pt-8 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-8 text-xs">
            <div className="space-y-3">
              <p className="text-white/60 font-medium">Product</p>
              <div className="space-y-2">
                <a
                  href="/docs"
                  className="block text-white/40 hover:text-white/60 transition-colors"
                >
                  Docs
                </a>
                <a
                  href="/changelog"
                  className="block text-white/40 hover:text-white/60 transition-colors"
                >
                  Changelog
                </a>
                <a
                  href="/docs/cli"
                  className="block text-white/40 hover:text-white/60 transition-colors"
                >
                  CLI
                </a>
                <a
                  href="/privacy"
                  className="block text-white/40 hover:text-white/60 transition-colors"
                >
                  Privacy
                </a>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-white/60 font-medium">Agents</p>
              <div className="space-y-2">
                <a
                  href="/claude-code"
                  className="block text-white/40 hover:text-white/60 transition-colors"
                >
                  Claude Code
                </a>
                <a
                  href="/codex"
                  className="block text-white/40 hover:text-white/60 transition-colors"
                >
                  Codex
                </a>
                <a
                  href="/opencode"
                  className="block text-white/40 hover:text-white/60 transition-colors"
                >
                  OpenCode
                </a>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-white/60 font-medium">Community</p>
              <div className="space-y-2">
                <a
                  href="https://discord.gg/jz8T2uahpH"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-white/40 hover:text-white/60 transition-colors"
                >
                  Discord
                </a>
                <a
                  href="https://github.com/getpaseo/paseo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-white/40 hover:text-white/60 transition-colors"
                >
                  GitHub
                </a>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-white/60 font-medium">Download</p>
              <div className="space-y-2">
                <a
                  href={appStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-white/40 hover:text-white/60 transition-colors"
                >
                  App Store
                </a>
                <a
                  href={playStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-white/40 hover:text-white/60 transition-colors"
                >
                  Google Play
                </a>
                <a
                  href="https://github.com/getpaseo/paseo/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-white/40 hover:text-white/60 transition-colors"
                >
                  Desktop
                </a>
                <a
                  href={webAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-white/40 hover:text-white/60 transition-colors"
                >
                  Web App
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </CursorFieldProvider>
  );
}

function Nav() {
  return (
    <nav className="flex flex-col sm:flex-row items-center sm:justify-between gap-4 mb-16">
      <div className="flex items-center gap-3">
        <a href="/" className="flex items-center gap-3">
          <img src="/logo.svg" alt="Paseo" className="w-7 h-7" />
          <span className="text-lg font-medium">Paseo</span>
        </a>
      </div>
      <div className="flex items-center gap-4">
        <a
          href="/docs"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Docs
        </a>
        <a
          href="/changelog"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Changelog
        </a>
        <a
          href="/download"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Download
        </a>
        <a
          href="https://discord.gg/jz8T2uahpH"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Discord"
          className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center"
        >
          <svg
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
          </svg>
        </a>
        <a
          href="https://github.com/getpaseo/paseo"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 0C5.37 0 0 5.484 0 12.252c0 5.418 3.438 10.013 8.205 11.637.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.738-4.042-1.61-4.042-1.61-.546-1.403-1.333-1.776-1.333-1.776-1.089-.756.084-.741.084-.741 1.205.087 1.838 1.262 1.838 1.262 1.07 1.87 2.809 1.33 3.495 1.017.108-.79.417-1.33.76-1.636-2.665-.31-5.467-1.35-5.467-6.005 0-1.327.465-2.413 1.235-3.262-.124-.31-.535-1.556.117-3.243 0 0 1.008-.33 3.3 1.248a11.2 11.2 0 0 1 3.003-.404c1.02.005 2.045.138 3.003.404 2.29-1.578 3.297-1.248 3.297-1.248.653 1.687.242 2.933.118 3.243.77.85 1.233 1.935 1.233 3.262 0 4.667-2.807 5.692-5.48 5.995.43.38.823 1.133.823 2.285 0 1.65-.015 2.98-.015 3.386 0 .315.218.694.825.576C20.565 22.26 24 17.667 24 12.252 24 5.484 18.627 0 12 0z" />
          </svg>
        </a>
      </div>
    </nav>
  );
}

function Hero({ title, subtitle }: { title: React.ReactNode; subtitle: string }) {
  return (
    <div className="space-y-6">
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-3xl md:text-5xl font-semibold tracking-tight"
      >
        {title}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
        className="text-white/70 text-lg leading-relaxed max-w-lg"
      >
        {subtitle}
      </motion.p>
    </div>
  );
}

function AgentBadge({ name, icon }: { name: string; icon: React.ReactNode }) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <span
      className="relative inline-flex items-center justify-center rounded-full p-1.5 text-white/60"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {icon}
      <AnimatePresence>
        {hovered && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-white text-black text-xs whitespace-nowrap pointer-events-none"
          >
            {name}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function Features() {
  return (
    <div className="space-y-10">
      {/* Primary differentiators - 2x2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        {[
          {
            title: "Self-hosted",
            description:
              "Agents run on your machine with your full dev environment. Use your tools, your configs and your skills.",
            icon: (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" />
                <line x1="6" y1="18" x2="6.01" y2="18" />
              </svg>
            ),
          },
          {
            title: "Multi-provider",
            description:
              "Claude Code, Codex, and OpenCode through the same interface. Pick the right model for each job.",
            icon: (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 3h5v5" />
                <path d="M8 3H3v5" />
                <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
                <path d="m15 9 6-6" />
              </svg>
            ),
          },
          {
            title: "Voice control",
            description:
              "Dictate tasks or talk through problems in voice mode. Hands-free when you need it.",
            icon: (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            ),
          },
          {
            title: "Cross-device",
            description:
              "iOS, Android, desktop, web, and CLI. Start work at your desk, check in from your phone, script it from the terminal.",
            icon: (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
            ),
          },
        ].map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: i * 0.06, ease: "easeOut" }}
            className="space-y-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-white/40">{feature.icon}</span>
              <p className="font-medium text-lg">{feature.title}</p>
            </div>
            <p className="text-sm text-white/60 leading-relaxed">{feature.description}</p>
          </motion.div>
        ))}
      </div>

      {/* Also */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.4, delay: 0.25, ease: "easeOut" }}
        className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/40"
      >
        <span>Multi-host</span>
        <span>Built-in terminal</span>
        <span>Git worktrees</span>
        <span>E2E encrypted relay</span>
        <span>Open source</span>
      </motion.div>
    </div>
  );
}

function GetStarted() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
      className="pt-10"
    >
      <div className="flex flex-row flex-wrap gap-3">
        <DownloadButton />
        <a
          href={webAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 transition-colors"
        >
          <GlobeIcon className="h-4 w-4" />
          Web App
        </a>
        <a
          href={appStoreUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg border border-white/20 px-3 py-2 text-white hover:bg-white/10 transition-colors"
          aria-label="App Store"
        >
          <AppleIcon className="h-5 w-5" />
        </a>
        <a
          href={playStoreUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg border border-white/20 px-3 py-2 text-white hover:bg-white/10 transition-colors"
          aria-label="Google Play"
        >
          <AndroidIcon className="h-5 w-5" />
        </a>
        <ServerInstallButton />
      </div>
      <div className="pt-3">
        <a
          href="/download"
          className="text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          All download options
        </a>
      </div>
      <div className="flex items-center gap-2 pt-6">
        <span className="text-xs text-white/40">Supports</span>
        <div className="flex items-center gap-1">
          <AgentBadge name="Claude Code" icon={<ClaudeCodeIcon className="h-6 w-6" />} />
          <AgentBadge name="Codex" icon={<CodexIcon className="h-6 w-6" />} />
          <AgentBadge name="OpenCode" icon={<OpenCodeIcon className="h-6 w-6" />} />
        </div>
      </div>
    </motion.div>
  );
}

function DownloadButton() {
  const detectedPlatform = useDetectedPlatform();
  const primary = downloadOptions.find((o) => o.platform === detectedPlatform)!;
  const PrimaryIcon = primary.icon;

  return (
    <a
      href={primary.href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90 transition-colors"
    >
      <PrimaryIcon className="h-4 w-4" />
      Download for {primary.label}
    </a>
  );
}

function ServerInstallButton() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center rounded-lg border border-white/20 px-3 py-2 text-white hover:bg-white/10 transition-colors"
        aria-label="Install on a server"
      >
        <TerminalIcon className="h-5 w-5" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md rounded-xl border border-white/20 bg-background p-6 space-y-4"
            >
              <div className="space-y-2">
                <p className="text-base font-medium text-white">Run agents on a remote machine</p>
                <p className="text-sm text-white/60">
                  For headless machines you want to connect to from the Paseo apps. The desktop app
                  already includes a built-in daemon.
                </p>
              </div>
              <CodeBlock>npm install -g @getpaseo/cli && paseo</CodeBlock>
              <p className="text-xs text-white/30">
                Requires Node.js 18+. Run <span className="font-mono text-white/40">paseo</span> to
                start the daemon.
              </p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClaudeCodeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
      {...props}
    >
      <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" />
    </svg>
  );
}

function CodexIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
      {...props}
    >
      <path d="M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z" />
    </svg>
  );
}

function OpenCodeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="96 64 288 384"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M320 224V352H192V224H320Z" opacity="0.4" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M384 416H128V96H384V416ZM320 160H192V352H320V160Z"
      />
    </svg>
  );
}

function AppStoreIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M342.277 86.6927C463.326 84.6952 587.87 65.619 705.523 104.97C830.467 143.522 874.012 278.153 872.814 397.105C873.713 481.299 874.012 566.193 858.931 649.19C834.262 804.895 746.172 873.01 590.666 874.608C422.377 880.301 172.489 908.965 104.474 711.012C76.5092 599.452 86.6964 481.1 88.1946 366.843C98.9811 200.75 163.301 90.2882 342.277 86.6927ZM715.411 596.156C758.856 591.362 754.362 524.645 710.816 524.545C610.542 525.244 639.605 550.513 594.462 456.83C577.383 418.778 540.529 337.279 496.085 396.006C479.206 431.062 516.359 464.121 528.844 495.382C569.892 560.6 606.647 628.515 648.494 693.334C667.77 724.495 716.509 696.73 697.333 663.372C685.048 642.298 677.258 619.726 665.773 598.253C682.452 597.854 698.831 598.053 715.411 596.156Z" />
      <path
        d="M697.234 663.371C716.41 696.729 667.671 724.494 648.395 693.333C606.548 628.614 569.794 560.699 528.745 495.381C516.161 464.219 479.107 431.161 495.986 396.005C540.43 337.178 577.384 418.776 594.363 456.829C639.506 550.512 610.443 525.243 710.717 524.544C754.263 524.644 758.757 591.361 715.312 596.155C698.732 598.052 682.453 597.852 665.674 598.252C677.159 619.725 684.95 642.297 697.234 663.371Z"
        fill="black"
      />
      <path
        d="M474.312 257.679C486.597 230.913 517.059 198.453 545.224 224.92C564.3 242.298 551.316 269.465 538.332 287.242C489.194 363.747 450.242 445.844 405.598 524.845C445.448 528.341 485.598 525.844 525.149 532.835C564.1 539.827 558.907 597.455 519.256 598.353C442.153 601.35 365.049 595.457 287.845 599.652C260.28 597.554 225.024 612.336 203.751 589.065C161.104 516.456 275.761 527.442 317.608 524.546C343.776 499.377 356.659 456.93 377.833 425.769C395.311 394.608 412.39 363.147 429.868 331.986C432.964 322.199 418.982 314.109 415.486 305.12C349.169 230.713 442.153 172.885 474.312 257.679Z"
        fill="black"
      />
      <path
        d="M265.471 626.12C284.647 595.758 329.491 609.042 330.39 643.199C325.296 664.872 313.511 684.647 298.53 701.027C275.758 724.997 235.009 703.124 242.5 670.864C246.195 654.485 256.882 640.302 265.471 626.12Z"
        fill="black"
      />
    </svg>
  );
}

function ChevronDownIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-medium">
        {number}
      </span>
      <div className="space-y-2 flex-1">{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = React.useState(false);
  const text = typeof children === "string" ? children : "";

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-black/30 backdrop-blur-sm rounded-lg p-3 md:p-4 font-mono text-sm flex items-center justify-between gap-2">
      <div>
        <span className="text-muted-foreground select-none">$ </span>
        <span className="text-foreground">{children}</span>
      </div>
      <button
        onClick={handleCopy}
        className="text-muted-foreground hover:text-foreground transition-colors p-1"
        title="Copy to clipboard"
      >
        {copied ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="currentColor"
            viewBox="0 0 256 256"
          >
            <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="currentColor"
            viewBox="0 0 256 256"
          >
            <path d="M216,28H88A20,20,0,0,0,68,48V76H40A20,20,0,0,0,20,96V216a20,20,0,0,0,20,20H168a20,20,0,0,0,20-20V188h28a20,20,0,0,0,20-20V48A20,20,0,0,0,216,28ZM164,212H44V100H164Zm48-48H188V96a20,20,0,0,0-20-20H92V52H212Z" />
          </svg>
        )}
      </button>
    </div>
  );
}

const bashKeywords = new Set([
  "while",
  "do",
  "done",
  "if",
  "then",
  "fi",
  "else",
  "break",
  "true",
  "false",
]);
const bashCommands = new Set(["paseo", "echo", "jq"]);

function highlightBash(code: string): React.ReactNode {
  const tokens: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < code.length) {
    if (code[i] === "#" && (i === 0 || /[\s(]/.test(code[i - 1]))) {
      const end = code.indexOf("\n", i);
      const comment = end === -1 ? code.slice(i) : code.slice(i, end);
      tokens.push(
        <span key={key++} className="text-white/30 italic">
          {comment}
        </span>,
      );
      i += comment.length;
      continue;
    }

    if (code[i] === '"') {
      let j = i + 1;
      while (j < code.length && code[j] !== '"') {
        if (code[j] === "\\") j++;
        j++;
      }
      const str = code.slice(i, j + 1);
      tokens.push(
        <span key={key++} className="text-green-400/80">
          {str}
        </span>,
      );
      i = j + 1;
      continue;
    }

    if (code[i] === "'") {
      let j = i + 1;
      while (j < code.length && code[j] !== "'") j++;
      const str = code.slice(i, j + 1);
      tokens.push(
        <span key={key++} className="text-green-400/80">
          {str}
        </span>,
      );
      i = j + 1;
      continue;
    }

    if (code[i] === "$") {
      if (code[i + 1] === "(") {
        tokens.push(
          <span key={key++} className="text-amber-300/70">
            $(
          </span>,
        );
        i += 2;
        continue;
      }
      let j = i + 1;
      while (j < code.length && /\w/.test(code[j])) j++;
      tokens.push(
        <span key={key++} className="text-amber-300/70">
          {code.slice(i, j)}
        </span>,
      );
      i = j;
      continue;
    }

    if (
      code[i] === "-" &&
      (i === 0 || /\s/.test(code[i - 1])) &&
      i + 1 < code.length &&
      /[\w-]/.test(code[i + 1])
    ) {
      let j = i;
      if (code[j + 1] === "-") j++;
      j++;
      while (j < code.length && /[\w-]/.test(code[j])) j++;
      tokens.push(
        <span key={key++} className="text-sky-300/70">
          {code.slice(i, j)}
        </span>,
      );
      i = j;
      continue;
    }

    if (/[a-zA-Z_]/.test(code[i])) {
      let j = i;
      while (j < code.length && /\w/.test(code[j])) j++;
      const word = code.slice(i, j);
      if (bashKeywords.has(word)) {
        tokens.push(
          <span key={key++} className="text-purple-400">
            {word}
          </span>,
        );
      } else if (bashCommands.has(word)) {
        tokens.push(
          <span key={key++} className="text-white">
            {word}
          </span>,
        );
      } else {
        tokens.push(word);
        key++;
      }
      i = j;
      continue;
    }

    if (code[i] === "|" || (code[i] === "&" && code[i + 1] === "&")) {
      const op = code[i] === "|" ? "|" : "&&";
      tokens.push(
        <span key={key++} className="text-white/40">
          {op}
        </span>,
      );
      i += op.length;
      continue;
    }

    if (code[i] === "\\") {
      tokens.push(
        <span key={key++} className="text-white/40">
          \
        </span>,
      );
      i++;
      continue;
    }

    if (code[i] === ")") {
      tokens.push(
        <span key={key++} className="text-amber-300/70">
          )
        </span>,
      );
      i++;
      continue;
    }

    tokens.push(code[i]);
    i++;
  }

  return <>{tokens}</>;
}

function CLICodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = React.useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative bg-white/5 rounded-lg overflow-hidden">
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 text-white/30 hover:text-white/70 transition-colors p-1"
        title="Copy to clipboard"
      >
        {copied ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            fill="currentColor"
            viewBox="0 0 256 256"
          >
            <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            fill="currentColor"
            viewBox="0 0 256 256"
          >
            <path d="M216,28H88A20,20,0,0,0,68,48V76H40A20,20,0,0,0,20,96V216a20,20,0,0,0,20,20H168a20,20,0,0,0,20-20V188h28a20,20,0,0,0,20-20V48A20,20,0,0,0,216,28ZM164,212H44V100H164Zm48-48H188V96a20,20,0,0,0-20-20H92V52H212Z" />
          </svg>
        )}
      </button>
      <pre className="p-4 pr-10 text-xs leading-relaxed overflow-x-auto text-white/70 font-mono whitespace-pre">
        {highlightBash(children)}
      </pre>
    </div>
  );
}

interface CLIExample {
  title: string;
  description: string;
  code: string;
}

const cliExamples: CLIExample[] = [
  {
    title: "Launch and monitor",
    description:
      "Give an agent a task and watch it work. The --worktree flag spins up an isolated git branch so you can run multiple agents on the same repo without conflicts.",
    code: `paseo run --provider claude/opus-4.6 "implement user authentication"
paseo run --provider codex/gpt-5.4 --worktree feature-x "implement feature X"

paseo ls                           # list running agents
paseo attach abc123                # stream live output
paseo send abc123 "also add tests" # follow-up task`,
  },
  {
    title: "Orchestration",
    description:
      "Agents can use the CLI too. Tell one agent to spawn others, split up the work, and pull everything together when they're done.",
    code: `# Spawn two agents in parallel, wait, then synthesize
paseo run --detach "implement the frontend" --name frontend
paseo run --detach "implement the API layer" --name api

paseo wait frontend api

paseo run "review both branches and write an integration plan"`,
  },
  {
    title: "Structured output",
    description:
      "Pass a JSON schema and get typed data back from any agent run. No output parsing, just the structured result you asked for.",
    code: `result=$(paseo run \\
  --output-schema '{
    "type": "object",
    "properties": {
      "severity": { "type": "string", "enum": ["low", "medium", "high"] },
      "issues":   { "type": "array", "items": { "type": "string" } }
    },
    "required": ["severity", "issues"]
  }' \\
  "audit this codebase for security issues")

echo $result | jq '.severity'   # "high"
echo $result | jq '.issues[0]'  # "SQL injection on line 42"`,
  },
  {
    title: "Remote",
    description:
      "Point at any daemon on your network or over the internet. Run agents on a beefy server from your laptop.",
    code: `# Set once for the session
export PASEO_HOST=workstation.local:6767
paseo run "run the full test suite"
paseo ls

# Or per-command
paseo --host gpu-server:6767 run "train the model"
paseo --host gpu-server:6767 attach abc123`,
  },
  {
    title: "Worker-judge loops",
    description:
      "Have one agent do the work and another judge the result. Loop until it passes. Good for test fixes, code review, or any task with clear acceptance criteria.",
    code: `while true; do
  paseo run "make all tests pass"

  verdict=$(paseo run \\
    --output-schema '{"type":"object","properties":{"passed":{"type":"boolean"}},"required":["passed"]}' \\
    "verify tests pass and the code is production-ready")

  echo "$verdict" | jq -e '.passed' && break
done`,
  },
];

function CLISection() {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const active = cliExamples[activeIndex];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h2 className="text-2xl font-medium">CLI</h2>
        <p className="text-sm text-white/60 max-w-lg">
          Everything you can do in the app, you can do from the terminal.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {cliExamples.map((example, i) => (
          <button
            key={example.title}
            onClick={() => setActiveIndex(i)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              i === activeIndex
                ? "border-white/40 text-white bg-white/10"
                : "border-white/15 text-white/50 hover:text-white/80 hover:border-white/30"
            }`}
          >
            {example.title}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <p className="text-sm text-white/50">{active.description}</p>
        <CLICodeBlock>{active.code}</CLICodeBlock>
      </div>

      <a
        href="/docs/cli"
        className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
      >
        Full CLI reference
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </a>
    </motion.div>
  );
}

function FAQ() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="space-y-6"
    >
      <h2 className="text-2xl font-medium">FAQ</h2>
      <div className="space-y-6">
        <FAQItem question="Is this free?">
          Yes. Paseo is free and open source. You need Claude Code, Codex, or OpenCode installed
          with your own credentials. Voice is local-first by default and can optionally use OpenAI
          speech providers if you configure them.
        </FAQItem>
        <FAQItem question="Does my code leave my machine?">
          Paseo doesn't send your code anywhere. Agents run locally and talk to their own APIs as
          they normally would. For remote access, you can use the optional{" "}
          <a href="/docs/security" className="underline hover:text-white/80">
            end-to-end encrypted relay
          </a>
          , connect directly over your local network, or use your own tunnel.
        </FAQItem>
        <FAQItem question="What agents does it support?">
          Claude Code, Codex, and OpenCode. Each agent runs as its own process using its own CLI.
          Paseo doesn't modify or wrap their behavior.
        </FAQItem>
        <FAQItem question="Do I need the desktop app?">
          No. You can run the daemon headless with{" "}
          <code className="font-mono text-white/50">npm install -g @getpaseo/cli && paseo</code> and
          use the CLI, web app, or mobile app to connect. The desktop app just bundles the daemon
          with a UI.
        </FAQItem>
        <FAQItem question="How does voice work?">
          Voice runs locally on your device by default. You talk, the app transcribes and sends it
          to your agent as text. Optionally, you can configure OpenAI speech providers for
          higher-quality transcription and text-to-speech. See the{" "}
          <a href="/docs/voice" className="underline hover:text-white/80">
            voice docs
          </a>
          .
        </FAQItem>
        <FAQItem question="Can I connect from outside my network?">
          Yes. You can use the hosted relay (end-to-end encrypted, Paseo can't read your traffic),
          set up your own tunnel (Tailscale, Cloudflare Tunnel, etc.), or expose the daemon port
          directly. See{" "}
          <a href="/docs/configuration" className="underline hover:text-white/80">
            configuration
          </a>
          .
        </FAQItem>
        <FAQItem question="Do I need git or GitHub?">
          No. Paseo works in any directory. Worktrees are optional and only relevant if you use git.
          You can run agents anywhere you'd normally work.
        </FAQItem>
        <FAQItem question="Can I get banned for using Paseo?">
          <p>We can't make promises on behalf of providers.</p>
          <p>
            That said, Paseo launches the official first-party CLIs (Claude Code, Codex, OpenCode)
            as subprocesses. It doesn't extract tokens or call inference APIs directly. From the
            provider's perspective, usage through Paseo is indistinguishable from running the CLI
            yourself.
          </p>
          <p>I've been using Paseo with all providers for months without issue.</p>
        </FAQItem>
        <FAQItem question="How do worktrees work?">
          When you launch an agent with the worktree option (from the app, desktop, or CLI), Paseo
          creates a git worktree and runs the agent inside it. The agent works on an isolated branch
          without touching your main working directory. See the{" "}
          <a href="/docs/worktrees" className="underline hover:text-white/80">
            worktrees docs
          </a>
          .
        </FAQItem>
      </div>
    </motion.div>
  );
}

function SponsorCTA() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="rounded-xl bg-white/5 border border-white/10 p-8 md:p-10 text-center space-y-4"
    >
      <p className="text-lg font-medium">Paseo is an independent project</p>
      <p className="text-sm text-white/50 max-w-md mx-auto leading-relaxed">
        I built Paseo because the existing tools weren't good enough for me. There's no VC or big
        team behind this. If it saves you time, sponsoring keeps development going.
      </p>
      <div className="pt-2">
        <a
          href="https://github.com/sponsors/boudra"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-white/10 border border-white/20 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/15 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-pink-400"
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          Sponsor on GitHub
        </a>
      </div>
    </motion.div>
  );
}

function FAQItem({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="font-medium text-sm cursor-pointer list-none flex items-start gap-2">
        <span className="font-mono text-white/40 group-open:hidden">+</span>
        <span className="font-mono text-white/40 hidden group-open:inline">-</span>
        {question}
      </summary>
      <div className="text-sm text-white/60 space-y-2 mt-2 ml-4">{children}</div>
    </details>
  );
}
