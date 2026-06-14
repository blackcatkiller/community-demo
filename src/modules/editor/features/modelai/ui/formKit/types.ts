// @ts-nocheck
// FormKit core types stay scene-agnostic. They only describe what to render,
// what the current state is, and which events can be emitted.
export type FormKitFieldKind =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "radio"
  | "button"
  | "swapPair";

export type FormKitValueFieldKind = Exclude<FormKitFieldKind, "swapPair">;

export type FormKitOption = {
  value: string;
  labelKey?: string;
  label?: string;
  disabled?: boolean;
};

type FormKitFieldOptions = {
  key: string;
  labelKey: string;
  inline?: boolean;
  min?: number;
  max?: number;
  step?: number;
  controls?: boolean;
  options?: FormKitOption[];
  filterable?: boolean;
  allowCustomValue?: boolean;
  clearable?: boolean;
  hintKey?: string;
};

export type FormKitValueFieldSchema = FormKitFieldOptions & {
  kind: FormKitValueFieldKind;
};

export type FormKitSwapPairItemSchema = FormKitFieldOptions & {
  kind: "number" | "select";
};

export type FormKitSwapPairFieldSchema = {
  key: string;
  kind: "swapPair";
  labelKey?: string;
  hintKey?: string;
  items: [FormKitSwapPairItemSchema, FormKitSwapPairItemSchema];
};

export type FormKitFieldSchema =
  | FormKitValueFieldSchema
  | FormKitSwapPairFieldSchema;

export type FormKitActionGuardSchema = {
  key: string;
  actionKey: string;
  messageKey: string;
  fieldKey?: string;
};

export type FormKitSectionSchema = {
  key: string;
  titleKey?: string;
  fields: FormKitFieldSchema[];
};

export type FormKitActionSchema = {
  key: string;
  labelKey: string;
  buttonType?: "primary" | "default" | "text";
};

export type FormKitLayout = {
  inlineNumber?: boolean;
  numberFieldWidth?: number;
  actionsAlign?: "start" | "center" | "end";
  maxBodyHeight?: number;
};

export type FormKitSchema = {
  id: string;
  titleKey: string;
  sections: FormKitSectionSchema[];
  actions?: FormKitActionSchema[];
  actionGuards?: FormKitActionGuardSchema[];
  layout?: FormKitLayout;
};

export type FormKitState = {
  visible?: boolean;
  values: Record<string, unknown>;
  disabledFields?: Record<string, boolean>;
  hiddenFields?: Record<string, boolean>;
  disabledActions?: Record<string, boolean>;
  hiddenActions?: Record<string, boolean>;
};

export type FormKitHandlers = {
  onChange?: (fieldKey: string, value: unknown) => void;
  onAction?: (actionKey: string) => void;
  onFieldFocus?: (fieldKey: string) => void;
  onFieldBlur?: (fieldKey: string) => void;
  isActionGuardTriggered?: (
    guardKey: string,
    context: {
      actionKey: string;
      state: FormKitState;
    }
  ) => boolean;
};

export type FormKitFieldValidation = {
  valid: boolean;
  normalizedValue: unknown;
  errorKey?: string;
};

export type FormKitValidationState = {
  hasErrors: boolean;
  invalidFields: Record<string, boolean>;
  fieldErrors: Record<string, string>;
};

export type FormKitActionGuardValidationState = {
  hasWarnings: boolean;
  warningFields: Record<string, boolean>;
  fieldWarnings: Record<string, string>;
  formWarnings: string[];
  activeGuardKeys: string[];
};
