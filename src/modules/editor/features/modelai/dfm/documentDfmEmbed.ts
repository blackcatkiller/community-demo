// @ts-nocheck
import type { DfmProjectFlow } from "@/store/modules/modelaiDfmProject";

/** Persisted under `PersistedDocument.userData` alongside model serialization. */
export const MODELAI_USERDATA_DFM_PROJECT_KEY = "modelaiDfmProject" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDfmProjectFlowValue(value: unknown): value is DfmProjectFlow {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (value.mode !== "dfm") return false;
  if (typeof value.projectId !== "string" || !value.projectId.trim())
    return false;
  if (typeof value.projectName !== "string") return false;
  return true;
}

export function readDfmProjectFlowFromUserData(
  userData: Record<string, unknown>
): DfmProjectFlow | undefined {
  const raw = userData[MODELAI_USERDATA_DFM_PROJECT_KEY];
  if (!isDfmProjectFlowValue(raw)) return undefined;
  return raw as DfmProjectFlow;
}

/** Deep clone into userData so mutations to the live store do not alias persisted state. */
export function writeDfmProjectFlowToUserData(
  userData: Record<string, unknown>,
  flow: DfmProjectFlow | undefined
): void {
  if (!flow) {
    delete userData[MODELAI_USERDATA_DFM_PROJECT_KEY];
    return;
  }
  userData[MODELAI_USERDATA_DFM_PROJECT_KEY] = JSON.parse(
    JSON.stringify(flow)
  ) as DfmProjectFlow;
}

export function normalizeDfmFlowDocumentId(
  flow: DfmProjectFlow,
  documentId: string
): DfmProjectFlow {
  if (flow.projectId === documentId) return flow;
  return { ...flow, projectId: documentId };
}
