import { DiagramSyntaxError } from './errors';
import {
  DEFAULT_DIAGRAM_OPTIONS,
  type DiagramLayoutMode,
  type DiagramSkin,
  type DiagramViewport,
  type GraphDefinition,
  type GraphDirection,
  type GraphEdge,
  type GraphNode,
  type GraphNodeKind
} from './model';
import { validateDiagram } from './validation';

const NODE_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*)(?:\[(default|terminal|accent|muted)\])?\s*:\s*(.+)$/;
const STANDARD_EDGE_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*)\s*->\s*([A-Za-z][A-Za-z0-9_-]*)(?:\s*\|\s*(.+))?$/;
const FEEDBACK_EDGE_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*)\s*~>\s*([A-Za-z][A-Za-z0-9_-]*)(?:\s*\|\s*(.+))?$/;
const LAYOUTS: readonly DiagramLayoutMode[] = ['auto', 'serpentine', 'fanout', 'layered-lr', 'layered-tb'];
const VIEWPORTS: readonly DiagramViewport[] = ['artboard', 'content'];
const SKINS: readonly DiagramSkin[] = ['clean', 'handdrawn'];

type DirectiveName = 'title' | 'direction' | 'layout' | 'columns' | 'viewport' | 'skin';

const decodeLabel = (value: string): string => value.trim().replaceAll('\\n', '\n');

const parseDirection = (value: string, lineNumber: number): GraphDirection => {
  const direction = value.trim().toUpperCase();
  if (direction === 'TB' || direction === 'LR') {
    return direction;
  }
  throw new DiagramSyntaxError('direction must be TB or LR.', lineNumber, 'direction');
};

const parseLayout = (value: string, lineNumber: number): DiagramLayoutMode => {
  const layout = value.trim().toLowerCase() as DiagramLayoutMode;
  if (LAYOUTS.includes(layout)) return layout;
  throw new DiagramSyntaxError(
    `unsupported layout "${value.trim()}". Expected: ${LAYOUTS.join(', ')}.`,
    lineNumber,
    'layout'
  );
};

const parseColumns = (value: string, lineNumber: number): number => {
  const raw = value.trim();
  if (!/^\d+$/.test(raw)) {
    throw new DiagramSyntaxError('columns must be an integer between 1 and 4.', lineNumber, 'columns');
  }
  const columns = Number(raw);
  if (columns < 1 || columns > 4) {
    throw new DiagramSyntaxError('columns must be an integer between 1 and 4.', lineNumber, 'columns');
  }
  return columns;
};

const parseViewport = (value: string, lineNumber: number): DiagramViewport => {
  const viewport = value.trim().toLowerCase() as DiagramViewport;
  if (VIEWPORTS.includes(viewport)) return viewport;
  throw new DiagramSyntaxError('viewport must be "artboard" or "content".', lineNumber, 'viewport');
};

const parseSkin = (value: string, lineNumber: number): DiagramSkin => {
  const skin = value.trim().toLowerCase() as DiagramSkin;
  if (SKINS.includes(skin)) return skin;
  throw new DiagramSyntaxError('skin must be "clean" or "handdrawn".', lineNumber, 'skin');
};

export function parseGraph(source: string): GraphDefinition {
  let title: string | undefined;
  let direction: GraphDirection = 'TB';
  let layout = DEFAULT_DIAGRAM_OPTIONS.layout;
  let columns: number | undefined;
  let viewport = DEFAULT_DIAGRAM_OPTIONS.viewport;
  let skin = DEFAULT_DIAGRAM_OPTIONS.skin;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();
  const seenDirectives = new Set<DirectiveName>();
  let columnsLine: number | undefined;

  const markDirective = (name: DirectiveName, lineNumber: number) => {
    if (seenDirectives.has(name)) {
      throw new DiagramSyntaxError(`duplicate "${name}" directive.`, lineNumber, name);
    }
    seenDirectives.add(name);
  };

  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? '';
    const line = rawLine.trim();
    const lineNumber = index + 1;

    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('title:')) {
      markDirective('title', lineNumber);
      title = decodeLabel(line.slice('title:'.length));
      continue;
    }
    if (line.startsWith('direction:')) {
      markDirective('direction', lineNumber);
      direction = parseDirection(line.slice('direction:'.length), lineNumber);
      continue;
    }
    if (line.startsWith('layout:')) {
      markDirective('layout', lineNumber);
      layout = parseLayout(line.slice('layout:'.length), lineNumber);
      continue;
    }
    if (line.startsWith('columns:')) {
      markDirective('columns', lineNumber);
      columns = parseColumns(line.slice('columns:'.length), lineNumber);
      columnsLine = lineNumber;
      continue;
    }
    if (line.startsWith('viewport:')) {
      markDirective('viewport', lineNumber);
      viewport = parseViewport(line.slice('viewport:'.length), lineNumber);
      continue;
    }
    if (line.startsWith('skin:')) {
      markDirective('skin', lineNumber);
      skin = parseSkin(line.slice('skin:'.length), lineNumber);
      continue;
    }

    const feedbackEdgeMatch = line.match(FEEDBACK_EDGE_PATTERN);
    if (feedbackEdgeMatch) {
      const [, from, to, label] = feedbackEdgeMatch;
      if (!from || !to) throw new DiagramSyntaxError('invalid feedback edge.', lineNumber);
      edges.push({ from, to, ...(label ? { label: decodeLabel(label) } : {}), kind: 'feedback' });
      continue;
    }

    const standardEdgeMatch = line.match(STANDARD_EDGE_PATTERN);
    if (standardEdgeMatch) {
      const [, from, to, label] = standardEdgeMatch;
      if (!from || !to) throw new DiagramSyntaxError('invalid edge.', lineNumber);
      edges.push({ from, to, ...(label ? { label: decodeLabel(label) } : {}), kind: 'default' });
      continue;
    }

    const nodeMatch = line.match(NODE_PATTERN);
    if (nodeMatch) {
      const [, id, rawKind, rawLabel] = nodeMatch;
      if (!id || !rawLabel) throw new DiagramSyntaxError('invalid node.', lineNumber);
      if (nodeIds.has(id)) throw new DiagramSyntaxError(`duplicate node "${id}".`, lineNumber);
      nodeIds.add(id);
      nodes.push({ id, label: decodeLabel(rawLabel), kind: (rawKind ?? 'default') as GraphNodeKind });
      continue;
    }

    throw new DiagramSyntaxError(`cannot parse "${line}".`, lineNumber);
  }

  if (nodes.length === 0) throw new Error('Graph must define at least one node.');

  for (const edge of edges) {
    if (!nodeIds.has(edge.from)) throw new Error(`Graph edge references unknown node "${edge.from}".`);
    if (!nodeIds.has(edge.to)) throw new Error(`Graph edge references unknown node "${edge.to}".`);
  }

  const graph: GraphDefinition = {
    ...(title ? { title } : {}),
    direction,
    options: {
      layout,
      ...(columns !== undefined ? { columns } : {}),
      viewport,
      skin
    },
    nodes,
    edges
  };

  validateDiagram(graph, { ...(columnsLine !== undefined ? { columns: columnsLine } : {}) });
  return graph;
}
