import type { Command } from 'commander'
import type { AgentSnapshotPayload } from '@getpaseo/server'
import { connectToDaemon, getDaemonHost } from '../../utils/client.js'
import type { CommandOptions, SingleResult, OutputSchema, CommandError } from '../../output/index.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { lookup } from 'mime-types'

/** Result type for agent run command */
export interface AgentRunResult {
  agentId: string
  status: 'created' | 'running' | 'completed' | 'timeout' | 'permission' | 'error'
  provider: string
  cwd: string
  title: string | null
}

/** Schema for agent run output */
export const agentRunSchema: OutputSchema<AgentRunResult> = {
  idField: 'agentId',
  columns: [
    { header: 'AGENT ID', field: 'agentId', width: 12 },
    { header: 'STATUS', field: 'status', width: 10 },
    { header: 'PROVIDER', field: 'provider', width: 10 },
    { header: 'CWD', field: 'cwd', width: 30 },
    { header: 'TITLE', field: 'title', width: 20 },
  ],
}

export interface AgentRunOptions extends CommandOptions {
  detach?: boolean
  name?: string
  provider?: string
  model?: string
  mode?: string
  worktree?: string
  base?: string
  image?: string[]
  cwd?: string
  label?: string[]
  ui?: boolean
  outputSchema?: string
}

function toRunResult(
  agent: AgentSnapshotPayload,
  statusOverride?: AgentRunResult['status']
): AgentRunResult {
  return {
    agentId: agent.id,
    status: statusOverride ?? (agent.status === 'running' ? 'running' : 'created'),
    provider: agent.provider,
    cwd: agent.cwd,
    title: agent.title,
  }
}

function loadOutputSchema(value: string): Record<string, unknown> {
  const trimmed = value.trim()
  if (!trimmed) {
    const error: CommandError = {
      code: 'INVALID_OUTPUT_SCHEMA',
      message: '--output-schema cannot be empty',
      details: 'Provide a JSON schema file path or inline JSON object',
    }
    throw error
  }

  let source = trimmed
  if (!trimmed.startsWith('{')) {
    try {
      source = readFileSync(resolve(trimmed), 'utf8')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const error: CommandError = {
        code: 'INVALID_OUTPUT_SCHEMA',
        message: `Failed to read output schema file: ${trimmed}`,
        details: message,
      }
      throw error
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const error: CommandError = {
      code: 'INVALID_OUTPUT_SCHEMA',
      message: 'Failed to parse output schema JSON',
      details: message,
    }
    throw error
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const error: CommandError = {
      code: 'INVALID_OUTPUT_SCHEMA',
      message: 'Output schema must be a JSON object',
    }
    throw error
  }

  return parsed as Record<string, unknown>
}

function extractFirstJsonObject(text: string): string | null {
  const source = text.trim()
  if (!source) {
    return null
  }

  const startIndexes: number[] = []
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '{') {
      startIndexes.push(i)
    }
  }

  for (const start of startIndexes) {
    let depth = 0
    let inString = false
    let escaped = false

    for (let i = start; i < source.length; i += 1) {
      const ch = source[i]!

      if (inString) {
        if (escaped) {
          escaped = false
          continue
        }
        if (ch === '\\') {
          escaped = true
          continue
        }
        if (ch === '"') {
          inString = false
        }
        continue
      }

      if (ch === '"') {
        inString = true
        continue
      }

      if (ch === '{') {
        depth += 1
        continue
      }
      if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          const candidate = source.slice(start, i + 1).trim()
          try {
            JSON.parse(candidate)
            return candidate
          } catch {
            // Keep scanning.
          }
        }
      }
    }
  }

  return null
}

function parseStructuredOutput(lastMessage: string): Record<string, unknown> {
  const trimmed = lastMessage.trim()
  const fenced = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
  const jsonText = fenced?.[1]?.trim() ?? extractFirstJsonObject(trimmed) ?? trimmed

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const error: CommandError = {
      code: 'OUTPUT_SCHEMA_FAILED',
      message: 'Agent response is not valid JSON',
      details: message,
    }
    throw error
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const error: CommandError = {
      code: 'OUTPUT_SCHEMA_FAILED',
      message: 'Agent response JSON must be an object',
    }
    throw error
  }

  return parsed as Record<string, unknown>
}

function structuredRunSchema(output: Record<string, unknown>): OutputSchema<AgentRunResult> {
  return {
    ...agentRunSchema,
    serialize: () => output,
  }
}

export async function runRunCommand(
  prompt: string,
  options: AgentRunOptions,
  _command: Command
): Promise<SingleResult<AgentRunResult>> {
  const host = getDaemonHost({ host: options.host as string | undefined })
  const outputSchema = options.outputSchema ? loadOutputSchema(options.outputSchema) : undefined

  // Validate prompt is provided
  if (!prompt || prompt.trim().length === 0) {
    const error: CommandError = {
      code: 'MISSING_PROMPT',
      message: 'A prompt is required',
      details: 'Usage: paseo agent run [options] <prompt>',
    }
    throw error
  }

  // Validate --base is only used with --worktree
  if (options.base && !options.worktree) {
    const error: CommandError = {
      code: 'INVALID_OPTIONS',
      message: '--base can only be used with --worktree',
      details: 'Usage: paseo agent run --worktree <name> --base <branch> <prompt>',
    }
    throw error
  }

  // --output-schema always runs in attached/wait mode
  if (outputSchema && options.detach) {
    const error: CommandError = {
      code: 'INVALID_OPTIONS',
      message: '--output-schema cannot be used with --detach',
      details: 'Structured output requires waiting for the agent to finish',
    }
    throw error
  }

  let client
  try {
    client = await connectToDaemon({ host: options.host as string | undefined })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const error: CommandError = {
      code: 'DAEMON_NOT_RUNNING',
      message: `Cannot connect to daemon at ${host}: ${message}`,
      details: 'Start the daemon with: paseo daemon start',
    }
    throw error
  }

  try {
    // Resolve working directory
    const cwd = options.cwd ?? process.cwd()

    // Process images if provided
    let images: Array<{ data: string; mimeType: string }> | undefined
    if (options.image && options.image.length > 0) {
      images = options.image.map((imagePath) => {
        const resolvedPath = resolve(imagePath)
        try {
          const imageData = readFileSync(resolvedPath)
          const mimeType = lookup(resolvedPath) || 'application/octet-stream'

          // Verify it's an image MIME type
          if (!mimeType.startsWith('image/')) {
            throw new Error(`File is not an image: ${imagePath} (detected type: ${mimeType})`)
          }

          return {
            data: imageData.toString('base64'),
            mimeType,
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          throw new Error(`Failed to read image ${imagePath}: ${message}`)
        }
      })
    }

    // Build git options if worktree is specified
    const git = options.worktree
      ? {
          createWorktree: true,
          worktreeSlug: options.worktree,
          baseBranch: options.base,
        }
      : undefined

    // Build labels from --label and --ui flags
    // --ui is syntactic sugar for --label ui=true
    // If explicit --label ui=... is provided, it takes precedence over --ui
    const labels: Record<string, string> = {}
    if (options.label) {
      for (const labelStr of options.label) {
        const eqIndex = labelStr.indexOf('=')
        if (eqIndex === -1) {
          const error: CommandError = {
            code: 'INVALID_LABEL',
            message: `Invalid label format: ${labelStr}`,
            details: 'Labels must be in key=value format',
          }
          throw error
        }
        const key = labelStr.slice(0, eqIndex)
        const value = labelStr.slice(eqIndex + 1)
        labels[key] = value
      }
    }
    // Add ui=true if --ui flag is set and ui label not already set
    if (options.ui && !('ui' in labels)) {
      labels['ui'] = 'true'
    }

    // Create the agent
    const agent = await client.createAgent({
      provider: (options.provider as 'claude' | 'codex' | 'opencode') ?? 'claude',
      cwd,
      title: options.name,
      modeId: options.mode,
      model: options.model,
      initialPrompt: prompt,
      outputSchema,
      images,
      git,
      worktreeName: options.worktree,
      labels: Object.keys(labels).length > 0 ? labels : undefined,
    })

    if (outputSchema) {
      const state = await client.waitForFinish(agent.id, 10 * 60 * 1000)

      if (state.status === 'timeout') {
        const error: CommandError = {
          code: 'OUTPUT_SCHEMA_FAILED',
          message: 'Timed out waiting for structured output',
        }
        throw error
      }

      if (state.status === 'permission') {
        const error: CommandError = {
          code: 'OUTPUT_SCHEMA_FAILED',
          message: 'Agent is waiting for permission before producing structured output',
        }
        throw error
      }

      if (state.status === 'error') {
        const error: CommandError = {
          code: 'OUTPUT_SCHEMA_FAILED',
          message: state.error ?? 'Agent failed before producing structured output',
        }
        throw error
      }

      const lastMessage = state.lastMessage?.trim()
      if (!lastMessage) {
        const error: CommandError = {
          code: 'OUTPUT_SCHEMA_FAILED',
          message: 'Agent finished without a structured output message',
        }
        throw error
      }

      const output = parseStructuredOutput(lastMessage)
      await client.close()

      return {
        type: 'single',
        data: toRunResult(agent, 'completed'),
        schema: structuredRunSchema(output),
      }
    }

    // Default run behavior is foreground: wait for completion unless --detach is set.
    if (!options.detach) {
      const state = await client.waitForFinish(agent.id, 10 * 60 * 1000)
      await client.close()

      const finalAgent = state.final ?? agent
      const status: AgentRunResult['status'] =
        state.status === 'idle' ? 'completed' : state.status

      return {
        type: 'single',
        data: toRunResult(finalAgent, status),
        schema: agentRunSchema,
      }
    }

    await client.close()

    return {
      type: 'single',
      data: toRunResult(agent),
      schema: agentRunSchema,
    }
  } catch (err) {
    await client.close().catch(() => {})

    if (err && typeof err === 'object' && 'code' in err) {
      throw err
    }

    const message = err instanceof Error ? err.message : String(err)
    const error: CommandError = {
      code: 'AGENT_CREATE_FAILED',
      message: `Failed to create agent: ${message}`,
    }
    throw error
  }
}
