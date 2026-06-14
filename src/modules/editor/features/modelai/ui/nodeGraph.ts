// @ts-nocheck
export type NodeStatus =
  | "done"
  | "active"
  | "pending"
  | "blocked"
  | "running"
  | "failed"
  | "dirty";

export interface GraphNode {
  id: string;
  label?: string;
  status?: NodeStatus;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
