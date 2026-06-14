// @ts-nocheck
import type { AsyncController } from "@modelai/core";
import type {
  IDocument,
  INode,
  ShapeType,
  VisualShapeData,
  VisualState
} from "@modelai/core/types";
import type { SnapResult } from "@modelai/selection/snap";
import type { IStep } from "./step";

export type ShapeFilter = (shape: VisualShapeData) => boolean;
export type NodeFilter = (node: INode) => boolean;

export interface SelectShapeOptions {
  multiple?: boolean;
  nodeFilter?: NodeFilter;
  shapeFilter?: ShapeFilter;
  selectedState?: VisualState;
  highlightState?: VisualState;
  keepSelection?: boolean;
}

export interface SelectNodeOptions {
  multiple?: boolean;
  filter?: NodeFilter;
  keepSelection?: boolean;
}

export abstract class SelectStep implements IStep {
  constructor(
    readonly snapType: ShapeType,
    readonly prompt: string,
    readonly options?: SelectShapeOptions
  ) {}

  async execute(
    document: IDocument,
    controller: AsyncController
  ): Promise<SnapResult | undefined> {
    const { shapeType, shapeFilter, nodeFilter } = document.selection as any;
    (document.selection as any).shapeType = this.snapType;
    (document.selection as any).shapeFilter = this.options?.shapeFilter;
    (document.selection as any).nodeFilter = this.options?.nodeFilter;

    if (!this.options?.keepSelection) {
      document.selection.clearSelection();
      document.visual.highlighter.clear();
    }

    try {
      return await this.select(document, controller);
    } finally {
      (document.selection as any).shapeType = shapeType;
      (document.selection as any).shapeFilter = shapeFilter;
      (document.selection as any).nodeFilter = nodeFilter;
    }
  }

  abstract select(
    document: IDocument,
    controller: AsyncController
  ): Promise<SnapResult | undefined>;
}

export class SelectShapeStep extends SelectStep {
  override async select(
    document: IDocument,
    controller: AsyncController
  ): Promise<SnapResult | undefined> {
    const shapes = await document.selection.pickShape(
      this.prompt,
      controller,
      this.options?.multiple === true,
      this.options?.selectedState,
      this.options?.highlightState
    );
    if (shapes.length === 0) return undefined;
    return {
      view: document.application.activeView!,
      shapes,
      nodes: shapes.map(x => x.owner.node)
    };
  }
}

export class SelectNodeStep implements IStep {
  constructor(
    readonly prompt: string,
    readonly options?: SelectNodeOptions
  ) {}

  async execute(
    document: IDocument,
    controller: AsyncController
  ): Promise<SnapResult | undefined> {
    const { nodeFilter } = document.selection as any;
    (document.selection as any).nodeFilter = this.options?.filter;
    if (!this.options?.keepSelection) {
      document.selection.clearSelection();
      document.visual.highlighter.clear();
    }

    try {
      const nodes = await document.selection.pickNode(
        this.prompt,
        controller,
        this.options?.multiple === true
      );
      if (nodes.length === 0) return undefined;
      return {
        view: document.application.activeView!,
        shapes: [],
        nodes
      };
    } finally {
      (document.selection as any).nodeFilter = nodeFilter;
    }
  }
}

export class GetOrSelectNodeStep extends SelectNodeStep {
  override execute(
    document: IDocument,
    controller: AsyncController
  ): Promise<SnapResult | undefined> {
    const selected = document.selection.getSelectedNodes().filter(node => {
      if (this.options?.filter) {
        return this.options.filter(node);
      }
      return true;
    });

    if (selected.length > 0) {
      controller.success();
      return Promise.resolve({
        view: document.application.activeView!,
        shapes: [],
        nodes: selected
      });
    }

    return super.execute(document, controller);
  }
}
