// @ts-nocheck
import type {
  EdgeMeshData,
  FaceMeshData,
  VertexMeshData
} from "@modelai/core/types";
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  type LineBasicMaterial,
  LineSegments,
  type Material,
  Mesh,
  type Object3D,
  Points,
  WireframeGeometry
} from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import {
  faceBasicAmberSolidMaterial,
  faceBasicBlueSolidMaterial,
  faceBasicCreamSolidMaterial,
  faceBasicGoldSolidMaterial,
  faceBasicGreenSolidMaterial,
  faceBasicOrangeSolidMaterial,
  faceBasicOverlayDefaultMaterial,
  faceBasicOverlayEmphasisMaterial,
  faceBasicOverlayGoldMaterial,
  faceBasicOverlayRedMaterial,
  faceBasicRedSolidMaterial,
  faceBasicWhiteSolidMaterial,
  faceLambertDefaultMaterial,
  faceLambertPreviewMaterial,
  faceLambertVertexColorMaterial,
  lineAmberThinMaterial,
  lineBasicDefaultMaterial,
  lineBasicGuideMaterial,
  lineBasicHighlightMaterial,
  lineBasicOverlayDefaultMaterial,
  lineBasicOverlayEmphasisMaterial,
  lineBasicOverlayGoldMaterial,
  lineBasicOverlayRedMaterial,
  lineBasicTemporaryMaterial,
  lineBasicTrackingMaterial,
  lineBlueDashedMaterial,
  lineBlueThinMaterial,
  lineBlueMediumMaterial,
  lineCreamThinMaterial,
  lineCyanThinMaterial,
  lineDefaultThinMaterial,
  lineEmphasisDashedMaterial,
  lineEmphasisThinMaterial,
  lineEmphasisWideMaterial,
  lineGoldThinMaterial,
  lineGreenThinMaterial,
  lineGuideDashedMaterial,
  lineGuideWideMaterial,
  lineHighlightWideMaterial,
  lineMagentaThinMaterial,
  lineOrangeThinMaterial,
  lineRedThinMaterial,
  lineSelectedWideMaterial,
  lineSnapWideMaterial,
  lineTemporaryDashedMaterial,
  lineTemporaryThinMaterial,
  lineTemporaryWideMaterial,
  lineTrackingDashedMaterial,
  lineWhiteDashedMaterial,
  lineWhiteThinMaterial,
  lineWhiteMediumMaterial,
  lineYellowThinMaterial,
  meshBasicBlackSolidMaterial,
  meshBasicBlackNoDepthMaterial,
  pointAmberSmallAlwaysMaterial,
  pointCreamSmallAlwaysMaterial,
  pointCyanSmallAlwaysMaterial,
  pointDefaultMaterial,
  pointEmphasisAlwaysMaterial,
  pointEmphasisOnTopMaterial,
  pointGoldSmallAlwaysMaterial,
  pointHighlightMaterial,
  pointHintAlwaysMaterial,
  pointMagentaSmallAlwaysMaterial,
  pointNeutralLargeAlwaysMaterial,
  pointOrangeSmallAlwaysMaterial,
  pointSelectedMaterial,
  pointSnapMaterial,
  pointTemporaryAlwaysMaterial,
  pointTemporaryOnTopMaterial,
  pointTrackingAlwaysMaterial,
  pointWhiteLargeAlwaysMaterial,
  pointWhiteSmallAlwaysMaterial,
  pointYellowSmallAlwaysMaterial
} from "./materials";

type TempMaterialVariants = {
  normal: Material;
  emphasized: Material;
};

export class ThreeGeometryFactory {
  static createFaceDisplayMaterial(data: { color?: number | number[] }) {
    if (Array.isArray(data.color) && data.color.length > 0) {
      return {
        material: faceLambertVertexColorMaterial,
        owned: false
      } as const;
    }
    return { material: faceLambertDefaultMaterial, owned: false } as const;
  }

  static createVertexGeometry(data: VertexMeshData) {
    const buff = ThreeGeometryFactory.createVertexBufferGeometry(data);
    const variants = ThreeGeometryFactory.resolveVertexMaterialVariants(data);
    const points = new Points(buff, variants.normal);
    ThreeGeometryFactory.attachTempMaterialVariants(points, variants);
    if (data.alwaysOnTop) {
      points.renderOrder = 999;
    }
    return points;
  }

  static createEdgeGeometry(data: EdgeMeshData) {
    const buff = ThreeGeometryFactory.createEdgeBufferGeometry(data);
    const variants = ThreeGeometryFactory.resolveEdgeMaterialVariants(data);
    const line = new LineSegments2(
      buff,
      variants.normal
    ).computeLineDistances();
    ThreeGeometryFactory.attachTempMaterialVariants(line, variants);
    return line;
  }

  static createFaceGeometry(
    data: FaceMeshData,
    opacity?: number,
    depthTest?: boolean
  ) {
    const buff = ThreeGeometryFactory.createFaceBufferGeometry(data);
    const variants = ThreeGeometryFactory.resolveFaceMaterialVariants(
      data,
      opacity,
      depthTest
    );
    ThreeGeometryFactory.setColor(buff, data, variants.normal);

    const mesh = new Mesh(buff, variants.normal);
    ThreeGeometryFactory.attachTempMaterialVariants(mesh, variants);
    if (depthTest !== false) return mesh;

    // Overlay mode keeps the contact area readable even when it is occluded.
    mesh.renderOrder = 999;
    const wireVariants =
      ThreeGeometryFactory.resolveOverlayWireMaterialVariants(data);

    const wire = new LineSegments(
      new WireframeGeometry(buff),
      wireVariants.normal as LineBasicMaterial
    );
    ThreeGeometryFactory.attachTempMaterialVariants(wire, wireVariants);
    wire.renderOrder = 1000;

    const group = new Group();
    group.add(mesh, wire);
    return group;
  }

  static createFaceBufferGeometry(data: {
    position: Float32Array;
    normal: Float32Array;
    uv: Float32Array;
    index?: Uint32Array;
  }) {
    const buff = new BufferGeometry();
    buff.setAttribute("position", new BufferAttribute(data.position, 3));
    buff.setAttribute("normal", new BufferAttribute(data.normal, 3));
    buff.setAttribute("uv", new BufferAttribute(data.uv, 2));
    if (data.index && data.index.length > 0)
      buff.setIndex(new BufferAttribute(data.index, 1));
    buff.computeBoundingBox();
    return buff;
  }

  static createEdgeBufferGeometry(data: EdgeMeshData) {
    const buff = new LineSegmentsGeometry();
    buff.setPositions(data.position);
    buff.computeBoundingBox();
    return buff;
  }

  static createVertexBufferGeometry(data: VertexMeshData) {
    const buff = new BufferGeometry();
    buff.setAttribute("position", new BufferAttribute(data.position, 3));
    buff.computeBoundingBox();
    return buff;
  }

  static resolveFaceMaterialVariants(
    data: { color?: number | number[] },
    opacity?: number,
    depthTest?: boolean
  ): TempMaterialVariants {
    if (Array.isArray(data.color) && data.color.length > 0) {
      return {
        normal: faceLambertVertexColorMaterial,
        emphasized: faceLambertVertexColorMaterial
      };
    }

    const color = typeof data.color === "number" ? data.color : undefined;
    if (depthTest === false) {
      switch (color) {
        case 0x000000:
          return {
            normal: meshBasicBlackNoDepthMaterial,
            emphasized: meshBasicBlackNoDepthMaterial
          };
        case 0xff4400:
          return {
            normal: faceBasicOverlayRedMaterial,
            emphasized: faceBasicOverlayEmphasisMaterial
          };
        case 0xffcc00:
          return {
            normal: faceBasicOverlayGoldMaterial,
            emphasized: faceBasicOverlayEmphasisMaterial
          };
        case undefined:
          return {
            normal: faceBasicOverlayDefaultMaterial,
            emphasized: faceBasicOverlayEmphasisMaterial
          };
        default:
          return {
            normal: faceBasicOverlayDefaultMaterial,
            emphasized: faceBasicOverlayEmphasisMaterial
          };
      }
    }

    if (opacity === undefined || opacity >= 1) {
      switch (color) {
        case 0xff4444:
          return {
            normal: faceBasicRedSolidMaterial,
            emphasized: faceBasicWhiteSolidMaterial
          };
        case 0x44cc44:
          return {
            normal: faceBasicGreenSolidMaterial,
            emphasized: faceBasicWhiteSolidMaterial
          };
        case 0x4488ff:
          return {
            normal: faceBasicBlueSolidMaterial,
            emphasized: faceBasicWhiteSolidMaterial
          };
        case 0x000000:
          return {
            normal: meshBasicBlackSolidMaterial,
            emphasized: meshBasicBlackSolidMaterial
          };
        case 0xffffff:
          return {
            normal: faceBasicWhiteSolidMaterial,
            emphasized: faceBasicWhiteSolidMaterial
          };
        case 0xf3eadb:
          return {
            normal: faceBasicCreamSolidMaterial,
            emphasized: faceBasicWhiteSolidMaterial
          };
        case 0xff6600:
          return {
            normal: faceBasicOrangeSolidMaterial,
            emphasized: faceBasicWhiteSolidMaterial
          };
        case 0xff8800:
          return {
            normal: faceBasicAmberSolidMaterial,
            emphasized: faceBasicWhiteSolidMaterial
          };
        case 0xffcc00:
          return {
            normal: faceBasicGoldSolidMaterial,
            emphasized: faceBasicWhiteSolidMaterial
          };
      }
      return {
        normal: faceLambertDefaultMaterial,
        emphasized: faceLambertDefaultMaterial
      };
    }

    return {
      normal: faceLambertPreviewMaterial,
      emphasized: faceLambertPreviewMaterial
    };
  }

  static setColor(
    geometry: BufferGeometry | LineSegmentsGeometry | undefined,
    data: { color?: number | number[] },
    material: any
  ) {
    if (Array.isArray(data.color) && geometry && "setAttribute" in geometry) {
      (geometry as BufferGeometry).setAttribute(
        "color",
        new BufferAttribute(new Float32Array(data.color), 3)
      );
      material.vertexColors = true;
    }
  }

  private static resolveOverlayWireMaterialVariants(data: {
    color?: number | number[];
  }): TempMaterialVariants {
    if (typeof data.color === "number") {
      switch (data.color) {
        case 0xff4400:
          return {
            normal: lineBasicOverlayRedMaterial,
            emphasized: lineBasicOverlayEmphasisMaterial
          };
        case 0xffcc00:
          return {
            normal: lineBasicOverlayGoldMaterial,
            emphasized: lineBasicOverlayEmphasisMaterial
          };
      }
    }
    return {
      normal: lineBasicOverlayDefaultMaterial,
      emphasized: lineBasicOverlayEmphasisMaterial
    };
  }

  private static resolveVertexMaterialVariants(
    data: VertexMeshData
  ): TempMaterialVariants {
    const color = typeof data.color === "number" ? data.color : undefined;
    if (data.alwaysOnTop) {
      if (
        color === pointTemporaryAlwaysMaterial.color.getHex() &&
        data.size === pointTemporaryOnTopMaterial.size
      ) {
        return {
          normal: pointTemporaryOnTopMaterial,
          emphasized: pointEmphasisOnTopMaterial
        };
      }
    }

    switch (color) {
      case undefined:
        return {
          normal: pointDefaultMaterial,
          emphasized: pointDefaultMaterial
        };
      case 0xaaaaaa:
        return {
          normal: pointNeutralLargeAlwaysMaterial,
          emphasized: pointWhiteLargeAlwaysMaterial
        };
      case 0xffffff:
        if (data.size === 10) {
          return {
            normal: pointWhiteLargeAlwaysMaterial,
            emphasized: pointWhiteLargeAlwaysMaterial
          };
        }
        return {
          normal: pointWhiteSmallAlwaysMaterial,
          emphasized: pointWhiteSmallAlwaysMaterial
        };
      case 0xdddd00:
        return {
          normal: pointYellowSmallAlwaysMaterial,
          emphasized: pointWhiteSmallAlwaysMaterial
        };
      case 0x00dddd:
        return {
          normal: pointCyanSmallAlwaysMaterial,
          emphasized: pointWhiteSmallAlwaysMaterial
        };
      case 0xdd44dd:
        return {
          normal: pointMagentaSmallAlwaysMaterial,
          emphasized: pointWhiteSmallAlwaysMaterial
        };
      case 0xf3eadb:
        return {
          normal: pointCreamSmallAlwaysMaterial,
          emphasized: pointWhiteSmallAlwaysMaterial
        };
      case 0xff6600:
        return {
          normal: pointOrangeSmallAlwaysMaterial,
          emphasized: pointWhiteSmallAlwaysMaterial
        };
      case 0xff8800:
        return {
          normal: pointAmberSmallAlwaysMaterial,
          emphasized: pointWhiteSmallAlwaysMaterial
        };
      case 0xffcc00:
        return {
          normal: pointGoldSmallAlwaysMaterial,
          emphasized: pointWhiteSmallAlwaysMaterial
        };
      default:
        if (color === pointDefaultMaterial.color.getHex() && data.size === 3) {
          return {
            normal: pointDefaultMaterial,
            emphasized: pointDefaultMaterial
          };
        }
        if (
          color === pointHighlightMaterial.color.getHex() &&
          data.size === 5
        ) {
          return {
            normal: pointHighlightMaterial,
            emphasized: pointHighlightMaterial
          };
        }
        if (color === pointSnapMaterial.color.getHex() && data.size === 5) {
          return {
            normal: pointSnapMaterial,
            emphasized: pointSnapMaterial
          };
        }
        if (color === pointSelectedMaterial.color.getHex() && data.size === 5) {
          return {
            normal: pointSelectedMaterial,
            emphasized: pointSelectedMaterial
          };
        }
        if (
          color === pointHintAlwaysMaterial.color.getHex() &&
          data.size === pointHintAlwaysMaterial.size
        ) {
          return {
            normal: pointHintAlwaysMaterial,
            emphasized: pointHintAlwaysMaterial
          };
        }
        if (
          color === pointTrackingAlwaysMaterial.color.getHex() &&
          data.size === pointTrackingAlwaysMaterial.size
        ) {
          return {
            normal: pointTrackingAlwaysMaterial,
            emphasized: pointTrackingAlwaysMaterial
          };
        }
        if (
          color === pointTemporaryAlwaysMaterial.color.getHex() &&
          data.size === pointTemporaryAlwaysMaterial.size
        ) {
          return {
            normal: pointTemporaryAlwaysMaterial,
            emphasized: pointEmphasisAlwaysMaterial
          };
        }
        return {
          normal: pointDefaultMaterial,
          emphasized: pointDefaultMaterial
        };
    }
  }

  private static resolveEdgeMaterialVariants(
    data: EdgeMeshData
  ): TempMaterialVariants {
    const color = typeof data.color === "number" ? data.color : undefined;
    const lineWidth = data.lineWidth ?? 1;
    const isDash = data.lineType === "dash";

    if (isDash) {
      if (color === lineBlueDashedMaterial.color.getHex() && lineWidth === 1) {
        return {
          normal: lineBlueDashedMaterial,
          emphasized: lineBlueDashedMaterial
        };
      }
      if (color === lineGuideWideMaterial.color.getHex() && lineWidth === 2) {
        return {
          normal: lineGuideDashedMaterial,
          emphasized: lineEmphasisDashedMaterial
        };
      }
      if (
        color === lineTrackingDashedMaterial.color.getHex() &&
        lineWidth === 1
      ) {
        return {
          normal: lineTrackingDashedMaterial,
          emphasized: lineTrackingDashedMaterial
        };
      }
      if (
        color === lineTemporaryDashedMaterial.color.getHex() &&
        lineWidth === 1
      ) {
        return {
          normal: lineTemporaryDashedMaterial,
          emphasized: lineEmphasisDashedMaterial
        };
      }
      if (color === lineWhiteDashedMaterial.color.getHex() && lineWidth === 1) {
        return {
          normal: lineWhiteDashedMaterial,
          emphasized: lineWhiteDashedMaterial
        };
      }
      return {
        normal: lineDefaultThinMaterial,
        emphasized: lineDefaultThinMaterial
      };
    }

    switch (color) {
      case undefined:
        return {
          normal: lineDefaultThinMaterial,
          emphasized: lineDefaultThinMaterial
        };
      case 0xff4444:
        return {
          normal: lineRedThinMaterial,
          emphasized: lineWhiteThinMaterial
        };
      case 0x44cc44:
        return {
          normal: lineGreenThinMaterial,
          emphasized: lineWhiteThinMaterial
        };
      case 0x4488ff:
        if (lineWidth === 2) {
          return {
            normal: lineBlueMediumMaterial,
            emphasized: lineWhiteMediumMaterial
          };
        }
        return {
          normal: lineBlueThinMaterial,
          emphasized: lineWhiteThinMaterial
        };
      case 0xdddd00:
        return {
          normal: lineYellowThinMaterial,
          emphasized: lineWhiteThinMaterial
        };
      case 0x00dddd:
        return {
          normal: lineCyanThinMaterial,
          emphasized: lineWhiteThinMaterial
        };
      case 0xdd44dd:
        return {
          normal: lineMagentaThinMaterial,
          emphasized: lineWhiteThinMaterial
        };
      case 0xffffff:
        if (lineWidth === 2) {
          return {
            normal: lineWhiteMediumMaterial,
            emphasized: lineWhiteMediumMaterial
          };
        }
        return {
          normal: lineWhiteThinMaterial,
          emphasized: lineWhiteThinMaterial
        };
      case 0xf3eadb:
        return {
          normal: lineCreamThinMaterial,
          emphasized: lineWhiteThinMaterial
        };
      case 0xff6600:
        return {
          normal: lineOrangeThinMaterial,
          emphasized: lineWhiteThinMaterial
        };
      case 0xff8800:
        return {
          normal: lineAmberThinMaterial,
          emphasized: lineWhiteThinMaterial
        };
      case 0xffcc00:
        return {
          normal: lineGoldThinMaterial,
          emphasized: lineWhiteThinMaterial
        };
      default:
        if (
          color === lineDefaultThinMaterial.color.getHex() &&
          lineWidth === 1
        ) {
          return {
            normal: lineDefaultThinMaterial,
            emphasized: lineDefaultThinMaterial
          };
        }
        if (
          color === lineHighlightWideMaterial.color.getHex() &&
          lineWidth === 3
        ) {
          return {
            normal: lineHighlightWideMaterial,
            emphasized: lineEmphasisWideMaterial
          };
        }
        if (color === lineSnapWideMaterial.color.getHex() && lineWidth === 3) {
          return {
            normal: lineSnapWideMaterial,
            emphasized: lineSnapWideMaterial
          };
        }
        if (
          color === lineSelectedWideMaterial.color.getHex() &&
          lineWidth === 3
        ) {
          return {
            normal: lineSelectedWideMaterial,
            emphasized: lineSelectedWideMaterial
          };
        }
        if (color === lineGuideWideMaterial.color.getHex() && lineWidth === 3) {
          return {
            normal: lineGuideWideMaterial,
            emphasized: lineEmphasisWideMaterial
          };
        }
        if (
          color === lineTemporaryThinMaterial.color.getHex() &&
          lineWidth === 1
        ) {
          return {
            normal: lineTemporaryThinMaterial,
            emphasized: lineEmphasisThinMaterial
          };
        }
        if (
          color === lineTemporaryWideMaterial.color.getHex() &&
          lineWidth === 3
        ) {
          return {
            normal: lineTemporaryWideMaterial,
            emphasized: lineEmphasisWideMaterial
          };
        }
        return {
          normal: lineDefaultThinMaterial,
          emphasized: lineDefaultThinMaterial
        };
    }
  }

  private static attachTempMaterialVariants(
    object: Object3D,
    variants: TempMaterialVariants
  ) {
    object.userData.tempMaterialVariants = variants;
  }

  static resolveBasicEdgeMaterial(color?: number) {
    switch (color) {
      case undefined:
        return lineBasicDefaultMaterial;
      case 0xff4400:
        return lineBasicOverlayRedMaterial;
      case 0xffcc00:
        return lineBasicOverlayGoldMaterial;
      default:
        if (color === lineBasicDefaultMaterial.color.getHex()) {
          return lineBasicDefaultMaterial;
        }
        if (color === lineBasicHighlightMaterial.color.getHex()) {
          return lineBasicHighlightMaterial;
        }
        if (color === lineBasicGuideMaterial.color.getHex()) {
          return lineBasicGuideMaterial;
        }
        if (color === lineBasicTrackingMaterial.color.getHex()) {
          return lineBasicTrackingMaterial;
        }
        if (color === lineBasicTemporaryMaterial.color.getHex()) {
          return lineBasicTemporaryMaterial;
        }
        return lineBasicDefaultMaterial;
    }
  }
}
