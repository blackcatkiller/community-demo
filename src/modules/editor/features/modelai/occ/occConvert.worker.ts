// @ts-nocheck
/// <reference lib="webworker" />

import type { ShapeNode as WasmShapeNode } from "chili-wasm";
import { initWasm } from "./wasm";
import type {
  OccConvertRequest,
  OccConvertResponse,
  OccConvertedNode
} from "./convertWorkerTypes";

type OccConvertedGroup = Extract<OccConvertedNode, { type: "group" }>;

let readyPromise: Promise<void> | null = null;
let readyWasmUrl: string | null = null;

async function ensureReady(wasmUrl: string) {
  if (!wasmUrl) {
    throw new Error("Worker received an empty WASM URL");
  }

  if (!readyPromise) {
    readyWasmUrl = wasmUrl;
    readyPromise = initWasm(wasmUrl).then(() => undefined);
  } else if (readyWasmUrl && readyWasmUrl !== wasmUrl) {
    throw new Error(
      `Worker WASM is already initialized with a different URL: ${readyWasmUrl}`
    );
  }
  await readyPromise;
}

function toGroup(
  name: string,
  children: OccConvertedNode[]
): OccConvertedGroup {
  return { type: "group", name, children };
}

function toShape(
  name: string,
  brep: string,
  extras?: { faceColors?: string[]; shapeColor?: string }
): OccConvertedNode {
  const node: OccConvertedNode = { type: "shape", name, brep };
  if (extras?.faceColors?.length) node.faceColors = extras.faceColors;
  if (extras?.shapeColor) node.shapeColor = extras.shapeColor;
  return node;
}

function safeDelete(target: unknown) {
  try {
    const deletable = target as { delete?: () => void } | null;
    deletable?.delete?.();
  } catch {
    // ignore cleanup failures
  }
}

function getWorkerConverter() {
  const converter = (globalThis as any).wasm?.Converter as
    | {
        convertFromStep(data: Uint8Array): WasmShapeNode | undefined;
        convertFromIges(data: Uint8Array): WasmShapeNode | undefined;
        convertToBrep(shape: unknown): string;
      }
    | undefined;

  if (!converter) {
    throw new Error(
      `Worker WASM Converter is unavailable at ${self.location.href}`
    );
  }

  return converter;
}

function addShapeNode(
  parent: OccConvertedGroup,
  wasmNode: WasmShapeNode,
  children: WasmShapeNode[]
) {
  const shape = (wasmNode as any).shape as
    | { isNull?: () => boolean }
    | undefined
    | null;
  if (shape && typeof shape.isNull === "function" && !shape.isNull()) {
    const brep = (globalThis as any).wasm.Converter.convertToBrep(shape);

    const getFaceColors = (wasmNode as any).getFaceColors as
      | (() => string[])
      | undefined;
    const faceColors =
      typeof getFaceColors === "function" ? getFaceColors.call(wasmNode) : [];
    const shapeColor =
      !faceColors?.length && (wasmNode as any).color
        ? String((wasmNode as any).color)
        : undefined;

    parent.children.push(
      toShape(wasmNode.name || "Shape", brep, {
        faceColors: faceColors?.length ? faceColors : undefined,
        shapeColor
      })
    );

    safeDelete(shape);
  }

  for (const child of children) {
    const subChildren = child.getChildren();
    if (subChildren.length > 1) {
      const group = toGroup(child.name || "Group", []);
      parent.children.push(group);
      addShapeNode(group, child, subChildren);
    } else {
      addShapeNode(parent, child, subChildren);
    }
    safeDelete(child);
  }
}

function convert(data: Uint8Array, format: "step" | "iges"): OccConvertedGroup {
  const converter = getWorkerConverter();
  const root =
    format === "step"
      ? ((globalThis as any).wasm.Converter.convertFromStep(
          data
        ) as WasmShapeNode | undefined)
      : ((globalThis as any).wasm.Converter.convertFromIges(
          data
        ) as WasmShapeNode | undefined);

  if (!root) {
    throw new Error(`Cannot convert ${format.toUpperCase()}`);
  }

  const outRoot = toGroup("Imported", []);
  const children = root.getChildren();
  addShapeNode(outRoot, root, children);

  safeDelete(root);
  return outRoot;
}

self.onmessage = async (event: MessageEvent<OccConvertRequest>) => {
  const { id, data, format, wasmUrl } = event.data;
  const respond = (payload: OccConvertResponse) => self.postMessage(payload);

  try {
    await ensureReady(wasmUrl);
    const tree = convert(new Uint8Array(data), format);
    respond({ id, ok: true, root: tree });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    respond({ id, ok: false, error: message });
  }
};
