export type KeyboardActionScope =
  | "global"
  | "message-input"
  | "sidebar"
  | "workspace";

export type KeyboardActionId =
  | "message-input.focus"
  | "message-input.dictation-toggle"
  | "message-input.dictation-cancel"
  | "message-input.voice-toggle"
  | "message-input.voice-mute-toggle";

export type KeyboardActionDefinition = {
  id: KeyboardActionId;
  scope: KeyboardActionScope;
};

export type KeyboardActionHandler = {
  handlerId: string;
  actions: readonly KeyboardActionId[];
  enabled: boolean;
  priority: number;
  isActive?: () => boolean;
  handle: (action: KeyboardActionDefinition) => boolean;
};

type KeyboardActionRegistryEntry = KeyboardActionHandler & {
  registeredAt: number;
};

export function createKeyboardActionDispatcher() {
  let nextRegistrationOrder = 1;
  const handlers = new Map<string, KeyboardActionRegistryEntry>();

  return {
    registerHandler(handler: KeyboardActionHandler) {
      handlers.set(handler.handlerId, {
        ...handler,
        registeredAt: nextRegistrationOrder++,
      });

      return () => {
        const current = handlers.get(handler.handlerId);
        if (!current) {
          return;
        }
        handlers.delete(handler.handlerId);
      };
    },

    dispatch(action: KeyboardActionDefinition): boolean {
      const candidates = Array.from(handlers.values())
        .filter((handler) => handler.actions.includes(action.id))
        .filter((handler) => handler.enabled)
        .filter((handler) => (handler.isActive ? handler.isActive() : true))
        .sort((left, right) => {
          if (left.priority !== right.priority) {
            return right.priority - left.priority;
          }
          return right.registeredAt - left.registeredAt;
        });

      for (const handler of candidates) {
        if (handler.handle(action)) {
          return true;
        }
      }

      return false;
    },
  };
}

export const keyboardActionDispatcher = createKeyboardActionDispatcher();
