// @ts-nocheck
import { Matrix4, Plane, XYZ, type XYZLike } from "@modelai/core/math";
import { property } from "@modelai/core/property";
import {
  resolveShapeNodeConstructOptions,
  restorePendingShapeReference,
  serializeShapeReference,
  ShapeNode,
  type ShapeNodeConstructOptions
} from "@/features/modelai/model/shapeNode";
import { buildLargeGateFeatureGeometry } from "../shared/gateBodyBuilders";
import { serializable } from "../../serialize/serializer";
import {
  normalizeLargeGateParams,
  type LargeGateParams,
  type LargeGateTemplate
} from "./largeGate";

type SerializedPlane = {
  origin: XYZLike;
  normal: XYZLike;
  xvec: XYZLike;
};

function serializePlane(plane: Plane): SerializedPlane {
  return {
    origin: { x: plane.origin.x, y: plane.origin.y, z: plane.origin.z },
    normal: { x: plane.normal.x, y: plane.normal.y, z: plane.normal.z },
    xvec: { x: plane.xvec.x, y: plane.xvec.y, z: plane.xvec.z }
  };
}

function deserializePlane(data: SerializedPlane | undefined): Plane {
  if (!data) return Plane.XY();
  return new Plane(
    new XYZ(data.origin.x, data.origin.y, data.origin.z),
    new XYZ(data.normal.x, data.normal.y, data.normal.z),
    new XYZ(data.xvec.x, data.xvec.y, data.xvec.z)
  );
}

export class LargeGateNode extends ShapeNode {
  private _plane: Plane;
  private _suspendRebuild = false;

  @property("modelai.largeGate.templateLabel", {
    group: "modelai.largeGate.group"
  })
  get template(): LargeGateTemplate {
    return this.getPrivateValue("template" as any, "D3") as LargeGateTemplate;
  }
  set template(value: LargeGateTemplate) {
    this.applyPropertyValue("template", value);
  }

  @property("modelai.largeGate.diameter", {
    group: "modelai.largeGate.group"
  })
  get gateDiameter(): number {
    return this.getPrivateValue("gateDiameter" as any, 0.6) as number;
  }
  set gateDiameter(value: number) {
    this.applyPropertyValue("gateDiameter", value);
  }

  @property("modelai.largeGate.spreadingAngle", {
    group: "modelai.largeGate.group"
  })
  get gateSpreadingAngle(): number {
    return this.getPrivateValue("gateSpreadingAngle" as any, 24) as number;
  }
  set gateSpreadingAngle(value: number) {
    this.applyPropertyValue("gateSpreadingAngle", value);
  }

  @property("modelai.largeGate.dipDepth", {
    group: "modelai.largeGate.group"
  })
  get gateDipDepth(): number {
    return this.getPrivateValue("gateDipDepth" as any, 7) as number;
  }
  set gateDipDepth(value: number) {
    this.applyPropertyValue("gateDipDepth", value);
  }

  get plane(): Plane {
    return this._plane;
  }

  constructor(
    name: string,
    plane: Plane,
    params: LargeGateParams,
    options?: string | ShapeNodeConstructOptions
  ) {
    const resolvedOptions = resolveShapeNodeConstructOptions(options);
    super(name, resolvedOptions.id);
    this._plane = plane;
    this.applyParams(params, {
      recordHistory: false,
      rebuild: resolvedOptions.rebuild ?? true
    });
  }

  exportParams(): LargeGateParams {
    return {
      template: this.template,
      gateDiameter: this.gateDiameter,
      gateSpreadingAngle: this.gateSpreadingAngle,
      gateDipDepth: this.gateDipDepth
    };
  }

  applyParams(
    params: LargeGateParams,
    options?: { recordHistory?: boolean; rebuild?: boolean }
  ): void {
    const recordHistory = options?.recordHistory ?? true;
    const rebuild = options?.rebuild ?? true;
    const next = normalizeLargeGateParams(params);

    this._suspendRebuild = true;
    try {
      this.applyPropertyValue("template", next.template, recordHistory);
      this.applyPropertyValue("gateDiameter", next.gateDiameter, recordHistory);
      this.applyPropertyValue(
        "gateSpreadingAngle",
        next.gateSpreadingAngle,
        recordHistory
      );
      this.applyPropertyValue("gateDipDepth", next.gateDipDepth, recordHistory);
    } finally {
      this._suspendRebuild = false;
    }

    if (rebuild) {
      this.rebuildShape();
    }
  }

  applyPlacement(
    plane: Plane,
    options?: { recordHistory?: boolean; rebuild?: boolean }
  ): void {
    void options?.recordHistory;
    this._plane = plane;
    if (options?.rebuild ?? true) {
      this.rebuildShape();
    }
  }

  private applyPropertyValue<K extends keyof LargeGateParams>(
    property: K,
    value: LargeGateParams[K],
    recordHistory = true
  ): void {
    this.setProperty(
      property as string,
      value,
      () => {
        if (!this._suspendRebuild) {
          this.rebuildShape();
        }
      },
      undefined,
      recordHistory
    );
  }

  private rebuildShape() {
    this.setFeatureGeometry(
      buildLargeGateFeatureGeometry(this._plane, {
        gateDiameter: this.gateDiameter,
        gateSpreadingAngle: this.gateSpreadingAngle,
        gateDipDepth: this.gateDipDepth
      })
    );
  }
}

const serializableClass: any = serializable;

serializableClass({
  serialize: (target: LargeGateNode) => ({
    id: target.id,
    name: target.name,
    visible: target.visible,
    plane: serializePlane(target.plane),
    params: target.exportParams(),
    transform: target.transform.toArray(),
    ...serializeShapeReference(target)
  }),
  deserialize: (data: Record<string, unknown>) => {
    const node = new LargeGateNode(
      String(data.name ?? "LargeGate"),
      deserializePlane(data.plane as SerializedPlane | undefined),
      (data.params as LargeGateParams | undefined) ?? {
        template: "D3",
        gateDiameter: 0.6,
        gateSpreadingAngle: 24,
        gateDipDepth: 7
      },
      {
        id: typeof data.id === "string" ? data.id : undefined,
        rebuild: data.shapeMode !== "reference"
      }
    );
    node.visible = Boolean(data.visible);
    const transformArray = data.transform as number[] | undefined;
    if (Array.isArray(transformArray) && transformArray.length === 16) {
      node.transform = Matrix4.fromArray(transformArray);
    }
    restorePendingShapeReference(node, data);
    return node;
  }
})(LargeGateNode);
