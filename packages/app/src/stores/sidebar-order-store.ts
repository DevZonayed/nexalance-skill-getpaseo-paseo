import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SidebarOrderStoreState {
  orderByServerId: Record<string, string[]>;
  getOrder: (serverId: string) => string[];
  setOrder: (serverId: string, keys: string[]) => void;
  insertAtTop: (serverId: string, key: string) => void;
  remove: (serverId: string, key: string) => void;
}

function normalizeKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawKey of keys) {
    const key = rawKey.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(key);
  }

  return normalized;
}

export const useSidebarOrderStore = create<SidebarOrderStoreState>()(
  persist(
    (set, get) => ({
      orderByServerId: {},
      getOrder: (serverId) => {
        const key = serverId.trim();
        if (!key) {
          return [];
        }
        return get().orderByServerId[key] ?? [];
      },
      setOrder: (serverId, keys) => {
        const key = serverId.trim();
        if (!key) {
          return;
        }
        const normalized = normalizeKeys(keys);
        set((state) => ({
          orderByServerId: {
            ...state.orderByServerId,
            [key]: normalized,
          },
        }));
      },
      insertAtTop: (serverId, rawKey) => {
        const serverKey = serverId.trim();
        const entryKey = rawKey.trim();
        if (!serverKey || !entryKey) {
          return;
        }
        set((state) => {
          const current = state.orderByServerId[serverKey] ?? [];
          const next = [entryKey, ...current.filter((key) => key !== entryKey)];
          return {
            orderByServerId: {
              ...state.orderByServerId,
              [serverKey]: next,
            },
          };
        });
      },
      remove: (serverId, rawKey) => {
        const serverKey = serverId.trim();
        const entryKey = rawKey.trim();
        if (!serverKey || !entryKey) {
          return;
        }
        set((state) => {
          const current = state.orderByServerId[serverKey] ?? [];
          const next = current.filter((key) => key !== entryKey);
          if (next.length === current.length) {
            return state;
          }
          return {
            orderByServerId: {
              ...state.orderByServerId,
              [serverKey]: next,
            },
          };
        });
      },
    }),
    {
      name: "sidebar-agent-order",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        orderByServerId: state.orderByServerId,
      }),
    }
  )
);
