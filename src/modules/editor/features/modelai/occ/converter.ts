// @ts-nocheck
import { gc, Result, type IDisposable, type Deletable } from "@modelai/core";
import type { INodeLinkedList } from "@modelai/core";
import { GroupNode } from "@modelai/model/node";
import { WorkpieceNode } from "@modelai/model/workpieceNode";
import type { ShapeNode as WasmShapeNode } from "chili-wasm";
import { OccShape } from "./shape";
import { getInitializedWasm } from "./wasm";

export class OccShapeConverter {
  private addShapeNode(
    collector: (d: Deletable | IDisposable) => any,
    parent: INodeLinkedList,
    node: WasmShapeNode,
    children: WasmShapeNode[]
  ) {
    if (node.shape && !node.shape.isNull()) {
      const shape = OccShape.wrap(node.shape) as OccShape;

      // getFaceColors is available in rebuilt WASM; guard for older builds
      const getFaceColors = (node as any).getFaceColors;
      if (typeof getFaceColors === "function") {
        const faceColors: string[] = getFaceColors.call(node);
        if (faceColors && faceColors.length > 0) {
          shape.faceColors = faceColors;
        }
      } else if (node.color) {
        // fallback: apply shape-level uniform color (current WASM supports this)
        shape.shapeColor = node.color as string;
      }

      parent.add(new WorkpieceNode(node.name || "Shape", shape));
    }

    children.forEach(child => {
      collector(child);
      const subChildren = child.getChildren();
      const folder =
        subChildren.length > 1 ? new GroupNode(child.name || "Group") : parent;
      if (subChildren.length > 1) parent.add(folder);
      this.addShapeNode(collector, folder, child, subChildren);
    });
  }

  convertFromSTEP(data: Uint8Array): Result<INodeLinkedList> {
    return this.fromData(data, input =>
      getInitializedWasm().Converter.convertFromStep(input)
    );
  }

  convertFromIGES(data: Uint8Array): Result<INodeLinkedList> {
    return this.fromData(data, input =>
      getInitializedWasm().Converter.convertFromIges(input)
    );
  }

  convertFromBREP(brep: string): Result<import("@modelai/core").IShape> {
    const shape = getInitializedWasm().Converter.convertFromBrep(brep);
    if (shape.isNull()) return Result.err("Cannot convert");
    return Result.ok(OccShape.wrap(shape));
  }

  private fromData(
    data: Uint8Array,
    converter: (data: Uint8Array) => WasmShapeNode | undefined
  ): Result<INodeLinkedList> {
    return gc(c => {
      const node = converter(data);
      if (!node) return Result.err("Cannot convert");
      const folder = new GroupNode("Imported");
      this.addShapeNode(c, folder, node, node.getChildren());
      c(node);
      return Result.ok(folder);
    });
  }
}
