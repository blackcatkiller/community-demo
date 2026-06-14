// @ts-nocheck
import { i18n, transformI18n } from "@/plugins/i18n";
import { refreshDocumentPushPlatePlaneHelper } from "@/features/modelai/gates/shared/globalPushPlatePlane";
import {
  type BoundingBox,
  BoundingBoxUtils,
  Matrix4,
  XYZ
} from "@modelai/core/math";
import type { IDocument, INode, INodeLinkedList } from "@modelai/core/types";
import { command } from "@modelai/command";
import { registerVerticalRunnerGateNode } from "@modelai/gates/shared/verticalRunnerGateRegistry";
import { HornGateNode } from "@/features/modelai/gates/horn/hornGate";
import { HotTipGateNode } from "@/features/modelai/gates/hotTip/hotTipGate";
import { HorizontalRunnerNode } from "@/features/modelai/gates/horizontalRunner/horizontalRunner";
import { LargeGateNode } from "@/features/modelai/gates/large/largeGate";
import { PartingRunnerNode } from "@/features/modelai/gates/partingRunner/partingRunner";
import { PinPointGateNode } from "@/features/modelai/gates/pinPoint/pinPointGate";
import { VerticalRunnerNode } from "@/features/modelai/gates/verticalRunner/verticalRunner";
import { PointVerticalRunnerNode } from "@/features/modelai/gates/pointVerticalRunner/pointVerticalRunner";
import { GroupNode } from "@modelai/model/node";
import {
  bindShapeReference,
  GeometryNode,
  ShapeNode
} from "@modelai/model/shapeNode";
import {
  copyWorkpieceShapeOrigin,
  WorkpieceNode
} from "@modelai/model/workpieceNode";
import { SubGateNode } from "@/features/modelai/gates/sub/subGate";
import type { SnapResult } from "@modelai/selection/snap";
import { GetOrSelectNodeStep, type IStep } from "@modelai/step";
import { mountFormKit } from "@modelai/ui/formKit/mount";
import type { AsyncController } from "@modelai/core";
import { Result } from "@modelai/core/result";
import { resolveRunnerNodeRootTypeGroup } from "@/features/modelai/gates/shared/runnerGroup";
import type {
  ModelArrayCopyFormPreset,
  ModelArrayCopyParams
} from "./modelArrayCopySchema";
import {
  getRememberedModelArrayCopyParams,
  ModelArrayCopyFormSession,
  normalizeModelArrayCopyParams,
  rememberModelArrayCopyParams
} from "./modelArrayCopySchema";
import { MultistepCommand } from "../../multistepCommand";

function formatMessage(key: string, ...args: Array<string | number>) {
  const translate = i18n.global.t as (
    messageKey: string,
    values?: Array<string | number>
  ) => string;
  return translate(key, args);
}

async function yieldToUi() {
  await new Promise<void>(resolve => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

type LoadingBridge = {
  onLoadingChange?: (loading: boolean, message: string) => void;
};

type LinearArrayOffset = {
  x: number;
  y: number;
};

type RotationAxis = "x" | "y";

type ArrayInsertionGroup = {
  parent?: INodeLinkedList;
  anchor?: INode;
  models: GeometryNode[];
};

type PendingInsertGroup = {
  parent: INodeLinkedList;
  nodes: INode[];
};

type TransformEntry = {
  source: GeometryNode;
  transform: Matrix4;
};

type ReferenceCopyPlan = {
  wrapSelection: boolean;
  groupParentKey?: INodeLinkedList;
  groupName: string;
};

const BATCHED_INSERT_THRESHOLD = 200;
const BATCHED_INSERT_CHUNK_SIZE = 200;

function buildLinearOffsets(
  params: ModelArrayCopyParams,
  models: GeometryNode[]
): LinearArrayOffset[] {
  const offsets: LinearArrayOffset[] = [];
  const boundingBox = getEntriesBoundingBox(createInitialEntries(models));
  const stepX =
    (boundingBox ? boundingBox.max.x - boundingBox.min.x : 0) +
    params.linearSpacingX;
  const stepY =
    (boundingBox ? boundingBox.max.y - boundingBox.min.y : 0) +
    params.linearSpacingY;

  for (let y = 0; y < params.linearCountY; y++) {
    for (let x = 0; x < params.linearCountX; x++) {
      if (x === 0 && y === 0) continue;
      offsets.push({
        x: x * stepX,
        y: y * stepY
      });
    }
  }

  return offsets;
}

function getGeometryPositions(model: GeometryNode) {
  let points = model.mesh.faces?.position;
  if (!points || points.length === 0) {
    points = model.mesh.edges?.position;
  }
  return points;
}

function getEntryBoundingBox(entry: TransformEntry): BoundingBox | undefined {
  const points = getGeometryPositions(entry.source);
  if (!points || points.length === 0) return undefined;
  return BoundingBoxUtils.fromNumbers(entry.transform.ofPoints(points));
}

function mergeBoundingBoxes(boxes: BoundingBox[]): BoundingBox | undefined {
  if (boxes.length === 0) return undefined;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const box of boxes) {
    minX = Math.min(minX, box.min.x);
    minY = Math.min(minY, box.min.y);
    minZ = Math.min(minZ, box.min.z);
    maxX = Math.max(maxX, box.max.x);
    maxY = Math.max(maxY, box.max.y);
    maxZ = Math.max(maxZ, box.max.z);
  }

  return {
    min: new XYZ(minX, minY, minZ),
    max: new XYZ(maxX, maxY, maxZ)
  };
}

function getEntriesBoundingBox(
  entries: TransformEntry[]
): BoundingBox | undefined {
  const boxes = entries
    .map(entry => getEntryBoundingBox(entry))
    .filter((box): box is BoundingBox => box !== undefined);
  return mergeBoundingBoxes(boxes);
}

function getBoundingBoxCenter(box: BoundingBox) {
  return new XYZ(
    (box.min.x + box.max.x) * 0.5,
    (box.min.y + box.max.y) * 0.5,
    (box.min.z + box.max.z) * 0.5
  );
}

function getBoundingBoxAxisSize(box: BoundingBox, axis: RotationAxis) {
  return axis === "x" ? box.max.x - box.min.x : box.max.y - box.min.y;
}

function getTranslatedEntries(
  entries: TransformEntry[],
  x: number,
  y: number
): TransformEntry[] {
  const translation = Matrix4.fromTranslation(x, y, 0);
  return entries.map(entry => ({
    source: entry.source,
    transform: translation.multiply(entry.transform)
  }));
}

function buildLinearEntryGroups(
  models: GeometryNode[],
  offsets: LinearArrayOffset[]
): TransformEntry[][] {
  const baseEntries = createInitialEntries(models);
  return offsets.map(offset =>
    getTranslatedEntries(baseEntries, offset.x, offset.y)
  );
}

function getRotatedEntries(
  entries: TransformEntry[],
  center: XYZ,
  radians: number
): TransformEntry[] {
  const rotation = Matrix4.fromAxisRad(center, { x: 0, y: 0, z: 1 }, radians);
  return entries.map(entry => ({
    source: entry.source,
    transform: rotation.multiply(entry.transform)
  }));
}

function getRotatedEntryGroups(
  groups: TransformEntry[][],
  center: XYZ,
  radians: number
): TransformEntry[][] {
  return groups.map(group => getRotatedEntries(group, center, radians));
}

function getTranslatedEntryGroups(
  groups: TransformEntry[][],
  x: number,
  y: number
): TransformEntry[][] {
  return groups.map(group => getTranslatedEntries(group, x, y));
}

function buildRotationRoundEntries(
  entries: TransformEntry[],
  spacing: number,
  axis: RotationAxis
): TransformEntry[] {
  const currentBox = getEntriesBoundingBox(entries);
  if (!currentBox) return [];

  const rotationCenter = getBoundingBoxCenter(currentBox);
  const rotatedEntries = getRotatedEntries(entries, rotationCenter, Math.PI);
  const rotatedBox = getEntriesBoundingBox(rotatedEntries);
  if (!rotatedBox) return [];

  const distance = getBoundingBoxAxisSize(rotatedBox, axis) + spacing;
  return axis === "x"
    ? getTranslatedEntries(rotatedEntries, distance, 0)
    : getTranslatedEntries(rotatedEntries, 0, distance);
}

function buildRotationRoundEntryGroups(
  groups: TransformEntry[][],
  spacing: number,
  axis: RotationAxis
): TransformEntry[][] {
  const currentEntries = groups.flat();
  const currentBox = getEntriesBoundingBox(currentEntries);
  if (!currentBox) return [];

  const rotationCenter = getBoundingBoxCenter(currentBox);
  const rotatedGroups = getRotatedEntryGroups(groups, rotationCenter, Math.PI);
  const rotatedBox = getEntriesBoundingBox(rotatedGroups.flat());
  if (!rotatedBox) return [];

  const distance = getBoundingBoxAxisSize(rotatedBox, axis) + spacing;
  return axis === "x"
    ? getTranslatedEntryGroups(rotatedGroups, distance, 0)
    : getTranslatedEntryGroups(rotatedGroups, 0, distance);
}

function buildCornerRoundEntries(
  entries: TransformEntry[],
  spacing: number
): TransformEntry[] {
  const currentBox = getEntriesBoundingBox(entries);
  if (!currentBox) return [];

  const rotationCenter = getBoundingBoxCenter(currentBox);
  const rightEntries = getRotatedEntries(entries, rotationCenter, Math.PI / 2);
  const bottomLeftEntries = getRotatedEntries(
    entries,
    rotationCenter,
    -Math.PI / 2
  );
  const bottomRightEntries = getRotatedEntries(
    entries,
    rotationCenter,
    Math.PI
  );

  const rightBox = getEntriesBoundingBox(rightEntries);
  const bottomLeftBox = getEntriesBoundingBox(bottomLeftEntries);
  const bottomRightBox = getEntriesBoundingBox(bottomRightEntries);
  if (!rightBox || !bottomLeftBox || !bottomRightBox) return [];

  const topRight = getTranslatedEntries(
    rightEntries,
    currentBox.max.x + spacing - rightBox.min.x,
    currentBox.max.y - rightBox.max.y
  );
  const bottomLeft = getTranslatedEntries(
    bottomLeftEntries,
    currentBox.min.x - bottomLeftBox.min.x,
    currentBox.min.y - spacing - bottomLeftBox.max.y
  );
  const bottomRight = getTranslatedEntries(
    bottomRightEntries,
    currentBox.max.x + spacing - bottomRightBox.min.x,
    currentBox.min.y - spacing - bottomRightBox.max.y
  );

  return [...topRight, ...bottomLeft, ...bottomRight];
}

function buildCornerRoundEntryGroups(
  groups: TransformEntry[][],
  spacing: number
): TransformEntry[][] {
  const currentEntries = groups.flat();
  const currentBox = getEntriesBoundingBox(currentEntries);
  if (!currentBox) return [];

  const rotationCenter = getBoundingBoxCenter(currentBox);
  const rightGroups = getRotatedEntryGroups(
    groups,
    rotationCenter,
    Math.PI / 2
  );
  const bottomLeftGroups = getRotatedEntryGroups(
    groups,
    rotationCenter,
    -Math.PI / 2
  );
  const bottomRightGroups = getRotatedEntryGroups(
    groups,
    rotationCenter,
    Math.PI
  );

  const rightBox = getEntriesBoundingBox(rightGroups.flat());
  const bottomLeftBox = getEntriesBoundingBox(bottomLeftGroups.flat());
  const bottomRightBox = getEntriesBoundingBox(bottomRightGroups.flat());
  if (!rightBox || !bottomLeftBox || !bottomRightBox) return [];

  const topRight = getTranslatedEntryGroups(
    rightGroups,
    currentBox.max.x + spacing - rightBox.min.x,
    currentBox.max.y - rightBox.max.y
  );
  const bottomLeft = getTranslatedEntryGroups(
    bottomLeftGroups,
    currentBox.min.x - bottomLeftBox.min.x,
    currentBox.min.y - spacing - bottomLeftBox.max.y
  );
  const bottomRight = getTranslatedEntryGroups(
    bottomRightGroups,
    currentBox.max.x + spacing - bottomRightBox.min.x,
    currentBox.min.y - spacing - bottomRightBox.max.y
  );

  return [...topRight, ...bottomLeft, ...bottomRight];
}

function resolveRotationAxis(
  startDirection: ModelArrayCopyParams["rotationStartDirection"],
  roundIndex: number
): RotationAxis {
  if (roundIndex % 2 === 0) return startDirection;
  return startDirection === "x" ? "y" : "x";
}

function createInitialEntries(models: GeometryNode[]): TransformEntry[] {
  return sortModelsForInsertion(models).map(model => ({
    source: model,
    transform: model.transform
  }));
}

function createInitialEntryGroup(models: GeometryNode[]): TransformEntry[] {
  return createInitialEntries(models);
}

function createInsertionAnchorMap(models: GeometryNode[]) {
  const anchors = new Map<INodeLinkedList | undefined, INode | undefined>();
  for (const group of buildInsertionGroups(models)) {
    anchors.set(group.parent, group.anchor);
  }
  return anchors;
}

function isNodeBefore(left: INode, right: INode) {
  let current = left.nextSibling;
  while (current) {
    if (current === right) return true;
    current = current.nextSibling;
  }
  return false;
}

function sortModelsForInsertion(models: GeometryNode[]) {
  return [...new Set(models)].sort((left, right) => {
    if (left === right) return 0;
    if (left.parent && left.parent === right.parent) {
      return isNodeBefore(left, right) ? -1 : 1;
    }
    return 0;
  });
}

function buildInsertionGroups(models: GeometryNode[]): ArrayInsertionGroup[] {
  const groups: ArrayInsertionGroup[] = [];
  const map = new Map<INodeLinkedList | undefined, ArrayInsertionGroup>();

  for (const model of sortModelsForInsertion(models)) {
    const parent = model.parent as INodeLinkedList | undefined;
    let group = map.get(parent);
    if (!group) {
      group = {
        parent,
        anchor: model.previousSibling,
        models: []
      };
      map.set(parent, group);
      groups.push(group);
    }
    group.models.push(model);
    group.anchor = model;
  }

  return groups;
}

function cloneGeometryNode(model: GeometryNode): GeometryNode | undefined {
  if (model instanceof PinPointGateNode) {
    const cloned = new PinPointGateNode(
      model.name,
      model.plane,
      model.exportParams()
    );
    cloned.visible = model.visible;
    return cloned;
  }

  if (model instanceof LargeGateNode) {
    const cloned = new LargeGateNode(
      model.name,
      model.plane,
      model.exportParams()
    );
    cloned.visible = model.visible;
    return cloned;
  }

  if (model instanceof HotTipGateNode) {
    const cloned = new HotTipGateNode(
      model.name,
      model.plane,
      model.exportParams()
    );
    cloned.visible = model.visible;
    return cloned;
  }

  if (model instanceof SubGateNode) {
    const cloned = new SubGateNode(
      model.name,
      model.plane,
      model.exportParams()
    );
    cloned.visible = model.visible;
    return cloned;
  }

  if (model instanceof HornGateNode) {
    const cloned = new HornGateNode(
      model.name,
      model.plane,
      model.exportParams()
    );
    cloned.visible = model.visible;
    return cloned;
  }

  if (model instanceof HorizontalRunnerNode) {
    const cloned = new HorizontalRunnerNode(
      model.name,
      model.start,
      model.end,
      model.exportParams()
    );
    cloned.visible = model.visible;
    return cloned;
  }

  if (model instanceof PartingRunnerNode) {
    const cloned = new PartingRunnerNode(
      model.name,
      model.start,
      model.end,
      model.exportParams()
    );
    cloned.visible = model.visible;
    return cloned;
  }

  if (model instanceof VerticalRunnerNode) {
    const cloned = new VerticalRunnerNode(
      model.name,
      model.start,
      model.direction,
      model.exportParams()
    );
    cloned.visible = model.visible;
    return cloned;
  }

  if (model instanceof PointVerticalRunnerNode) {
    const cloned = new PointVerticalRunnerNode(
      model.name,
      model.plane,
      model.exportParams()
    );
    cloned.visible = model.visible;
    return cloned;
  }

  if (!(model instanceof ShapeNode)) return undefined;
  const shape = model.shape;
  if (!shape.isOk) return undefined;

  const cloned = new WorkpieceNode(model.name, shape.value.clone());
  cloned.visible = model.visible;
  copyWorkpieceShapeOrigin(cloned, model);
  return cloned;
}

function createSameTypeShell(
  model: GeometryNode,
  name: string
): ShapeNode | undefined {
  if (model instanceof PinPointGateNode) {
    return new PinPointGateNode(name, model.plane, model.exportParams(), {
      rebuild: false
    });
  }

  if (model instanceof LargeGateNode) {
    return new LargeGateNode(name, model.plane, model.exportParams(), {
      rebuild: false
    });
  }

  if (model instanceof HotTipGateNode) {
    return new HotTipGateNode(name, model.plane, model.exportParams(), {
      rebuild: false
    });
  }

  if (model instanceof SubGateNode) {
    return new SubGateNode(name, model.plane, model.exportParams(), {
      rebuild: false
    });
  }

  if (model instanceof HornGateNode) {
    return new HornGateNode(name, model.plane, model.exportParams(), {
      rebuild: false
    });
  }

  if (model instanceof HorizontalRunnerNode) {
    return new HorizontalRunnerNode(
      name,
      model.start,
      model.end,
      model.exportParams(),
      { rebuild: false }
    );
  }

  if (model instanceof PartingRunnerNode) {
    return new PartingRunnerNode(
      name,
      model.start,
      model.end,
      model.exportParams(),
      { rebuild: false }
    );
  }

  if (model instanceof VerticalRunnerNode) {
    return new VerticalRunnerNode(
      name,
      model.start,
      model.direction,
      model.exportParams(),
      model.sourceGateNodeId,
      { rebuild: false }
    );
  }

  if (model instanceof PointVerticalRunnerNode) {
    return new PointVerticalRunnerNode(
      name,
      model.plane,
      model.exportParams(),
      {
        rebuild: false
      }
    );
  }

  if (model instanceof WorkpieceNode) {
    return new WorkpieceNode(
      name,
      Result.err("Shape is provided by reference source")
    );
  }

  return undefined;
}

function createReferenceGeometryNode(
  model: GeometryNode,
  name: string
): GeometryNode | undefined {
  if (!(model instanceof ShapeNode)) return undefined;
  const shell = createSameTypeShell(model, name);
  if (!shell) return undefined;
  bindShapeReference(shell, model);
  shell.visible = model.visible;
  return shell;
}

function isWorkpieceLikeNode(model: GeometryNode) {
  return model instanceof WorkpieceNode;
}

function shouldWrapReferenceSelection(models: GeometryNode[]) {
  return models.length !== 1 || isWorkpieceLikeNode(models[0]);
}

function createReferenceCopyPlan(models: GeometryNode[]): ReferenceCopyPlan {
  const sortedModels = sortModelsForInsertion(models);
  const firstModel = sortedModels[0];
  const commonParent = sortedModels.every(
    model => model.parent === firstModel.parent
  )
    ? (firstModel.parent as INodeLinkedList | undefined)
    : undefined;
  const fallbackName = firstModel.parent?.name ?? firstModel.name;
  return {
    wrapSelection: shouldWrapReferenceSelection(sortedModels),
    groupParentKey: commonParent ?? (firstModel?.parent as INodeLinkedList),
    groupName: `${fallbackName}${transformI18n("modelai.modelArrayCopy.referenceNodeSuffix")}`
  };
}

function registerCopiedGateForVerticalRunner(
  document: IDocument,
  node: GeometryNode
) {
  if (node instanceof PinPointGateNode || node instanceof HotTipGateNode) {
    registerVerticalRunnerGateNode(document, node);
  }
}

@command({
  key: "modify.modelArrayCopy",
  icon: "icon-copy"
})
export class ModelArrayCopyCommand extends MultistepCommand {
  private params: ModelArrayCopyParams;

  constructor(private readonly preset: ModelArrayCopyFormPreset = {}) {
    super();
    this.params = this.createInitialParams();
  }

  protected override getSteps(): IStep[] {
    return [
      new GetOrSelectNodeStep(
        transformI18n("modelai.command.prompt.selectModelsForArrayCopy"),
        {
          multiple: true,
          filter: node => node instanceof GeometryNode
        }
      ),
      {
        execute: (_document, controller) => this.showConfig(controller)
      }
    ];
  }

  protected override executeMainTask(): void {}

  protected override async executeMainTaskAsync(): Promise<void> {
    const models = this.getSelectedModels();
    if (models.length === 0) return;

    if (this.params.copyMode === "reference") {
      await this.executeReferenceCopyAsync(models);
      return;
    }

    if (this.params.mode === "rotation") {
      await this.executeRotationCopyAsync(models);
      return;
    }

    if (this.params.mode === "corner") {
      await this.executeCornerCopyAsync(models);
      return;
    }

    const offsets = buildLinearOffsets(this.params, models);
    if (offsets.length === 0) return;

    await this.executeLinearCopyAsync(models, offsets);
  }

  private async executeReferenceCopyAsync(models: GeometryNode[]) {
    const insertionAnchors = createInsertionAnchorMap(models);
    const referencePlan = createReferenceCopyPlan(models);

    if (this.params.mode === "rotation") {
      await this.executeRotationReferenceAsync(
        models,
        insertionAnchors,
        referencePlan
      );
      return;
    }

    if (this.params.mode === "corner") {
      await this.executeCornerReferenceAsync(
        models,
        insertionAnchors,
        referencePlan
      );
      return;
    }

    const offsets = buildLinearOffsets(this.params, models);
    if (offsets.length === 0) return;

    await this.insertReferenceEntryGroupsWithProgress(
      buildLinearEntryGroups(models, offsets),
      insertionAnchors,
      referencePlan
    );
  }

  private async executeLinearCopyAsync(
    models: GeometryNode[],
    offsets: LinearArrayOffset[]
  ) {
    const app = this.application as LoadingBridge;
    const totalCloneCount = offsets.length * models.length;
    let completedCloneCount = 0;

    app.onLoadingChange?.(
      true,
      formatMessage(
        "modelai.modelArrayCopy.copyingProgress",
        completedCloneCount,
        totalCloneCount
      )
    );
    await yieldToUi();

    try {
      const insertionAnchors = createInsertionAnchorMap(models);
      for (const group of buildInsertionGroups(models)) {
        for (const offset of offsets) {
          const translation = Matrix4.fromTranslation(offset.x, offset.y, 0);

          for (const model of group.models) {
            const clone = cloneGeometryNode(model);
            if (!clone) continue;

            clone.transform = translation.multiply(model.transform);

            const pending = new Map<
              INodeLinkedList | undefined,
              PendingInsertGroup
            >();
            this.pushPendingNode(pending, group.parent, clone);
            this.insertPendingNodes(pending, insertionAnchors);

            completedCloneCount += 1;
            this.document.visual.update();
            app.onLoadingChange?.(
              true,
              formatMessage(
                "modelai.modelArrayCopy.copyingProgress",
                completedCloneCount,
                totalCloneCount
              )
            );
            await yieldToUi();
          }
        }
      }

      this.finishCopyViewUpdate();
    } finally {
      app.onLoadingChange?.(false, "");
    }
  }

  private async executeRotationCopyAsync(models: GeometryNode[]) {
    const app = this.application as LoadingBridge;
    const requestedCount = Number(this.params.rotationCount);
    const rounds = Math.log2(requestedCount);
    if (!Number.isInteger(rounds) || rounds <= 0) return;

    const currentEntries = createInitialEntries(models);
    const insertionAnchors = createInsertionAnchorMap(models);
    const totalCloneCount = models.length * (requestedCount - 1);
    let completedCloneCount = 0;

    app.onLoadingChange?.(
      true,
      formatMessage(
        "modelai.modelArrayCopy.copyingProgress",
        completedCloneCount,
        totalCloneCount
      )
    );
    await yieldToUi();

    try {
      for (let roundIndex = 0; roundIndex < rounds; roundIndex++) {
        const axis = resolveRotationAxis(
          this.params.rotationStartDirection,
          roundIndex
        );
        const nextEntries = buildRotationRoundEntries(
          currentEntries,
          this.params.rotationSpacing,
          axis
        );
        if (nextEntries.length === 0) break;

        completedCloneCount = await this.insertEntriesWithProgress(
          nextEntries,
          insertionAnchors,
          completedCloneCount,
          totalCloneCount,
          app
        );

        currentEntries.push(...nextEntries);
      }

      this.finishCopyViewUpdate();
    } finally {
      app.onLoadingChange?.(false, "");
    }
  }

  private async executeCornerCopyAsync(models: GeometryNode[]) {
    const app = this.application as LoadingBridge;
    const requestedCount = Number(this.params.cornerCount);
    const exponent = Math.log2(requestedCount);
    if (!Number.isInteger(exponent) || exponent <= 0) return;

    const cornerRounds = Math.floor(exponent / 2);
    const hasExtraRotationRound = exponent % 2 === 1;
    const currentEntries = createInitialEntries(models);
    const insertionAnchors = createInsertionAnchorMap(models);
    const totalCloneCount = models.length * (requestedCount - 1);
    let completedCloneCount = 0;

    app.onLoadingChange?.(
      true,
      formatMessage(
        "modelai.modelArrayCopy.copyingProgress",
        completedCloneCount,
        totalCloneCount
      )
    );
    await yieldToUi();

    try {
      for (let roundIndex = 0; roundIndex < cornerRounds; roundIndex++) {
        const nextEntries = buildCornerRoundEntries(
          currentEntries,
          this.params.rotationSpacing
        );
        if (nextEntries.length === 0) break;

        completedCloneCount = await this.insertEntriesWithProgress(
          nextEntries,
          insertionAnchors,
          completedCloneCount,
          totalCloneCount,
          app
        );
        currentEntries.push(...nextEntries);
      }

      if (hasExtraRotationRound) {
        const nextEntries = buildRotationRoundEntries(
          currentEntries,
          this.params.rotationSpacing,
          "x"
        );
        completedCloneCount = await this.insertEntriesWithProgress(
          nextEntries,
          insertionAnchors,
          completedCloneCount,
          totalCloneCount,
          app
        );
      }

      this.finishCopyViewUpdate();
    } finally {
      app.onLoadingChange?.(false, "");
    }
  }

  private async executeRotationReferenceAsync(
    models: GeometryNode[],
    insertionAnchors: Map<INodeLinkedList | undefined, INode | undefined>,
    referencePlan: ReferenceCopyPlan
  ) {
    const requestedCount = Number(this.params.rotationCount);
    const rounds = Math.log2(requestedCount);
    if (!Number.isInteger(rounds) || rounds <= 0) return;

    const currentGroups = [createInitialEntryGroup(models)];
    const insertedGroups: TransformEntry[][] = [];

    for (let roundIndex = 0; roundIndex < rounds; roundIndex++) {
      const axis = resolveRotationAxis(
        this.params.rotationStartDirection,
        roundIndex
      );
      const nextGroups = buildRotationRoundEntryGroups(
        currentGroups,
        this.params.rotationSpacing,
        axis
      );
      if (nextGroups.length === 0) break;

      insertedGroups.push(...nextGroups);
      currentGroups.push(...nextGroups);
    }

    await this.insertReferenceEntryGroupsWithProgress(
      insertedGroups,
      insertionAnchors,
      referencePlan
    );
  }

  private async executeCornerReferenceAsync(
    models: GeometryNode[],
    insertionAnchors: Map<INodeLinkedList | undefined, INode | undefined>,
    referencePlan: ReferenceCopyPlan
  ) {
    const requestedCount = Number(this.params.cornerCount);
    const exponent = Math.log2(requestedCount);
    if (!Number.isInteger(exponent) || exponent <= 0) return;

    const cornerRounds = Math.floor(exponent / 2);
    const hasExtraRotationRound = exponent % 2 === 1;
    const currentGroups = [createInitialEntryGroup(models)];
    const insertedGroups: TransformEntry[][] = [];

    for (let roundIndex = 0; roundIndex < cornerRounds; roundIndex++) {
      const nextGroups = buildCornerRoundEntryGroups(
        currentGroups,
        this.params.rotationSpacing
      );
      if (nextGroups.length === 0) break;

      insertedGroups.push(...nextGroups);
      currentGroups.push(...nextGroups);
    }

    if (hasExtraRotationRound) {
      insertedGroups.push(
        ...buildRotationRoundEntryGroups(
          currentGroups,
          this.params.rotationSpacing,
          "x"
        )
      );
    }

    await this.insertReferenceEntryGroupsWithProgress(
      insertedGroups,
      insertionAnchors,
      referencePlan
    );
  }

  private async insertEntriesWithProgress(
    entries: TransformEntry[],
    insertionAnchors: Map<INodeLinkedList | undefined, INode | undefined>,
    completedCloneCount: number,
    totalCloneCount: number,
    app: LoadingBridge
  ) {
    const chunkSize =
      totalCloneCount > BATCHED_INSERT_THRESHOLD
        ? BATCHED_INSERT_CHUNK_SIZE
        : entries.length;
    const shouldYieldBetweenChunks = totalCloneCount > BATCHED_INSERT_THRESHOLD;

    for (let index = 0; index < entries.length; index += chunkSize) {
      const chunk = entries.slice(index, index + chunkSize);
      let insertedCount = 0;
      const pending = new Map<
        INodeLinkedList | undefined,
        PendingInsertGroup
      >();

      chunk.forEach(entry => {
        const clone = cloneGeometryNode(entry.source);
        if (!clone) return;

        clone.transform = entry.transform;
        const parentKey = entry.source.parent as INodeLinkedList | undefined;
        this.pushPendingNode(pending, parentKey, clone);
        insertedCount += 1;
      });

      this.insertPendingNodes(pending, insertionAnchors);
      completedCloneCount += insertedCount;

      if (!shouldYieldBetweenChunks) continue;
      this.document.visual.update();
      app.onLoadingChange?.(
        true,
        formatMessage(
          "modelai.modelArrayCopy.copyingProgress",
          completedCloneCount,
          totalCloneCount
        )
      );
      await yieldToUi();
    }

    return completedCloneCount;
  }

  private async insertReferenceEntryGroupsWithProgress(
    entryGroups: TransformEntry[][],
    insertionAnchors: Map<INodeLinkedList | undefined, INode | undefined>,
    referencePlan: ReferenceCopyPlan
  ) {
    const entries = entryGroups.flat();
    if (entries.length === 0) return;

    const app = this.application as LoadingBridge;
    const totalCloneCount = entries.length;
    let completedCloneCount = 0;
    const maxGroupSize = Math.max(1, ...entryGroups.map(group => group.length));
    const chunkSize =
      totalCloneCount > BATCHED_INSERT_THRESHOLD
        ? Math.max(1, Math.floor(BATCHED_INSERT_CHUNK_SIZE / maxGroupSize))
        : entryGroups.length;
    const shouldYieldBetweenChunks = totalCloneCount > BATCHED_INSERT_THRESHOLD;

    app.onLoadingChange?.(
      true,
      formatMessage(
        "modelai.modelArrayCopy.copyingProgress",
        completedCloneCount,
        totalCloneCount
      )
    );
    if (shouldYieldBetweenChunks) {
      await yieldToUi();
    }

    try {
      for (let index = 0; index < entryGroups.length; index += chunkSize) {
        const chunk = entryGroups.slice(index, index + chunkSize);
        let insertedCount = 0;
        const pending = new Map<
          INodeLinkedList | undefined,
          PendingInsertGroup
        >();
        const pendingReferenceChildren = new Map<GroupNode, GeometryNode[]>();

        chunk.forEach(groupEntries => {
          if (referencePlan.wrapSelection) {
            const referenceGroup = this.createReferenceGroup(
              groupEntries,
              referencePlan.groupName
            );
            if (!referenceGroup) return;
            const parentKey = referencePlan.groupParentKey;
            this.pushPendingNode(pending, parentKey, referenceGroup.group);
            pendingReferenceChildren.set(
              referenceGroup.group,
              referenceGroup.children
            );
            insertedCount += groupEntries.length;
            return;
          }

          groupEntries.forEach(entry => {
            const node = this.createReferenceNode(entry);
            if (!node) return;
            const parentKey = entry.source.parent as
              | INodeLinkedList
              | undefined;
            this.pushPendingNode(pending, parentKey, node);
            insertedCount += 1;
          });
        });

        this.insertPendingNodes(pending, insertionAnchors);
        this.insertReferenceGroupChildren(pendingReferenceChildren);
        completedCloneCount += insertedCount;

        if (!shouldYieldBetweenChunks) continue;
        this.document.visual.update();
        app.onLoadingChange?.(
          true,
          formatMessage(
            "modelai.modelArrayCopy.copyingProgress",
            completedCloneCount,
            totalCloneCount
          )
        );
        await yieldToUi();
      }

      this.finishCopyViewUpdate();
    } finally {
      app.onLoadingChange?.(false, "");
    }
  }

  private finishCopyViewUpdate() {
    refreshDocumentPushPlatePlaneHelper(this.document);
    this.document.visual.update();
    const view =
      this.stepDatas[0]?.view ?? this.document.application.activeView;
    view?.update();
  }

  private resolveInsertionParent(parent: INodeLinkedList | undefined) {
    return (
      parent ??
      this.document.modelManager.currentNode ??
      this.document.modelManager.rootNode
    );
  }

  private createReferenceNode(entry: TransformEntry): GeometryNode | undefined {
    const node = createReferenceGeometryNode(
      entry.source,
      `${entry.source.name}${transformI18n("modelai.modelArrayCopy.referenceNodeSuffix")}`
    );
    if (!node) return undefined;
    node.transform = entry.transform;
    return node;
  }

  private createReferenceGroup(
    entries: TransformEntry[],
    name: string
  ): { group: GroupNode; children: GeometryNode[] } | undefined {
    const group = new GroupNode(name);
    const children: GeometryNode[] = [];
    for (const entry of entries) {
      const node = this.createReferenceNode(entry);
      if (!node) continue;
      children.push(node);
    }
    return children.length > 0 ? { group, children } : undefined;
  }

  private insertReferenceGroupChildren(
    pendingReferenceChildren: Map<GroupNode, GeometryNode[]>
  ) {
    pendingReferenceChildren.forEach((children, group) => {
      group.add(...children);
      children.forEach(child => this.registerCopiedNode(child));
    });
  }

  private pushPendingNode(
    pending: Map<INodeLinkedList | undefined, PendingInsertGroup>,
    parentKey: INodeLinkedList | undefined,
    node: INode
  ) {
    const runnerParent = resolveRunnerNodeRootTypeGroup(this.document, node);
    const effectiveParentKey = runnerParent ?? parentKey;
    let group = pending.get(effectiveParentKey);
    if (!group) {
      group = {
        parent: runnerParent ?? this.resolveInsertionParent(parentKey),
        nodes: []
      };
      pending.set(effectiveParentKey, group);
    }
    group.nodes.push(node);
  }

  private insertPendingNodes(
    pending: Map<INodeLinkedList | undefined, PendingInsertGroup>,
    insertionAnchors: Map<INodeLinkedList | undefined, INode | undefined>
  ) {
    pending.forEach((group, parentKey) => {
      if (group.nodes.length === 0) return;
      const anchor = insertionAnchors.has(parentKey)
        ? insertionAnchors.get(parentKey)
        : group.parent.lastChild;
      group.parent.insertAfter(anchor, ...group.nodes);
      group.nodes.forEach(node => this.registerCopiedNode(node));
      insertionAnchors.set(parentKey, group.nodes[group.nodes.length - 1]);
    });
  }

  private registerCopiedNode(node: INode) {
    if (node instanceof GeometryNode) {
      registerCopiedGateForVerticalRunner(this.document, node);
      return;
    }

    if (node instanceof GroupNode) {
      let child = node.firstChild;
      while (child) {
        this.registerCopiedNode(child);
        child = child.nextSibling;
      }
    }
  }

  private getSelectedModels() {
    return (this.stepDatas[0]?.nodes ?? []).filter(
      (node): node is GeometryNode => node instanceof GeometryNode
    );
  }

  private async showConfig(
    controller: AsyncController
  ): Promise<SnapResult | undefined> {
    const session = new ModelArrayCopyFormSession(this.createInitialParams(), {
      ...this.preset
    });
    const unmount = mountFormKit(session.createFormKitRegistration(controller));

    try {
      return await new Promise<SnapResult | undefined>(resolve => {
        controller.onCompleted(() => {
          this.params = session.getParams();
          this.rememberParams(this.params);
          resolve({
            view: this.stepDatas[0].view,
            shapes: [],
            nodes: this.getSelectedModels()
          });
        });
        controller.onCancelled(() => resolve(undefined));
      });
    } finally {
      unmount();
      session.dispose();
    }
  }

  private createInitialParams(): ModelArrayCopyParams {
    return normalizeModelArrayCopyParams({
      ...getRememberedModelArrayCopyParams(),
      ...this.preset
    });
  }

  private rememberParams(params: ModelArrayCopyParams): void {
    const remembered = getRememberedModelArrayCopyParams();
    rememberModelArrayCopyParams(
      normalizeModelArrayCopyParams({
        ...params,
        copyMode: this.preset.copyMode ? remembered.copyMode : params.copyMode,
        mode: this.preset.mode ? remembered.mode : params.mode
      })
    );
  }
}

@command({
  key: "modify.translateReferenceArrayCopy",
  icon: "icon-copy"
})
export class TranslateReferenceArrayCopyCommand extends ModelArrayCopyCommand {
  constructor() {
    super({
      copyMode: "reference",
      mode: "linear"
    });
  }
}

@command({
  key: "modify.rotateReferenceArrayCopy",
  icon: "icon-copy"
})
export class RotateReferenceArrayCopyCommand extends ModelArrayCopyCommand {
  constructor() {
    super({
      copyMode: "reference",
      mode: "rotation"
    });
  }
}
