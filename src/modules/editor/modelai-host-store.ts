"use client";

import { create } from "zustand";

import type { ModelAIReactHost, ModelAINodeListItem } from "@/modules/editor/modelai-react-host";

type ModelAIHostState = {
  host: ModelAIReactHost | null;
  nodes: ModelAINodeListItem[];
  importStatus: "idle" | "loading" | "ready" | "error";
  importMessage: string;
  setHost: (host: ModelAIReactHost | null) => void;
  setNodes: (nodes: ModelAINodeListItem[]) => void;
  importFiles: (files: File[]) => Promise<void>;
  fitContent: () => void;
  setCameraView: (view: "front" | "right" | "top" | "iso" | "fit") => void;
  selectNode: (id: string) => void;
  toggleNodeVisibility: (id: string) => void;
};

export const useModelAIHostStore = create<ModelAIHostState>((set, get) => ({
  host: null,
  nodes: [],
  importStatus: "idle",
  importMessage: "ModelAI viewer ready",
  setHost: (host) => {
    set({
      host,
      nodes: host?.getNodeList() ?? [],
      importStatus: host ? "ready" : "idle",
    });
  },
  setNodes: (nodes) => set({ nodes }),
  importFiles: async (files) => {
    const host = get().host;
    if (!host || files.length === 0) return;

    set({ importStatus: "loading", importMessage: `Importing ${files[0]?.name ?? "file"}...` });
    try {
      for (const file of files) {
        await host.importFile(file);
      }
      set({
        nodes: host.getNodeList(),
        importStatus: "ready",
        importMessage: `Imported ${files.length} file${files.length === 1 ? "" : "s"}`,
      });
    } catch (error) {
      set({
        importStatus: "error",
        importMessage: error instanceof Error ? error.message : String(error),
      });
    }
  },
  fitContent: () => {
    get().host?.fitContent();
  },
  setCameraView: (view) => {
    const host = get().host;
    if (!host) return;
    if (view === "fit") {
      host.fitContent();
      return;
    }
    host.setCameraView(view);
  },
  selectNode: (id) => {
    get().host?.selectNode(id);
  },
  toggleNodeVisibility: (id) => {
    const host = get().host;
    host?.toggleNodeVisibility(id);
    set({ nodes: host?.getNodeList() ?? [] });
  },
}));
