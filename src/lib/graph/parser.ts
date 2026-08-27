import type {
  GraphDefinition,
  GraphDirection,
  GraphEdge,
  GraphNode,
  GraphNodeKind
} from './model';

const NODE_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*)(?:\[(default|terminal|accent|muted)\])?\s*:\s*(.+)$/;
const STANDARD_EDGE_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*)\s*->\s*([A-Za-z][A-Za-z0-9_-]*)(?:\s*\|\s*(.+))?$/;
const FEEDBACK_EDGE_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*)\s*~>\s*([A-Za-z][A-Za-z0-9_-]*)(?:\s*\|\s*(.+))?$/;

const decodeLabel = (value: string): string => value.trim().replaceAll('\\n', '\n');

const parseDirection = (value: string, lineNumber: number): GraphDirection => {
  const direction = value.trim().toUpperCase();
  if (direction === 'TB' || direction === 'LR') {
    return direction;
  }

  throw new Error(`Graph line ${lineNumber}: direction must be TB or LR.`);
};

export function parseGraph(source: string): GraphDefinition {
  let title: string | undefined;
  let direction: GraphDirection = 'TB';
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? '';
    const line = rawLine.trim();
    const lineNumber = index + 1;

    if (!line || line.startsWith('#')) {
      continue;
    }

    if (line.startsWith('title:')) {
      title = decodeLabel(line.slice('title:'.length));
      continue;
    }

    if (line.startsWith('direction:')) {
      direction = parseDirection(line.slice('direction:'.length), lineNumber);
      continue;
    }

    const feedbackEdgeMatch = line.match(FEEDBACK_EDGE_PATTERN);
    if (feedbackEdgeMatch) {
      const [, from, to, label] = feedbackEdgeMatch;
      if (!from || !to) {
        throw new Error(`Graph line ${lineNumber}: invalid feedback edge.`);
      }

      edges.push({
        from,
        to,
        ...(label ? { label: decodeLabel(label) } : {}),
        kind: 'feedback'
      });
      continue;
    }

    const standardEdgeMatch = line.match(STANDARD_EDGE_PATTERN);
    if (standardEdgeMatch) {
      const [, from, to, label] = standardEdgeMatch;
      if (!from || !to) {
        throw new Error(`Graph line ${lineNumber}: invalid edge.`);
      }

      edges.push({
        from,
        to,
        ...(label ? { label: decodeLabel(label) } : {}),
        kind: 'default'
      });
      continue;
    }

    const nodeMatch = line.match(NODE_PATTERN);
    if (nodeMatch) {
      const [, id, rawKind, rawLabel] = nodeMatch;
      if (!id || !rawLabel) {
        throw new Error(`Graph line ${lineNumber}: invalid node.`);
      }
      if (nodeIds.has(id)) {
        throw new Error(`Graph line ${lineNumber}: duplicate node "${id}".`);
      }

      nodeIds.add(id);
      nodes.push({
        id,
        label: decodeLabel(rawLabel),
        kind: (rawKind ?? 'default') as GraphNodeKind
      });
      continue;
    }

    throw new Error(`Graph line ${lineNumber}: cannot parse "${line}".`);
  }

  if (nodes.length === 0) {
    throw new Error('Graph must define at least one node.');
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.from)) {
      throw new Error(`Graph edge references unknown node "${edge.from}".`);
    }
    if (!nodeIds.has(edge.to)) {
      throw new Error(`Graph edge references unknown node "${edge.to}".`);
    }
  }

  return {
    ...(title ? { title } : {}),
    direction,
    nodes,
    edges
  };
}
