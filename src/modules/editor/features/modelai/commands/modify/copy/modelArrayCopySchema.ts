// @ts-nocheck
import { Observable } from "@modelai/core";
import type { AsyncController } from "@modelai/core";
import { createFormKitRegistration } from "@modelai/ui/formKit/runtime";

export type ModelArrayMode = "linear" | "rotation" | "corner";
export type ModelArrayCopyMode = "real" | "reference";
export type RotationArrayCount = "2" | "4" | "8" | "16" | "32" | "64";
export type CornerArrayCount = "4" | "16" | "64";
export type LinearArrayTemplate =
  | "1x2"
  | "1x4"
  | "1x8"
  | "2x2"
  | "2x4"
  | "2x8"
  | "4x4"
  | "4x8";
export type RotationArrayStartDirection = "x" | "y";

export type ModelArrayCopyParams = {
  copyMode: ModelArrayCopyMode;
  mode: ModelArrayMode;
  rotationCount: RotationArrayCount;
  cornerCount: CornerArrayCount;
  linearTemplate?: LinearArrayTemplate;
  rotationSpacing: number;
  rotationStartDirection: RotationArrayStartDirection;
  linearCountX: number;
  linearCountY: number;
  linearSpacingX: number;
  linearSpacingY: number;
};

export type ModelArrayCopyFormPreset = Partial<
  Pick<ModelArrayCopyParams, "copyMode" | "mode">
>;

const ROTATION_COUNT_OPTIONS: RotationArrayCount[] = [
  "2",
  "4",
  "8",
  "16",
  "32",
  "64"
];
const CORNER_COUNT_OPTIONS: CornerArrayCount[] = ["4", "16", "64"];
const COPY_MODE_OPTIONS: ModelArrayCopyMode[] = ["real", "reference"];
const ROTATION_SPACING_PRESET_OPTIONS = ["10", "50", "100"] as const;
const LINEAR_TEMPLATE_OPTIONS: LinearArrayTemplate[] = [
  "1x2",
  "1x4",
  "1x8",
  "2x2",
  "2x4",
  "2x8",
  "4x4",
  "4x8"
];

const LINEAR_TEMPLATE_VALUE_MAP: Record<
  LinearArrayTemplate,
  {
    linearCountX: number;
    linearCountY: number;
  }
> = {
  "1x2": {
    linearCountX: 1,
    linearCountY: 2
  },
  "1x4": {
    linearCountX: 1,
    linearCountY: 4
  },
  "1x8": {
    linearCountX: 1,
    linearCountY: 8
  },
  "2x2": {
    linearCountX: 2,
    linearCountY: 2
  },
  "2x4": {
    linearCountX: 2,
    linearCountY: 4
  },
  "2x8": {
    linearCountX: 2,
    linearCountY: 8
  },
  "4x4": {
    linearCountX: 4,
    linearCountY: 4
  },
  "4x8": {
    linearCountX: 4,
    linearCountY: 8
  }
};

const DEFAULT_MODEL_ARRAY_COPY_PARAMS: ModelArrayCopyParams = {
  copyMode: "real",
  mode: "linear",
  rotationCount: "4",
  cornerCount: "4",
  rotationSpacing: 10,
  rotationStartDirection: "x",
  linearCountX: 2,
  linearCountY: 1,
  linearSpacingX: 10,
  linearSpacingY: 10
};

let rememberedModelArrayCopyParams: ModelArrayCopyParams = {
  ...DEFAULT_MODEL_ARRAY_COPY_PARAMS
};

function isModelArrayMode(value: unknown): value is ModelArrayMode {
  return value === "rotation" || value === "linear" || value === "corner";
}

function isModelArrayCopyMode(value: unknown): value is ModelArrayCopyMode {
  return (
    typeof value === "string" &&
    COPY_MODE_OPTIONS.includes(value as ModelArrayCopyMode)
  );
}

function isRotationArrayCount(value: unknown): value is RotationArrayCount {
  return (
    typeof value === "string" &&
    ROTATION_COUNT_OPTIONS.includes(value as RotationArrayCount)
  );
}

function isCornerArrayCount(value: unknown): value is CornerArrayCount {
  return (
    typeof value === "string" &&
    CORNER_COUNT_OPTIONS.includes(value as CornerArrayCount)
  );
}

function isLinearArrayTemplate(value: unknown): value is LinearArrayTemplate {
  return (
    typeof value === "string" &&
    LINEAR_TEMPLATE_OPTIONS.includes(value as LinearArrayTemplate)
  );
}

function isClearedLinearArrayTemplateValue(value: unknown) {
  return value === undefined || value === null || value === "";
}

function isRotationArrayStartDirection(
  value: unknown
): value is RotationArrayStartDirection {
  return value === "x" || value === "y";
}

function normalizePositiveNumber(value: unknown, fallback: number) {
  const next = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, next);
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const next = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(1, Math.round(next));
}

function getLinearArrayTemplateFromCounts(
  linearCountX: number,
  linearCountY: number
): LinearArrayTemplate | undefined {
  return LINEAR_TEMPLATE_OPTIONS.find(template => {
    const preset = LINEAR_TEMPLATE_VALUE_MAP[template];
    return (
      preset.linearCountX === linearCountX &&
      preset.linearCountY === linearCountY
    );
  });
}

export function normalizeModelArrayCopyParams(
  params: Partial<ModelArrayCopyParams> | undefined
): ModelArrayCopyParams {
  return {
    copyMode: isModelArrayCopyMode(params?.copyMode)
      ? params.copyMode
      : DEFAULT_MODEL_ARRAY_COPY_PARAMS.copyMode,
    mode: isModelArrayMode(params?.mode)
      ? params.mode
      : DEFAULT_MODEL_ARRAY_COPY_PARAMS.mode,
    rotationCount: isRotationArrayCount(params?.rotationCount)
      ? params.rotationCount
      : DEFAULT_MODEL_ARRAY_COPY_PARAMS.rotationCount,
    cornerCount: isCornerArrayCount(params?.cornerCount)
      ? params.cornerCount
      : DEFAULT_MODEL_ARRAY_COPY_PARAMS.cornerCount,
    linearTemplate: isLinearArrayTemplate(params?.linearTemplate)
      ? params.linearTemplate
      : undefined,
    rotationSpacing: normalizePositiveNumber(
      params?.rotationSpacing,
      DEFAULT_MODEL_ARRAY_COPY_PARAMS.rotationSpacing
    ),
    rotationStartDirection: isRotationArrayStartDirection(
      params?.rotationStartDirection
    )
      ? params.rotationStartDirection
      : DEFAULT_MODEL_ARRAY_COPY_PARAMS.rotationStartDirection,
    linearCountX: normalizePositiveInteger(
      params?.linearCountX,
      DEFAULT_MODEL_ARRAY_COPY_PARAMS.linearCountX
    ),
    linearCountY: normalizePositiveInteger(
      params?.linearCountY,
      DEFAULT_MODEL_ARRAY_COPY_PARAMS.linearCountY
    ),
    linearSpacingX: normalizePositiveNumber(
      params?.linearSpacingX,
      DEFAULT_MODEL_ARRAY_COPY_PARAMS.linearSpacingX
    ),
    linearSpacingY: normalizePositiveNumber(
      params?.linearSpacingY,
      DEFAULT_MODEL_ARRAY_COPY_PARAMS.linearSpacingY
    )
  };
}

export function getRememberedModelArrayCopyParams(): ModelArrayCopyParams {
  return { ...rememberedModelArrayCopyParams };
}

export function rememberModelArrayCopyParams(params: ModelArrayCopyParams) {
  rememberedModelArrayCopyParams = { ...params };
}

export class ModelArrayCopyFormSession extends Observable {
  private params: ModelArrayCopyParams;

  constructor(
    initial?: Partial<ModelArrayCopyParams>,
    private readonly preset: ModelArrayCopyFormPreset = {}
  ) {
    super();
    this.params = normalizeModelArrayCopyParams({
      ...initial,
      ...preset
    });
  }

  getParams(): ModelArrayCopyParams {
    return { ...this.params };
  }

  private getHiddenFields() {
    if (this.params.mode === "rotation") {
      return {
        cornerCount: true,
        linearTemplate: true,
        linearCountX: true,
        linearCountY: true,
        linearSpacingX: true,
        linearSpacingY: true
      };
    }

    if (this.params.mode === "corner") {
      return {
        rotationCount: true,
        rotationStartDirection: true,
        linearTemplate: true,
        linearCountX: true,
        linearCountY: true,
        linearSpacingX: true,
        linearSpacingY: true
      };
    }

    return {
      rotationCount: true,
      cornerCount: true,
      rotationSpacing: true,
      rotationStartDirection: true
    };
  }

  setField(fieldKey: string, value: unknown) {
    const previous = this.params;
    let next: ModelArrayCopyParams | undefined;

    switch (fieldKey) {
      case "copyMode":
        if (this.preset.copyMode !== undefined) return;
        if (!isModelArrayCopyMode(value)) return;
        next = {
          ...previous,
          copyMode: value
        };
        break;
      case "mode":
        if (this.preset.mode !== undefined) return;
        if (!isModelArrayMode(value)) return;
        next = {
          ...previous,
          mode: value
        };
        break;
      case "rotationCount":
        if (!isRotationArrayCount(value)) return;
        next = {
          ...previous,
          rotationCount: value
        };
        break;
      case "cornerCount":
        if (!isCornerArrayCount(value)) return;
        next = {
          ...previous,
          cornerCount: value
        };
        break;
      case "linearTemplate":
        if (isClearedLinearArrayTemplateValue(value)) {
          next = {
            ...previous,
            linearTemplate: undefined
          };
          break;
        }
        if (!isLinearArrayTemplate(value)) return;
        next = {
          ...previous,
          linearTemplate: value,
          ...LINEAR_TEMPLATE_VALUE_MAP[value]
        };
        break;
      case "rotationSpacing":
        next = {
          ...previous,
          rotationSpacing: normalizePositiveNumber(
            value,
            previous.rotationSpacing
          )
        };
        break;
      case "rotationStartDirection":
        if (!isRotationArrayStartDirection(value)) return;
        next = {
          ...previous,
          rotationStartDirection: value
        };
        break;
      case "linearCountX":
        next = {
          ...previous,
          linearCountX: normalizePositiveInteger(value, previous.linearCountX)
        };
        next.linearTemplate = getLinearArrayTemplateFromCounts(
          next.linearCountX,
          previous.linearCountY
        );
        break;
      case "linearCountY":
        next = {
          ...previous,
          linearCountY: normalizePositiveInteger(value, previous.linearCountY)
        };
        next.linearTemplate = getLinearArrayTemplateFromCounts(
          previous.linearCountX,
          next.linearCountY
        );
        break;
      case "linearSpacingX":
        next = {
          ...previous,
          linearSpacingX: normalizePositiveNumber(
            value,
            previous.linearSpacingX
          )
        };
        break;
      case "linearSpacingY":
        next = {
          ...previous,
          linearSpacingY: normalizePositiveNumber(
            value,
            previous.linearSpacingY
          )
        };
        break;
      default:
        return;
    }

    const normalized = normalizeModelArrayCopyParams(next);
    if (this.preset.copyMode !== undefined) {
      normalized.copyMode = this.preset.copyMode;
    }
    if (this.preset.mode !== undefined) {
      normalized.mode = this.preset.mode;
    }
    if (JSON.stringify(previous) === JSON.stringify(normalized)) {
      return;
    }
    this.params = normalized;
    this.emitPropertyChanged("params", previous);
  }

  createFormKitRegistration(controller: AsyncController) {
    return createFormKitRegistration({
      schema: {
        id: "modify-model-array-copy-form",
        titleKey: "modelai.modelArrayCopy.group",
        sections: [
          {
            key: "modelArrayCopy",
            fields: [
              ...(!this.preset.copyMode
                ? [
                    {
                      key: "copyMode",
                      labelKey: "modelai.modelArrayCopy.copyModeLabel",
                      kind: "radio" as const,
                      options: COPY_MODE_OPTIONS.map(option => ({
                        value: option,
                        labelKey: `modelai.modelArrayCopy.copyMode.${option}`
                      }))
                    }
                  ]
                : []),
              ...(!this.preset.mode
                ? [
                    {
                      key: "mode",
                      labelKey: "modelai.modelArrayCopy.modeLabel",
                      kind: "radio" as const,
                      options: [
                        {
                          value: "rotation",
                          labelKey: "modelai.modelArrayCopy.mode.rotation"
                        },
                        // {
                        //   value: "corner",
                        //   labelKey: "modelai.modelArrayCopy.mode.corner"
                        // },
                        {
                          value: "linear",
                          labelKey: "modelai.modelArrayCopy.mode.linear"
                        }
                      ]
                    }
                  ]
                : []),
              {
                key: "rotationCount",
                labelKey: "modelai.modelArrayCopy.rotationCount",
                kind: "select",
                options: ROTATION_COUNT_OPTIONS.map(option => ({
                  value: option,
                  label: option
                }))
              },
              {
                key: "cornerCount",
                labelKey: "modelai.modelArrayCopy.rotationCount",
                kind: "select",
                options: CORNER_COUNT_OPTIONS.map(option => ({
                  value: option,
                  label: option
                }))
              },
              {
                key: "rotationSpacing",
                labelKey: "modelai.modelArrayCopy.rotationSpacing",
                kind: "select",
                allowCustomValue: true,
                options: ROTATION_SPACING_PRESET_OPTIONS.map(option => ({
                  value: option,
                  label: option
                }))
              },
              {
                key: "rotationStartDirection",
                labelKey: "modelai.modelArrayCopy.rotationStartDirection",
                kind: "radio",
                options: [
                  {
                    value: "x",
                    labelKey:
                      "modelai.modelArrayCopy.rotationStartDirectionOptions.x"
                  },
                  {
                    value: "y",
                    labelKey:
                      "modelai.modelArrayCopy.rotationStartDirectionOptions.y"
                  }
                ]
              },
              {
                key: "linearTemplate",
                labelKey: "modelai.modelArrayCopy.linearTemplateLabel",
                kind: "select",
                clearable: true,
                options: LINEAR_TEMPLATE_OPTIONS.map(option => ({
                  value: option,
                  labelKey: `modelai.modelArrayCopy.linearTemplate.${option}`
                }))
              },
              {
                key: "linearCountPair",
                kind: "swapPair",
                items: [
                  {
                    key: "linearCountX",
                    labelKey: "modelai.modelArrayCopy.linearCountX",
                    kind: "number",
                    step: 1,
                    controls: true
                  },
                  {
                    key: "linearCountY",
                    labelKey: "modelai.modelArrayCopy.linearCountY",
                    kind: "number",
                    step: 1,
                    controls: true
                  }
                ]
              },
              {
                key: "linearSpacingPair",
                kind: "swapPair",
                items: [
                  {
                    key: "linearSpacingX",
                    labelKey: "modelai.modelArrayCopy.linearSpacingX",
                    kind: "select",
                    allowCustomValue: true,
                    options: ROTATION_SPACING_PRESET_OPTIONS.map(option => ({
                      value: option,
                      label: option
                    }))
                  },
                  {
                    key: "linearSpacingY",
                    labelKey: "modelai.modelArrayCopy.linearSpacingY",
                    kind: "select",
                    allowCustomValue: true,
                    options: ROTATION_SPACING_PRESET_OPTIONS.map(option => ({
                      value: option,
                      label: option
                    }))
                  }
                ]
              }
            ]
          }
        ],
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
        values: {
          copyMode: this.params.copyMode,
          mode: this.params.mode,
          rotationCount: this.params.rotationCount,
          cornerCount: this.params.cornerCount,
          linearTemplate: this.params.linearTemplate,
          rotationSpacing: this.params.rotationSpacing,
          rotationStartDirection: this.params.rotationStartDirection,
          linearCountX: this.params.linearCountX,
          linearCountY: this.params.linearCountY,
          linearSpacingX: this.params.linearSpacingX,
          linearSpacingY: this.params.linearSpacingY
        },
        hiddenFields: this.getHiddenFields()
      }),
      handlers: {
        onChange: (fieldKey, value) => {
          this.setField(fieldKey, value);
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
        this.onPropertyChanged(handlePropertyChanged);
        return () => this.removePropertyChanged(handlePropertyChanged);
      }
    });
  }
}
