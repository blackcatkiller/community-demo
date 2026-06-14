// @ts-nocheck
import type { IDocument, IView } from "@modelai/core/types";
import { VisualConfig } from "@modelai/core/types";
import type { Plane } from "@modelai/core/math";
import type { SnapResult } from "./types";
import { Axis } from "./axis";
import { TrackingBase } from "./trackingBase";
import { MAX_TRACKING_POINTS } from "./trackingPointConfig";

export interface ObjectTrackingAxis {
  axes: Axis[];
  objectName: string | undefined;
}

interface SnapInfo {
  snap: SnapResult;
  shapeId: number;
}

export class ObjectTracking extends TrackingBase {
  private timer?: number;
  private snapping?: SnapResult;
  private snappingKey?: string;
  private readonly trackings: Map<IDocument, SnapInfo[]> = new Map();

  constructor(trackingZ: boolean) {
    super(trackingZ);
  }

  override clear(): void {
    this.clearTimer();
    super.clear();
    this.trackings.clear();
  }

  getTrackingAxes(view: IView, plane: Plane) {
    const result: ObjectTrackingAxis[] = [];
    this.trackings.get(view.document)?.forEach(x => {
      const axes = Axis.getAxiesAtPlane(x.snap.point!, plane, this.trackingZ);
      result.push({ axes, objectName: x.snap.info });
    });
    return result;
  }

  showTrackingAtTimeout(document: IDocument, snap?: SnapResult) {
    const key = snap?.point
      ? `${snap.point.x.toFixed(6)}|${snap.point.y.toFixed(6)}|${snap.point.z.toFixed(6)}`
      : undefined;
    if (key && this.snappingKey === key) return;
    this.snapping = snap;
    this.snappingKey = key;
    this.clearTimer();
    if (!snap) return;
    this.timer = window.setTimeout(
      () => this.switchTrackingPoint(document, snap),
      600
    );
  }

  private clearTimer() {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private switchTrackingPoint(document: IDocument, snap: SnapResult) {
    if (this.isCleared || snap.shapes.length === 0) return;
    if (!this.trackings.has(document)) {
      this.trackings.set(document, []);
    }
    const currentTrackings = this.trackings.get(document)!;
    const existingTracking = currentTrackings.find(x =>
      x.snap.point!.isEqualTo(snap.point!)
    );
    existingTracking
      ? this.removeTrackingPoint(document, existingTracking, currentTrackings)
      : this.addTrackingPoint(snap, document, currentTrackings);
    document.visual.update();
  }

  private removeTrackingPoint(
    document: IDocument,
    s: SnapInfo,
    snaps: SnapInfo[]
  ) {
    document.visual.context.removeMesh(s.shapeId);

    // Keep the array reference stable; `snaps` is shared with the Map value.
    const index = snaps.indexOf(s);
    if (index >= 0) {
      snaps.splice(index, 1);
    }
  }

  private addTrackingPoint(
    snap: SnapResult,
    document: IDocument,
    snaps: SnapInfo[]
  ) {
    // Keep at most N tracking points per document; when exceeded, drop the oldest.
    while (snaps.length >= MAX_TRACKING_POINTS) {
      const oldest = snaps.shift();
      if (!oldest) break;
      document.visual.context.removeMesh(oldest.shapeId);
    }

    const pointId = this.displayPoint(
      document,
      snap,
      VisualConfig.trackingVertexSize,
      VisualConfig.trackingVertexColor
    );
    snaps.push({ shapeId: pointId, snap });
  }
}
