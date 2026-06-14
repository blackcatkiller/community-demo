// @ts-nocheck
import type { IView, ShapeMeshData } from "@modelai/core/types";
import { type EdgeMeshData, VisualConfig } from "@modelai/core/types";
import { Matrix4, Plane, PlaneAngle, Precision, XYZ } from "@modelai/core/math";
import { command } from "@modelai/command";
import {
  Dimension,
  type PointSnapData,
  type SnapLengthAtPlaneData
} from "@modelai/selection/snap";
import { PointStep, type IStep } from "@modelai/step";
import { transformI18n } from "@/plugins/i18n";
import { createFormKitRegistration } from "@modelai/ui/formKit/runtime";
import { mountFormKit } from "@modelai/ui/formKit/mount";
import { applyForegroundOverlay } from "@modelai/geometry/foregroundOverlay";
import type { ThreeView } from "@modelai/viewer/view";
import { RotateHelper } from "@modelai/viewer/rotateHelper";
import { TransformedCommand } from "./transformedCommand";

// Reserved imports from the earlier rotate snap UI path.
// Keeping them here as comments avoids eslint unused-import errors while
// preserving the original integration points for future reactivation.
// import { createDefaultSnapConfig } from "@modelai/selection/snapConfig";
// import {
//   AngleSnapEventHandler,
//   SnapLengthAtPlaneHandler
// } from "@modelai/selection/snap";
// import { createSnapCommandUI } from "@modelai/step";

const DEFAULT_CIRCLE_SEGMENTS = 64;
type RotatePlaneMode = "workplane" | "xy" | "yz" | "zx";

function ensurePlane(view: IView, plane: Plane): Plane {
  const direction = view.direction();
  if (Math.abs(direction.dot(plane.normal)) < 1e-6) {
    const left = direction.cross(view.up());
    return new Plane(plane.origin, direction, left);
  }
  return plane;
}

function createCircleEdgeMesh(
  center: XYZ,
  normal: XYZ,
  radius: number,
  axisX: XYZ,
  segments: number = DEFAULT_CIRCLE_SEGMENTS,
  color: number = VisualConfig.temporaryEdgeColor
): EdgeMeshData {
  const ax = axisX.x;
  const ay = axisX.y;
  const az = axisX.z;
  const axisLen = Math.sqrt(ax * ax + ay * ay + az * az);
  if (axisLen <= Precision.Distance) {
    return {
      position: new Float32Array(),
      lineType: "solid",
      color,
      range: []
    };
  }

  const x0 = ax / axisLen;
  const y0 = ay / axisLen;
  const z0 = az / axisLen;

  // normal cross xAxis
  let bx = normal.y * z0 - normal.z * y0;
  let by = normal.z * x0 - normal.x * z0;
  let bz = normal.x * y0 - normal.y * x0;
  const bLen = Math.sqrt(bx * bx + by * by + bz * bz);
  if (bLen <= Precision.Distance) {
    return {
      position: new Float32Array(),
      lineType: "solid",
      color,
      range: []
    };
  }
  bx /= bLen;
  by /= bLen;
  bz /= bLen;

  const cx = center.x;
  const cy = center.y;
  const cz = center.z;

  const pos: number[] = [];
  const step = (Math.PI * 2) / Math.max(3, segments);
  for (let i = 0; i < segments; i++) {
    const a0 = step * i;
    const a1 = step * (i + 1);

    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);

    const p0x = cx + radius * (x0 * c0 + bx * s0);
    const p0y = cy + radius * (y0 * c0 + by * s0);
    const p0z = cz + radius * (z0 * c0 + bz * s0);
    const p1x = cx + radius * (x0 * c1 + bx * s1);
    const p1y = cy + radius * (y0 * c1 + by * s1);
    const p1z = cz + radius * (z0 * c1 + bz * s1);

    pos.push(p0x, p0y, p0z, p1x, p1y, p1z);
  }

  return {
    position: new Float32Array(pos),
    lineType: "solid",
    color,
    range: []
  };
}

function createArcEdgeMesh(
  center: XYZ,
  normal: XYZ,
  start: XYZ,
  angle: number,
  segments: number = Math.max(
    8,
    Math.ceil((Math.abs(angle) / (Math.PI * 2)) * DEFAULT_CIRCLE_SEGMENTS)
  ),
  color: number = VisualConfig.temporaryEdgeColor
): EdgeMeshData {
  const vx = start.x - center.x;
  const vy = start.y - center.y;
  const vz = start.z - center.z;
  const radius = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (radius <= Precision.Distance) {
    return {
      position: new Float32Array(),
      lineType: "solid",
      color,
      range: []
    };
  }

  const invR = 1 / radius;
  const x0 = vx * invR;
  const y0 = vy * invR;
  const z0 = vz * invR;

  // normal cross xAxis
  let bx = normal.y * z0 - normal.z * y0;
  let by = normal.z * x0 - normal.x * z0;
  let bz = normal.x * y0 - normal.y * x0;
  const bLen = Math.sqrt(bx * bx + by * by + bz * bz);
  if (bLen <= Precision.Distance) {
    return {
      position: new Float32Array(),
      lineType: "solid",
      color,
      range: []
    };
  }
  bx /= bLen;
  by /= bLen;
  bz /= bLen;

  const cx = center.x;
  const cy = center.y;
  const cz = center.z;

  const pos: number[] = [];
  const step = angle / Math.max(1, segments);
  for (let i = 0; i < segments; i++) {
    const a0 = step * i;
    const a1 = step * (i + 1);

    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);

    const p0x = cx + radius * (x0 * c0 + bx * s0);
    const p0y = cy + radius * (y0 * c0 + by * s0);
    const p0z = cz + radius * (z0 * c0 + bz * s0);
    const p1x = cx + radius * (x0 * c1 + bx * s1);
    const p1y = cy + radius * (y0 * c1 + by * s1);
    const p1z = cz + radius * (z0 * c1 + bz * s1);

    pos.push(p0x, p0y, p0z, p1x, p1y, p1z);
  }

  return {
    position: new Float32Array(pos),
    lineType: "solid",
    color,
    range: []
  };
}

@command({
  key: "modify.rotate",
  icon: "icon-rotate"
})
export class Rotate extends TransformedCommand {
  private rotationPlaneMode: RotatePlaneMode = "xy";
  private rotationAngleDeg = 0;
  private axisGuideObjectId?: number;
  private axisGuideHelper?: RotateHelper;
  private setupPreviewObjectId?: number;
  private detachAxisGuideOverlay?: () => void;
  private axisGuideCleanupRegistered = false;

  private showRotateSetupPrompt(message: string | null) {
    const app = this.document.application as any;
    app?.onSnapPrompt?.(message);
  }

  private resolveRotationPlane(
    mode: RotatePlaneMode,
    view: IView,
    origin: XYZ
  ) {
    let plane: Plane;
    switch (mode) {
      case "xy":
        plane = Plane.XY().translateTo(origin);
        break;
      case "yz":
        plane = new Plane(origin, new XYZ(1, 0, 0), new XYZ(0, 1, 0));
        break;
      case "zx":
        plane = new Plane(origin, new XYZ(0, 1, 0), new XYZ(0, 0, 1));
        break;
      case "workplane":
      default:
        plane = this.findPlane(view, origin);
        break;
    }
    return ensurePlane(view, plane);
  }

  private getRotationPlane(view: IView, origin: XYZ) {
    return this.resolveRotationPlane(this.rotationPlaneMode, view, origin);
  }

  private getRotationAngleRad() {
    return (this.rotationAngleDeg * Math.PI) / 180;
  }

  private getAnglePreviewResult(view: IView, angleDeg: number) {
    const center = this.stepDatas[0].point!;
    const p1 = this.stepDatas[2].point!;
    const plane =
      this.stepDatas[2].plane ??
      this.getRotationPlane(this.stepDatas[0].view, center);
    const vec = p1.sub(center).rotate(plane.normal, (angleDeg * Math.PI) / 180);
    const point = center.add(vec ?? p1.sub(center));
    return {
      view,
      point,
      plane,
      shapes: []
    };
  }

  protected override onRestarting(): void {
    super.onRestarting();
    this.clearAxisGuide();
    this.clearRotateSetupPreview();
  }

  private getAxisGuideSize(
    _center: XYZ,
    _plane: Plane,
    _mode: RotatePlaneMode
  ) {
    return Math.max(this.getPreviewExtent() * 0.12, 12);
  }

  private getPreviewExtent() {
    if (this.positions.length < 6) return 100;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < this.positions.length; i += 3) {
      const x = this.positions[i];
      const y = this.positions[i + 1];
      const z = this.positions[i + 2];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    return Math.max(
      new XYZ(maxX - minX, maxY - minY, maxZ - minZ).length(),
      100
    );
  }

  private syncAxisGuide(mode: RotatePlaneMode) {
    const center = this.stepDatas[0]?.point;
    const view = this.stepDatas[0]?.view;
    if (!center || !view) return;

    const plane = this.resolveRotationPlane(mode, view, center);
    const helperSize = this.getAxisGuideSize(center, plane, mode);
    if (!this.axisGuideHelper) {
      this.axisGuideHelper = new RotateHelper();
      const view = this.stepDatas[0]?.view as ThreeView | undefined;
      if (view) {
        this.detachAxisGuideOverlay = applyForegroundOverlay(
          view,
          this.axisGuideHelper.object
        );
        this.axisGuideHelper.object.userData.detachOcclusionOverlay =
          this.detachAxisGuideOverlay;
      }
      this.axisGuideObjectId = this.document.visual.context.displayObject(
        this.axisGuideHelper.object
      );
    }
    this.axisGuideHelper.setPose(center, plane, mode, helperSize);
    this.document.visual.update();
  }

  private clearAxisGuide() {
    this.detachAxisGuideOverlay?.();
    this.detachAxisGuideOverlay = undefined;
    this.axisGuideHelper?.dispose();
    this.axisGuideHelper = undefined;
    if (this.axisGuideObjectId !== undefined) {
      this.document.visual.context.removeMesh(this.axisGuideObjectId);
      this.axisGuideObjectId = undefined;
    }
    this.document.visual.update();
  }

  private getSetupPreviewRadius() {
    return Math.max(this.getPreviewExtent() * 0.18, 24);
  }

  private getTransformPreviewByAngle(
    center: XYZ,
    normal: XYZ,
    angleDeg: number
  ): EdgeMeshData {
    const positions = Matrix4.fromAxisRad(
      center,
      normal,
      (angleDeg * Math.PI) / 180
    ).ofPoints(this.positions);
    return {
      position: new Float32Array(positions),
      lineType: "solid",
      color: VisualConfig.temporaryEdgeColor,
      range: []
    };
  }

  private getRotateSetupEndpoints(
    view: IView,
    center: XYZ,
    mode: RotatePlaneMode,
    angleDeg: number
  ) {
    const plane = this.resolveRotationPlane(mode, view, center);
    const radius = this.getSetupPreviewRadius();
    const baseVector = plane.xvec.normalize().multiply(radius);
    const start = center.add(baseVector);
    const angleRad = (angleDeg * Math.PI) / 180;
    const endVector = baseVector.rotate(plane.normal, angleRad) ?? baseVector;
    const end = center.add(endVector);
    return { plane, angleRad, start, end };
  }

  private getRotateSetupAnglePrompt(center: XYZ, plane: Plane, end: XYZ) {
    const planeAngle = new PlaneAngle(
      new Plane(center, plane.normal, plane.xvec.normalize())
    );
    planeAngle.movePoint(end);
    return `${planeAngle.angle.toFixed(2)} deg`;
  }

  private getRotateSetupPreview(
    view: IView,
    center: XYZ,
    mode: RotatePlaneMode,
    angleDeg: number
  ): ShapeMeshData[] {
    const { plane, angleRad, start, end } = this.getRotateSetupEndpoints(
      view,
      center,
      mode,
      angleDeg
    );

    const shapes: ShapeMeshData[] = [
      this.getTransformPreviewByAngle(center, plane.normal, angleDeg),
      this.meshPoint(center),
      this.meshPoint(start),
      this.meshPoint(end),
      this.meshLine(center, start, VisualConfig.temporaryEdgeColor),
      this.meshLine(center, end, VisualConfig.temporaryEdgeColor)
    ];

    if (Math.abs(angleRad) > Precision.Angle) {
      shapes.push(
        createArcEdgeMesh(
          center,
          plane.normal,
          start,
          angleRad,
          undefined,
          VisualConfig.temporaryEdgeColor
        )
      );
    }

    return shapes;
  }

  private syncRotateSetupPreview(
    view: IView,
    center: XYZ,
    mode: RotatePlaneMode,
    angleDeg: number
  ) {
    const { plane, end } = this.getRotateSetupEndpoints(
      view,
      center,
      mode,
      angleDeg
    );
    this.clearRotateSetupPreview(false);
    this.setupPreviewObjectId = this.document.visual.context.displayMesh(
      this.getRotateSetupPreview(view, center, mode, angleDeg)
    );
    this.showRotateSetupPrompt(
      this.getRotateSetupAnglePrompt(center, plane, end)
    );
    this.document.visual.update();
  }

  private clearRotateSetupPreview(shouldUpdate: boolean = true) {
    this.showRotateSetupPrompt(null);
    if (this.setupPreviewObjectId === undefined) return;
    this.document.visual.context.removeMesh(this.setupPreviewObjectId);
    this.setupPreviewObjectId = undefined;
    if (shouldUpdate) {
      this.document.visual.update();
    }
  }

  private createRotateSetupStep(): IStep {
    return {
      execute: async (_document, controller) => {
        if (!this.axisGuideCleanupRegistered) {
          this.disposeStack.add({
            dispose: () => {
              this.clearAxisGuide();
              this.clearRotateSetupPreview();
            }
          });
          this.axisGuideCleanupRegistered = true;
        }

        const center = this.stepDatas[0].point!;
        const view = this.stepDatas[0].view;
        let planeMode = this.rotationPlaneMode;
        let angleDeg = this.rotationAngleDeg;

        this.syncAxisGuide(planeMode);
        this.syncRotateSetupPreview(view, center, planeMode, angleDeg);

        const listeners = new Set<() => void>();
        const emitState = () => {
          listeners.forEach(listener => listener());
        };

        const registration = createFormKitRegistration({
          schema: {
            id: "modify-rotate-plane-form",
            titleKey: "modelai.rotate.group",
            sections: [
              {
                key: "plane",
                fields: [
                  {
                    key: "planeMode",
                    labelKey: "modelai.rotate.planeMode",
                    kind: "radio",
                    options: [
                      {
                        value: "xy",
                        labelKey: "modelai.rotate.planeModeOptions.xy"
                      },
                      {
                        value: "yz",
                        labelKey: "modelai.rotate.planeModeOptions.yz"
                      },
                      {
                        value: "zx",
                        labelKey: "modelai.rotate.planeModeOptions.zx"
                      },
                      {
                        value: "workplane",
                        labelKey: "modelai.rotate.planeModeOptions.workplane",
                        disabled: true
                      }
                    ]
                  },
                  {
                    key: "angleDeg",
                    labelKey: "modelai.rotate.angle",
                    kind: "number",
                    step: 0.1
                  }
                ]
              }
            ],
            actions: [
              {
                key: "confirm",
                labelKey: "buttons.pureConfirm",
                buttonType: "primary"
              },
              {
                key: "cancel",
                labelKey: "buttons.pureClose",
                buttonType: "text"
              }
            ],
            layout: {
              inlineNumber: true,
              numberFieldWidth: 148,
              actionsAlign: "end",
              maxBodyHeight: 260
            }
          },
          getState: () => ({
            visible: true,
            values: {
              planeMode,
              angleDeg
            }
          }),
          handlers: {
            onChange: (fieldKey, value) => {
              if (fieldKey === "planeMode") {
                if (
                  value !== "xy" &&
                  value !== "yz" &&
                  value !== "zx" &&
                  value !== "workplane"
                ) {
                  return;
                }
                planeMode = value;
                this.syncAxisGuide(planeMode);
                this.syncRotateSetupPreview(view, center, planeMode, angleDeg);
                emitState();
                return;
              }

              if (fieldKey !== "angleDeg") return;
              if (value === "" || value === null || value === undefined) {
                this.clearRotateSetupPreview();
                emitState();
                return;
              }
              const next = typeof value === "number" ? value : Number(value);
              if (!Number.isFinite(next)) return;
              angleDeg = next;
              this.syncRotateSetupPreview(view, center, planeMode, angleDeg);
              emitState();
            },
            onAction: actionKey => {
              if (actionKey === "confirm") {
                this.rotationPlaneMode = planeMode;
                this.rotationAngleDeg = angleDeg;
                this.clearRotateSetupPreview();
                controller.success();
                return;
              }
              if (actionKey === "cancel") {
                this.clearRotateSetupPreview();
                controller.cancel();
              }
            }
          },
          subscribeState: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          }
        });
        const unmount = mountFormKit(registration);

        try {
          return await new Promise(resolve => {
            controller.onCompleted(() => {
              if (controller.result?.status !== "success") {
                resolve(undefined);
                return;
              }
              this.clearRotateSetupPreview();
              resolve({
                view,
                point: center,
                plane: this.getRotationPlane(view, center),
                shapes: []
              });
            });
            controller.onCancelled(() => {
              this.clearAxisGuide();
              this.clearRotateSetupPreview();
              resolve(undefined);
            });
          });
        } finally {
          unmount();
        }
      }
    };
  }

  protected override transfrom(point: XYZ): Matrix4 {
    const plane =
      this.stepDatas[1].plane ??
      this.getRotationPlane(this.stepDatas[0].view, this.stepDatas[0].point!);
    const normal = plane.normal;
    const center = this.stepDatas[0].point!;
    const angle =
      this.stepDatas.length >= 3
        ? this.getAngle(point)
        : this.getRotationAngleRad();
    return Matrix4.fromAxisRad(center, normal, angle);
  }

  protected override getSteps(): IStep[] {
    const firstStep = new PointStep(
      transformI18n("modelai.command.prompt.pickRotateCenter"),
      undefined,
      true
    );
    const secondStep = this.createRotateSetupStep();

    /*
    const thirdStep: IStep = {
      execute: async (document, controller) => {
        const pointData = this.getSecondPointData();
        const app = document.application as any;
        const snapConfig =
          app?.getSnapConfigRef?.() ?? createDefaultSnapConfig();
        const snapUI = createSnapCommandUI(document);
        const handler = new SnapLengthAtPlaneHandler(
          document,
          controller,
          pointData,
          snapConfig,
          snapUI
            ? {
                ...snapUI,
                requestInput: undefined
              }
            : undefined
        );

        try {
          await document.selection.pickAsync(
            handler,
            transformI18n("modelai.command.prompt.pickRotateReferencePoint"),
            controller,
            false,
            "draw"
          );
          const snaped = handler.snaped;
          return controller.result?.status === "success" ? snaped : undefined;
        } finally {
          handler.dispose();
        }
      }
    };
    const fourthStep: IStep = {
      execute: async (document, controller) => {
        const pointData = this.getThirdPointData();
        const app = document.application as any;
        const snapConfig =
          app?.getSnapConfigRef?.() ?? createDefaultSnapConfig();
        const snapUI = createSnapCommandUI(document);
        const handler = new AngleSnapEventHandler(
          document,
          controller,
          () => this.stepDatas[0].point!,
          this.stepDatas[2].point!,
          pointData,
          snapConfig,
          snapUI
        );
        let angleDeg = this.rotationAngleDeg;
        const listeners = new Set<() => void>();
        const view = this.stepDatas[2].view ?? this.stepDatas[0].view;
        const syncAnglePreview = () => {
          if (!view) return;
          handler.setPreviewResult(this.getAnglePreviewResult(view, angleDeg));
        };
        const registration = createFormKitRegistration({
          schema: {
            id: "modify-rotate-angle-form",
            titleKey: "modelai.rotate.group",
            sections: [
              {
                key: "angle",
                fields: [
                  {
                    key: "angleDeg",
                    labelKey: "modelai.rotate.angle",
                    kind: "number"
                  }
                ]
              }
            ],
            actions: [
              {
                key: "confirm",
                labelKey: "buttons.pureConfirm",
                buttonType: "primary"
              },
              {
                key: "cancel",
                labelKey: "buttons.pureClose",
                buttonType: "text"
              }
            ],
            layout: {
              actionsAlign: "end",
              maxBodyHeight: 220
            }
          },
          getState: () => ({
            visible: true,
            values: {
              angleDeg
            }
          }),
          handlers: {
            onChange: (fieldKey, value) => {
              if (fieldKey !== "angleDeg" || typeof value !== "number") return;
              angleDeg = value;
              syncAnglePreview();
              listeners.forEach(listener => listener());
            },
            onAction: actionKey => {
              if (actionKey === "confirm") {
                this.rotationAngleDeg = angleDeg;
                if (view) {
                  handler.setPreviewResult(
                    this.getAnglePreviewResult(view, angleDeg)
                  );
                }
                controller.success();
                return;
              }
              if (actionKey === "cancel") {
                controller.cancel();
              }
            }
          },
          subscribeState: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          }
        });
        const unmount = mountFormKit(registration);

        try {
          handler.isEnabled = true;
          await document.selection.pickAsync(
            handler,
            transformI18n("modelai.command.prompt.pickRotateAngle"),
            controller,
            false,
            "draw"
          );
          const snaped = handler.snaped;
          return controller.result?.status === "success" ? snaped : undefined;
        } finally {
          unmount();
          handler.dispose();
        }
      }
    };
    return [firstStep, secondStep, thirdStep, fourthStep];
    */

    return [firstStep, secondStep];
  }

  private readonly getSecondPointData = (): SnapLengthAtPlaneData => {
    const { point, view } = this.stepDatas[0];
    const plane =
      this.stepDatas[1].plane ?? this.getRotationPlane(view, point!);
    return {
      point: () => point!,
      preview: this.circlePreview,
      plane: _ => plane,
      validator: (p: XYZ) => {
        if (p.distanceTo(point!) < Precision.Distance) return false;
        return p.sub(point!).isParallelTo(plane.normal) === false;
      }
    };
  };

  private readonly circlePreview = (end: XYZ | undefined) => {
    const center = this.stepDatas[0].point!;
    const visualCenter = this.meshPoint(center);
    if (!end) return [visualCenter];

    const view = this.stepDatas[0].view;
    const plane = this.getRotationPlane(view, center);
    const projectedEnd = plane.project(end);
    const axisX = projectedEnd.sub(center);
    const radius = axisX.length();
    if (radius <= Precision.Distance) {
      return [visualCenter];
    }

    return [
      visualCenter,
      this.meshLine(center, projectedEnd, VisualConfig.temporaryEdgeColor),
      createCircleEdgeMesh(center, plane.normal, radius, axisX)
    ];
  };

  private readonly getThirdPointData = (): PointSnapData => {
    return {
      dimension: Dimension.D1D2,
      preview: this.anglePreview,
      plane: () =>
        this.stepDatas[2].plane ??
        this.getRotationPlane(this.stepDatas[0].view, this.stepDatas[0].point!),
      validator: p => {
        return (
          p.distanceTo(this.stepDatas[0].point!) > 1e-3 &&
          p.distanceTo(this.stepDatas[2].point!) > 1e-3
        );
      }
    };
  };

  private getAngle(point: XYZ) {
    const plane =
      this.stepDatas[2].plane ??
      this.getRotationPlane(this.stepDatas[0].view, this.stepDatas[0].point!);
    const normal = plane.normal;
    const center = this.stepDatas[0].point!;
    const p1 = this.stepDatas[2].point!;
    const v1 = p1.sub(center);
    const v2 = point.sub(center);
    return v1.angleOnPlaneTo(v2, normal) ?? 0;
  }

  private readonly anglePreview = (point: XYZ | undefined) => {
    const p2 = point ?? this.stepDatas[2].point!;
    const center = this.stepDatas[0].point!;
    const p1 = this.stepDatas[2].point!;

    const result = [
      this.transformPreview(p2),
      this.meshPoint(center),
      this.meshPoint(p1),
      this.getRayData(p1),
      this.getRayData(p2)
    ];

    const angle = this.getAngle(p2);
    if (Math.abs(angle) > Precision.Angle) {
      const plane =
        this.stepDatas[2].plane ??
        this.getRotationPlane(this.stepDatas[0].view, center);
      result.push(
        createArcEdgeMesh(
          center,
          plane.normal,
          plane.project(p1),
          angle,
          undefined,
          VisualConfig.temporaryEdgeColor
        )
      );
    }

    return result;
  };

  private getRayData(end: XYZ) {
    const center = this.stepDatas[0].point!;
    const vec = end.sub(center).normalize();
    const rayEnd = center.add(vec.multiply(1e6));
    return this.getTempLineData(center, rayEnd);
  }
}
