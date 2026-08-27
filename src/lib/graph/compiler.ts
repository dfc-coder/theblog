import type {
  GraphDefinition,
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

export interface GraphCompileOptions {
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

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const wrapLine = (line: string): string[] => {
  const trimmed = line.trim();
  if (trimmed.length <= MAX_LABEL_CHARS) {
    return [trimmed];
  }

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
    if (candidate.length <= MAX_LABEL_CHARS) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
};

const nodeLines = (label: string): string[] =>
  label.split('\n').flatMap((line) => wrapLine(line));

const estimateNodeSize = (node: GraphNode) => {
  const lineCount = Math.max(nodeLines(node.label).length, 1);

  return {
    width: NODE_WIDTH,
    height: NODE_HEIGHT + (lineCount - 1) * NODE_LINE_HEIGHT
  };
};

const buildRanks = (graph: GraphDefinition): number[] => {
  const nodeIndex = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of graph.edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue = graph.nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const rankById = new Map(graph.nodes.map((node) => [node.id, 0]));
  let visited = 0;

  while (queue.length > 0) {
    queue.sort((left, right) => (nodeIndex.get(left) ?? 0) - (nodeIndex.get(right) ?? 0));
    const current = queue.shift();
    if (!current) {
      break;
    }
    visited += 1;

    for (const target of outgoing.get(current) ?? []) {
      rankById.set(target, Math.max(rankById.get(target) ?? 0, (rankById.get(current) ?? 0) + 1));
      const remaining = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) {
        queue.push(target);
      }
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
  return {
    height,
    offsetY: (height - contentHeight) / 2
  };
};

const defaultSerpentineColumns = (nodeCount: number): number => {
  if (nodeCount <= 3) {
    return Math.max(nodeCount, 1);
  }
  if (nodeCount === 4) {
    return 2;
  }
  if (nodeCount <= 6) {
    return 3;
  }
  return 4;
};

const resolveSerpentineColumns = (nodeCount: number, preferred?: number): number => {
  if (preferred === undefined) {
    return defaultSerpentineColumns(nodeCount);
  }

  return Math.max(1, Math.min(Math.floor(preferred), Math.min(nodeCount, 4)));
};

const createSerpentineLayout = (
  graph: GraphDefinition,
  rawRanks: readonly (readonly SizedNode[])[],
  preferredColumns?: number
): GraphLayout => {
  const ordered = rawRanks.flat();
  const columns = resolveSerpentineColumns(ordered.length, preferredColumns);
  const rows: SizedNode[][] = [];

  for (let index = 0; index < ordered.length; index += columns) {
    rows.push(ordered.slice(index, index + columns));
  }

  const rowHeights = rows.map((row) => Math.max(...row.map((item) => item.height), NODE_HEIGHT));
  const contentHeight = rowHeights.reduce(
    (total, height, index) => total + height + (index > 0 ? ROW_GAP : 0),
    0
  );
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

  return {
    kind: 'serpentine',
    width: ARTBOARD_WIDTH,
    height,
    nodes: positionedRows.flat(),
    ranks: positionedRows
  };
};

const createLayeredTbLayout = (rawRanks: readonly (readonly SizedNode[])[]): GraphLayout => {
  const visualRows: { items: readonly SizedNode[]; semanticRank: number }[] = [];

  rawRanks.forEach((rank, semanticRank) => {
    for (let index = 0; index < rank.length; index += 4) {
      visualRows.push({ items: rank.slice(index, index + 4), semanticRank });
    }
  });

  const rowHeights = visualRows.map(({ items }) =>
    Math.max(...items.map((item) => item.height), NODE_HEIGHT)
  );
  let contentHeight = rowHeights.reduce((total, rowHeight) => total + rowHeight, 0);

  for (let index = 1; index < visualRows.length; index += 1) {
    contentHeight +=
      visualRows[index - 1]?.semanticRank === visualRows[index]?.semanticRank ? STACK_GAP : RANK_GAP;
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
      positioned.push({
        ...item.node,
        width: item.width,
        height: item.height,
        x: x + NODE_WIDTH / 2,
        y: y + rowHeight / 2,
        rank: item.rank
      });
      x += NODE_WIDTH + COLUMN_GAP;
    }

    positionedRows.push(positioned);
    const next = visualRows[rowIndex + 1];
    if (next) {
      y += rowHeight + (next.semanticRank === row.semanticRank ? STACK_GAP : RANK_GAP);
    }
  });

  return {
    kind: 'layered-tb',
    width: ARTBOARD_WIDTH,
    height,
    nodes: positionedRows.flat(),
    ranks: positionedRows
  };
};

const createLayeredLrLayout = (rawRanks: readonly (readonly SizedNode[])[]): GraphLayout => {
  const columnHeights = rawRanks.map((rank) =>
    rank.reduce((total, item, index) => total + item.height + (index > 0 ? STACK_GAP : 0), 0)
  );
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
      positioned.push({
        ...item.node,
        width: item.width,
        height: item.height,
        x: x + NODE_WIDTH / 2,
        y: y + item.height / 2,
        rank: item.rank
      });
      y += item.height + STACK_GAP;
    }

    positionedRanks.push(positioned);
    x += NODE_WIDTH + RANK_GAP;
  });

  return {
    kind: 'layered-lr',
    width: ARTBOARD_WIDTH,
    height,
    nodes: positionedRanks.flat(),
    ranks: positionedRanks
  };
};

const findFanoutHub = (graph: GraphDefinition): string | undefined => {
  if (graph.edges.length !== graph.nodes.length - 1 || graph.nodes.length < 5) {
    return undefined;
  }

  const outgoing = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
  }

  return graph.nodes.find((node) => (outgoing.get(node.id) ?? 0) === graph.nodes.length - 1)?.id;
};

const createFanoutLayout = (
  graph: GraphDefinition,
  nodeRanks: readonly number[],
  hubId: string
): GraphLayout => {
  const hubIndex = graph.nodes.findIndex((node) => node.id === hubId);
  const hub = graph.nodes[hubIndex];
  if (!hub) {
    throw new Error(`Unknown fanout hub "${hubId}".`);
  }

  const hubSize = estimateNodeSize(hub);
  const children = graph.nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.id !== hubId);
  const rowCount = Math.ceil(children.length / 2);
  const childRows = children.map(({ node }) => estimateNodeSize(node));
  const rowHeight = Math.max(...childRows.map((size) => size.height), NODE_HEIGHT);
  const childGap = 32;
  const contentHeight = hubSize.height + 62 + rowCount * rowHeight + Math.max(rowCount - 1, 0) * childGap;
  const { height, offsetY } = centerArtboardHeight(contentHeight);
  const hubPosition: PositionedNode = {
    ...hub,
    ...hubSize,
    x: ARTBOARD_WIDTH / 2,
    y: offsetY + hubSize.height / 2,
    rank: nodeRanks[hubIndex] ?? 0
  };
  const leftX = ARTBOARD_WIDTH * 0.28;
  const rightX = ARTBOARD_WIDTH * 0.72;
  const positionedChildren: PositionedNode[] = [];
  let childY = offsetY + hubSize.height + 62 + rowHeight / 2;

  children.forEach(({ node, index }, childIndex) => {
    const size = estimateNodeSize(node);
    positionedChildren.push({
      ...node,
      ...size,
      x: childIndex % 2 === 0 ? leftX : rightX,
      y: childY,
      rank: nodeRanks[index] ?? 1
    });

    if (childIndex % 2 === 1) {
      childY += rowHeight + childGap;
    }
  });

  return {
    kind: 'fanout',
    width: ARTBOARD_WIDTH,
    height,
    nodes: [hubPosition, ...positionedChildren],
    ranks: [[hubPosition], positionedChildren]
  };
};

const createLayout = (graph: GraphDefinition, options: GraphCompileOptions): GraphLayout => {
  const nodeRanks = buildRanks(graph);
  const rawRanks = buildRawRanks(graph, nodeRanks);
  const fanoutHub = findFanoutHub(graph);

  if (fanoutHub) {
    return createFanoutLayout(graph, nodeRanks, fanoutHub);
  }

  if (rawRanks.every((rank) => rank.length === 1)) {
    return createSerpentineLayout(graph, rawRanks, options.serpentineColumns);
  }

  const lrWidth = rawRanks.length * NODE_WIDTH + Math.max(rawRanks.length - 1, 0) * RANK_GAP;
  const canUseLr = graph.direction === 'LR' && Math.max(...rawRanks.map((rank) => rank.length)) <= 3;

  if (canUseLr && lrWidth <= ARTBOARD_WIDTH - MARGIN_X * 2) {
    return createLayeredLrLayout(rawRanks);
  }

  return createLayeredTbLayout(rawRanks);
};

const renderNodeLabel = (node: PositionedNode): string => {
  const lines = nodeLines(node.label);
  const startY = node.y - ((lines.length - 1) * NODE_LINE_HEIGHT) / 2;

  return lines
    .map(
      (line, index) =>
        `<tspan x="${node.x}" y="${startY + index * NODE_LINE_HEIGHT}">${escapeHtml(line)}</tspan>`
    )
    .join('');
};

const regularEdgePath = (
  from: PositionedNode,
  to: PositionedNode
): { path: string; labelX: number; labelY: number } => {
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
      labelY: (startY + endY) / 2 - 8
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
    labelY: middleY - 8
  };
};

const fanoutEdgePath = (
  from: PositionedNode,
  to: PositionedNode
): { path: string; labelX: number; labelY: number } => {
  const goesLeft = to.x < from.x;
  const laneX = goesLeft ? MARGIN_X / 2 : ARTBOARD_WIDTH - MARGIN_X / 2;
  const startX = from.x + (goesLeft ? -from.width / 2 : from.width / 2);
  const endX = to.x + (goesLeft ? -to.width / 2 : to.width / 2);

  return {
    path: `M ${startX} ${from.y} H ${laneX} V ${to.y} H ${endX}`,
    labelX: laneX + (goesLeft ? 8 : -8),
    labelY: (from.y + to.y) / 2
  };
};

const longEdgePath = (
  from: PositionedNode,
  to: PositionedNode,
  longEdgeIndex: number
): { path: string; labelX: number; labelY: number } => {
  const laneX = ARTBOARD_WIDTH - 8 - longEdgeIndex * LONG_EDGE_LANE_GAP;
  const startX = from.x + from.width / 2;
  const endX = to.x + to.width / 2;

  return {
    path: `M ${startX} ${from.y} H ${laneX} V ${to.y} H ${endX}`,
    labelX: laneX - 8,
    labelY: (from.y + to.y) / 2 - 8
  };
};

const edgePath = (
  from: PositionedNode,
  to: PositionedNode,
  layout: GraphLayout,
  longEdgeIndex: number
): { path: string; labelX: number; labelY: number } => {
  if (layout.kind === 'fanout') {
    return fanoutEdgePath(from, to);
  }

  if (to.rank - from.rank > 1) {
    return longEdgePath(from, to, longEdgeIndex);
  }

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

const resolveViewport = (layout: GraphLayout, options: GraphCompileOptions): SvgViewport => {
  if (options.viewport !== 'content' || layout.kind !== 'serpentine' || layout.nodes.length === 0) {
    return { x: 0, y: 0, width: layout.width, height: layout.height };
  }

  const padding = Math.max(options.viewportPadding ?? 28, 0);
  const minNodeX = Math.min(...layout.nodes.map((node) => node.x - node.width / 2));
  const maxNodeX = Math.max(...layout.nodes.map((node) => node.x + node.width / 2));
  const minNodeY = Math.min(...layout.nodes.map((node) => node.y - node.height / 2));
  const maxNodeY = Math.max(...layout.nodes.map((node) => node.y + node.height / 2));
  const x = Math.max(0, minNodeX - padding);
  const y = Math.max(0, minNodeY - padding);
  const maxX = Math.min(layout.width, maxNodeX + padding);
  const maxY = Math.min(layout.height, maxNodeY + padding);

  return {
    x,
    y,
    width: Math.max(maxX - x, 1),
    height: Math.max(maxY - y, 1)
  };
};

const svgNumber = (value: number): string => Number(value.toFixed(2)).toString();

export function compileGraphSvg(
  graph: GraphDefinition,
  options: GraphCompileOptions = {}
): string {
  const layout = createLayout(graph, options);
  const viewport = resolveViewport(layout, options);
  const arrowId = stableId(graph, options);
  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
  let longEdgeIndex = 0;

  const edges = graph.edges
    .map((edge) => {
      const from = nodesById.get(edge.from);
      const to = nodesById.get(edge.to);
      if (!from || !to) {
        return '';
      }

      const isLong = to.rank - from.rank > 1;
      const route = edgePath(from, to, layout, isLong ? longEdgeIndex++ : 0);
      const label = edge.label
        ? `<text class="graph-edge-label" x="${route.labelX}" y="${route.labelY}">${escapeHtml(edge.label)}</text>`
        : '';

      return `<g class="graph-edge"><path d="${route.path}" marker-end="url(#${arrowId})"/>${label}</g>`;
    })
    .join('');

  const nodes = layout.nodes
    .map(
      (node) => `<g class="graph-node graph-node--${node.kind}">
  <rect x="${node.x - node.width / 2}" y="${node.y - node.height / 2}" width="${node.width}" height="${node.height}" rx="4"/>
  <text x="${node.x}" y="${node.y}">${renderNodeLabel(node)}</text>
</g>`
    )
    .join('');

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