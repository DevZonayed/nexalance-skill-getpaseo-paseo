import { Command } from 'commander'
import chalk from 'chalk'
import { spawn } from 'node:child_process'
import { closeSync, openSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  createPaseoDaemon,
  loadConfig,
  resolvePaseoHome,
  createRootLogger,
  loadPersistedConfig,
} from '@getpaseo/server'
import type { CliConfigOverrides } from '@getpaseo/server'

interface StartOptions {
  port?: string
  listen?: string
  home?: string
  foreground?: boolean
  relay?: boolean
  mcp?: boolean
  allowedHosts?: string
}

interface DetachedStartupReady {
  exitedEarly: false
}

interface DetachedStartupExited {
  exitedEarly: true
  code: number | null
  signal: NodeJS.Signals | null
  error?: Error
}

type DetachedStartupResult = DetachedStartupReady | DetachedStartupExited

const DETACHED_STARTUP_GRACE_MS = 1200
const DAEMON_LOG_FILENAME = 'daemon.log'

export function startCommand(): Command {
  return new Command('start')
    .description('Start the Paseo daemon')
    .option('--listen <listen>', 'Listen target (host:port, port, or unix socket path)')
    .option('--port <port>', 'Port to listen on (default: 6767)')
    .option('--home <path>', 'Paseo home directory (default: ~/.paseo)')
    .option('--foreground', 'Run in foreground (don\'t daemonize)')
    .option('--no-relay', 'Disable relay connection')
    .option('--no-mcp', 'Disable the Agent MCP HTTP endpoint')
    .option(
      '--allowed-hosts <hosts>',
      'Comma-separated list of allowed Host header values (Vite-style; e.g., "localhost,.example.com" or "true")'
    )
    .action(async (options: StartOptions) => {
      await runStart(options)
    })
}

function buildForegroundArgs(options: StartOptions): string[] {
  const args = ['daemon', 'start', '--foreground']

  if (options.listen) {
    args.push('--listen', options.listen)
  } else if (options.port) {
    args.push('--port', options.port)
  }

  if (options.home) {
    args.push('--home', options.home)
  }

  if (options.relay === false) {
    args.push('--no-relay')
  }

  if (options.mcp === false) {
    args.push('--no-mcp')
  }

  if (options.allowedHosts) {
    args.push('--allowed-hosts', options.allowedHosts)
  }

  return args
}

function tailFile(filePath: string, lines = 30): string | null {
  try {
    const content = readFileSync(filePath, 'utf-8')
    return content.split('\n').filter(Boolean).slice(-lines).join('\n')
  } catch {
    return null
  }
}

async function runDetachedStart(options: StartOptions): Promise<void> {
  const childEnv: NodeJS.ProcessEnv = { ...process.env }
  if (options.home) {
    childEnv.PASEO_HOME = options.home
  }

  const paseoHome = resolvePaseoHome(childEnv)
  const logPath = path.join(paseoHome, DAEMON_LOG_FILENAME)

  const cliEntry = process.argv[1]
  if (!cliEntry) {
    throw new Error('Unable to determine CLI entrypoint for detached daemon start')
  }

  const logFd = openSync(logPath, 'a')

  try {
    const child = spawn(
      process.execPath,
      [...process.execArgv, cliEntry, ...buildForegroundArgs(options)],
      {
        detached: true,
        env: childEnv,
        stdio: ['ignore', logFd, logFd],
      }
    )

    child.unref()

    const startup = await new Promise<DetachedStartupResult>((resolve) => {
      let settled = false

      const finish = (value: DetachedStartupResult) => {
        if (settled) return
        settled = true
        resolve(value)
      }

      const timer = setTimeout(() => finish({ exitedEarly: false }), DETACHED_STARTUP_GRACE_MS)

      child.once('error', (error) => {
        clearTimeout(timer)
        finish({ exitedEarly: true, code: null, signal: null, error })
      })

      child.once('exit', (code, signal) => {
        clearTimeout(timer)
        finish({ exitedEarly: true, code, signal })
      })
    })

    if (startup.exitedEarly) {
      const reason = startup.error
        ? startup.error.message
        : `exit code ${startup.code ?? 'unknown'}${startup.signal ? ` (${startup.signal})` : ''}`
      const recentLogs = tailFile(logPath)
      throw new Error(
        [
          `Daemon failed to start in background (${reason}).`,
          recentLogs ? `Recent daemon logs:\n${recentLogs}` : null,
        ]
          .filter(Boolean)
          .join('\n\n')
      )
    }

    console.log(chalk.green(`Daemon starting in background (PID ${child.pid ?? 'unknown'}).`))
    console.log(chalk.dim(`Logs: ${logPath}`))
  } finally {
    closeSync(logFd)
  }
}

async function runStart(options: StartOptions): Promise<void> {
  if (options.listen && options.port) {
    console.error(chalk.red('Cannot use --listen and --port together'))
    process.exit(1)
  }

  if (!options.foreground) {
    try {
      await runDetachedStart(options)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(chalk.red(message))
      process.exit(1)
    }
    return
  }

  // Set environment variables based on CLI options
  if (options.home) {
    process.env.PASEO_HOME = options.home
  }

  let paseoHome: string
  let logger: ReturnType<typeof createRootLogger>
  let config: ReturnType<typeof loadConfig>
  const cliOverrides: CliConfigOverrides = {}

  if (options.listen) {
    cliOverrides.listen = options.listen
  } else if (options.port) {
    cliOverrides.listen = `127.0.0.1:${options.port}`
  }

  if (options.relay === false) {
    cliOverrides.relayEnabled = false
  }

  if (options.allowedHosts) {
    const raw = options.allowedHosts.trim()
    cliOverrides.allowedHosts =
      raw.toLowerCase() === 'true'
        ? true
        : raw.split(',').map(h => h.trim()).filter(Boolean)
  }

  if (options.mcp === false) {
    cliOverrides.mcpEnabled = false
  }

  try {
    paseoHome = resolvePaseoHome()
    const persistedConfig = loadPersistedConfig(paseoHome)
    logger = createRootLogger(persistedConfig)
    config = loadConfig(paseoHome, { cli: cliOverrides })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(chalk.red(message))
    process.exit(1)
  }

  let daemon: Awaited<ReturnType<typeof createPaseoDaemon>>
  try {
    daemon = await createPaseoDaemon(config, logger)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(chalk.red(`Failed to initialize daemon: ${message}`))
    process.exit(1)
  }

  // Handle graceful shutdown
  let shuttingDown = false
  const handleShutdown = async (signal: string) => {
    if (shuttingDown) {
      logger.info('Forcing exit...')
      process.exit(1)
    }
    shuttingDown = true
    logger.info(`${signal} received, shutting down gracefully... (press Ctrl+C again to force exit)`)

    const forceExit = setTimeout(() => {
      logger.warn('Forcing shutdown - HTTP server didn\'t close in time')
      process.exit(1)
    }, 10000)

    try {
      await daemon.stop()
      clearTimeout(forceExit)
      logger.info('Server closed')
      process.exit(0)
    } catch (err) {
      clearTimeout(forceExit)
      logger.error({ err }, 'Shutdown failed')
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => handleShutdown('SIGTERM'))
  process.on('SIGINT', () => handleShutdown('SIGINT'))

  try {
    await daemon.start()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(chalk.red(`Failed to start daemon: ${message}`))
    process.exit(1)
  }
}
