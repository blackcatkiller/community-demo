// @ts-nocheck
import type { GraphData } from "./nodeGraph";

const EDGES: GraphData["edges"] = [
  { from: "鎽嗘", to: "鍘氬害鍒嗘瀽" },
  { from: "鎽嗘", to: "鏂滅巼鍒嗘瀽" },
  { from: "鍘氬害鍒嗘瀽", to: "鍒嗗瀷" },
  { from: "鏂滅巼鍒嗘瀽", to: "鍒嗗瀷" },
  { from: "鍒嗗瀷", to: "婊戝潡" },
  { from: "婊戝潡", to: "鍒嗘ā" },
  { from: "鍒嗘ā", to: "鎷嗗垎闀朵欢" }
];

export const HISTORY_GRAPH_V2: GraphData = {
  nodes: [
    { id: "鎽嗘", status: "done" },
    { id: "鍘氬害鍒嗘瀽", status: "done" },
    { id: "鏂滅巼鍒嗘瀽", status: "done" },
    { id: "鍒嗗瀷", status: "active" },
    { id: "婊戝潡", status: "pending" },
    { id: "鍒嗘ā", status: "pending" },
    { id: "鎷嗗垎闀朵欢", status: "pending" }
  ],
  edges: EDGES
};

export const HISTORY_GRAPH_V1: GraphData = {
  nodes: [
    { id: "鎽嗘", status: "done" },
    { id: "鍘氬害鍒嗘瀽", status: "done" },
    { id: "鏂滅巼鍒嗘瀽", status: "done" },
    { id: "鍒嗗瀷", status: "done" },
    { id: "婊戝潡", status: "done" },
    { id: "鍒嗘ā", status: "active" },
    { id: "鎷嗗垎闀朵欢", status: "pending" }
  ],
  edges: EDGES
};
