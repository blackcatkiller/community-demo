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
import { buildSubGateFeatureGeometry } from "../shared/gateBodyBuilders";
import {
  normalizeSubGateParams,
  type SubGateParams,
  type SubGateTemplate
} from "./subGate";
import { serializable } from "../../serialize/serializer";

export class SubGateNode extends ShapeNode {
  private _plane: Plane;
  private _suspendRebuild = false;

  @property("modelai.subGate.templateLabel", { group: "modelai.subGate.group" })
  get template(): SubGateTemplate {
    return this.getPrivateValue("template" as any, "D3") as SubGateTemplate;
  }
  set template(value: SubGateTemplate) {
    this.applyPropertyValue("template", value);
  }

  @property("modelai.subGate.diameter", {
    group: "modelai.subGate.group"
  })
  get gateDiameter(): number {
    return this.getPrivateValue("gateDiameter" as any, 0.6) as number;
  }
  set gateDiameter(value: number) {
    this.applyPropertyValue("gateDiameter", value);
  }

  @property("modelai.subGate.spreadingAngle", {
    group: "modelai.subGate.group"
  })
  get gateSpreadingAngle(): number {
    return this.getPrivateValue("gateSpreadingAngle" as any, 24) as number;
  }
  set gateSpreadingAngle(value: number) {
    this.applyPropertyValue("gateSpreadingAngle", value);
  }

  @property("modelai.subGate.dipDepth", {
    group: "modelai.subGate.group"
  })
  get gateDipDepth(): number {
    return this.getPrivateValue("gateDipDepth" as any, 7) as number;
  }
  set gateDipDepth(value: number) {
    this.applyPropertyValue("gateDipDepth", value);
  }

  @property("modelai.subGate.angle", {
    group: "modelai.subGate.group"
  })
  get gateAngle(): number {
    return this.getPrivateValue("gateAngle" as any, 45) as number;
  }
  set gateAngle(value: number) {
    this.applyPropertyValue("gateAngle", value);
  }

  get plane(): Plane {
    return this._plane;
  }

  constructor(
    name: string,
    plane: Plane,
    params: SubGateParams,
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

  exportParams(): SubGateParams {
    return {
      template: this.template,
      gateDiameter: this.gateDiameter,
      gateSpreadingAngle: this.gateSpreadingAngle,
      gateDipDepth: this.gateDipDepth,
      gateAngle: this.gateAngle
    };
  }

  applyParams(
    params: SubGateParams,
    options?: { recordHistory?: boolean; rebuild?: boolean }
  ): void {
    const recordHistory = options?.recordHistory ?? true;
    const rebuild = options?.rebuild ?? true;
    const normalized = normalizeSubGateParams(params);

    this._suspendRebuild = true;
    try {
      this.applyPropertyValue("template", normalized.template, recordHistory);
      this.applyPropertyValue(
        "gateDiameter",
        normalized.gateDiameter,
        recordHistory
      );
      this.applyPropertyValue(
        "gateSpreadingAngle",
        normalized.gateSpreadingAngle,
        recordHistory
      );
      this.applyPropertyValue(
        "gateDipDepth",
        normalized.gateDipDepth,
        recordHistory
      );
      this.applyPropertyValue("gateAngle", normalized.gateAngle, recordHistory);
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

  private applyPropertyValue<K extends keyof SubGateParams>(
    property: K,
    value: SubGateParams[K],
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
      buildSubGateFeatureGeometry(this._plane, {
        gateDiameter: this.gateDiameter,
        gateSpreadingAngle: this.gateSpreadingAngle,
        gateDipDepth: this.gateDipDepth,
        gateAngle: this.gateAngle
      })
    );
  }
}

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

const serializableClass: any = serializable;

serializableClass({
  serialize: (target: SubGateNode) => ({
    id: target.id,
    name: target.name,
    visible: target.visible,
    plane: serializePlane(target.plane),
    params: target.exportParams(),
    transform: target.transform.toArray(),
    ...serializeShapeReference(target)
  }),
  deserialize: (data: Record<string, unknown>) => {
    const node = new SubGateNode(
      String(data.name ?? "SubGate"),
      deserializePlane(data.plane as SerializedPlane | undefined),
      (data.params as SubGateParams | undefined) ?? {
        template: "D3",
        gateDiameter: 0.6,
        gateSpreadingAngle: 24,
        gateDipDepth: 7,
        gateAngle: 45
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
})(SubGateNode);
