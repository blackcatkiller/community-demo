import type { EditorNode } from "@/modules/editor/kernel/types";
import { getUniqueNodeName } from "@/modules/editor/kernel/node-system";

export type StepParseResult = {
  node: EditorNode;
  diagnostics: string[];
};

function sanitizeStepName(fileName: string) {
  return fileName.replace(/\.(stp|step)$/i, "") || "STEP model";
}

export async function parseStepFilePlaceholder(
  file: File | string,
  existingNodes: EditorNode[],
): Promise<StepParseResult> {
  const fileName = typeof file === "string" ? file : file.name;
  const baseName = sanitizeStepName(fileName);
  const text = typeof file === "string" ? "" : await file.text().catch(() => "");
  const headerMatch = /HEADER;([\s\S]*?)ENDSEC;/i.exec(text);
  const entityCount = Array.from(text.matchAll(/#[0-9]+\s*=/g)).length;
  const id = `step-${Date.now().toString(36)}`;

  return {
    node: {
      id,
      name: getUniqueNodeName(existingNodes, baseName),
      type: "step",
      visible: true,
      color: "#8fb8d1",
      position: [0, 1.2, 2.4],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      metadata: {
        sourceFile: fileName,
        parser: "placeholder-step-kernel",
        entityCount,
        hasHeader: Boolean(headerMatch),
      },
    },
    diagnostics: [
      "STEP file accepted by the editor kernel.",
      "OCC/Chili WASM conversion is not wired yet; viewport uses placeholder geometry.",
    ],
  };
}
