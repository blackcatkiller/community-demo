// @ts-nocheck
import type {
  ViewPointQuery,
  VisualShapeData,
  ViewShapeGuidePolicy
} from "@modelai/core/types";
import { type ShapeType, ShapeTypeUtils } from "@modelai/core/types";
import { Matrix4, Vector3 } from "three";
import type { Camera, Vector2 } from "three";
import { type GeometryPointShapeHit, ThreeGeometry } from "./geometry";
import { AabbResult, classifyAabb, getAabbs } from "./subShapeAabb";
import type { ThreeVisualContext } from "./visualContext";
import type { VisualPointHit } from "./visualObject";
import type { ThreeView, ViewShapeDetection } from "./view";

type ShapeHitTesterDeps = {
  context: ThreeVisualContext;
  getCamera: () => Camera;
  screenToCameraRect: (mx: number, my: number) => Vector2;
  computeVisualHits: (query: ViewPointQuery) => VisualPointHit[];
};

export class ShapeHitTester {
  private readonly _projectedPoint = new Vector3();
  private readonly _shapeHitsCache = new WeakMap<
    ViewPointQuery,
    Map<string, VisualShapeData[]>
  >();

  static install(view: ThreeView) {
    const tester = new ShapeHitTester({
      context: view.context,
      getCamera: () => view.camera,
      screenToCameraRect: (mx, my) => view.screenToCameraRect(mx, my),
      computeVisualHits: query => view.getPointVisualHits(query)
    });
    const detection: ViewShapeDetection = {
      detectShapes: (shapeType, mx, my, options) =>
        tester.detectShapes(view.pointQueryAt(mx, my), shapeType, options),
      detectShapesRect: (shapeType, x1, y1, x2, y2) =>
        tester.detectShapesRect(shapeType, x1, y1, x2, y2)
    };
    view.installShapeDetection(detection);
    return tester;
  }

  constructor(private readonly deps: ShapeHitTesterDeps) {}

  detectShapes(
    query: ViewPointQuery,
    shapeType: ShapeType,
    options?: { guidePolicy?: ViewShapeGuidePolicy }
  ): VisualShapeData[] {
    const guidePolicy = options?.guidePolicy ?? "default";
    const cached = this.readShapeHits(query, shapeType, guidePolicy);
    if (cached) return cached;

    let result: VisualShapeData[];
    if (ShapeTypeUtils.isWhole(shapeType)) {
      result = this.detectWholeShapes(query);
    } else {
      const hits: GeometryPointShapeHit[] = [];
      this.deps.context.visuals().forEach(v => {
        if (!v.visible || !(v instanceof ThreeGeometry)) return;
        hits.push(...v.pointShapeHits(query.raycaster, shapeType, guidePolicy));
      });
      hits.sort((a, b) => a.distance - b.distance);
      result = hits.map(item => item.hit);
    }
    this.writeShapeHits(query, shapeType, guidePolicy, result);
    return result;
  }

  detectShapesRect(
    shapeType: ShapeType,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): VisualShapeData[] {
    const ndc1 = this.deps.screenToCameraRect(x1, y1);
    const ndc2 = this.deps.screenToCameraRect(x2, y2);
    const ndcRect: [number, number, number, number] = [
      Math.min(ndc1.x, ndc2.x),
      Math.max(ndc1.x, ndc2.x),
      Math.min(ndc1.y, ndc2.y),
      Math.max(ndc1.y, ndc2.y)
    ];
    const camera = this.deps.getCamera();
    const vpMatrix = new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    const result: VisualShapeData[] = [];
    this.deps.context.visuals().forEach(v => {
      if (!v.visible || !(v instanceof ThreeGeometry)) return;
      const mesh = v.geometryNode.mesh;
      const mvp = new Matrix4().multiplyMatrices(vpMatrix, v.matrixWorld);

      if (ShapeTypeUtils.hasEdge(shapeType) && mesh.edges) {
        const aabbs = getAabbs(mesh.edges);
        mesh.edges.range.forEach((g, i) => {
          const classification = classifyAabb(aabbs[i], mvp, ndcRect);
          if (
            this.shouldReject(classification) ||
            !this.isDirectRangeInside(
              classification,
              mvp,
              mesh.edges!.position,
              g.start,
              g.count,
              ndcRect
            )
          ) {
            return;
          }
          result.push({
            owner: v as any,
            shape: g.shape,
            transform: v.worldTransform(),
            indexes: [i]
          });
        });
      }

      if (ShapeTypeUtils.hasFace(shapeType) && mesh.faces?.index) {
        const aabbs = getAabbs(mesh.faces, mesh.faces.index);
        mesh.faces.range.forEach((g, i) => {
          const classification = classifyAabb(aabbs[i], mvp, ndcRect);
          if (
            this.shouldReject(classification) ||
            !this.isFaceRangeInside(
              classification,
              mvp,
              mesh.faces!.position,
              mesh.faces!.index,
              g.start,
              g.count,
              ndcRect
            )
          ) {
            return;
          }
          result.push({
            owner: v as any,
            shape: g.shape,
            transform: v.worldTransform(),
            indexes: [i]
          });
        });
      }

      if (ShapeTypeUtils.hasVertex(shapeType) && mesh.vertexs) {
        const aabbs = getAabbs(mesh.vertexs);
        mesh.vertexs.range.forEach((g, i) => {
          const classification = classifyAabb(aabbs[i], mvp, ndcRect);
          if (
            this.shouldReject(classification) ||
            !this.isDirectRangeInside(
              classification,
              mvp,
              mesh.vertexs!.position,
              g.start,
              g.count,
              ndcRect
            )
          ) {
            return;
          }
          result.push({
            owner: v as any,
            shape: g.shape,
            transform: v.worldTransform(),
            indexes: [i]
          });
        });
      }
    });
    return result;
  }

  private detectWholeShapes(query: ViewPointQuery): VisualShapeData[] {
    const visualHits = this.deps.computeVisualHits(query);
    for (const hit of visualHits) {
      const target = hit.target;
      if (!(target instanceof ThreeGeometry)) continue;
      const geomNode = target.geometryNode as any;
      const shape = geomNode.shape?.isOk ? geomNode.shape.value : undefined;
      if (!shape) continue;
      return [
        {
          owner: target as any,
          shape,
          transform: target.worldTransform(),
          point: hit.point,
          indexes: []
        }
      ];
    }
    return [];
  }

  private readShapeHits(
    query: ViewPointQuery,
    shapeType: ShapeType,
    guidePolicy: ViewShapeGuidePolicy
  ) {
    return this._shapeHitsCache
      .get(query)
      ?.get(this.shapeHitCacheKey(shapeType, guidePolicy));
  }

  private writeShapeHits(
    query: ViewPointQuery,
    shapeType: ShapeType,
    guidePolicy: ViewShapeGuidePolicy,
    hits: VisualShapeData[]
  ) {
    let cache = this._shapeHitsCache.get(query);
    if (!cache) {
      cache = new Map<string, VisualShapeData[]>();
      this._shapeHitsCache.set(query, cache);
    }
    cache.set(this.shapeHitCacheKey(shapeType, guidePolicy), hits);
  }

  private shapeHitCacheKey(
    shapeType: ShapeType,
    guidePolicy: ViewShapeGuidePolicy
  ) {
    return `${shapeType}:${guidePolicy}`;
  }

  private shouldReject(classification: AabbResult) {
    return classification === AabbResult.Reject;
  }

  private isDirectRangeInside(
    classification: AabbResult,
    mvp: Matrix4,
    positions: Float32Array,
    start: number,
    count: number,
    ndcRect: [number, number, number, number]
  ) {
    if (classification === AabbResult.Accept) return true;
    const [ndcMinX, ndcMaxX, ndcMinY, ndcMaxY] = ndcRect;
    for (let i = start; i < start + count; i++) {
      const projected = this.projectPoint(
        mvp,
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2]
      );
      if (
        projected.x < ndcMinX ||
        projected.x > ndcMaxX ||
        projected.y < ndcMinY ||
        projected.y > ndcMaxY ||
        projected.z < -1 ||
        projected.z > 1
      ) {
        return false;
      }
    }
    return true;
  }

  private isFaceRangeInside(
    classification: AabbResult,
    mvp: Matrix4,
    positions: Float32Array,
    indices: Uint32Array,
    start: number,
    count: number,
    ndcRect: [number, number, number, number]
  ) {
    if (classification === AabbResult.Accept) return true;
    const [ndcMinX, ndcMaxX, ndcMinY, ndcMaxY] = ndcRect;
    for (let i = start; i < start + count; i++) {
      const vertexIndex = indices[i];
      const projected = this.projectPoint(
        mvp,
        positions[vertexIndex * 3],
        positions[vertexIndex * 3 + 1],
        positions[vertexIndex * 3 + 2]
      );
      if (
        projected.x < ndcMinX ||
        projected.x > ndcMaxX ||
        projected.y < ndcMinY ||
        projected.y > ndcMaxY ||
        projected.z < -1 ||
        projected.z > 1
      ) {
        return false;
      }
    }
    return true;
  }

  private projectPoint(mvp: Matrix4, x: number, y: number, z: number) {
    return this._projectedPoint.set(x, y, z).applyMatrix4(mvp);
  }
}
