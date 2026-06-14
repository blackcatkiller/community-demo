// @ts-nocheck
import type { MoldflowProjectFlow } from "@/store/modules/modelaiMoldflowProject";

/** 鎸?DFM 鐨勬枃妗ｅ祵鍏ユ柟寮忓钩绉伙細鎶?moldflow 椤圭洰娴佸揩鐓ф寕鍒?PersistedDocument.userData銆?*/
export const MODELAI_USERDATA_MOLDFLOW_PROJECT_KEY =
  "modelaiMoldflowProject" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isMoldflowProjectFlowValue(
  value: unknown
): value is MoldflowProjectFlow {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (value.mode !== "moldflow") return false;
  if (typeof value.projectId !== "string" || !value.projectId.trim())
    return false;
  if (typeof value.projectName !== "string") return false;
  return true;
}

export function readMoldflowProjectFlowFromUserData(
  userData: Record<string, unknown>
): MoldflowProjectFlow | undefined {
  const raw = userData[MODELAI_USERDATA_MOLDFLOW_PROJECT_KEY];
  if (!isMoldflowProjectFlowValue(raw)) return undefined;
  return raw as MoldflowProjectFlow;
}

/** 骞崇Щ DFM 鐨勬繁鎷疯礉鍐欏叆閫昏緫锛岄伩鍏嶈繍琛屼腑椤圭洰鎬佸拰搴忓垪鍖栫粨鏋滀簰鐩稿紩鐢ㄣ€?*/
export function writeMoldflowProjectFlowToUserData(
  userData: Record<string, unknown>,
  flow: MoldflowProjectFlow | undefined
): void {
  if (!flow) {
    delete userData[MODELAI_USERDATA_MOLDFLOW_PROJECT_KEY];
    return;
  }
  userData[MODELAI_USERDATA_MOLDFLOW_PROJECT_KEY] = JSON.parse(
    JSON.stringify(flow)
  ) as MoldflowProjectFlow;
}

export function normalizeMoldflowFlowDocumentId(
  flow: MoldflowProjectFlow,
  documentId: string
): MoldflowProjectFlow {
  if (flow.projectId === documentId) return flow;
  return { ...flow, projectId: documentId };
}
