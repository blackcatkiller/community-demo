// @ts-nocheck
import type { FormKitHandlers, FormKitSchema, FormKitState } from "./types";

export type FormKitRegistrationBehavior = {
  releaseFocusOnActionWarning?: boolean;
};

export type FormKitRegistration = {
  readonly id: string;
  readonly schema: FormKitSchema;
  behavior?: FormKitRegistrationBehavior;
  getState(): FormKitState;
  handlers?: FormKitHandlers;
  subscribe?(listener: () => void): (() => void) | void;
  dispose?(): void;
};

// A registration is the runtime contract between business code and the
// viewport host. The form core never reads business objects directly.
export function createFormKitRegistration(options: {
  schema: FormKitSchema;
  behavior?: FormKitRegistrationBehavior;
  getState: () => FormKitState;
  handlers?: FormKitHandlers;
  subscribeState?: (listener: () => void) => (() => void) | void;
  dispose?: () => void;
}): FormKitRegistration {
  return {
    id: options.schema.id,
    schema: options.schema,
    behavior: options.behavior,
    getState: options.getState,
    handlers: options.handlers,
    subscribe(listener) {
      return options.subscribeState?.(listener);
    },
    dispose() {
      options.dispose?.();
    }
  };
}
