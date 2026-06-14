// @ts-nocheck
import type {
  IApplication,
  IDocument,
  IEventHandler,
  INode,
  IView,
  IVisual,
  PushPlatePlaneObject
} from "@modelai/core/types";
import type { INodeLinkedList } from "@modelai/core";
import { PubSub } from "@modelai/core";
import { History } from "@modelai/core";
import { Logger } from "@modelai/core";
import { Plane, type XYZ } from "@modelai/core/math";
import { ShapeType } from "@modelai/core/types";
import { gc } from "@modelai/core/gc";
import type { IStorage } from "@modelai/core/storage";
import { ModelManager } from "@modelai/model/modelManager";
import { OccShapeConverter } from "@modelai/occ/converter";
import { initWasm } from "@modelai/occ/wasm";
import chiliWasmUrl from "@modelai/occ/wasmAsset";
import { NodeSelectionHandler } from "@modelai/selection/nodeSelectionHandler";
import { Selection } from "@modelai/selection/selection";
import {
  createDefaultSnapConfig,
  type SnapConfig
} from "@modelai/selection/snapConfig";
import type { SnapPointInfo } from "@modelai/selection/snapPointHandler";
import { SnapPointHandler } from "@modelai/selection/snapPointHandler";
import type { SnapResult } from "@modelai/selection/snap";
import { GroupNode, setActiveModelManager } from "@modelai/model/node";
import { WorkpieceNode } from "@modelai/model/workpieceNode";
import { OccShape } from "@modelai/occ";
import type { GraphData } from "@modelai/ui/nodeGraph";
import { ThreeVisual } from "@modelai/viewer/visual";
import { CommandService } from "@modelai/services/commandService";
import { HotkeyService } from "@modelai/services/hotkeyService";
import {
  DEFAULT_SHORTCUT_PROFILE,
  isCancelableCommand
} from "@modelai/command";
import "@modelai/commands";
import { GateEditorService } from "@/features/modelai/gates/shared/gateEditorService";
import {
  disposeDocumentPushPlatePlaneHelper,
  ensureDocumentPushPlatePlane,
  PushPlatePlaneHeightHandleController,
  refreshDocumentPushPlatePlaneHelper
} from "@/features/modelai/gates/shared/globalPushPlatePlane";
import { SelectionControlFormKitBridge } from "@/features/modelai/selection/selectionControlFormKitBridge";
import {
  convertOccFileInWorker,
  disposeOccConvertWorker
} from "../occ/occConvertWorkerClient";
import type {
  OccConvertedNode,
  OccSourceFormat
} from "../occ/convertWorkerTypes";
import { uploadModelFile, type UploadedModelAsset } from "@/api/oss";
import { newImportBlobId } from "@modelai/model/shapeFileOrigin";
import { hydrateWorkpieceShapesFromShapeOrigins } from "@modelai/model/shapeFileOriginHydration";
import { createModelAIStorage } from "../storage/createModelAIStorage";
import { sortRecentDocumentsDesc } from "../storage/recentCatalog";
import {
  InternalClassName,
  MODEL_AI_DB_NAME,
  MODEL_AI_DOCUMENT_TABLE,
  MODEL_AI_DOCUMENT_VERSION,
  MODEL_AI_RECENT_TABLE,
  type PersistedDocument,
  type PersistedRecentDocument
} from "../serialize";
import type { WorkflowMode } from "../workflow/types";

async function yieldToUi() {
  await new Promise<void>(resolve => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

const _WORKFLOW_NODE_SCENE_MAP: Readonly<
  Partial<Record<string, string | string[]>>
> = {
  鏂滅巼鍒嗘瀽: "D01_slope",
  鍒嗗瀷: ["D01_insert_line", "D01_parting_line"],
  婊戝潡: "D01_slider"
};

function createDocumentId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `modelai-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

type ImportedFileOriginContext = {
  format: OccSourceFormat;
  fileName: string;
  uploaded: UploadedModelAsset;
  leafCounter: { n: number };
};

export class ModelAIDocument implements IDocument {
  id: string;
  name: string;
  userData: Record<string, unknown> = {};
  readonly modelManager: ModelManager;
  visual!: IVisual;
  readonly selection: Selection;
  readonly application: ModelAIWorkbenchApp;
  readonly history = new History();
  readonly converter = new OccShapeConverter();
  readonly pushPlatePlane: PushPlatePlaneObject = {
    z: Number.NaN,
    helperVisible: false,
    helperWidth: 200,
    helperHeight: 200
  };

  constructor(
    app: ModelAIWorkbenchApp,
    options?: { id?: string; name?: string }
  ) {
    this.application = app;
    this.id = options?.id ?? createDocumentId();
    this.name = options?.name ?? "ModelAI";
    this.modelManager = new ModelManager(this, this.name);
    this.selection = new Selection(this);
  }

  serialize(): PersistedDocument {
    return {
      [InternalClassName]: "ModelAIDocument",
      version: MODEL_AI_DOCUMENT_VERSION,
      id: this.id,
      name: this.name,
      userData: this.userData,
      models: this.modelManager.serialize()
    };
  }

  async save() {
    const data = this.serialize();
    await this.application.storage.put(
      MODEL_AI_DB_NAME,
      MODEL_AI_DOCUMENT_TABLE,
      this.id,
      data
    );
    const now = Date.now();
    const prev = (await this.application.storage.get(
      MODEL_AI_DB_NAME,
      MODEL_AI_RECENT_TABLE,
      this.id
    )) as PersistedRecentDocument | undefined;
    const createdAt = prev?.createdAt ?? prev?.date ?? now;
    const recent: PersistedRecentDocument = {
      id: this.id,
      name: this.name,
      date: now,
      createdAt,
      updatedAt: now,
      mode: this.application.workflowMode
    };
    if (prev?.image !== undefined) {
      recent.image = prev.image;
    }
    await this.application.storage.put(
      MODEL_AI_DB_NAME,
      MODEL_AI_RECENT_TABLE,
      this.id,
      recent
    );
  }

  static async open(
    application: ModelAIWorkbenchApp,
    id: string
  ): Promise<PersistedDocument | undefined> {
    const data = (await application.storage.get(
      MODEL_AI_DB_NAME,
      MODEL_AI_DOCUMENT_TABLE,
      id
    )) as PersistedDocument | undefined;
    if (!data) {
      Logger.warn(`[ModelAI] document not found: ${id}`);
      return undefined;
    }
    return ModelAIDocument.tryParsePersisted(data);
  }

  /** Returns `data` when version matches; otherwise logs and returns `undefined`. */
  static tryParsePersisted(
    data: PersistedDocument
  ): PersistedDocument | undefined {
    if (data.version !== MODEL_AI_DOCUMENT_VERSION) {
      Logger.warn(
        `[ModelAI] document version mismatch: ${data.version}, expected ${MODEL_AI_DOCUMENT_VERSION}`
      );
      return undefined;
    }
    return data;
  }

  initVisual(viewportContainer: HTMLElement) {
    const handler = new NodeSelectionHandler(
      this,
      viewportContainer,
      undefined,
      undefined,
      true
    );
    this.visual = new ThreeVisual(
      this,
      new PushPlatePlaneHeightHandleController(this, handler)
    );
    this.visual.context.onVisualShapesChanged = () => {
      refreshDocumentPushPlatePlaneHelper(this);
    };
    this.selection.setContainer(viewportContainer);
    this.modelManager.addNodeObserver(records => {
      this.visual.context.handleNodeChanged(records);
      ensureDocumentPushPlatePlane(this, {
        refreshVisual: false
      });
    });
  }

  setPushPlatePlaneHelperVisible(
    visible: boolean,
    options?: { refreshVisual?: boolean }
  ) {
    this.pushPlatePlane.helperVisible = visible;
    if (visible) {
      ensureDocumentPushPlatePlane(this, options);
      return;
    }

    refreshDocumentPushPlatePlaneHelper(this);
    if (options?.refreshVisual !== false) {
      this.visual?.update();
    }
  }

  async importSTEP(
    file: File,
    options?: { skipUpload?: boolean }
  ): Promise<void> {
    const buffer = await file.arrayBuffer();
    let uploaded: UploadedModelAsset | undefined;
    if (!options?.skipUpload) {
      const ext = file.name.match(/\.[^.]+$/i)?.[0] ?? ".stp";
      uploaded = await uploadModelFile(file, {
        fileName: `${this.id}/imports/${newImportBlobId()}${ext}`,
        autoCreateBucket: true,
        withToken: false
      });
    }
    const root = await convertOccFileInWorker(buffer, "step");
    const originCtx = uploaded
      ? {
          format: "step" as const satisfies OccSourceFormat,
          fileName: file.name,
          uploaded,
          leafCounter: { n: 0 }
        }
      : undefined;
    const folder = this.buildImportedFolderFromWorker(
      root,
      file.name,
      originCtx
    );
    this.modelManager.addNode(folder);
    this.visual.update();
  }

  async importIGES(
    file: File,
    options?: { skipUpload?: boolean }
  ): Promise<void> {
    const buffer = await file.arrayBuffer();
    let uploaded: UploadedModelAsset | undefined;
    if (!options?.skipUpload) {
      const ext = file.name.match(/\.[^.]+$/i)?.[0] ?? ".igs";
      uploaded = await uploadModelFile(file, {
        fileName: `${this.id}/imports/${newImportBlobId()}${ext}`,
        autoCreateBucket: true,
        withToken: false
      });
    }
    const root = await convertOccFileInWorker(buffer, "iges");
    const originCtx = uploaded
      ? {
          format: "iges" as const satisfies OccSourceFormat,
          fileName: file.name,
          uploaded,
          leafCounter: { n: 0 }
        }
      : undefined;
    const folder = this.buildImportedFolderFromWorker(
      root,
      file.name,
      originCtx
    );
    this.modelManager.addNode(folder);
    this.visual.update();
  }

  private buildImportedFolderFromWorker(
    root: OccConvertedNode,
    name: string,
    originCtx?: ImportedFileOriginContext
  ) {
    if (root.type !== "group") {
      throw new Error("Invalid worker result: root is not a group");
    }
    const folder = new GroupNode(name || "Imported");
    this.appendWorkerNodes(folder, root.children, originCtx);
    return folder;
  }

  private appendWorkerNodes(
    parent: INodeLinkedList,
    nodes: OccConvertedNode[],
    originCtx?: ImportedFileOriginContext
  ) {
    for (const node of nodes) {
      if (node.type === "group") {
        const group = new GroupNode(node.name || "Group");
        parent.add(group);
        this.appendWorkerNodes(group, node.children, originCtx);
        continue;
      }

      const shapeResult = this.converter.convertFromBREP(node.brep);
      if (!shapeResult.isOk) {
        throw new Error(`Failed to import BREP: ${shapeResult.error}`);
      }
      const shape = shapeResult.value as any;
      if (node.faceColors?.length) shape.faceColors = node.faceColors;
      if (node.shapeColor) shape.shapeColor = node.shapeColor;
      const workpiece = new WorkpieceNode(node.name || "Shape", shape);
      if (originCtx) {
        const idx = originCtx.leafCounter.n;
        workpiece.shapeOrigin = {
          kind: "oss-file",
          format: originCtx.format,
          fileName: originCtx.fileName,
          leafShapeIndex: idx,
          ref: {
            ossPath: originCtx.uploaded.ossPath,
            objectUrl: originCtx.uploaded.objectUrl,
            bucket: originCtx.uploaded.bucket,
            key: originCtx.uploaded.key,
            sizeBytes: originCtx.uploaded.size_bytes,
            contentType: originCtx.uploaded.content_type
          }
        };
        originCtx.leafCounter.n += 1;
      }
      parent.add(workpiece);
    }
  }
}

export class ModelAIWorkbenchApp implements IApplication {
  activeView: IView | undefined;
  readonly views: IView[] = [];
  document: ModelAIDocument;
  readonly storage: IStorage;
  /** Mirrored from the workbench route `mode` for recent-list persistence. */
  workflowMode: WorkflowMode = "dfm";
  executingCommand: any;
  defaultHandler: IEventHandler | undefined;
  onLoadingChange: ((loading: boolean, message: string) => void) | undefined;
  onSnapUpdate: ((info: SnapPointInfo | null) => void) | undefined;
  onSnapPrompt: ((message: string | null) => void) | undefined;
  onGraphChange: ((data: GraphData | null) => void) | undefined;
  onSceneChange: ((sceneKey: string | null) => void) | undefined;

  private readonly snapUpdateListeners = new Set<
    (info: SnapPointInfo | null) => void
  >();
  private readonly snapPromptListeners = new Set<
    (message: string | null) => void
  >();

  private wasmReady = false;
  private defaultProjectLoaded = false;
  private snapHandler: SnapPointHandler | undefined;
  private pickHandler: SnapPointHandler | undefined;
  private pickRestoreHandler: IEventHandler | undefined;
  private pickActive = false;
  private commandActive = false;
  private commandPickCallback:
    | ((result: SnapResult | null) => void)
    | undefined;
  private readonly commandService = new CommandService();
  private readonly hotkeyService = new HotkeyService();
  private readonly gateEditorService = new GateEditorService();
  private readonly selectionControlFormKitBridge =
    new SelectionControlFormKitBridge();
  private drawPointHandler: SnapPointHandler | undefined;
  private drawPointRestoreHandler: IEventHandler | undefined;
  private drawPointActive = false;
  private drawPointCounter = 0;
  private readonly snapConfig: SnapConfig = createDefaultSnapConfig();
  private disposed = false;
  private sceneCache = new Map<string, INode[]>();
  private currentCacheKey: string | null = null;
  private dfmResultRootNodeIds: string[] = [];
  private dfmDetachedRootNodes: INode[] = [];

  constructor(storage: IStorage = createModelAIStorage()) {
    this.storage = storage;
    this.document = new ModelAIDocument(this);
    this.commandService.register(this);
    PubSub.default.sub("commandFinished", this.onCommandFinished);
    this.hotkeyService.addMap(DEFAULT_SHORTCUT_PROFILE.map);

    // Default snap callbacks fan out to any number of UI subscribers.
    // (Both the mesh-snap system and the command-step system call these.)
    this.onSnapUpdate = info => {
      for (const listener of this.snapUpdateListeners) {
        try {
          listener(info ?? null);
        } catch (error) {
          console.error("[ModelAI] onSnapUpdate listener failed:", error);
        }
      }
    };

    this.onSnapPrompt = message => {
      for (const listener of this.snapPromptListeners) {
        try {
          listener(message ?? null);
        } catch (error) {
          console.error("[ModelAI] onSnapPrompt listener failed:", error);
        }
      }
    };
  }

  get currentScene() {
    return this.currentCacheKey;
  }

  getSnapConfigRef() {
    return this.snapConfig;
  }

  showPushPlatePlane() {
    this.document.setPushPlatePlaneHelperVisible(true);
  }

  hidePushPlatePlane() {
    this.document.setPushPlatePlaneHelperVisible(false);
  }

  subscribeSnapUpdate(listener: (info: SnapPointInfo | null) => void) {
    this.snapUpdateListeners.add(listener);
    return () => {
      this.snapUpdateListeners.delete(listener);
    };
  }

  subscribeSnapPrompt(listener: (message: string | null) => void) {
    this.snapPromptListeners.add(listener);
    return () => {
      this.snapPromptListeners.delete(listener);
    };
  }

  isPickingPoint() {
    return this.pickActive;
  }

  isDrawingPoint() {
    return this.drawPointActive;
  }

  isCommandPickingPoint() {
    return this.commandActive;
  }

  private readonly onCommandFinished = (
    commandName: string,
    command: any,
    status: "success" | "cancel" | "fail"
  ) => {
    if (commandName !== "special.commandPick") return;
    const result = status === "success" ? (command?.result ?? null) : null;
    const callback = this.commandPickCallback;
    this.commandPickCallback = undefined;
    this.commandActive = false;
    this.onSnapPrompt?.(null);
    callback?.(result);
  };

  async init() {
    if (this.disposed || this.wasmReady) return;
    this.onLoadingChange?.(true, "Loading...");
    try {
      await initWasm(chiliWasmUrl);
      await this.storage.createDBIfNeeded(MODEL_AI_DB_NAME, [
        MODEL_AI_DOCUMENT_TABLE,
        MODEL_AI_RECENT_TABLE
      ]);
      this.wasmReady = true;
    } finally {
      this.onLoadingChange?.(false, "");
    }
  }

  initView(viewportContainer: HTMLElement, viewportEl: HTMLElement) {
    if (this.disposed) {
      throw new Error("ModelAI workbench has been disposed");
    }
    this.document.initVisual(viewportContainer);
    this.defaultHandler = this.document.visual.eventHandler;
    const view = this.document.visual.createView("Main", Plane.XY());
    view.setDom(viewportEl);
    this.activeView = view;
    this.views.push(view);
    this.commandService.start();
    this.hotkeyService.start();
    PubSub.default.pub("activeViewChanged", view);
    refreshDocumentPushPlatePlaneHelper(this.document);
    requestAnimationFrame(() => {
      view.cameraController.fitContent();
      (view.cameraController as any).storeInitialPose?.();
      view.update();
    });
    return this.defaultHandler;
  }

  async loadDefaultProject() {
    if (this.disposed || this.defaultProjectLoaded) return;
    await this.clearAndImport("D01");
    this.defaultProjectLoaded = true;
  }

  executeCommand(commandKey: string) {
    this.commandService.execute(commandKey);
  }

  async saveActiveDocument() {
    if (this.disposed) return;
    await this.document.save();
  }

  async openDocument(id: string): Promise<ModelAIDocument | undefined> {
    if (this.disposed) return undefined;
    const data = await ModelAIDocument.open(this, id);
    return await this.applyPersistedDocument(data);
  }

  async loadDocument(
    data: PersistedDocument
  ): Promise<ModelAIDocument | undefined> {
    if (this.disposed) return undefined;
    const normalized = ModelAIDocument.tryParsePersisted(data);
    return await this.applyPersistedDocument(normalized);
  }

  async listRecentDocuments(page = 0): Promise<PersistedRecentDocument[]> {
    if (this.disposed) return [];
    const records = await this.storage.page(
      MODEL_AI_DB_NAME,
      MODEL_AI_RECENT_TABLE,
      page
    );
    return sortRecentDocumentsDesc(records as PersistedRecentDocument[]);
  }

  async importFiles(files: File[]) {
    if (this.disposed || !files.length) return;
    this.onLoadingChange?.(true, "Loading...");
    await yieldToUi();
    try {
      for (const file of files) {
        const name = file.name.toLowerCase();
        if (name.endsWith(".step") || name.endsWith(".stp")) {
          await this.document.importSTEP(file);
        } else if (name.endsWith(".iges") || name.endsWith(".igs")) {
          await this.document.importIGES(file);
        }
      }
      this.activeView?.cameraController.fitContent();
      (this.activeView?.cameraController as any)?.storeInitialPose?.();
      this.activeView?.update();
    } finally {
      this.onLoadingChange?.(false, "");
    }
  }

  clearImportedScene() {
    if (this.disposed) return;
    this.stashCurrentScene();
    this.activeView?.cameraController.fitContent();
    this.activeView?.update();
  }

  clearSceneCache() {
    if (this.disposed) return;
    for (const nodes of this.sceneCache.values()) {
      nodes.forEach(node => node.dispose());
    }
    this.sceneCache.clear();
    this.currentCacheKey = null;
    this.onSceneChange?.(this.currentCacheKey);
  }

  setModelSceneVisible(visible: boolean) {
    if (this.disposed) return;
    const root = this.document.modelManager.rootNode;
    let child = root.firstChild;
    while (child) {
      child.visible = visible;
      child = child.nextSibling;
    }
    this.activeView?.update();
  }

  openImportDialog(
    importFiles: (files: File[]) => Promise<void> | void = files =>
      this.importFiles(files)
  ) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".step,.stp,.iges,.igs";
    input.multiple = true;
    input.addEventListener("change", async () => {
      if (!input.files?.length) return;
      await importFiles(Array.from(input.files));
    });
    input.click();
  }

  async importProject(name: string) {
    const response = await fetch(
      `${import.meta.env.BASE_URL}modelai/resource/product_${name}.stp`
    );
    if (!response.ok) {
      throw new Error(`Failed to load model ${name}: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    await this.document.importSTEP(new File([buffer], `product_${name}.stp`), {
      skipUpload: true
    });
    this.activeView?.cameraController.fitContent();
    (this.activeView?.cameraController as any)?.storeInitialPose?.();
    this.activeView?.update();
  }

  getRootNodes() {
    const nodes: INode[] = [];
    let child = this.document.modelManager.rootNode.firstChild;
    while (child) {
      nodes.push(child);
      child = child.nextSibling;
    }
    return nodes;
  }

  hasDfmSceneRoots() {
    return (
      this.getRootNodes().length > 0 || this.dfmDetachedRootNodes.length > 0
    );
  }

  clearDfmResultView() {
    if (this.disposed) return;

    const resultNodeIdSet = new Set(this.dfmResultRootNodeIds);
    if (resultNodeIdSet.size) {
      const resultNodes = this.getRootNodes().filter(node =>
        resultNodeIdSet.has(node.id)
      );
      if (resultNodes.length) {
        this.document.selection.clearSelection();
        this.document.modelManager.rootNode.remove(...resultNodes);
        resultNodes.forEach(node => node.dispose());
      }
    }

    this.dfmResultRootNodeIds = [];
    this.restoreDfmDetachedRootNodes();
    this.activeView?.update();
  }

  showDfmResultGroup(group: INode, options: { detachSource?: boolean } = {}) {
    if (this.disposed) {
      group.dispose();
      return;
    }

    this.clearDfmResultView();
    if (options.detachSource) {
      this.detachCurrentRootNodesForDfmResult();
    }

    this.document.modelManager.addNode(group);
    this.dfmResultRootNodeIds = [group.id];
    this.activeView?.cameraController.fitContent();
    this.activeView?.update();
  }

  setRootNodesVisible(nodeIds: string[], visible: boolean) {
    const nodeIdSet = new Set(nodeIds);
    this.getRootNodes().forEach(node => {
      if (nodeIdSet.has(node.id)) {
        node.visible = visible;
      }
    });
    this.activeView?.update();
  }

  removeRootNodes(nodeIds: string[]) {
    const nodeIdSet = new Set(nodeIds);
    const nodes = this.getRootNodes().filter(node => nodeIdSet.has(node.id));
    if (!nodes.length) return;

    this.document.selection.clearSelection();
    this.document.modelManager.rootNode.remove(...nodes);
    nodes.forEach(node => node.dispose());
    this.activeView?.update();
  }

  detachRootNodes(nodeIds: string[]) {
    const nodeIdSet = new Set(nodeIds);
    const nodes = this.getRootNodes().filter(node => nodeIdSet.has(node.id));
    if (!nodes.length) return [];

    this.document.selection.clearSelection();
    this.document.modelManager.rootNode.remove(...nodes);
    this.activeView?.update();
    return nodes;
  }

  restoreRootNodes(nodes: INode[]) {
    const detachedNodes = nodes.filter(node => !node.parent);
    if (!detachedNodes.length) return;

    this.document.modelManager.addNode(...detachedNodes);
    this.activeView?.update();
  }

  async importProjectResults(names: string | string[]) {
    const beforeIds = new Set(this.getRootNodes().map(node => node.id));
    const list = Array.isArray(names) ? names : [names];
    for (const name of list) {
      await this.importProject(name);
    }
    const added = this.getRootNodes().filter(node => !beforeIds.has(node.id));
    this.activeView?.cameraController.fitContent();
    this.activeView?.update();
    return added;
  }

  async clearAndImport(names: string | string[]) {
    const list = Array.isArray(names) ? names : [names];
    const key = list.join(",");
    if (key === this.currentCacheKey) return;

    this.stashCurrentScene();

    if (this.sceneCache.has(key)) {
      this.restoreFromCache(key);
      return;
    }

    this.onLoadingChange?.(true, "Loading...");
    try {
      for (const name of list) {
        await this.importProject(name);
      }
      this.currentCacheKey = key;
      this.onSceneChange?.(this.currentCacheKey);
    } finally {
      this.onLoadingChange?.(false, "");
    }
  }

  async onVersionLoad(graphData: GraphData, projectName: string) {
    const names = projectName
      .split(",")
      .map(name => name.trim())
      .filter(Boolean);
    await this.clearAndImport(names.length > 1 ? names : projectName);
    this.onGraphChange?.(graphData);
  }

  handleNodeClick(_id: string) {}

  setSnapMode(active: boolean) {
    if (this.disposed || !this.document.visual || !this.defaultHandler) return;
    if (this.commandActive) {
      this.cancelCommandPickPoint();
    }
    if (this.drawPointActive) {
      this.setDrawPointMode(false);
    }
    if (active) {
      this.snapHandler = new SnapPointHandler(
        this.document,
        ShapeType.Edge | ShapeType.Face | ShapeType.Vertex,
        this.snapConfig
      );
      this.snapHandler.onSnapUpdate = info => {
        this.onSnapUpdate?.(info);
      };
      this.document.visual.eventHandler = this.snapHandler;
      return;
    }

    this.snapHandler?.dispose();
    this.snapHandler = undefined;
    this.document.visual.eventHandler = this.defaultHandler;
    this.onSnapUpdate?.(null);
    this.onSnapPrompt?.(null);
  }

  startPickPoint(onPicked: (info: SnapPointInfo | null) => void) {
    if (this.disposed || !this.document.visual || !this.defaultHandler) return;
    if (this.pickActive) return;
    if (this.commandActive) {
      this.cancelCommandPickPoint();
    }
    if (this.drawPointActive) {
      this.setDrawPointMode(false);
    }
    this.pickActive = true;
    this.pickRestoreHandler = this.document.visual.eventHandler;
    this.pickHandler = new SnapPointHandler(
      this.document,
      ShapeType.Edge | ShapeType.Face | ShapeType.Vertex,
      this.snapConfig
    );
    this.pickHandler.onSnapUpdate = info => {
      this.onSnapUpdate?.(info);
    };
    this.pickHandler.onSnapConfirm = info => {
      this.finishPickPoint();
      onPicked(info ?? null);
    };
    this.document.visual.eventHandler = this.pickHandler;
  }

  cancelPickPoint() {
    if (!this.pickActive) return;
    this.finishPickPoint();
  }

  startCommandPickPoint(onPicked: (result: SnapResult | null) => void) {
    if (this.disposed || !this.document.visual || !this.defaultHandler) return;
    if (this.commandActive) return;
    if (this.pickActive) {
      this.cancelPickPoint();
    }
    if (this.drawPointActive) {
      this.setDrawPointMode(false);
    }
    if (this.snapHandler) {
      this.setSnapMode(false);
    }

    this.commandActive = true;
    this.commandPickCallback = onPicked;
    this.executeCommand("special.commandPick");
  }

  cancelCommandPickPoint() {
    if (!this.commandActive) return;
    const current = this.executingCommand;
    if (current && isCancelableCommand(current)) {
      void current.cancel();
    }
  }

  private finishPickPoint() {
    if (!this.pickActive) return;
    this.pickHandler?.dispose();
    this.pickHandler = undefined;
    if (this.pickRestoreHandler) {
      this.document.visual.eventHandler = this.pickRestoreHandler;
    } else if (this.defaultHandler) {
      this.document.visual.eventHandler = this.defaultHandler;
    }
    this.pickRestoreHandler = undefined;
    this.pickActive = false;
    this.onSnapUpdate?.(null);
    this.onSnapPrompt?.(null);
  }

  setDrawPointMode(active: boolean) {
    if (this.disposed || !this.document.visual || !this.defaultHandler) return;
    if (active) {
      if (this.drawPointActive) return;
      if (this.commandActive) {
        this.cancelCommandPickPoint();
      }
      if (this.pickActive) {
        this.cancelPickPoint();
      }
      this.drawPointActive = true;
      this.drawPointRestoreHandler = this.document.visual.eventHandler;
      this.drawPointHandler = new SnapPointHandler(
        this.document,
        ShapeType.Edge | ShapeType.Face | ShapeType.Vertex,
        this.snapConfig
      );
      this.drawPointHandler.onSnapUpdate = info => {
        this.onSnapUpdate?.(info);
      };
      this.drawPointHandler.onSnapConfirm = info => {
        if (!info) return;
        const point = info.precisePoint ?? info.meshPoint;
        this.addPointShape(point);
      };
      this.document.visual.eventHandler = this.drawPointHandler;
      return;
    }

    if (!this.drawPointActive) return;
    this.drawPointHandler?.dispose();
    this.drawPointHandler = undefined;
    if (this.drawPointRestoreHandler) {
      this.document.visual.eventHandler = this.drawPointRestoreHandler;
    } else if (this.defaultHandler) {
      this.document.visual.eventHandler = this.defaultHandler;
    }
    this.drawPointRestoreHandler = undefined;
    this.drawPointActive = false;
    this.onSnapUpdate?.(null);
    this.onSnapPrompt?.(null);
  }

  dispose() {
    if (this.disposed) return;
    this.cancelPickPoint();
    this.cancelCommandPickPoint();
    this.setDrawPointMode(false);
    this.setSnapMode(false);
    this.commandService.stop();
    this.hotkeyService.stop();
    this.gateEditorService.dispose();
    this.selectionControlFormKitBridge.dispose();
    disposeDocumentPushPlatePlaneHelper(this.document);
    disposeOccConvertWorker();
    PubSub.default.remove("commandFinished", this.onCommandFinished);
    this.document.visual?.dispose?.();
    this.document.modelManager.dispose?.();
    this.views.length = 0;
    this.activeView = undefined;
    this.defaultHandler = undefined;
    this.onGraphChange?.(null);
    this.onSceneChange?.(null);
    this.onSnapPrompt?.(null);
    this.snapUpdateListeners.clear();
    this.snapPromptListeners.clear();
    this.disposed = true;
  }

  private addPointShape(point: XYZ) {
    try {
      const shape = gc(collect => {
        const result = collect(
          wasm.ShapeFactory.point({ x: point.x, y: point.y, z: point.z })
        );
        if (!result.isOk) {
          throw new Error(result.error || "Failed to create point");
        }
        if (result.shape.isNull()) {
          throw new Error("Point shape is null");
        }
        return OccShape.wrap(result.shape);
      });
      const node = new WorkpieceNode(`Point_${++this.drawPointCounter}`, shape);
      this.document.modelManager.addNode(node);
      this.document.visual.update();
    } catch (error) {
      console.error("[ModelAI] create point failed:", error);
    }
  }

  private detachCurrentRootNodesForDfmResult() {
    const resultNodeIdSet = new Set(this.dfmResultRootNodeIds);
    const nodeIds = this.getRootNodes()
      .filter(node => !resultNodeIdSet.has(node.id))
      .map(node => node.id);
    this.dfmDetachedRootNodes = this.detachRootNodes(nodeIds);
  }

  private restoreDfmDetachedRootNodes() {
    const detachedNodes = this.dfmDetachedRootNodes.filter(
      node => !node.parent
    );
    this.dfmDetachedRootNodes = [];
    if (!detachedNodes.length) return;

    this.document.modelManager.addNode(...detachedNodes);
  }

  private stashCurrentScene() {
    const root = this.document.modelManager.rootNode;
    const children: INode[] = [];
    let child = root.firstChild;
    while (child) {
      children.push(child);
      child = child.nextSibling;
    }

    this.document.selection.clearSelection();
    if (!children.length) return;

    root.remove(...children);
    if (this.currentCacheKey !== null) {
      this.sceneCache.set(this.currentCacheKey, children);
    } else {
      children.forEach(node => node.dispose());
    }
    this.currentCacheKey = null;
    this.onSceneChange?.(this.currentCacheKey);
  }

  private restoreFromCache(key: string) {
    const nodes = this.sceneCache.get(key);
    if (!nodes) return;
    this.sceneCache.delete(key);
    for (const node of nodes) {
      this.document.modelManager.addNode(node);
    }
    this.currentCacheKey = key;
    this.onSceneChange?.(this.currentCacheKey);
    this.activeView?.cameraController.fitContent();
    this.activeView?.update();
  }

  private async applyPersistedDocument(
    data: PersistedDocument | undefined
  ): Promise<ModelAIDocument | undefined> {
    if (!data) return undefined;
    setActiveModelManager(this.document.modelManager);
    this.cancelPickPoint();
    this.cancelCommandPickPoint();
    this.setDrawPointMode(false);
    this.setSnapMode(false);
    this.clearSceneCache();
    this.document.selection.clearSelection();

    this.document.id = data.id;
    this.document.name = data.name;
    this.document.userData = { ...(data.userData ?? {}) };

    await this.document.modelManager.deserialize(data.models ?? undefined);

    this.onLoadingChange?.(true, "Loading...");
    try {
      await hydrateWorkpieceShapesFromShapeOrigins(this.document.modelManager);
    } finally {
      this.onLoadingChange?.(false, "");
    }

    if (this.document.visual instanceof ThreeVisual) {
      this.document.visual.context.resyncDocumentVisuals();
    }

    this.defaultProjectLoaded = false;
    this.currentCacheKey = null;
    this.onSceneChange?.(this.currentCacheKey);

    requestAnimationFrame(() => {
      refreshDocumentPushPlatePlaneHelper(this.document);
      this.activeView?.cameraController.fitContent();
      (this.activeView?.cameraController as any)?.storeInitialPose?.();
      this.activeView?.update();
    });

    return this.document;
  }
}
