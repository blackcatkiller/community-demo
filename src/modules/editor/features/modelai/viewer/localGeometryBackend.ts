// @ts-nocheck
import type {
  EdgeMeshData,
  FaceMeshData,
  VertexMeshData
} from "@modelai/core/types";
import type { BoundingBox } from "@modelai/core/math";
import { ShapeNode, type GeometryNode } from "@modelai/model/shapeNode";
import {
  Mesh,
  type Material,
  type Object3D,
  Points,
  type PointsMaterial
} from "three";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import type {
  GeometryRenderChannels,
  GeometryVisualBackend
} from "./geometryBackend";
import { ThreeGeometryFactory } from "./geometryFactory";
import { ThreeHelper } from "./helper";
import {
  faceBasicDragGhostMaterial,
  faceLambertDefaultMaterial,
  faceLambertHighlightSolidMaterial,
  faceLambertSelectedTransparentMaterial,
  lineDefaultThinMaterial,
  lineHighlightWideMaterial,
  lineSelectedWideMaterial,
  lineSnapWideMaterial,
  pointDefaultMaterial,
  pointHighlightMaterial,
  pointSelectedMaterial,
  pointSnapMaterial
} from "./materials";
import type { ThreeVisualContext } from "./visualContext";
import {
  buildGuideEdgeMeshes,
  type FeatureGuideDescriptor,
  filterGuidesByRole
} from "../geometry/featureGeometry";
import type { ThreeGeometry } from "./geometry";
import { VisualState, VisualStateUtils } from "@modelai/core/types";
import { createGuidePointHelperObjectFromGuides } from "./guidePointHelper";
import { applyForegroundOverlay } from "../geometry/foregroundOverlay";
import type { ThreeView } from "./view";

export class LocalGeometryBackend implements GeometryVisualBackend {
  private _visual?: ThreeGeometry;
  private _faceMaterial: Material | Material[] = faceLambertDefaultMaterial;
  private _edges?: LineSegments2;
  private _faces?: Mesh;
  private _vertexs?: Points;
  private _guides: LineSegments2[] = [];
  private _guidePoints: Object3D[] = [];
  private _detachGuideOcclusionOverlays: Array<() => void> = [];
  private _detachGuidePointOverlays: Array<() => void> = [];

  constructor(
    readonly geometryNode: GeometryNode,
    readonly context: ThreeVisualContext
  ) {}

  attach(visual: ThreeGeometry) {
    this._visual = visual;
    this.refresh();
  }

  detach() {
    this.removeMeshes();
    this._visual = undefined;
  }

  refresh() {
    this.removeMeshes();
    const visual = this._visual;
    if (!visual) return;
    const mesh = this.geometryNode.mesh;
    if (mesh?.vertexs?.position.length) this.initVertexs(mesh.vertexs);
    if (mesh?.faces?.position.length) this.initFaces(mesh.faces);
    if (mesh?.edges?.position.length) this.initEdges(mesh.edges);
    this.initGuides();
  }

  boundingBox(): BoundingBox | undefined {
    const box =
      this._faces?.geometry.boundingBox ?? this._edges?.geometry.boundingBox;
    if (!box) return this.geometryNode.boundingBox();
    return { min: ThreeHelper.toXYZ(box.min), max: ThreeHelper.toXYZ(box.max) };
  }

  getRenderChannels(): GeometryRenderChannels {
    return {
      faces: this._faces,
      edges: this._edges,
      vertexs: this._vertexs,
      guides: this._guides
    };
  }

  applyWholeVisualState(state: VisualState): boolean {
    if (VisualStateUtils.hasState(state, VisualState.snapHighlight)) {
      this.setVertexsTemporary(pointSnapMaterial);
      this.setEdgesTemporary(lineSnapWideMaterial);
    } else if (VisualStateUtils.hasState(state, VisualState.edgeHighlight)) {
      this.setVertexsTemporary(pointHighlightMaterial);
      this.setEdgesTemporary(lineHighlightWideMaterial);
    } else if (VisualStateUtils.hasState(state, VisualState.edgeSelected)) {
      this.setVertexsTemporary(pointSelectedMaterial);
      this.setEdgesTemporary(lineSelectedWideMaterial);
    } else if (VisualStateUtils.hasState(state, VisualState.faceTransparent)) {
      this.removeTemporaryMaterial();
      this.setFacesTemporary(faceLambertSelectedTransparentMaterial);
    } else if (VisualStateUtils.hasState(state, VisualState.faceDragGhost)) {
      this.removeTemporaryMaterial();
      this.setFacesTemporary(faceBasicDragGhostMaterial);
    } else if (VisualStateUtils.hasState(state, VisualState.faceColored)) {
      this.removeTemporaryMaterial();
      this.setFacesTemporary(faceLambertHighlightSolidMaterial);
    } else {
      this.clearWholeVisualState();
    }
    return true;
  }

  clearWholeVisualState(): boolean {
    this.removeTemporaryMaterial();
    return true;
  }

  private initVertexs(data: VertexMeshData) {
    const visual = this._visual;
    if (!visual) return;
    const buff = ThreeGeometryFactory.createVertexBufferGeometry(data);
    this._vertexs = new Points(buff, pointDefaultMaterial);
    this._vertexs.layers.set(visual.vertexLayer());
    visual.add(this._vertexs);
  }

  private initEdges(data: EdgeMeshData) {
    const visual = this._visual;
    if (!visual) return;
    const buff = ThreeGeometryFactory.createEdgeBufferGeometry(data);
    this._edges = new LineSegments2(buff, lineDefaultThinMaterial);
    this._edges.layers.set(visual.edgeLayer());
    visual.add(this._edges);
  }

  private initFaces(data: FaceMeshData) {
    const visual = this._visual;
    if (!visual) return;
    const buff = ThreeGeometryFactory.createFaceBufferGeometry(data);
    if (data.groups.length > 1) buff.groups = data.groups;

    const { material, owned } =
      ThreeGeometryFactory.createFaceDisplayMaterial(data);
    this._faceMaterial = material;
    void owned;
    if (Array.isArray(data.color) && data.color.length > 0) {
      ThreeGeometryFactory.setColor(buff, data, this._faceMaterial);
    }

    this._faces = new Mesh(buff, this._faceMaterial);
    this._faces.layers.set(visual.faceLayer());
    visual.add(this._faces);
  }

  private initGuides() {
    const visual = this._visual;
    if (!visual || !(this.geometryNode instanceof ShapeNode)) return;
    const displayGuides = filterGuidesByRole(
      this.geometryNode.guides,
      "display"
    );
    const guideMeshes = buildGuideEdgeMeshes(displayGuides, {
      advancedOcclusion: true
    });
    const guidePointHelper =
      createGuidePointHelperObjectFromGuides(displayGuides);
    if (guideMeshes.length === 0 && !guidePointHelper) return;
    const helper = visual.constructor as {
      createGuideObjects?: (
        meshes: readonly EdgeMeshData[],
        context: ThreeVisualContext,
        layer: number,
        descriptors?: readonly FeatureGuideDescriptor[]
      ) => {
        guides: LineSegments2[];
        detachOcclusionOverlays: Array<() => void>;
      };
    };
    if (guideMeshes.length > 0) {
      const created = helper.createGuideObjects?.(
        guideMeshes,
        this.context,
        visual.edgeLayer(),
        displayGuides
      );
      if (created) {
        this._guides = created.guides;
        this._detachGuideOcclusionOverlays = created.detachOcclusionOverlays;
        this._guides.forEach(guide => visual.add(guide));
      }
    }
    if (guidePointHelper) {
      setObjectLayer(guidePointHelper, visual.edgeLayer());
      this._guidePoints = [guidePointHelper];
      this.attachGuidePointOverlay(guidePointHelper);
      visual.add(guidePointHelper);
    }
  }

  private removeMeshes() {
    const visual = this._visual;
    this.detachGuideOcclusionOverlays();
    this.detachGuidePointOverlays();
    [
      ...this._guides,
      ...this._guidePoints,
      this._vertexs,
      this._edges,
      this._faces
    ]
      .filter((mesh): mesh is NonNullable<typeof mesh> => mesh !== undefined)
      .forEach(mesh => {
        visual?.remove(mesh);
        (mesh as any).geometry?.dispose();
      });
    this._faceMaterial = faceLambertDefaultMaterial;
    this._guides = [];
    this._guidePoints = [];
    this._vertexs = this._edges = this._faces = undefined as any;
  }

  private setFacesTemporary(material: Material) {
    if (this._faces) this._faces.material = material;
  }

  private setEdgesTemporary(material: LineMaterial) {
    if (this._edges) this._edges.material = material;
  }

  private setVertexsTemporary(material: PointsMaterial) {
    if (this._vertexs) this._vertexs.material = material;
  }

  private removeTemporaryMaterial() {
    if (this._vertexs) this._vertexs.material = pointDefaultMaterial;
    if (this._edges) this._edges.material = lineDefaultThinMaterial;
    if (this._faces) this._faces.material = this._faceMaterial;
  }

  private detachGuideOcclusionOverlays() {
    this._detachGuideOcclusionOverlays.forEach(detach => detach());
    this._detachGuideOcclusionOverlays = [];
    this._guides.forEach(guide => {
      if (guide.userData) {
        delete guide.userData.detachOcclusionOverlay;
      }
    });
  }

  private attachGuidePointOverlay(object: Object3D) {
    const view = this.context.document.application.activeView;
    if (!isThreeView(view)) return;
    const detach = applyForegroundOverlay(view, object);
    object.userData.detachForegroundOverlay = detach;
    this._detachGuidePointOverlays.push(detach);
  }

  private detachGuidePointOverlays() {
    this._detachGuidePointOverlays.forEach(detach => detach());
    this._detachGuidePointOverlays = [];
    this._guidePoints.forEach(point => {
      if (point.userData) {
        delete point.userData.detachForegroundOverlay;
      }
    });
  }
}

function isThreeView(view: unknown): view is ThreeView {
  return (
    !!view &&
    typeof (view as any).addAfterSceneRenderHook === "function" &&
    typeof (view as any).removeAfterSceneRenderHook === "function"
  );
}

function setObjectLayer(object: Object3D, layer: number) {
  object.traverse(child => child.layers.set(layer));
}
