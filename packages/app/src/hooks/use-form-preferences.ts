import { useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { AgentProvider } from "@server/server/agent/agent-sdk-types";

const FORM_PREFERENCES_STORAGE_KEY = "@paseo:create-agent-preferences";
const FORM_PREFERENCES_QUERY_KEY = ["form-preferences"];

const providerPreferencesSchema = z.object({
  model: z.string().optional(),
  mode: z.string().optional(),
  thinkingByModel: z.record(z.string()).optional(),
});

const formPreferencesSchema = z.object({
  provider: z.string().optional(),
  providerPreferences: z.record(providerPreferencesSchema).optional(),
});

export type ProviderPreferences = z.infer<typeof providerPreferencesSchema>;
export type FormPreferences = z.infer<typeof formPreferencesSchema>;

const DEFAULT_FORM_PREFERENCES: FormPreferences = {};

async function loadFormPreferences(): Promise<FormPreferences> {
  const stored = await AsyncStorage.getItem(FORM_PREFERENCES_STORAGE_KEY);
  if (!stored) return DEFAULT_FORM_PREFERENCES;
  const result = formPreferencesSchema.safeParse(JSON.parse(stored));
  return result.success ? result.data : DEFAULT_FORM_PREFERENCES;
}

export interface UseFormPreferencesReturn {
  preferences: FormPreferences;
  isLoading: boolean;
  updatePreferences: (updates: Partial<FormPreferences>) => Promise<void>;
}

export function mergeProviderPreferences(args: {
  preferences: FormPreferences;
  provider: AgentProvider;
  updates: Partial<ProviderPreferences>;
}): FormPreferences {
  const { preferences, provider, updates } = args;
  const existingProviderPreferences = preferences.providerPreferences ?? {};
  const existing = existingProviderPreferences[provider] ?? {};
  const nextThinkingByModel =
    updates.thinkingByModel === undefined
      ? existing.thinkingByModel
      : {
          ...existing.thinkingByModel,
          ...updates.thinkingByModel,
        };

  return {
    ...preferences,
    provider,
    providerPreferences: {
      ...existingProviderPreferences,
      [provider]: {
        ...existing,
        ...updates,
        ...(nextThinkingByModel ? { thinkingByModel: nextThinkingByModel } : {}),
      },
    },
  };
}

export function useFormPreferences(): UseFormPreferencesReturn {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: FORM_PREFERENCES_QUERY_KEY,
    queryFn: loadFormPreferences,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const preferences = data ?? DEFAULT_FORM_PREFERENCES;

  const updatePreferences = useCallback(
    async (updates: Partial<FormPreferences>) => {
      const prev =
        queryClient.getQueryData<FormPreferences>(FORM_PREFERENCES_QUERY_KEY) ??
        DEFAULT_FORM_PREFERENCES;
      const next = { ...prev, ...updates };
      queryClient.setQueryData<FormPreferences>(FORM_PREFERENCES_QUERY_KEY, next);
      await AsyncStorage.setItem(FORM_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    },
    [queryClient],
  );

  return {
    preferences,
    isLoading: isPending,
    updatePreferences,
  };
}
