// @ts-nocheck
import {
  Observable,
  PubSub,
  Transaction,
  type AsyncController
} from "@modelai/core";
import type { IDocument } from "@modelai/core/types";
import { createGateFormKitRegistration } from "./formKit";
import type { GateFormSection } from "./formKit";
import {
  DocumentPushPlatePlaneHistoryRecord,
  setDocumentPushPlatePlane
} from "./globalPushPlatePlane";

export type PushPlatePlaneParams = {
  pushPlatePlaneZ: number;
};

function normalizePushPlatePlaneParams(
  next: PushPlatePlaneParams
): PushPlatePlaneParams {
  const z = Number(next.pushPlatePlaneZ);
  return {
    pushPlatePlaneZ: Number.isFinite(z) ? z : 0
  };
}

function buildPushPlatePlaneFormSections(): GateFormSection[] {
  return [
    {
      key: "pushPlatePlane",
      fields: [
        {
          key: "pushPlatePlaneZ",
          prop: "pushPlatePlaneZ",
          labelKey: "modelai.pushPlatePlane.height",
          kind: "number",
          step: 0.5,
          controls: true
        }
      ]
    }
  ];
}

export class PushPlatePlaneEditSession extends Observable {
  private readonly beforePushPlatePlaneZ: number;
  private params: PushPlatePlaneParams;
  private readonly handlePushPlatePlaneChanged = (
    document: IDocument,
    z: number
  ) => {
    if (document !== this.document || this.params.pushPlatePlaneZ === z) return;
    this.params = {
      pushPlatePlaneZ: z
    };
    this.emitPropertyChanged("params", undefined);
  };

  constructor(private readonly document: IDocument) {
    super();
    this.beforePushPlatePlaneZ = Number(document.pushPlatePlane.z);
    this.params = {
      pushPlatePlaneZ: this.beforePushPlatePlaneZ
    };
    PubSub.default.sub(
      "pushPlatePlaneChanged",
      this.handlePushPlatePlaneChanged
    );
  }

  getParams(): PushPlatePlaneParams {
    return {
      ...this.params
    };
  }

  setParams(next: PushPlatePlaneParams): void {
    const normalized = normalizePushPlatePlaneParams(next);
    if (this.params.pushPlatePlaneZ === normalized.pushPlatePlaneZ) return;
    this.params = normalized;
    setDocumentPushPlatePlane(this.document, normalized.pushPlatePlaneZ, {
      syncRunners: true,
      refreshVisual: false
    });
    this.emitPropertyChanged("params", undefined);
  }

  createFormKitRegistration(controller: AsyncController) {
    return createGateFormKitRegistration({
      formKitId: "pushPlatePlane",
      titleKey: "modelai.pushPlatePlane.group",
      sections: buildPushPlatePlaneFormSections(),
      controller,
      owner: this,
      getValue: prop => this.getParams()[prop as keyof PushPlatePlaneParams],
      setValue: (prop, value) => {
        this.setParams({
          ...this.getParams(),
          [prop]: value
        } as PushPlatePlaneParams);
      }
    });
  }

  attachGizmo(_controller: AsyncController): void {}

  confirm(): void {
    const afterZ = this.getParams().pushPlatePlaneZ;
    if (this.beforePushPlatePlaneZ === afterZ) return;
    Transaction.execute(this.document, "edit push plate plane", () => {
      Transaction.add(
        this.document,
        new DocumentPushPlatePlaneHistoryRecord(
          this.document,
          this.beforePushPlatePlaneZ,
          afterZ
        )
      );
    });
  }

  cancel(): void {
    this.params = {
      pushPlatePlaneZ: this.beforePushPlatePlaneZ
    };
    setDocumentPushPlatePlane(this.document, this.beforePushPlatePlaneZ, {
      syncRunners: true,
      refreshVisual: false
    });
    this.emitPropertyChanged("params", undefined);
  }

  protected override disposeInternal(): void {
    PubSub.default.remove(
      "pushPlatePlaneChanged",
      this.handlePushPlatePlaneChanged
    );
    super.disposeInternal();
  }
}
