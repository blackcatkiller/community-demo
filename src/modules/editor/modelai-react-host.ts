import type {
  CursorType,
  IApplication,
  IDocument,
  IEventHandler,
  INode,
  ISelection,
  IView,
  VisualShapeData,
} from "@modelai/core/types";
import { History } from "@modelai/core/history";
import { Plane, XYZ } from "@modelai/core/math";
import { ModelManager } from "@modelai/model/modelManager";
import { FolderNode, GroupNode } from "@modelai/model/node";
import type { INodeLinkedList } from "@modelai/core";
import { Selection } from "@modelai/selection/selection";
import {
  createDefaultSnapConfig,
  type SnapConfig,
} from "@modelai/selection/snapConfig";
import { ThreeVisual } from "@modelai/viewer/visual";
import { WorkpieceNode } from "@modelai/model/workpieceNode";
import { OccShapeConverter } from "@modelai/occ/converter";
import { convertOccFileInWorker } from "@modelai/occ/occConvertWorkerClient";
import { getInitializedWasm, initWasm } from "@modelai/occ/wasm";
import chiliWasmUrl from "@modelai/occ/wasmAsset";
import type {
  OccConvertedNode,
  OccSourceFormat,
} from "@modelai/occ/convertWorkerTypes";
import { Result } from "@modelai/core/result";

type ModelAIVisualContext = {
  handleNodeChanged(records: Parameters<NonNullable<IDocument["visual"]>["context"]["handleNodeChanged"]>[0]): void;
  resyncDocumentVisuals(): void;
  setVisible?(node: INode, visible: boolean): void;
};

export type ModelAINodeListItem = {
  id: string;
  name: string;
  visible: boolean;
  depth: number;
  kind: "group" | "shape" | "node";
};

function noop() {
  return undefined;
}

function resolveWasmUrl() {
  if (typeof window === "undefined") return chiliWasmUrl;
  return new URL(chiliWasmUrl, window.location.origin).href;
}

const noopEventHandler: IEventHandler = {
  isEnabled: true,
  dispose: noop,
  pointerMove: noop,
  pointerDown: noop,
  pointerUp: noop,
  pointerOut: noop,
  mouseWheel: noop,
  keyDown: noop,
};

class ModelAIReactDocument implements IDocument {
  readonly id = `react-doc-${Date.now().toString(36)}`;
  name = "Community Studio";
  readonly modelManager: ModelManager;
  readonly selection: ISelection;
  readonly history = new History();
  readonly pushPlatePlane = {
    z: Number.NaN,
    helperVisible: false,
    helperWidth: 200,
    helperHeight: 200,
  };
  readonly visual: ThreeVisual;

  constructor(readonly application: ModelAIReactHost) {
    this.modelManager = new ModelManager(this, this.name);
    this.selection = new Selection(this);
    this.visual = new ThreeVisual(this, noopEventHandler);
  }
}

export class ModelAIReactHost implements IApplication {
  readonly document: ModelAIReactDocument;
  readonly snapConfig: SnapConfig = createDefaultSnapConfig();
  readonly converter = new OccShapeConverter();
  activeView: IView | undefined;
  readonly views: IView[] = [];
  private nodeListeners = new Set<(nodes: ModelAINodeListItem[]) => void>();

  constructor() {
    this.document = new ModelAIReactDocument(this);
    this.document.modelManager.addNodeObserver((records) => {
      this.visualContext.handleNodeChanged(records);
      this.emitNodeList();
      this.activeView?.cameraController.fitContent();
      this.activeView?.update();
    });
  }

  private get visualContext() {
    return this.document.visual.context as ModelAIVisualContext;
  }

  getSnapConfigRef() {
    return this.snapConfig;
  }

  mount(viewportContainer: HTMLElement, viewportEl: HTMLElement) {
    if (this.activeView) return this.activeView;

    const view = this.document.visual.createView(
      "main",
      Plane.XY(),
    );
    view.setDom(viewportEl);
    view.setInteractionTargetVisible?.(true);
    this.activeView = view;
    this.views.push(view);

    const maybeThreeView = view as IView & {
      setOverlayHost?: (el?: HTMLElement) => void;
      setViewHelperVisible?: (visible: boolean) => void;
      setViewHelperLocation?: (location: {
        left?: number;
        right?: number;
        top?: number | null;
        bottom?: number;
      }) => void;
    };
    maybeThreeView.setOverlayHost?.(viewportContainer);
    maybeThreeView.setViewHelperVisible?.(true);
    maybeThreeView.setViewHelperLocation?.({
      left: 12,
      bottom: 8,
      top: null,
    });

    this.document.modelManager.rootNode = new FolderNode(this.document.name);
    this.visualContext.resyncDocumentVisuals();
    view.cameraController.fitContent();
    view.update();
    this.emitNodeList();
    return view;
  }

  onNodeListChanged(listener: (nodes: ModelAINodeListItem[]) => void) {
    this.nodeListeners.add(listener);
    listener(this.getNodeList());
    return () => {
      this.nodeListeners.delete(listener);
    };
  }

  private emitNodeList() {
    const nodes = this.getNodeList();
    for (const listener of this.nodeListeners) {
      listener(nodes);
    }
  }

  getNodeList(): ModelAINodeListItem[] {
    const items: ModelAINodeListItem[] = [];
    const walk = (node: INode | undefined, depth: number) => {
      let current = node;
      while (current) {
        items.push({
          id: current.id,
          name: current.name,
          visible: current.visible,
          depth,
          kind:
            current instanceof GroupNode || current instanceof FolderNode
              ? "group"
              : current instanceof WorkpieceNode
                ? "shape"
                : "node",
        });
        const maybeGroup = current as INodeLinkedList;
        if (maybeGroup.firstChild) {
          walk(maybeGroup.firstChild, depth + 1);
        }
        current = current.nextSibling;
      }
    };

    walk(this.document.modelManager.rootNode.firstChild, 0);
    return items;
  }

  private findNode(id: string) {
    return this.document.modelManager.findNodes((node) => node.id === id)[0];
  }

  selectNode(id: string) {
    const node = this.findNode(id);
    if (!node) return;
    this.document.selection.setSelection([node], false);
    this.activeView?.update();
  }

  toggleNodeVisibility(id: string) {
    const node = this.findNode(id);
    if (!node) return;
    node.visible = !node.visible;
    this.visualContext.setVisible?.(node, node.visible);
    this.document.visual.update();
    this.emitNodeList();
  }

  private getFormat(file: File): OccSourceFormat {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "igs" || ext === "iges") return "iges";
    return "step";
  }

  async importFile(file: File) {
    const format = this.getFormat(file);
    await initWasm(resolveWasmUrl());
    getInitializedWasm();
    const data = await file.arrayBuffer();
    const converted = await convertOccFileInWorker(data, format);
    const root = this.createNodesFromConvertedTree(converted, file.name);
    this.document.modelManager.addNode(root);
    this.activeView?.cameraController.fitContent();
    this.activeView?.update();
    this.emitNodeList();
  }

  private createNodesFromConvertedTree(
    converted: OccConvertedNode,
    fallbackName: string,
  ): INode {
    if (converted.type === "shape") {
      const shape = this.converter.convertFromBREP(converted.brep);
      if (!shape.isOk) {
        return new GroupNode(`${converted.name || fallbackName} (failed)`);
      }
      const occShape = shape.value as typeof shape.value & {
        faceColors?: string[];
        shapeColor?: string;
      };
      if (converted.faceColors?.length) occShape.faceColors = converted.faceColors;
      if (converted.shapeColor) occShape.shapeColor = converted.shapeColor;
      return new WorkpieceNode(converted.name || fallbackName, Result.ok(occShape));
    }

    const group = new GroupNode(converted.name || fallbackName);
    for (const child of converted.children) {
      group.add(this.createNodesFromConvertedTree(child, fallbackName));
    }
    return group;
  }

  fitContent() {
    this.activeView?.cameraController.fitContent();
    this.activeView?.update();
  }

  setCameraView(viewName: "front" | "right" | "top" | "iso") {
    const view = this.activeView;
    if (!view) return;
    const target = new XYZ(0, 0, 0);
    const distance = 1200;
    const poses = {
      front: {
        eye: new XYZ(0, -distance, 0),
        up: new XYZ(0, 0, 1),
      },
      right: {
        eye: new XYZ(distance, 0, 0),
        up: new XYZ(0, 0, 1),
      },
      top: {
        eye: new XYZ(0, 0, distance),
        up: new XYZ(0, 1, 0),
      },
      iso: {
        eye: new XYZ(distance, -distance, distance),
        up: new XYZ(0, 0, 1),
      },
    } satisfies Record<string, { eye: XYZ; up: XYZ }>;

    const pose = poses[viewName];
    view.cameraController.lookAt(pose.eye, target, pose.up);
    view.update();
  }

  setSnapEnabled(enabled: boolean) {
    this.snapConfig.enableSnap = enabled;
  }

  dispose() {
    this.document.visual.dispose();
    this.document.modelManager.dispose();
    this.document.history.dispose();
    this.nodeListeners.clear();
    this.activeView = undefined;
    this.views.length = 0;
  }
}

export type ModelAIReactSelection = {
  nodes: INode[];
  shapes: VisualShapeData[];
  cursor?: CursorType;
};
