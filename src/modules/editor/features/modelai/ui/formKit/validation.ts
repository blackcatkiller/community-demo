// @ts-nocheck
import type {
  FormKitActionGuardSchema,
  FormKitActionGuardValidationState,
  FormKitFieldValidation,
  FormKitSchema,
  FormKitState,
  FormKitValidationState,
  FormKitValueFieldSchema,
  FormKitSwapPairItemSchema
} from "./types";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeCustomSelectValue(value: unknown) {
  if (typeof value === "string") {
    const normalized = value.trim();
    return {
      valid: normalized.length > 0,
      normalizedValue: normalized
    };
  }

  if (isFiniteNumber(value)) {
    return {
      valid: true,
      normalizedValue: value
    };
  }

  return {
    valid: false,
    normalizedValue: value
  };
}

function isEmptySelectableValue(value: unknown) {
  return value === undefined || value === null || value === "";
}

export function normalizeFormKitFieldValue(
  field: FormKitValueFieldSchema | FormKitSwapPairItemSchema,
  value: unknown
): FormKitFieldValidation {
  switch (field.kind) {
    case "text":
      return {
        valid: true,
        normalizedValue: value
      };
    case "number": {
      if (!isFiniteNumber(value)) {
        return {
          valid: false,
          normalizedValue: value,
          errorKey: "modelai.formKit.validation.invalidNumber"
        };
      }
      return {
        valid: true,
        normalizedValue: value
      };
    }
    case "boolean":
      return {
        valid: typeof value === "boolean",
        normalizedValue: value,
        errorKey:
          typeof value === "boolean"
            ? undefined
            : "modelai.formKit.validation.invalidBoolean"
      };
    case "select":
    case "radio": {
      if (
        field.kind === "select" &&
        field.clearable &&
        isEmptySelectableValue(value)
      ) {
        return {
          valid: true,
          normalizedValue: undefined
        };
      }
      const options = field.options ?? [];
      if (field.kind === "select" && field.allowCustomValue) {
        const { valid, normalizedValue } = normalizeCustomSelectValue(value);
        return {
          valid,
          normalizedValue,
          errorKey: valid
            ? undefined
            : "modelai.formKit.validation.invalidOption"
        };
      }
      const valid =
        typeof value === "string" &&
        options.some(option => option.value === value && !option.disabled);
      return {
        valid,
        normalizedValue: value,
        errorKey: valid ? undefined : "modelai.formKit.validation.invalidOption"
      };
    }
    case "button":
      return {
        valid: true,
        normalizedValue: value
      };
    default:
      return {
        valid: false,
        normalizedValue: value,
        errorKey: "modelai.formKit.validation.invalidValue"
      };
  }
}

export function validateFormKitState(
  schema: FormKitSchema,
  state: FormKitState
): FormKitValidationState {
  const invalidFields: Record<string, boolean> = {};
  const fieldErrors: Record<string, string> = {};

  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.kind === "swapPair") {
        for (const item of field.items) {
          if (
            state.hiddenFields?.[item.key] ||
            state.disabledFields?.[item.key]
          ) {
            continue;
          }
          const result = normalizeFormKitFieldValue(
            item,
            state.values[item.key]
          );
          if (!result.valid) {
            invalidFields[item.key] = true;
            fieldErrors[item.key] =
              result.errorKey ?? "modelai.formKit.validation.invalidValue";
          }
        }
        continue;
      }

      if (
        state.hiddenFields?.[field.key] ||
        state.disabledFields?.[field.key]
      ) {
        continue;
      }
      const result = normalizeFormKitFieldValue(field, state.values[field.key]);
      if (!result.valid) {
        invalidFields[field.key] = true;
        fieldErrors[field.key] =
          result.errorKey ?? "modelai.formKit.validation.invalidValue";
      }
    }
  }

  return {
    hasErrors: Object.keys(invalidFields).length > 0,
    invalidFields,
    fieldErrors
  };
}

function isActionGuardTriggered(
  guard: FormKitActionGuardSchema,
  state: FormKitState,
  evaluateGuard?: (
    guard: FormKitActionGuardSchema,
    state: FormKitState
  ) => boolean
) {
  return evaluateGuard?.(guard, state) ?? false;
}

export function emptyFormKitActionGuardValidationState(): FormKitActionGuardValidationState {
  return {
    hasWarnings: false,
    warningFields: {},
    fieldWarnings: {},
    formWarnings: [],
    activeGuardKeys: []
  };
}

export function validateFormKitActionGuards(
  schema: FormKitSchema,
  state: FormKitState,
  actionKey: string,
  evaluateGuard?: (
    guard: FormKitActionGuardSchema,
    state: FormKitState
  ) => boolean
): FormKitActionGuardValidationState {
  const warningFields: Record<string, boolean> = {};
  const fieldWarnings: Record<string, string> = {};
  const formWarnings: string[] = [];
  const activeGuardKeys: string[] = [];

  for (const guard of schema.actionGuards ?? []) {
    if (guard.actionKey !== actionKey) {
      continue;
    }

    if (!isActionGuardTriggered(guard, state, evaluateGuard)) {
      continue;
    }

    activeGuardKeys.push(guard.key);

    if (guard.fieldKey) {
      warningFields[guard.fieldKey] = true;
      fieldWarnings[guard.fieldKey] ??= guard.messageKey;
      continue;
    }

    formWarnings.push(guard.messageKey);
  }

  return {
    hasWarnings: activeGuardKeys.length > 0,
    warningFields,
    fieldWarnings,
    formWarnings,
    activeGuardKeys
  };
}
