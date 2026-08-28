import type {
  DiagramLayoutMode,
  GraphDefinition,
  GraphEdge,
  GraphLayout,
  GraphNode,
  PositionedNode
} from './model';

const ARTBOARD_WIDTH = 720;
const ARTBOARD_MIN_HEIGHT = 220;
const NODE_WIDTH = 152;
const NODE_LINE_HEIGHT = 18;
const NODE_PADDING_Y = 14;
const NODE_HEIGHT = NODE_LINE_HEIGHT + NODE_PADDING_Y * 2;
const MAX_LABEL_CHARS = 20;
const COLUMN_GAP = 20;
const ROW_GAP = 64;
const RANK_GAP = 60;
const STACK_GAP = 22;
const MARGIN_X = 24;
const MARGIN_Y = 28;
const LONG_EDGE_LANE_GAP = 10;
const CONTENT_VIEWPORT_PADDING = 28;

export interface GraphCompileOptions {
  readonly layout?: DiagramLayoutMode;
  readonly serpentineColumns?: number;
  readonly viewport?: 'artboard' | 'content';
  readonly viewportPadding?: number;
}

interface SizedNode {
  readonly node: GraphNode;
  readonly width: number;
  readonly height: number;
  readonly rank: number;
}

interface SvgViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface EdgeRoute {
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const isFeedbackEdge = (edge: GraphEdge): boolean => (edge.kind ?? 'default') === 'feedback';

const wrapLine = (line: string): string[] => {
  const trimmed = line.trim();
  if (trimmed.length <= MAX_LABEL_CHARS) return [trimmed];

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > MAX_LABEL_CHARS) {
      if (current) {
        lines.push(current);
        current = '';
      }
      for (let offset = 0; offset < word.length; offset += MAX_LABEL_CHARS) {
        lines.push(word.slice(offset, offset + MAX_LABEL_CHARS));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= MAX_LABEL_CHARS) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
};

const nodeLines = (label: string): string[] => label.split('\n').flatMap((line) => wrapLine(line));

const estimateNodeSize = (node: GraphNode) => {
  const lineCount = Math.max(nodeLines(node.label).length, 1);
  return { width: NODE_WIDTH, height: NODE_HEIGHT + (lineCount - 1) * NODE_LINE_HEIGHT };
};

const buildRanks = (graph: GraphDefinition): number[] => {
  const nodeIndex = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of graph.edges) {
    if (isFeedbackEdge(edge)) continue;
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue = graph.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const rankById = new Map(graph.nodes.map((node) => [node.id, 0]));
  let visited = 0;

  while (queue.length > 0) {
    queue.sort((left, right) => (nodeIndex.get(left) ?? 0) - (nodeIndex.get(right) ?? 0));
    const current = queue.shift();
    if (!current) break;
    visited += 1;

    for (const target of outgoing.get(current) ?? []) {
      rankById.set(target, Math.max(rankById.get(target) ?? 0, (rankById.get(current) ?? 0) + 1));
      const remaining = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }

  if (visited !== graph.nodes.length) {
    throw new Error('Graph contains a cycle. Only directed acyclic graphs are supported.');
  }

  return graph.nodes.map((node) => rankById.get(node.id) ?? 0);
};

const buildRawRanks = (graph: GraphDefinition, nodeRanks: readonly number[]): SizedNode[][] => {
  const rankCount = Math.max(...nodeRanks) + 1;
  const ranks: SizedNode[][] = Array.from({ length: rankCount }, () => []);
  graph.nodes.forEach((node, index) => {
    const rank = nodeRanks[index] ?? 0;
    ranks[rank]?.push({ node, ...estimateNodeSize(node), rank });
  });
  return ranks;
};

const centerArtboardHeight = (contentHeight: number): { height: number; offsetY: number } => {
  const height = Math.max(ARTBOARD_MIN_HEIGHT, contentHeight + MARGIN_Y * 2);
  return { height, offsetY: (height - contentHeight) / 2 };
};

const defaultSerpentineColumns = (nodeCount: number): number => {
  if (nodeCount <= 3) return Math.max(nodeCount, 1);
  if (nodeCount === 4) return 2;
  if (nodeCount <= 6) return 3;
  return 4;
};

const resolveSerpentineColumns = (nodeCount: number, preferred?: number): number => {
  if (preferred === undefined) return defaultSerpentineColumns(nodeCount);
  return Math.max(1, Math.min(Math.floor(preferred), Math.min(nodeCount, 4)));
};

const createSerpentineLayout = (
  rawRanks: readonly (readonly SizedNode[])[],
  preferredColumns?: number
): GraphLayout => {
  const ordered = rawRanks.flat();
  const columns = resolveSerpentineColumns(ordered.length, preferredColumns);
  const rows: SizedNode[][] = [];
  for (let index = 0; index < ordered.length; index += columns) rows.push(ordered.slice(index, index + columns));

  const rowHeights = rows.map((row) => Math.max(...row.map((item) => item.height), NODE_HEIGHT));
  const contentHeight = rowHeights.reduce((total, height, index) => total + height + (index > 0 ? ROW_GAP : 0), 0);
  const { height, offsetY } = centerArtboardHeight(contentHeight);
  const positionedRows: PositionedNode[][] = [];
  let y = offsetY;

  rows.forEach((row, rowIndex) => {
    const rowHeight = rowHeights[rowIndex] ?? NODE_HEIGHT;
    const rowWidth = row.length * NODE_WIDTH + Math.max(row.length - 1, 0) * COLUMN_GAP;
    const startX = (ARTBOARD_WIDTH - rowWidth) / 2;
    const positioned: PositionedNode[] = [];

    row.forEach((item, itemIndex) => {
      const visualIndex = rowIndex % 2 === 0 ? itemIndex : row.length - 1 - itemIndex;
      positioned.push({
        ...item.node,
        width: item.width,
        height: item.height,
        x: startX + visualIndex * (NODE_WIDTH + COLUMN_GAP) + NODE_WIDTH / 2,
        y: y + rowHeight / 2,
        rank: item.rank
      });
    });

    positionedRows.push(positioned);
    y += rowHeight + ROW_GAP;
  });

  return { kind: 'serpentine', width: ARTBOARD_WIDTH, height, nodes: positionedRows.flat(), ranks: positionedRows };
};

const createLayeredTbLayout = (rawRanks: readonly (readonly SizedNode[])[]): GraphLayout => {
  const visualRows: { items: readonly SizedNode[]; semanticRank: number }[] = [];
  rawRanks.forEach((rank, semanticRank) => {
    for (let index = 0; index < rank.length; index += 4) {
      visualRows.push({ items: rank.slice(index, index + 4), semanticRank });
    }
  });

  const rowHeights = visualRows.map(({ items }) => Math.max(...items.map((item) => item.height), NODE_HEIGHT));
  let contentHeight = rowHeights.reduce((total, rowHeight) => total + rowHeight, 0);
  for (let index = 1; index < visualRows.length; index += 1) {
    contentHeight += visualRows[index - 1]?.semanticRank === visualRows[index]?.semanticRank ? STACK_GAP : RANK_GAP;
  }

  const { height, offsetY } = centerArtboardHeight(contentHeight);
  const positionedRows: PositionedNode[][] = [];
  let y = offsetY;

  visualRows.forEach((row, rowIndex) => {
    const rowHeight = rowHeights[rowIndex] ?? NODE_HEIGHT;
    const rowWidth = row.items.length * NODE_WIDTH + Math.max(row.items.length - 1, 0) * COLUMN_GAP;
    let x = (ARTBOARD_WIDTH - rowWidth) / 2;
    const positioned: PositionedNode[] = [];

    for (const item of row.items) {
      positioned.push({ ...item.node, width: item.width, height: item.height, x: x + NODE_WIDTH / 2, y: y + rowHeight / 2, rank: item.rank });
      x += NODE_WIDTH + COLUMN_GAP;
    }

    positionedRows.push(positioned);
    const next = visualRows[rowIndex + 1];
    if (next) y += rowHeight + (next.semanticRank === row.semanticRank ? STACK_GAP : RANK_GAP);
  });

  return { kind: 'layered-tb', width: ARTBOARD_WIDTH, height, nodes: positionedRows.flat(), ranks: positionedRows };
};

const createLayeredLrLayout = (rawRanks: readonly (readonly SizedNode[])[]): GraphLayout => {
  const columnHeights = rawRanks.map((rank) => rank.reduce((total, item, index) => total + item.height + (index > 0 ? STACK_GAP : 0), 0));
  const contentHeight = Math.max(...columnHeights, NODE_HEIGHT);
  const { height, offsetY } = centerArtboardHeight(contentHeight);
  const contentWidth = rawRanks.length * NODE_WIDTH + Math.max(rawRanks.length - 1, 0) * RANK_GAP;
  let x = (ARTBOARD_WIDTH - contentWidth) / 2;
  const positionedRanks: PositionedNode[][] = [];

  rawRanks.forEach((rank, rankIndex) => {
    const columnHeight = columnHeights[rankIndex] ?? NODE_HEIGHT;
    let y = offsetY + (contentHeight - columnHeight) / 2;
    const positioned: PositionedNode[] = [];

    for (const item of rank) {
      positioned.push({ ...item.node, width: item.width, height: item.height, x: x + NODE_WIDTH / 2, y: y + item.height / 2, rank: item.rank });
      y += item.height + STACK_GAP;
    }

    positionedRanks.push(positioned);
    x += NODE_WIDTH + RANK_GAP;
  });

  return { kind: 'layered-lr', width: ARTBOARD_WIDTH, height, nodes: positionedRanks.flat(), ranks: positionedRanks };
};

const findFanoutHub = (graph: GraphDefinition): string | undefined => {
  const structuralEdges = graph.edges.filter((edge) => !isFeedbackEdge(edge));
  if (structuralEdges.length !== graph.nodes.length - 1 || graph.nodes.length < 5) return undefined;
  const outgoing = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of structuralEdges) outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
  return graph.nodes.find((node) => (outgoing.get(node.id) ?? 0) === graph.nodes.length - 1)?.id;
};

const createFanoutLayout = (graph: GraphDefinition, nodeRanks: readonly number[], hubId: string): GraphLayout => {
  const hubIndex = graph.nodes.findIndex((node) => node.id === hubId);
  const hub = graph.nodes[hubIndex];
  if (!hub) throw new Error(`Unknown fanout hub "${hubId}".`);

  const hubSize = estimateNodeSize(hub);
  const children = graph.nodes.map((node, index) => ({ node, index })).filter(({ node }) => node.id !== hubId);
  const rowCount = Math.ceil(children.length / 2);
  const childRows = children.map(({ node }) => estimateNodeSize(node));
  const rowHeight = Math.max(...childRows.map((size) => size.height), NODE_HEIGHT);
  const childGap = 32;
  const contentHeight = hubSize.height + 62 + rowCount * rowHeight + Math.max(rowCount - 1, 0) * childGap;
  const { height, offsetY } = centerArtboardHeight(contentHeight);
  const hubPosition: PositionedNode = { ...hub, ...hubSize, x: ARTBOARD_WIDTH / 2, y: offsetY + hubSize.height / 2, rank: nodeRanks[hubIndex] ?? 0 };
  const leftX = ARTBOARD_WIDTH * 0.28;
  const rightX = ARTBOARD_WIDTH * 0.72;
  const positionedChildren: PositionedNode[] = [];
  let childY = offsetY + hubSize.height + 62 + rowHeight / 2;

  children.forEach(({ node, index }, childIndex) => {
    const size = estimateNodeSize(node);
    positionedChildren.push({ ...node, ...size, x: childIndex % 2 === 0 ? leftX : rightX, y: childY, rank: nodeRanks[index] ?? 1 });
    if (childIndex % 2 === 1) childY += rowHeight + childGap;
  });

  return { kind: 'fanout', width: ARTBOARD_WIDTH, height, nodes: [hubPosition, ...positionedChildren], ranks: [[hubPosition], positionedChildren] };
};

export const createGraphLayout = (graph: GraphDefinition, options: GraphCompileOptions = {}): GraphLayout => {
  const nodeRanks = buildRanks(graph);
  const rawRanks = buildRawRanks(graph, nodeRanks);
  const layout = options.layout ?? 'auto';

  if (layout === 'serpentine') return createSerpentineLayout(rawRanks, options.serpentineColumns);
  if (layout === 'layered-lr') return createLayeredLrLayout(rawRanks);
  if (layout === 'layered-tb') return createLayeredTbLayout(rawRanks);
  if (layout === 'fanout') {
    const hub = findFanoutHub(graph);
    if (!hub) throw new Error('Fanout layout requires exactly one hub connected to every other node.');
    return createFanoutLayout(graph, nodeRanks, hub);
  }

  const fanoutHub = findFanoutHub(graph);
  if (fanoutHub) return createFanoutLayout(graph, nodeRanks, fanoutHub);
  if (rawRanks.every((rank) => rank.length === 1)) return createSerpentineLayout(rawRanks, options.serpentineColumns);

  const lrWidth = rawRanks.length * NODE_WIDTH + Math.max(rawRanks.length - 1, 0) * RANK_GAP;
  const canUseLr = graph.direction === 'LR' && Math.max(...rawRanks.map((rank) => rank.length)) <= 3;
  if (canUseLr && lrWidth <= ARTBOARD_WIDTH - MARGIN_X * 2) return createLayeredLrLayout(rawRanks);
  return createLayeredTbLayout(rawRanks);
};

const renderNodeLabel = (node: PositionedNode): string => {
  const lines = nodeLines(node.label);
  const startY = node.y - ((lines.length - 1) * NODE_LINE_HEIGHT) / 2;
  return lines.map((line, index) => `<tspan x="${node.x}" y="${startY + index * NODE_LINE_HEIGHT}">${escapeHtml(line)}</tspan>`).join('');
};

const regularEdgePath = (from: PositionedNode, to: PositionedNode): EdgeRoute => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    const direction = Math.sign(dx) || 1;
    const startX = from.x + (from.width / 2) * direction;
    const startY = from.y;
    const endX = to.x - (to.width / 2) * direction;
    const endY = to.y;
    const middleX = (startX + endX) / 2;
    return {
      path: `M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}`,
      labelX: middleX,
      labelY: (startY + endY) / 2 - 8,
      minX: Math.min(startX, endX, middleX), minY: Math.min(startY, endY), maxX: Math.max(startX, endX, middleX), maxY: Math.max(startY, endY)
    };
  }

  const direction = Math.sign(dy) || 1;
  const startX = from.x;
  const startY = from.y + (from.height / 2) * direction;
  const endX = to.x;
  const endY = to.y - (to.height / 2) * direction;
  const middleY = (startY + endY) / 2;
  return {
    path: `M ${startX} ${startY} V ${middleY} H ${endX} V ${endY}`,
    labelX: (startX + endX) / 2 + 8,
    labelY: middleY - 8,
    minX: Math.min(startX, endX), minY: Math.min(startY, endY, middleY), maxX: Math.max(startX, endX), maxY: Math.max(startY, endY, middleY)
  };
};

const fanoutEdgePath = (from: PositionedNode, to: PositionedNode): EdgeRoute => {
  const goesLeft = to.x < from.x;
  const laneX = goesLeft ? MARGIN_X / 2 : ARTBOARD_WIDTH - MARGIN_X / 2;
  const startX = from.x + (goesLeft ? -from.width / 2 : from.width / 2);
  const endX = to.x + (goesLeft ? -to.width / 2 : to.width / 2);
  return {
    path: `M ${startX} ${from.y} H ${laneX} V ${to.y} H ${endX}`,
    labelX: laneX + (goesLeft ? 8 : -8), labelY: (from.y + to.y) / 2,
    minX: Math.min(startX, endX, laneX), minY: Math.min(from.y, to.y), maxX: Math.max(startX, endX, laneX), maxY: Math.max(from.y, to.y)
  };
};

const longEdgePath = (from: PositionedNode, to: PositionedNode, longEdgeIndex: number): EdgeRoute => {
  const laneX = ARTBOARD_WIDTH - 8 - longEdgeIndex * LONG_EDGE_LANE_GAP;
  const startX = from.x + from.width / 2;
  const endX = to.x + to.width / 2;
  return {
    path: `M ${startX} ${from.y} H ${laneX} V ${to.y} H ${endX}`,
    labelX: laneX - 8, labelY: (from.y + to.y) / 2 - 8,
    minX: Math.min(startX, endX, laneX), minY: Math.min(from.y, to.y), maxX: Math.max(startX, endX, laneX), maxY: Math.max(from.y, to.y)
  };
};

const feedbackEdgePath = (from: PositionedNode, to: PositionedNode, layout: GraphLayout): EdgeRoute => {
  const startX = from.x;
  const startY = from.y - from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  const leftNodeBoundary = Math.min(...layout.nodes.map((node) => node.x - node.width / 2));
  const laneX = Math.max(MARGIN_X / 2, leftNodeBoundary - 20);
  const verticalBend = Math.min(44, Math.max(28, Math.abs(startY - endY) * 0.18));
  const c1x = laneX;
  const c1y = startY - verticalBend;
  const c2x = laneX;
  const c2y = endY + verticalBend;
  return {
    path: `M ${startX} ${startY} C ${c1x} ${c1y} ${c2x} ${c2y} ${endX} ${endY}`,
    labelX: laneX + 10, labelY: (startY + endY) / 2 - 6,
    minX: Math.min(startX, endX, c1x, c2x), minY: Math.min(startY, endY, c1y, c2y), maxX: Math.max(startX, endX, c1x, c2x), maxY: Math.max(startY, endY, c1y, c2y)
  };
};

const edgePath = (from: PositionedNode, to: PositionedNode, layout: GraphLayout, longEdgeIndex: number): EdgeRoute => {
  if (layout.kind === 'fanout') return fanoutEdgePath(from, to);
  if (to.rank - from.rank > 1) return longEdgePath(from, to, longEdgeIndex);
  return regularEdgePath(from, to);
};

const stableId = (graph: GraphDefinition, options: GraphCompileOptions): string => {
  const source = JSON.stringify({ graph, options });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `graph-arrow-${(hash >>> 0).toString(36)}`;
};

const resolveViewport = (layout: GraphLayout, routes: readonly EdgeRoute[], options: GraphCompileOptions): SvgViewport => {
  if (options.viewport !== 'content' || layout.nodes.length === 0) {
    return { x: 0, y: 0, width: layout.width, height: layout.height };
  }

  const padding = Math.max(options.viewportPadding ?? CONTENT_VIEWPORT_PADDING, 0);
  const nodeMinX = Math.min(...layout.nodes.map((node) => node.x - node.width / 2));
  const nodeMaxX = Math.max(...layout.nodes.map((node) => node.x + node.width / 2));
  const nodeMinY = Math.min(...layout.nodes.map((node) => node.y - node.height / 2));
  const nodeMaxY = Math.max(...layout.nodes.map((node) => node.y + node.height / 2));
  const routeMinX = routes.length ? Math.min(...routes.map((route) => Math.min(route.minX, route.labelX))) : nodeMinX;
  const routeMaxX = routes.length ? Math.max(...routes.map((route) => Math.max(route.maxX, route.labelX))) : nodeMaxX;
  const routeMinY = routes.length ? Math.min(...routes.map((route) => Math.min(route.minY, route.labelY))) : nodeMinY;
  const routeMaxY = routes.length ? Math.max(...routes.map((route) => Math.max(route.maxY, route.labelY))) : nodeMaxY;
  const minX = Math.min(nodeMinX, routeMinX);
  const maxX = Math.max(nodeMaxX, routeMaxX);
  const minY = Math.min(nodeMinY, routeMinY);
  const maxY = Math.max(nodeMaxY, routeMaxY);
  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const boundedMaxX = Math.min(layout.width, maxX + padding);
  const boundedMaxY = Math.min(layout.height, maxY + padding);

  return { x, y, width: Math.max(boundedMaxX - x, 1), height: Math.max(boundedMaxY - y, 1) };
};

const svgNumber = (value: number): string => Number(value.toFixed(2)).toString();

export function compileGraphSvg(graph: GraphDefinition, options: GraphCompileOptions = {}): string {
  const layout = createGraphLayout(graph, options);
  const arrowId = stableId(graph, options);
  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
  let longEdgeIndex = 0;

  const routedEdges = graph.edges.flatMap((edge) => {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!from || !to) return [];
    const feedback = isFeedbackEdge(edge);
    const isLong = !feedback && to.rank - from.rank > 1;
    const route = feedback ? feedbackEdgePath(from, to, layout) : edgePath(from, to, layout, isLong ? longEdgeIndex++ : 0);
    return [{ edge, feedback, route }];
  });

  const viewport = resolveViewport(layout, routedEdges.map(({ route }) => route), options);
  const edges = routedEdges.map(({ edge, feedback, route }) => {
    const label = edge.label ? `<text class="graph-edge-label" x="${route.labelX}" y="${route.labelY}">${escapeHtml(edge.label)}</text>` : '';
    const edgeClass = feedback ? 'graph-edge graph-edge--feedback' : 'graph-edge';
    return `<g class="${edgeClass}"><path d="${route.path}" marker-end="url(#${arrowId})"/>${label}</g>`;
  }).join('');

  const nodes = layout.nodes.map((node) => `<g class="graph-node graph-node--${node.kind}">
  <rect x="${node.x - node.width / 2}" y="${node.y - node.height / 2}" width="${node.width}" height="${node.height}" rx="4"/>
  <text x="${node.x}" y="${node.y}">${renderNodeLabel(node)}</text>
</g>`).join('');

  const title = graph.title ? `<figcaption>${escapeHtml(graph.title)}</figcaption>` : '';
  const aria = graph.title ? ` aria-label="${escapeHtml(graph.title)}"` : ' aria-label="Architecture diagram"';
  const svgWidth = Math.ceil(viewport.width);
  const svgHeight = Math.ceil(viewport.height);
  const viewBox = [viewport.x, viewport.y, viewport.width, viewport.height].map(svgNumber).join(' ');

  return `<figure class="article-graph" data-graph-layout="${layout.kind}">
${title}
<div class="article-graph__viewport">
<div class="article-graph__stage">
<svg class="article-graph__svg" width="${svgWidth}" height="${svgHeight}" viewBox="${viewBox}" role="img"${aria}>
  <defs>
    <marker id="${arrowId}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 8 4 L 0 8 z" class="graph-arrow"/>
    </marker>
  </defs>
  ${edges}
  ${nodes}
</svg>
</div>
</div>
</figure>`;
}
