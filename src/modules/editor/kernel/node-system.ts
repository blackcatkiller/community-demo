import type { EditorNode } from "@/modules/editor/kernel/types";

export type EditorNodeMap = Record<string, EditorNode>;

export function createNodeMap(nodes: EditorNode[]): EditorNodeMap {
  return Object.fromEntries(nodes.map((node) => [node.id, node]));
}

export function getUniqueNodeName(nodes: EditorNode[], baseName: string) {
  const existing = new Set(nodes.map((node) => node.name));
  if (!existing.has(baseName)) return baseName;

  let index = 2;
  while (existing.has(`${baseName} ${index}`)) {
    index += 1;
  }

  return `${baseName} ${index}`;
}

export function flattenNodeTree(nodes: EditorNode[]) {
  const map = createNodeMap(nodes);
  const roots = nodes.filter((node) => !node.parentId);
  const result: Array<{ node: EditorNode; depth: number }> = [];

  const visit = (node: EditorNode, depth: number) => {
    result.push({ node, depth });
    for (const childId of node.children ?? []) {
      const child = map[childId];
      if (child) visit(child, depth + 1);
    }
  };

  for (const root of roots) visit(root, 0);
  return result;
}

export function setNodeVisibility(
  nodes: EditorNode[],
  id: string,
  visible: boolean,
) {
  return nodes.map((node) => (node.id === id ? { ...node, visible } : node));
}

export function updateNodeTransform(
  nodes: EditorNode[],
  id: string,
  transform: Partial<Pick<EditorNode, "position" | "rotation" | "scale">>,
) {
  return nodes.map((node) => (node.id === id ? { ...node, ...transform } : node));
}

export function appendNode(nodes: EditorNode[], node: EditorNode) {
  if (!node.parentId) return [...nodes, node];

  return [
    ...nodes.map((item) =>
      item.id === node.parentId
        ? { ...item, children: [...(item.children ?? []), node.id] }
        : item,
    ),
    node,
  ];
}
