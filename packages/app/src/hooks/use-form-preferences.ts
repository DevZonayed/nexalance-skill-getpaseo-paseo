import { useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
const FORM_PREFERENCES_STORAGE_KEY = "@paseo:create-agent-preferences";
const FORM_PREFERENCES_QUERY_KEY = ["form-preferences"];

const formPreferencesSchema = z.object({
  workingDir: z.string().optional(),
  provider: z.string().optional(),
  serverId: z.string().optional(),
});

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
