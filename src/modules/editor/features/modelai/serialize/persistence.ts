// @ts-nocheck
import type { Serialized } from "./serializer";
import type { SerializedModelManager } from "../model/modelManager";
import type { WorkflowMode } from "../workflow/types";

export const MODEL_AI_DB_NAME = "modelai";
export const MODEL_AI_DOCUMENT_TABLE = "document";
export const MODEL_AI_RECENT_TABLE = "recent";
export const MODEL_AI_DOCUMENT_VERSION = 1;

export interface PersistedDocument extends Serialized {
  version: number;
  id: string;
  name: string;
  userData?: Record<string, unknown>;
  // Reserved for upcoming model tree serialization.
  models: SerializedModelManager | null;
}

export interface PersistedRecentDocument {
  id: string;
  name: string;
  /** Last save time; mirrors {@link updatedAt} when both are set. */
  date: number;
  /** First persisted save time (ms since epoch). */
  createdAt?: number;
  /** Last persisted save time (ms since epoch). */
  updatedAt?: number;
  /** Workflow mode used when the solution was last saved (route `mode`). */
  mode?: WorkflowMode;
  image?: string;
}
