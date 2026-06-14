// @ts-nocheck
import { gc } from "@modelai/core/gc";
import { Result } from "@modelai/core/result";
import type { IShape, ShapeMeshData } from "@modelai/core/types";
import type { XYZ } from "@modelai/core/math";
import { OccShape } from "@modelai/occ/shape";

// Shared shape-building helpers reused by sub gates and horn gates.

// Normalize OCC build results into Result<IShape> and handle null shapes.
export function convertShapeResult(result: any): Result<IShape> {
  let res: Result<IShape>;
  if (!result?.isOk) {
    res = Result.err(result?.error ?? "Shape creation failed");
  } else if (result.shape?.isNull?.()) {
    res = Result.err("Shape is null");
  } else {
    res = Result.ok(OccShape.wrap(result.shape));
  }
  result?.delete?.();
  return res;
}

// Build a straight pipe shell (cone / frustum), preferring OPipeShell and
// falling back to cone generation.
export function createPipeShell(
  r1: number,
  r2: number,
  start: XYZ,
  end: XYZ
): Result<IShape> {
  const direction = end.sub(start).normalize();
  const length = end.sub(start).length();

  if (typeof (wasm as any)?.ShapeBuilderModelAi?.OPipeShell !== "function") {
    return convertShapeResult(
      wasm.ShapeFactory.cone(
        { x: direction.x, y: direction.y, z: direction.z },
        { x: start.x, y: start.y, z: start.z },
        r1,
        r2,
        length
      )
    );
  }

  return gc(collect => {
    const spine = collect(
      (wasm as any).ShapeBuilderModelAi.LineSpine3D(
        start.x,
        start.y,
        start.z,
        end.x,
        end.y,
        end.z
      )
    );
    const shape = (wasm as any).ShapeBuilderModelAi.OPipeShell(r1, r2, spine);
    if (!shape || shape.isNull()) {
      shape?.delete?.();
      return Result.err("OPipeShell failed");
    }
    return Result.ok(OccShape.wrap(shape));
  });
}

// Build a round pipe shell with optional end caps. Fall back to a
// straight pipe shell when the richer API is unavailable.
export function createPipeShellRound(
  r1: number,
  r2: number,
  hasCap1: boolean,
  hasCap2: boolean,
  start: XYZ,
  end: XYZ
): Result<IShape> {
  if (typeof (wasm as any)?.ShapeFactory?.oPipeShellRound === "function") {
    return convertShapeResult(
      (wasm as any).ShapeFactory.oPipeShellRound(
        r1,
        r2,
        hasCap1,
        hasCap2,
        { x: start.x, y: start.y, z: start.z },
        { x: end.x, y: end.y, z: end.z }
      )
    );
  }

  if (
    typeof (wasm as any)?.ShapeBuilderModelAi?.OPipeShellExCaps === "function"
  ) {
    return gc(collect => {
      const spine = collect(
        (wasm as any).ShapeBuilderModelAi.LineSpine3D(
          start.x,
          start.y,
          start.z,
          end.x,
          end.y,
          end.z
        )
      );
      const shape = (wasm as any).ShapeBuilderModelAi.OPipeShellExCaps(
        r1,
        r2,
        hasCap1,
        hasCap2,
        spine
      );
      if (!shape || shape.isNull()) {
        shape?.delete?.();
        return Result.err("OPipeShellExCaps failed");
      }
      return Result.ok(OccShape.wrap(shape));
    });
  }

  return createPipeShell(r1, r2, start, end);
}

// Build a straight U-shaped pipe shell with optional end caps.
export function createPipeShellU(
  w1: number,
  h1: number,
  w2: number,
  h2: number,
  hasCap1: boolean,
  hasCap2: boolean,
  start: XYZ,
  end: XYZ
): Result<IShape> {
  return gc(collect => {
    const lineSpineBuilder = (wasm as any)?.ShapeBuilderModelAi?.LineSpine3D;
    if (typeof lineSpineBuilder !== "function") {
      return Result.err("LineSpine3D not available");
    }

    const spine = collect(
      lineSpineBuilder(start.x, start.y, start.z, end.x, end.y, end.z)
    );

    if (
      typeof (wasm as any)?.ShapeBuilderModelAi?.UPipeShellExCaps === "function"
    ) {
      const shape = (wasm as any).ShapeBuilderModelAi.UPipeShellExCaps(
        w1,
        h1,
        w2,
        h2,
        hasCap1,
        hasCap2,
        spine
      );
      if (!shape || shape.isNull()) {
        shape?.delete?.();
        return Result.err("UPipeShellExCaps failed");
      }
      return Result.ok(OccShape.wrap(shape));
    }

    if (typeof (wasm as any)?.ShapeBuilderModelAi?.UPipeShell === "function") {
      const shape = (wasm as any).ShapeBuilderModelAi.UPipeShell(
        w1,
        h1,
        w2,
        h2,
        spine
      );
      if (!shape || shape.isNull()) {
        shape?.delete?.();
        return Result.err("UPipeShell failed");
      }
      return Result.ok(OccShape.wrap(shape));
    }

    return Result.err("UPipeShell not available");
  });
}

// Build an arc-shaped pipe shell for horn gates. Return an error when
// ArcSpine support is unavailable.
export function createPipeShellArc(
  r1: number,
  r2: number,
  center: XYZ,
  normal: XYZ,
  start: XYZ,
  sweepAngle: number
): Result<IShape> {
  return createPipeShellArcRound(
    r1,
    r2,
    false,
    false,
    center,
    normal,
    start,
    sweepAngle
  );
}

// Build an arc-shaped round pipe shell with optional end caps,
// preferring OPipeShellExCaps and falling back to the basic arc shell.
export function createPipeShellArcRound(
  r1: number,
  r2: number,
  hasCap1: boolean,
  hasCap2: boolean,
  center: XYZ,
  normal: XYZ,
  start: XYZ,
  sweepAngle: number
): Result<IShape> {
  if (typeof (wasm as any)?.ShapeFactory?.oPipeShellRoundArc === "function") {
    return convertShapeResult(
      (wasm as any).ShapeFactory.oPipeShellRoundArc(
        r1,
        r2,
        hasCap1,
        hasCap2,
        { x: center.x, y: center.y, z: center.z },
        { x: normal.x, y: normal.y, z: normal.z },
        { x: start.x, y: start.y, z: start.z },
        sweepAngle
      )
    );
  }

  if (typeof (wasm as any)?.ShapeBuilderModelAi?.ArcSpine !== "function") {
    return Result.err("ArcSpine not available");
  }

  return gc(collect => {
    const spine = collect(
      (wasm as any).ShapeBuilderModelAi.ArcSpine(
        center.x,
        center.y,
        center.z,
        normal.x,
        normal.y,
        normal.z,
        start.x,
        start.y,
        start.z,
        sweepAngle
      )
    );

    if (
      typeof (wasm as any)?.ShapeBuilderModelAi?.OPipeShellExCaps === "function"
    ) {
      const shape = (wasm as any).ShapeBuilderModelAi.OPipeShellExCaps(
        r1,
        r2,
        hasCap1,
        hasCap2,
        spine
      );
      if (!shape || shape.isNull()) {
        shape?.delete?.();
        return Result.err("OPipeShellExCaps failed");
      }
      return Result.ok(OccShape.wrap(shape));
    }

    const shape = (wasm as any).ShapeBuilderModelAi.OPipeShell(r1, r2, spine);
    if (!shape || shape.isNull()) {
      shape?.delete?.();
      return Result.err("OPipeShell failed");
    }
    return Result.ok(OccShape.wrap(shape));
  });
}

// Push the mesh from an IShape into the preview list and dispose the shape
// afterward.
export function pushShapeMesh(result: Result<IShape>, list: ShapeMeshData[]) {
  if (!result.isOk) return;
  const mesh = result.value.mesh;
  if (mesh.faces) list.push(mesh.faces);
  else if (mesh.edges) list.push(mesh.edges);
  result.value.dispose();
}
