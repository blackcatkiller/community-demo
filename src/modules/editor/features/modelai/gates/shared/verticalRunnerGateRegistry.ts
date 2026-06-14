// @ts-nocheck
import {
  NodeAction,
  type IDocument,
  type NodeRecord
} from "@modelai/core/types";
import { HotTipGateNode } from "../hotTip/hotTipGate";
import { PinPointGateNode } from "../pinPoint/pinPointGate";
import { VerticalRunnerNode } from "../verticalRunner/verticalRunner";

export type RegisteredVerticalRunnerGateNode =
  | PinPointGateNode
  | HotTipGateNode;

export type VerticalRunnerGateRegistration = {
  gateNode: RegisteredVerticalRunnerGateNode;
  hasGeneratedVerticalRunner: boolean;
};

const verticalRunnerGateRegistry = new WeakMap<
  IDocument,
  VerticalRunnerGateRegistration[]
>();
const observedDocuments = new WeakSet<IDocument>();

function isRegisteredVerticalRunnerGateNode(
  node: RegisteredVerticalRunnerGateNode | undefined
): node is RegisteredVerticalRunnerGateNode {
  return (
    !!node &&
    (node instanceof PinPointGateNode || node instanceof HotTipGateNode)
  );
}

function collectActiveRegistrations(document: IDocument) {
  const current = verticalRunnerGateRegistry.get(document) ?? [];
  const next = current.filter(
    item =>
      isRegisteredVerticalRunnerGateNode(item.gateNode) &&
      !!item.gateNode.parent
  );
  if (next.length !== current.length) {
    verticalRunnerGateRegistry.set(document, next);
  }
  return next;
}

function updateGeneratedFlag(
  document: IDocument,
  gateNodeId: string,
  hasGeneratedVerticalRunner: boolean
) {
  const registrations = collectActiveRegistrations(document);
  const registration = registrations.find(
    item => item.gateNode.id === gateNodeId
  );
  if (registration) {
    registration.hasGeneratedVerticalRunner = hasGeneratedVerticalRunner;
  }
}

function hasActiveGeneratedVerticalRunner(
  document: IDocument,
  gateNodeId: string
) {
  return (
    document.modelManager.findNodes(node => {
      return (
        node instanceof VerticalRunnerNode &&
        node.parent !== undefined &&
        node.sourceGateNodeId === gateNodeId
      );
    }).length > 0
  );
}

function handleNodeChanged(document: IDocument, records: NodeRecord[]) {
  records.forEach(record => {
    if (!(record.node instanceof VerticalRunnerNode)) {
      return;
    }

    const sourceGateNodeId = record.node.sourceGateNodeId;
    if (!sourceGateNodeId) {
      return;
    }

    if (
      record.action === NodeAction.add ||
      record.action === NodeAction.insertAfter ||
      record.action === NodeAction.insertBefore
    ) {
      updateGeneratedFlag(document, sourceGateNodeId, true);
      return;
    }

    if (
      record.action === NodeAction.remove ||
      record.action === NodeAction.transfer
    ) {
      updateGeneratedFlag(
        document,
        sourceGateNodeId,
        hasActiveGeneratedVerticalRunner(document, sourceGateNodeId)
      );
    }
  });
}

function ensureDocumentObserver(document: IDocument) {
  if (observedDocuments.has(document)) {
    return;
  }

  document.modelManager.addNodeObserver(records =>
    handleNodeChanged(document, records)
  );
  observedDocuments.add(document);
}

export function registerVerticalRunnerGateNode(
  document: IDocument,
  node: RegisteredVerticalRunnerGateNode
) {
  ensureDocumentObserver(document);

  const registrations = collectActiveRegistrations(document);
  const existing = registrations.find(item => item.gateNode.id === node.id);
  if (!existing) {
    registrations.push({
      gateNode: node,
      hasGeneratedVerticalRunner: false
    });
    verticalRunnerGateRegistry.set(document, registrations);
  }
}

export function markVerticalRunnerGenerated(
  document: IDocument,
  gateNode: RegisteredVerticalRunnerGateNode
) {
  ensureDocumentObserver(document);
  updateGeneratedFlag(document, gateNode.id, true);
}

export function getRegisteredVerticalRunnerGateRegistrations(
  document: IDocument
) {
  ensureDocumentObserver(document);
  return collectActiveRegistrations(document);
}

export function getPendingVerticalRunnerGateNodes(document: IDocument) {
  return getRegisteredVerticalRunnerGateRegistrations(document)
    .filter(item => !item.hasGeneratedVerticalRunner)
    .map(item => item.gateNode);
}
