import type { Command } from 'commander'
import { connectToDaemon } from '../../utils/client.js'
import type { CommandOptions, ListResult, OutputSchema } from '../../output/index.js'

/** Model list item for display */
export interface ModelListItem {
  model: string
  id: string
  description: string
}

const VALID_PROVIDERS = ['claude', 'codex', 'opencode']

/** Schema for provider models output */
export const providerModelsSchema: OutputSchema<ModelListItem> = {
  idField: 'id',
  columns: [
    { header: 'ID', field: 'id', width: 30 },
    { header: 'MODEL', field: 'model', width: 30 },
    { header: 'DESCRIPTION', field: 'description', width: 40 },
  ],
}

export type ProviderModelsResult = ListResult<ModelListItem>

export interface ProviderModelsOptions extends CommandOptions {
  host?: string
}

export async function runModelsCommand(
  provider: string,
  options: ProviderModelsOptions,
  _command: Command
): Promise<ProviderModelsResult> {
  const normalizedProvider = provider.toLowerCase()

  if (!VALID_PROVIDERS.includes(normalizedProvider)) {
    throw {
      code: 'UNKNOWN_PROVIDER',
      message: `Unknown provider: ${provider}`,
      details: `Valid providers: ${VALID_PROVIDERS.join(', ')}`,
    }
  }

  const client = await connectToDaemon({ host: options.host })
  try {
    const result = await client.listProviderModels(normalizedProvider)

    if (result.error) {
      throw {
        code: 'PROVIDER_ERROR',
        message: `Failed to fetch models for ${provider}: ${result.error}`,
      }
    }

    const models: ModelListItem[] = (result.models ?? []).map((m) => ({
      model: m.label,
      id: m.id,
      description: m.description ?? '',
    }))

    return {
      type: 'list',
      data: models,
      schema: providerModelsSchema,
    }
  } finally {
    await client.close()
  }
}
