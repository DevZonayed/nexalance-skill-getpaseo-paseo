import { spawnSync } from 'node:child_process'
import {
  applySherpaLoaderEnv as applySherpaLoaderEnvFromServer,
  resolveSherpaLoaderEnv,
} from '@getpaseo/server'

const SHERPA_ENV_BOOTSTRAPPED = 'PASEO_SHERPA_ENV_BOOTSTRAPPED'

export function applySherpaLoaderEnv(env: NodeJS.ProcessEnv): {
  changed: boolean
  key: 'LD_LIBRARY_PATH' | 'DYLD_LIBRARY_PATH' | 'PATH' | null
  libDir: string | null
} {
  const result = applySherpaLoaderEnvFromServer(env)
  return {
    changed: result.changed,
    key: result.key,
    libDir: result.libDir,
  }
}

export function reexecWithSherpaLoaderEnvIfNeeded(): never | void {
  const resolved = resolveSherpaLoaderEnv()
  if (!resolved) {
    return
  }
  if (process.env[SHERPA_ENV_BOOTSTRAPPED] === '1') {
    return
  }

  const envCopy: NodeJS.ProcessEnv = { ...process.env }
  const applied = applySherpaLoaderEnvFromServer(envCopy)
  const updatedValue = applied.key ? envCopy[applied.key] ?? '' : ''
  if (applied.key && updatedValue === (process.env[applied.key] ?? '')) {
    return
  }

  const env: NodeJS.ProcessEnv = {
    ...envCopy,
    [SHERPA_ENV_BOOTSTRAPPED]: '1',
  }

  const result = spawnSync(process.execPath, process.argv.slice(1), {
    env,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  process.exit(result.status ?? 1)
}
