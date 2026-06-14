// @ts-nocheck
import { TempMeshEmphasisConfig } from "@modelai/config";
import { VisualConfig } from "@modelai/core/types";
import {
  AlwaysDepth,
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  LessEqualDepth,
  LineBasicMaterial,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PointsMaterial,
  SpriteMaterial,
  SRGBColorSpace
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { ThreeHelper } from "./helper";

function createPointMaterial(
  color: number | string,
  size: number,
  options: {
    depthFunc?: number;
    depthTest?: boolean;
    depthWrite?: boolean;
  } = {}
) {
  return new PointsMaterial({
    color: ThreeHelper.fromColor(color),
    sizeAttenuation: false,
    size,
    ...(options.depthFunc !== undefined
      ? { depthFunc: options.depthFunc }
      : {}),
    ...(options.depthTest !== undefined
      ? { depthTest: options.depthTest }
      : {}),
    ...(options.depthWrite !== undefined
      ? { depthWrite: options.depthWrite }
      : {})
  });
}

function createLineMaterial(
  color: number | string,
  linewidth: number,
  options: {
    dashed?: boolean;
    polygonOffsetFactor?: number;
    polygonOffsetUnits?: number;
  } = {}
) {
  const material = new LineMaterial({
    linewidth,
    color,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: options.polygonOffsetFactor ?? -4,
    polygonOffsetUnits: options.polygonOffsetUnits ?? -4
  });
  if (options.dashed) {
    material.dashed = true;
    material.dashScale = 100;
    material.dashSize = 100;
    material.gapSize = 100;
  }
  return material;
}

function createBasicLineMaterial(
  color: number | string,
  options: {
    transparent?: boolean;
    opacity?: number;
    depthTest?: boolean;
    depthWrite?: boolean;
    toneMapped?: boolean;
  } = {}
) {
  return new LineBasicMaterial({
    color,
    ...(options.transparent !== undefined
      ? { transparent: options.transparent }
      : {}),
    ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
    ...(options.depthTest !== undefined
      ? { depthTest: options.depthTest }
      : {}),
    ...(options.depthWrite !== undefined
      ? { depthWrite: options.depthWrite }
      : {}),
    ...(options.toneMapped !== undefined
      ? { toneMapped: options.toneMapped }
      : {})
  });
}

function createLambertFaceMaterial(
  color: number | string,
  options: {
    transparent?: boolean;
    opacity?: number;
    depthTest?: boolean;
    vertexColors?: boolean;
    polygonOffset?: boolean;
    polygonOffsetFactor?: number;
    polygonOffsetUnits?: number;
  } = {}
) {
  return new MeshLambertMaterial({
    color,
    side: DoubleSide,
    ...(options.transparent !== undefined
      ? { transparent: options.transparent }
      : {}),
    ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
    ...(options.depthTest !== undefined
      ? { depthTest: options.depthTest }
      : {}),
    ...(options.vertexColors !== undefined
      ? { vertexColors: options.vertexColors }
      : {}),
    ...(options.polygonOffset !== undefined
      ? { polygonOffset: options.polygonOffset }
      : {}),
    ...(options.polygonOffsetFactor !== undefined
      ? { polygonOffsetFactor: options.polygonOffsetFactor }
      : {}),
    ...(options.polygonOffsetUnits !== undefined
      ? { polygonOffsetUnits: options.polygonOffsetUnits }
      : {})
  });
}

function createBasicFaceMaterial(
  color: number | string,
  options: {
    transparent?: boolean;
    opacity?: number;
    depthTest?: boolean;
    depthWrite?: boolean;
    toneMapped?: boolean;
    side?: number;
  } = {}
) {
  return new MeshBasicMaterial({
    color,
    side: options.side ?? DoubleSide,
    ...(options.transparent !== undefined
      ? { transparent: options.transparent }
      : {}),
    ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
    ...(options.depthTest !== undefined
      ? { depthTest: options.depthTest }
      : {}),
    ...(options.depthWrite !== undefined
      ? { depthWrite: options.depthWrite }
      : {}),
    ...(options.toneMapped !== undefined
      ? { toneMapped: options.toneMapped }
      : {})
  });
}

function createDepthAwareBasicMeshMaterial(color: number | string) {
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
    toneMapped: false
  });
  material.depthFunc = LessEqualDepth;
  return material;
}

function createMetallicMeshMaterial(color: number | string) {
  return new MeshStandardMaterial({
    color,
    transparent: false,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
    metalness: 0.82,
    roughness: 0.24,
    envMapIntensity: 1.1,
    emissive: ThreeHelper.fromColor(color).multiplyScalar(0.06),
    toneMapped: false
  });
}

function createSpriteLabelMaterial(text: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new SpriteMaterial({ transparent: true, toneMapped: false });

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "600 78px Arial";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;

  const material = new SpriteMaterial({
    map,
    transparent: true,
    toneMapped: false,
    depthTest: true,
    depthWrite: true
  });
  material.depthFunc = LessEqualDepth;
  return material;
}

function createViewCubeLabelMaterial(text: string, fillColor: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new SpriteMaterial({ transparent: true, toneMapped: false });

  ctx.beginPath();
  ctx.arc(32, 32, 16, 0, 2 * Math.PI);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.font = "20px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 32, 34);

  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;

  return new SpriteMaterial({
    map,
    toneMapped: false,
    transparent: true,
    alphaTest: 0.01,
    depthTest: true,
    depthWrite: true
  });
}

function createGlowSpriteMaterial(opacity: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new SpriteMaterial({
      transparent: true,
      opacity,
      toneMapped: false,
      depthTest: false,
      depthWrite: false
    });
  }

  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,0.75)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.35)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;

  return new SpriteMaterial({
    map,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
}

// Used by: ThreeGeometry, ThreeReferenceArrayVisual, ReferenceShapeBatchVisual,
// ReferenceSourceHitAssets, ThreeGeometryFactory.
export const faceLambertDefaultMaterial = createLambertFaceMaterial(
  VisualConfig.defaultFaceColor,
  {
    transparent: true,
    opacity: 1
  }
);

// Used by: ThreeGeometry, ThreeReferenceArrayVisual, ReferenceShapeBatchVisual,
// ThreeGeometryFactory.
export const faceLambertVertexColorMaterial = createLambertFaceMaterial(
  VisualConfig.defaultFaceColor,
  {
    vertexColors: true
  }
);

// Used by: ThreeGeometry, ReferenceSourceHitAssets.
export const pointDefaultMaterial = createPointMaterial(
  VisualConfig.defaultEdgeColor,
  3
);

// Used by: ThreeGeometry whole-state highlight.
export const pointHighlightMaterial = createPointMaterial(
  VisualConfig.highlightEdgeColor,
  5
);

// Used by: ThreeGeometry whole-state snap highlight.
export const pointSnapMaterial = createPointMaterial(
  VisualConfig.snapVertexColor,
  5
);

// Used by: ThreeGeometry whole-state selected highlight.
export const pointSelectedMaterial = pointHighlightMaterial;

// Used by: ThreeGeometryFactory temporary preview points.
export const pointTemporaryAlwaysMaterial = createPointMaterial(
  VisualConfig.temporaryVertexColor,
  VisualConfig.temporaryVertexSize,
  { depthFunc: AlwaysDepth }
);

// Used by: ThreeGeometryFactory always-on-top temporary preview points.
export const pointTemporaryOnTopMaterial = createPointMaterial(
  VisualConfig.temporaryVertexColor,
  VisualConfig.temporaryVertexSize,
  {
    depthFunc: AlwaysDepth,
    depthTest: false,
    depthWrite: false
  }
);

// Used by: TrackingBase, ObjectTracking temporary points.
export const pointTrackingAlwaysMaterial = createPointMaterial(
  VisualConfig.trackingVertexColor,
  VisualConfig.trackingVertexSize,
  { depthFunc: AlwaysDepth }
);

// Used by: ObjectSnap invisible/visible hint points.
export const pointHintAlwaysMaterial = createPointMaterial(
  VisualConfig.snapHintVertexColor,
  VisualConfig.hintVertexSize,
  { depthFunc: AlwaysDepth }
);

// Used by: TransformGizmo origin handle point.
export const pointNeutralLargeAlwaysMaterial = createPointMaterial(
  0xaaaaaa,
  10,
  {
    depthFunc: AlwaysDepth
  }
);

// Used by: TransformGizmo hovered origin handle point.
export const pointWhiteLargeAlwaysMaterial = createPointMaterial(0xffffff, 10, {
  depthFunc: AlwaysDepth
});

// Used by: TransformGizmo XY arc midpoint handle point.
export const pointYellowSmallAlwaysMaterial = createPointMaterial(0xdddd00, 6, {
  depthFunc: AlwaysDepth
});

// Used by: TransformGizmo YZ arc midpoint handle point.
export const pointCyanSmallAlwaysMaterial = createPointMaterial(0x00dddd, 6, {
  depthFunc: AlwaysDepth
});

// Used by: TransformGizmo XZ arc midpoint handle point.
export const pointMagentaSmallAlwaysMaterial = createPointMaterial(
  0xdd44dd,
  6,
  {
    depthFunc: AlwaysDepth
  }
);

// Used by: TransformGizmo hovered arc/extra midpoint handle point.
export const pointWhiteSmallAlwaysMaterial = createPointMaterial(0xffffff, 6, {
  depthFunc: AlwaysDepth
});

// Used by: TransformGizmo angle extra-handle marker point.
export const pointCreamSmallAlwaysMaterial = createPointMaterial(0xf3eadb, 6, {
  depthFunc: AlwaysDepth
});

// Used by: TransformGizmo orange extra-handle marker point.
export const pointOrangeSmallAlwaysMaterial = createPointMaterial(0xff6600, 6, {
  depthFunc: AlwaysDepth
});

// Used by: TransformGizmo amber extra-handle marker point.
export const pointAmberSmallAlwaysMaterial = createPointMaterial(0xff8800, 6, {
  depthFunc: AlwaysDepth
});

// Used by: TransformGizmo yellow extra-handle marker point.
export const pointGoldSmallAlwaysMaterial = createPointMaterial(0xffcc00, 6, {
  depthFunc: AlwaysDepth
});

// Used by: ViewportMeasurementPrompt emphasized temporary points.
export const pointEmphasisAlwaysMaterial = createPointMaterial(
  TempMeshEmphasisConfig.color,
  VisualConfig.temporaryVertexSize,
  { depthFunc: AlwaysDepth }
);

// Used by: ViewportMeasurementPrompt emphasized always-on-top temporary points.
export const pointEmphasisOnTopMaterial = createPointMaterial(
  TempMeshEmphasisConfig.color,
  VisualConfig.temporaryVertexSize,
  {
    depthFunc: AlwaysDepth,
    depthTest: false,
    depthWrite: false
  }
);

// Used by: ThreeGeometry, ThreeReferenceArrayVisual, ReferenceShapeBatchVisual,
// ReferenceSourceHitAssets.
export const lineDefaultThinMaterial = createLineMaterial(
  VisualConfig.defaultEdgeColor,
  1,
  {
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  }
);

// Used by: ThreeVisualContext.displayLineSegments default lines.
export const lineBasicDefaultMaterial = createBasicLineMaterial(
  VisualConfig.defaultEdgeColor
);

// Used by: ThreeVisualContext.displayLineSegments highlight-colored lines.
export const lineBasicHighlightMaterial = createBasicLineMaterial(
  VisualConfig.highlightEdgeColor
);

// Used by: ThreeVisualContext.displayLineSegments guide-colored lines.
export const lineBasicGuideMaterial = createBasicLineMaterial(
  VisualConfig.measurementGuideColor
);

// Used by: Document z-plane helper border.
export const lineBasicWhiteAlpha60NoDepthMaterial = createBasicLineMaterial(
  0xffffff,
  {
    transparent: true,
    opacity: 0.6,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  }
);

// Used by: ThreeVisualContext.displayLineSegments tracking-colored lines.
export const lineBasicTrackingMaterial = createBasicLineMaterial(
  VisualConfig.trackingEdgeColor
);

// Used by: ThreeVisualContext.displayLineSegments temporary-colored lines.
export const lineBasicTemporaryMaterial = createBasicLineMaterial(
  VisualConfig.temporaryEdgeColor
);

// Used by: ThreeGeometry, ThreeReferenceArrayVisual, ReferenceShapeBatchVisual,
// ThreeHighlighter.
export const lineHighlightWideMaterial = createLineMaterial(
  VisualConfig.highlightEdgeColor,
  3
);

// Used by: ThreeGeometry, ThreeReferenceArrayVisual, ReferenceShapeBatchVisual,
// ThreeHighlighter.
export const lineSnapWideMaterial = createLineMaterial(
  VisualConfig.snapEdgeColor,
  3
);

// Used by: ThreeGeometry, ThreeReferenceArrayVisual, ReferenceShapeBatchVisual,
// ThreeHighlighter.
export const lineSelectedWideMaterial = lineHighlightWideMaterial;

// Used by: ThreeGeometryFactory measurement/runner solid guide edges.
export const lineGuideWideMaterial = createLineMaterial(
  VisualConfig.measurementGuideColor,
  3
);

// Used by: ThreeGeometryFactory measurement dashed guide edges.
export const lineGuideDashedMaterial = createLineMaterial(
  VisualConfig.measurementGuideColor,
  2,
  { dashed: true }
);

// Used by: ThreeGeometryFactory temporary solid edges.
export const lineTemporaryThinMaterial = createLineMaterial(
  VisualConfig.temporaryEdgeColor,
  1
);

// Used by: ThreeGeometryFactory temporary wide solid edges.
export const lineTemporaryWideMaterial = createLineMaterial(
  VisualConfig.temporaryEdgeColor,
  3
);

// Used by: ThreeGeometryFactory temporary dashed edges.
export const lineTemporaryDashedMaterial = createLineMaterial(
  VisualConfig.temporaryEdgeColor,
  1,
  { dashed: true }
);

// Used by: TrackingSnap temporary dashed tracking edges.
export const lineTrackingDashedMaterial = createLineMaterial(
  VisualConfig.trackingEdgeColor,
  1,
  { dashed: true }
);

// Used by: TransformGizmo X axis / straight handle edges.
export const lineRedThinMaterial = createLineMaterial(0xff4444, 1);

// Used by: TransformGizmo Y axis / straight handle edges.
export const lineGreenThinMaterial = createLineMaterial(0x44cc44, 1);

// Used by: TransformGizmo Z axis / straight handle edges.
export const lineBlueThinMaterial = createLineMaterial(0x4488ff, 1);

// Used by: TransformGizmo angle extra-handle dashed guide lines.
export const lineBlueDashedMaterial = createLineMaterial(0x4488ff, 1, {
  dashed: true
});

// Used by: HotTip semantic plane-move handle outer arcs.
export const lineBlueMediumMaterial = createLineMaterial(0x4488ff, 2);

// Used by: TransformGizmo XY arc edges.
export const lineYellowThinMaterial = createLineMaterial(0xdddd00, 1);

// Used by: TransformGizmo YZ arc edges.
export const lineCyanThinMaterial = createLineMaterial(0x00dddd, 1);

// Used by: TransformGizmo XZ arc edges.
export const lineMagentaThinMaterial = createLineMaterial(0xdd44dd, 1);

// Used by: TransformGizmo hovered edges.
export const lineWhiteThinMaterial = createLineMaterial(0xffffff, 1);

// Used by: HotTip semantic plane-move handle outer arcs.
export const lineWhiteMediumMaterial = createLineMaterial(0xffffff, 2);

// Used by: ThreeGeometryFactory projection helper dashed edges.
export const lineWhiteDashedMaterial = createLineMaterial(0xffffff, 1, {
  dashed: true
});

// Used by: TransformGizmo angle extra-handle edges.
export const lineCreamThinMaterial = createLineMaterial(0xf3eadb, 1);

// Used by: TransformGizmo orange extra-handle edges.
export const lineOrangeThinMaterial = createLineMaterial(0xff6600, 1);

// Used by: TransformGizmo amber extra-handle edges.
export const lineAmberThinMaterial = createLineMaterial(0xff8800, 1);

// Used by: TransformGizmo yellow extra-handle edges.
export const lineGoldThinMaterial = createLineMaterial(0xffcc00, 1);

// Used by: ViewportMeasurementPrompt emphasized temporary/highlight edges.
export const lineEmphasisWideMaterial = createLineMaterial(
  TempMeshEmphasisConfig.color,
  3
);

// Used by: ViewportMeasurementPrompt emphasized temporary narrow edges.
export const lineEmphasisThinMaterial = createLineMaterial(
  TempMeshEmphasisConfig.color,
  1
);

// Used by: ViewportMeasurementPrompt emphasized dashed edges.
export const lineEmphasisDashedMaterial = createLineMaterial(
  TempMeshEmphasisConfig.color,
  2,
  { dashed: true }
);

// Used by: TransformGizmo X axis / straight handle arrow heads.
export const faceBasicRedSolidMaterial = createBasicFaceMaterial(0xff4444, {
  depthTest: true,
  depthWrite: true,
  toneMapped: false
});

// Used by: TransformGizmo Y axis / straight handle arrow heads.
export const faceBasicGreenSolidMaterial = createBasicFaceMaterial(0x44cc44, {
  depthTest: true,
  depthWrite: true,
  toneMapped: false
});

// Used by: TransformGizmo Z axis / straight handle arrow heads.
export const faceBasicBlueSolidMaterial = createBasicFaceMaterial(0x4488ff, {
  depthTest: true,
  depthWrite: true,
  toneMapped: false
});

// Used by: TransformGizmo hovered arrow heads.
export const faceBasicWhiteSolidMaterial = createBasicFaceMaterial(0xffffff, {
  depthTest: true,
  depthWrite: true,
  toneMapped: false
});

// Used by: TransformGizmo angle extra-handle arrow heads.
export const faceBasicCreamSolidMaterial = createBasicFaceMaterial(0xf3eadb, {
  depthTest: true,
  depthWrite: true,
  toneMapped: false
});

// Used by: TransformGizmo orange extra-handle arrow heads.
export const faceBasicOrangeSolidMaterial = createBasicFaceMaterial(0xff6600, {
  depthTest: true,
  depthWrite: true,
  toneMapped: false
});

// Used by: TransformGizmo amber extra-handle arrow heads.
export const faceBasicAmberSolidMaterial = createBasicFaceMaterial(0xff8800, {
  depthTest: true,
  depthWrite: true,
  toneMapped: false
});

// Used by: TransformGizmo yellow extra-handle arrow heads.
export const faceBasicGoldSolidMaterial = createBasicFaceMaterial(0xffcc00, {
  depthTest: true,
  depthWrite: true,
  toneMapped: false
});

// Used by: ThreeGeometry, ThreeReferenceArrayVisual, ReferenceShapeBatchVisual.
export const faceLambertSelectedTransparentMaterial = createLambertFaceMaterial(
  VisualConfig.selectedFaceColor,
  {
    transparent: true,
    opacity: 0.1
  }
);

// Used by: ThreeGeometry, ThreeReferenceArrayVisual, ReferenceShapeBatchVisual drag ghost faces.
export const faceBasicDragGhostMaterial = createBasicFaceMaterial(
  VisualConfig.selectedFaceColor,
  {
    transparent: true,
    opacity: 0.35,
    depthTest: true,
    depthWrite: false,
    toneMapped: false
  }
);

// Used by: ThreeGeometry, ThreeReferenceArrayVisual, ReferenceShapeBatchVisual.
export const faceLambertHighlightSolidMaterial = createLambertFaceMaterial(
  VisualConfig.highlightFaceColor
);

// Used by: ThreeGeometryFactory temporary face previews with default opacity.
export const faceLambertPreviewMaterial = createLambertFaceMaterial(
  VisualConfig.defaultFaceColor,
  {
    transparent: true,
    opacity: 0.5
  }
);

// Used by: ThreeGeometryFactory default overlay face previews.
export const faceBasicOverlayDefaultMaterial = createBasicFaceMaterial(
  VisualConfig.defaultFaceColor,
  {
    transparent: true,
    opacity: 0.55,
    depthTest: false,
    depthWrite: false
  }
);

// Used by: ConnectivityMeasure overlap contact overlay faces.
export const faceBasicOverlayRedMaterial = createBasicFaceMaterial(0xff4400, {
  transparent: true,
  opacity: 0.55,
  depthTest: false,
  depthWrite: false
});

// Used by: ConnectivityMeasure touching contact overlay faces.
export const faceBasicOverlayGoldMaterial = createBasicFaceMaterial(0xffcc00, {
  transparent: true,
  opacity: 0.55,
  depthTest: false,
  depthWrite: false
});

// Used by: ViewportMeasurementPrompt emphasized overlay faces.
export const faceBasicOverlayEmphasisMaterial = createBasicFaceMaterial(
  TempMeshEmphasisConfig.color,
  {
    transparent: true,
    opacity: 0.55,
    depthTest: false,
    depthWrite: false
  }
);

// Used by: ThreeHighlighter face highlight overlay.
export const faceLambertHighlightOverlayMaterial = createLambertFaceMaterial(
  VisualConfig.highlightFaceColor,
  {
    transparent: true,
    opacity: 0.55,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  }
);

// Used by: ThreeHighlighter snap face overlay.
export const faceLambertSnapOverlayMaterial = createLambertFaceMaterial(
  VisualConfig.snapFaceColor,
  {
    transparent: true,
    opacity: 0.55,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  }
);

// Used by: ThreeHighlighter selected face overlay.
export const faceLambertSelectedOverlayMaterial =
  faceLambertHighlightOverlayMaterial;

// Used by: ThreeGeometryFactory default overlay face wireframe.
export const lineBasicOverlayDefaultMaterial = createBasicLineMaterial(
  VisualConfig.defaultFaceColor,
  {
    depthTest: false,
    depthWrite: false
  }
);

// Used by: ConnectivityMeasure overlap contact overlay wireframe.
export const lineBasicOverlayRedMaterial = createBasicLineMaterial(0xff4400, {
  depthTest: false,
  depthWrite: false
});

// Used by: ConnectivityMeasure touching contact overlay wireframe.
export const lineBasicOverlayGoldMaterial = createBasicLineMaterial(0xffcc00, {
  depthTest: false,
  depthWrite: false
});

// Used by: ViewportMeasurementPrompt emphasized overlay wireframe.
export const lineBasicOverlayEmphasisMaterial = createBasicLineMaterial(
  TempMeshEmphasisConfig.color,
  {
    depthTest: false,
    depthWrite: false
  }
);

// Used by: CustomAxesHelper center origin ball.
export const meshBasicNeutralDepthMaterial =
  createDepthAwareBasicMeshMaterial(0x8f8f8f);

// Used by: CustomAxesHelper muted center origin ball; CustomAxesHelper muted axis shaft/head.
export const meshBasicMutedDepthMaterial =
  createDepthAwareBasicMeshMaterial(0x7a7a7a);

// Used by: CustomAxesHelper X axis shaft/head.
export const meshBasicAxisRedDepthMaterial =
  createDepthAwareBasicMeshMaterial("#ff3b3b");

// Used by: CustomAxesHelper Y axis shaft/head.
export const meshBasicAxisGreenDepthMaterial =
  createDepthAwareBasicMeshMaterial("#27b44a");

// Used by: CustomAxesHelper Z axis shaft/head.
export const meshBasicAxisBlueDepthMaterial =
  createDepthAwareBasicMeshMaterial("#1f59ff");

// Used by: CustomAxesHelper X axis label sprite.
export const spriteTextXRedMaterial = createSpriteLabelMaterial("X", "#ff3b3b");

// Used by: CustomAxesHelper Y axis label sprite.
export const spriteTextYGreenMaterial = createSpriteLabelMaterial(
  "Y",
  "#27b44a"
);

// Used by: CustomAxesHelper Z axis label sprite.
export const spriteTextZBlueMaterial = createSpriteLabelMaterial(
  "Z",
  "#1f59ff"
);

// Used by: CustomAxesHelper muted X axis label sprite.
export const spriteTextXMutedMaterial = createSpriteLabelMaterial(
  "X",
  "#7a7a7a"
);

// Used by: CustomAxesHelper muted Y axis label sprite.
export const spriteTextYMutedMaterial = createSpriteLabelMaterial(
  "Y",
  "#7a7a7a"
);

// Used by: CustomAxesHelper muted Z axis label sprite.
export const spriteTextZMutedMaterial = createSpriteLabelMaterial(
  "Z",
  "#7a7a7a"
);

// Used by: RotateHelper visible XY mode and guide point focus helpers.
export const meshStandardBlueMetallicMaterial =
  createMetallicMeshMaterial(0x4b87ff);

// Used by: RotateHelper visible YZ mode.
export const meshStandardRedMetallicMaterial =
  createMetallicMeshMaterial(0xff365f);

// Used by: RotateHelper visible ZX mode.
export const meshStandardGreenMetallicMaterial =
  createMetallicMeshMaterial(0x1fbf6a);

// Used by: RotateHelper visible workplane mode.
export const meshStandardSlateMetallicMaterial =
  createMetallicMeshMaterial(0x94a3b8);

// Used by: guide point default helpers.
export const meshStandardWhiteMetallicMaterial =
  createMetallicMeshMaterial(0xffffff);

// Used by: HotTip semantic handle internal black fills.
export const meshBasicBlackSolidMaterial = createBasicFaceMaterial(0x000000, {
  depthTest: true,
  depthWrite: true,
  toneMapped: false
});

// Used by: HotTip semantic handle internal black fills in overlay mode.
export const meshBasicBlackNoDepthMaterial = createBasicFaceMaterial(0x000000, {
  depthTest: false,
  depthWrite: false,
  toneMapped: false
});

// Used by: HotTip semantic solid arrow heads.
export const meshBasicWhiteNoDepthMaterial = createBasicFaceMaterial(0xffffff, {
  depthTest: false,
  depthWrite: false,
  toneMapped: false
});

// Used by: HotTip semantic solid arrow heads in active state.
export const meshBasicBlueNoDepthMaterial = createBasicFaceMaterial(0x4488ff, {
  depthTest: false,
  depthWrite: false,
  toneMapped: false
});

// Used by: HotTip semantic translucent arc fills.
export const meshBasicWhiteAlpha45NoDepthMaterial = createBasicFaceMaterial(
  0xffffff,
  {
    transparent: true,
    opacity: 0.45,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  }
);

// Used by: HotTip semantic translucent arc fills in active state.
export const meshBasicBlueAlpha45NoDepthMaterial = createBasicFaceMaterial(
  0x4488ff,
  {
    transparent: true,
    opacity: 0.45,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  }
);

// Used by: ViewHelperWidget bloom composite plane.
export const meshBasicAdditiveOverlayMaterial = new MeshBasicMaterial({
  transparent: true,
  blending: AdditiveBlending,
  depthTest: false,
  depthWrite: false
});

// Used by: ViewCubeHelper back glow sprite.
export const spriteGlowSoftMaterial = createGlowSpriteMaterial(0.22);

// Used by: ViewCubeHelper box helper outline.
export const lineBasicSlateAlpha60NoDepthMaterial = createBasicLineMaterial(
  0x9ca3af,
  {
    transparent: true,
    opacity: 0.6,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  }
);

// Used by: Document z-plane helper fill.
export const meshBasicWhiteAlpha10NoDepthMaterial = new MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.1,
  depthTest: false,
  depthWrite: false,
  side: DoubleSide,
  toneMapped: false
});

// Used by: ViewCubeHelper depth-only occluder cube.
export const meshBasicInvisibleOccluderMaterial = new MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0,
  depthTest: true,
  depthWrite: true,
  colorWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper solid cube body.
export const meshBasicWhiteAlpha08NoDepthMaterial = new MeshBasicMaterial({
  color: 0xf8fafc,
  transparent: true,
  opacity: 0.08,
  depthTest: false,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper cube edge outline.
export const lineBasicWhiteAlpha65Material = createBasicLineMaterial(0xe5e7eb, {
  transparent: true,
  opacity: 0.65,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper face normal state.
export const meshBasicSlateAlpha42Material = new MeshBasicMaterial({
  color: 0x94a3b8,
  side: DoubleSide,
  transparent: true,
  opacity: 0.42,
  depthTest: true,
  depthWrite: true,
  toneMapped: false
});

// Used by: ViewCubeHelper face hover state.
export const meshBasicSlateAlpha72Material = new MeshBasicMaterial({
  color: 0x94a3b8,
  side: DoubleSide,
  transparent: true,
  opacity: 0.72,
  depthTest: true,
  depthWrite: true,
  toneMapped: false
});

// Used by: ViewCubeHelper face selected state.
export const meshBasicSlateAlpha95Material = new MeshBasicMaterial({
  color: 0x94a3b8,
  side: DoubleSide,
  transparent: true,
  opacity: 0.95,
  depthTest: true,
  depthWrite: true,
  toneMapped: false
});

// Used by: ViewCubeHelper X nub normal state.
export const meshBasicRedAlpha90Material = new MeshBasicMaterial({
  color: 0xff365f,
  transparent: true,
  opacity: 0.9,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper X nub hover state.
export const meshBasicRedAlpha98Material = new MeshBasicMaterial({
  color: 0xff365f,
  transparent: true,
  opacity: 0.98,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper X nub selected state; ViewCubeHelper X arrow locked state.
export const meshBasicRedAlpha100Material = new MeshBasicMaterial({
  color: 0xff365f,
  transparent: true,
  opacity: 1,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper Y nub normal state.
export const meshBasicGreenAlpha90Material = new MeshBasicMaterial({
  color: 0x1fbf6a,
  transparent: true,
  opacity: 0.9,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper Y nub hover state.
export const meshBasicGreenAlpha98Material = new MeshBasicMaterial({
  color: 0x1fbf6a,
  transparent: true,
  opacity: 0.98,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper Y nub selected state; ViewCubeHelper Y arrow locked state.
export const meshBasicGreenAlpha100Material = new MeshBasicMaterial({
  color: 0x1fbf6a,
  transparent: true,
  opacity: 1,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper Z nub normal state.
export const meshBasicBlueAlpha90Material = new MeshBasicMaterial({
  color: 0x2f7bff,
  transparent: true,
  opacity: 0.9,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper Z nub hover state.
export const meshBasicBlueAlpha98Material = new MeshBasicMaterial({
  color: 0x2f7bff,
  transparent: true,
  opacity: 0.98,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper Z nub selected state; ViewCubeHelper Z arrow locked state.
export const meshBasicBlueAlpha100Material = new MeshBasicMaterial({
  color: 0x2f7bff,
  transparent: true,
  opacity: 1,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper X arrow normal state.
export const meshBasicRedAlpha78Material = new MeshBasicMaterial({
  color: 0xff365f,
  transparent: true,
  opacity: 0.78,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper X arrow hover state.
export const meshBasicRedAlpha95Material = new MeshBasicMaterial({
  color: 0xff365f,
  transparent: true,
  opacity: 0.95,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper Y arrow normal state.
export const meshBasicGreenAlpha78Material = new MeshBasicMaterial({
  color: 0x1fbf6a,
  transparent: true,
  opacity: 0.78,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper Y arrow hover state.
export const meshBasicGreenAlpha95Material = new MeshBasicMaterial({
  color: 0x1fbf6a,
  transparent: true,
  opacity: 0.95,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper Z arrow normal state.
export const meshBasicBlueAlpha78Material = new MeshBasicMaterial({
  color: 0x2f7bff,
  transparent: true,
  opacity: 0.78,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper Z arrow hover state.
export const meshBasicBlueAlpha95Material = new MeshBasicMaterial({
  color: 0x2f7bff,
  transparent: true,
  opacity: 0.95,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper muted arrow state when another axis is locked.
export const meshBasicMutedAlpha35Material = new MeshBasicMaterial({
  color: 0x9ca3af,
  transparent: true,
  opacity: 0.35,
  depthTest: true,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper rotate arc tube.
export const meshBasicSlateAlpha70NoDepthMaterial = new MeshBasicMaterial({
  color: 0x94a3b8,
  transparent: true,
  opacity: 0.7,
  depthTest: false,
  depthWrite: false,
  toneMapped: false
});

// Used by: ViewCubeHelper rotate arc arrow head.
export const meshBasicWhiteAlpha90DoubleSidedNoDepthMaterial =
  new MeshBasicMaterial({
    color: 0xe2e8f0,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false
  });

// Used by: ViewCubeHelper X axis label sprite.
export const spriteBadgeXRedMaterial = createViewCubeLabelMaterial(
  "X",
  "#ff365f"
);

// Used by: ViewCubeHelper muted X axis label sprite.
export const spriteBadgeXMutedMaterial = createViewCubeLabelMaterial(
  "X",
  "#9ca3af"
);

// Used by: ViewCubeHelper Y axis label sprite.
export const spriteBadgeYGreenMaterial = createViewCubeLabelMaterial(
  "Y",
  "#1fbf6a"
);

// Used by: ViewCubeHelper muted Y axis label sprite.
export const spriteBadgeYMutedMaterial = createViewCubeLabelMaterial(
  "Y",
  "#9ca3af"
);

// Used by: ViewCubeHelper Z axis label sprite.
export const spriteBadgeZBlueMaterial = createViewCubeLabelMaterial(
  "Z",
  "#2f7bff"
);

// Used by: ViewCubeHelper muted Z axis label sprite.
export const spriteBadgeZMutedMaterial = createViewCubeLabelMaterial(
  "Z",
  "#9ca3af"
);
