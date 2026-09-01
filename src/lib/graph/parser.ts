import type {
  GraphDiagramDefinition,
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
  if (direction === 'TB' || direction === 'LR') return direction;
  throw new Error(`Graph line ${lineNumber}: direction must be TB or LR.`);
};

const edgeKey = (edge: GraphEdge): string =>
  `${edge.kind ?? 'default'}:${edge.from}->${edge.to}:${edge.label ?? ''}`;

export function parseGraph(source: string): GraphDiagramDefinition {
  let title: string | undefined;
  let direction: GraphDirection = 'TB';
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();
  const edgeKeys = new Set<string>();

  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? '').trim();
    const lineNumber = index + 1;
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('title:')) {
      title = decodeLabel(line.slice('title:'.length));
      continue;
    }

    if (line.startsWith('direction:')) {
      direction = parseDirection(line.slice('direction:'.length), lineNumber);
      continue;
    }

    const feedbackMatch = line.match(FEEDBACK_EDGE_PATTERN);
    if (feedbackMatch) {
      const [, from, to, rawLabel] = feedbackMatch;
      if (!from || !to) throw new Error(`Graph line ${lineNumber}: invalid feedback edge.`);
      const edge: GraphEdge = {
        from,
        to,
        ...(rawLabel ? { label: decodeLabel(rawLabel) } : {}),
        kind: 'feedback'
      };
      const key = edgeKey(edge);
      if (edgeKeys.has(key)) throw new Error(`Graph line ${lineNumber}: duplicate edge ${from} -> ${to}.`);
      edgeKeys.add(key);
      edges.push(edge);
      continue;
    }

    const standardMatch = line.match(STANDARD_EDGE_PATTERN);
    if (standardMatch) {
      const [, from, to, rawLabel] = standardMatch;
      if (!from || !to) throw new Error(`Graph line ${lineNumber}: invalid edge.`);
      const edge: GraphEdge = {
        from,
        to,
        ...(rawLabel ? { label: decodeLabel(rawLabel) } : {}),
        kind: 'default'
      };
      const key = edgeKey(edge);
      if (edgeKeys.has(key)) throw new Error(`Graph line ${lineNumber}: duplicate edge ${from} -> ${to}.`);
      edgeKeys.add(key);
      edges.push(edge);
      continue;
    }

    const nodeMatch = line.match(NODE_PATTERN);
    if (nodeMatch) {
      const [, id, rawKind, rawLabel] = nodeMatch;
      if (!id || !rawLabel) throw new Error(`Graph line ${lineNumber}: invalid node.`);
      if (nodeIds.has(id)) throw new Error(`Graph line ${lineNumber}: duplicate node "${id}".`);
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

  if (nodes.length === 0) throw new Error('Graph must define at least one node.');

  for (const edge of edges) {
    if (!nodeIds.has(edge.from)) throw new Error(`Graph edge references unknown node "${edge.from}".`);
    if (!nodeIds.has(edge.to)) throw new Error(`Graph edge references unknown node "${edge.to}".`);
  }

  return {
    kind: 'graph',
    ...(title ? { title } : {}),
    direction,
    nodes,
    edges
  };
}
