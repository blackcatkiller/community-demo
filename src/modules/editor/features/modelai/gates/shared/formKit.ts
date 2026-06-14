// @ts-nocheck
import type { AsyncController } from "@modelai/core";
import { createFormKitRegistration } from "@modelai/ui/formKit/runtime";
import type {
  FormKitOption,
  FormKitValueFieldKind
} from "@modelai/ui/formKit/types";

export type GateFormField = {
  key: string;
  prop: string;
  labelKey: string;
  kind: FormKitValueFieldKind;
  min?: number;
  max?: number;
  step?: number;
  controls?: boolean;
  options?: FormKitOption[];
  disabled?: boolean;
  hidden?: boolean | ((getValue: (prop: string) => unknown) => boolean);
  onChange?: (value: unknown) => void;
};

export type GateFormSection = {
  key: string;
  titleKey?: string;
  fields: GateFormField[];
};

type PropertyChangeOwner = {
  onPropertyChanged?: (handler: (...args: any[]) => void) => void;
  removePropertyChanged?: (handler: (...args: any[]) => void) => void;
};

export function createGateFormKitRegistration(options: {
  formKitId: string;
  titleKey: string;
  sections: GateFormSection[];
  controller: AsyncController;
  owner: PropertyChangeOwner;
  getValue: (prop: string) => unknown;
  setValue: (prop: string, value: unknown) => void;
}) {
  const {
    formKitId,
    titleKey,
    sections,
    controller,
    owner,
    getValue,
    setValue
  } = options;

  return createFormKitRegistration({
    schema: {
      id: `${formKitId}-form-kit`,
      titleKey,
      sections: sections.map(section => ({
        key: section.key,
        titleKey: section.titleKey,
        fields: section.fields.map(field => ({
          key: field.key,
          labelKey: field.labelKey,
          kind: field.kind,
          min: field.min,
          max: field.max,
          step: field.step,
          controls: field.controls,
          options: field.options
        }))
      })),
      actions: [
        {
          key: "cancel",
          labelKey: "buttons.pureClose",
          buttonType: "text"
        },
        {
          key: "confirm",
          labelKey: "buttons.pureConfirm",
          buttonType: "primary"
        }
      ],
      layout: {
        inlineNumber: true,
        numberFieldWidth: 148,
        actionsAlign: "end",
        maxBodyHeight: 420
      }
    },
    getState: () => ({
      visible: true,
      values: Object.fromEntries(
        sections.flatMap(section =>
          section.fields.map(field => [field.key, getValue(field.prop)])
        )
      ),
      disabledFields: Object.fromEntries(
        sections.flatMap(section =>
          section.fields.map(field => [field.key, Boolean(field.disabled)])
        )
      ),
      hiddenFields: Object.fromEntries(
        sections.flatMap(section =>
          section.fields.map(field => [
            field.key,
            typeof field.hidden === "function"
              ? Boolean(field.hidden(getValue))
              : Boolean(field.hidden)
          ])
        )
      )
    }),
    handlers: {
      onChange: (fieldKey, value) => {
        const field = sections
          .flatMap(section => section.fields)
          .find(item => item.key === fieldKey);
        if (!field || field.disabled) return;
        if (field.onChange) {
          field.onChange(value);
          return;
        }
        setValue(field.prop, value);
      },
      onAction: actionKey => {
        if (actionKey === "confirm") {
          controller.success();
          return;
        }
        if (actionKey === "cancel") {
          controller.cancel();
        }
      }
    },
    subscribeState: emit => {
      const handlePropertyChanged = () => emit();
      owner.onPropertyChanged?.(handlePropertyChanged);
      return () => owner.removePropertyChanged?.(handlePropertyChanged);
    }
  });
}
