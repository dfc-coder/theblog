import type {
  GraphDefinition,
  GraphEdge,
  GraphLayout,
  GraphNode,
  PositionedNode
} from './model';

const ARTBOARD_WIDTH = 720;
const MOBILE_ARTBOARD_WIDTH = 336;
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
const EDGE_LABEL_HALF_HEIGHT = 12;

export type GraphLayoutProfileName = 'desktop' | 'mobile';

interface GraphLayoutProfile {
  readonly id: GraphLayoutProfileName;
  readonly width: number;
  readonly maxColumns: number;
  readonly vertical: boolean;
}

const DESKTOP_PROFILE: GraphLayoutProfile = {
  id: 'desktop',
  width: ARTBOARD_WIDTH,
  maxColumns: 4,
  vertical: false
};

const MOBILE_PROFILE: GraphLayoutProfile = {
  id: 'mobile',
  width: MOBILE_ARTBOARD_WIDTH,
  maxColumns: 2,
  vertical: true
};

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

interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

interface EdgeRoute {
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly bounds: Bounds;
}

interface CompiledEdge {
  readonly edge: GraphEdge;
  readonly route: EdgeRoute;
  readonly feedback: boolean;
}

const profileByName = (profile: GraphLayoutProfileName): GraphLayoutProfile =>
  profile === 'mobile' ? MOBILE_PROFILE : DESKTOP_PROFILE;

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const isFeedbackEdge = (edge: GraphEdge): boolean =>
  (edge.kind ?? 'default') === 'feedback';

const resolveNodeWidth = (profile: GraphLayoutProfile): number => {
  const totalGaps = Math.max(profile.maxColumns - 1, 0) * COLUMN_GAP;
  const available = profile.width - MARGIN_X * 2 - totalGaps;
  return Math.min(NODE_WIDTH, Math.floor(available / profile.maxColumns));
};

const maxLabelChars = (nodeWidth: number): number =>
  Math.max(16, Math.floor((MAX_LABEL_CHARS * nodeWidth) / NODE_WIDTH));

const edgeLabelHalfWidth = (label: string): number =>
  Math.min(48, Math.max(16, label.length * 4.4));

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const wrapLine = (line: string, nodeWidth: number): string[] => {
  const limit = maxLabelChars(nodeWidth);
  const trimmed = line.trim();
  if (trimmed.length <= limit) {
    return [trimmed];
  }

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > limit) {
      if (current) {
        lines.push(current);
        current = '';
      }

      for (let offset = 0; offset < word.length; offset += limit) {
        lines.push(word.slice(offset, offset + limit));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= limit) {
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

const nodeLines = (label: string, nodeWidth: number): string[] =>
  label.split('\n').flatMap((line) => wrapLine(line, nodeWidth));

const estimateNodeSize = (node: GraphNode, nodeWidth: number) => {
  const lineCount = Math.max(nodeLines(node.label, nodeWidth).length, 1);

  return {
    width: nodeWidth,
    height: NODE_HEIGHT + (lineCount - 1) * NODE_LINE_HEIGHT
  };
};

const buildRanks = (graph: GraphDefinition): number[] => {
  const nodeIndex = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of graph.edges) {
    if (isFeedbackEdge(edge)) {
      continue;
    }

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

const buildRawRanks = (
  graph: GraphDefinition,
  nodeRanks: readonly number[],
  nodeWidth: number
): SizedNode[][] => {
  const rankCount = Math.max(...nodeRanks) + 1;
  const ranks: SizedNode[][] = Array.from({ length: rankCount }, () => []);

  graph.nodes.forEach((node, index) => {
    const rank = nodeRanks[index] ?? 0;
    ranks[rank]?.push({ node, ...estimateNodeSize(node, nodeWidth), rank });
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

const resolveSerpentineColumns = (
  nodeCount: number,
  profile: GraphLayoutProfile,
  preferred?: number
): number => {
  const desired = preferred === undefined ? defaultSerpentineColumns(nodeCount) : Math.floor(preferred);
  return Math.max(1, Math.min(desired, Math.min(nodeCount, profile.maxColumns)));
};

const createSerpentineLayout = (
  rawRanks: readonly (readonly SizedNode[])[],
  profile: GraphLayoutProfile,
  nodeWidth: number,
  preferredColumns?: number
): GraphLayout => {
  const ordered = rawRanks.flat();
  const columns = resolveSerpentineColumns(ordered.length, profile, preferredColumns);
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
    const rowWidth = row.length * nodeWidth + Math.max(row.length - 1, 0) * COLUMN_GAP;
    const startX = (profile.width - rowWidth) / 2;
    const positioned: PositionedNode[] = [];

    row.forEach((item, itemIndex) => {
      const visualIndex = rowIndex % 2 === 0 ? itemIndex : row.length - 1 - itemIndex;
      positioned.push({
        ...item.node,
        width: item.width,
        height: item.height,
        x: startX + visualIndex * (nodeWidth + COLUMN_GAP) + nodeWidth / 2,
        y: y + rowHeight / 2,
        rank: item.rank
      });
    });

    positionedRows.push(positioned);
    y += rowHeight + ROW_GAP;
  });

  return {
    kind: 'serpentine',
    width: profile.width,
    height,
    nodes: positionedRows.flat(),
    ranks: positionedRows
  };
};

const createLayeredTbLayout = (
  rawRanks: readonly (readonly SizedNode[])[],
  profile: GraphLayoutProfile,
  nodeWidth: number
): GraphLayout => {
  const visualRows: { items: readonly SizedNode[]; semanticRank: number }[] = [];

  rawRanks.forEach((rank, semanticRank) => {
    for (let index = 0; index < rank.length; index += profile.maxColumns) {
      visualRows.push({ items: rank.slice(index, index + profile.maxColumns), semanticRank });
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
    const rowWidth = row.items.length * nodeWidth + Math.max(row.items.length - 1, 0) * COLUMN_GAP;
    let x = (profile.width - rowWidth) / 2;
    const positioned: PositionedNode[] = [];

    for (const item of row.items) {
      positioned.push({
        ...item.node,
        width: item.width,
        height: item.height,
        x: x + nodeWidth / 2,
        y: y + rowHeight / 2,
        rank: item.rank
      });
      x += nodeWidth + COLUMN_GAP;
    }

    positionedRows.push(positioned);
    const next = visualRows[rowIndex + 1];
    if (next) {
      y += rowHeight + (next.semanticRank === row.semanticRank ? STACK_GAP : RANK_GAP);
    }
  });

  return {
    kind: 'layered-tb',
    width: profile.width,
    height,
    nodes: positionedRows.flat(),
    ranks: positionedRows
  };
};

const createLayeredLrLayout = (
  rawRanks: readonly (readonly SizedNode[])[],
  profile: GraphLayoutProfile,
  nodeWidth: number
): GraphLayout => {
  const columnHeights = rawRanks.map((rank) =>
    rank.reduce((total, item, index) => total + item.height + (index > 0 ? STACK_GAP : 0), 0)
  );
  const contentHeight = Math.max(...columnHeights, NODE_HEIGHT);
  const { height, offsetY } = centerArtboardHeight(contentHeight);
  const contentWidth = rawRanks.length * nodeWidth + Math.max(rawRanks.length - 1, 0) * RANK_GAP;
  let x = (profile.width - contentWidth) / 2;
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
        x: x + nodeWidth / 2,
        y: y + item.height / 2,
        rank: item.rank
      });
      y += item.height + STACK_GAP;
    }

    positionedRanks.push(positioned);
    x += nodeWidth + RANK_GAP;
  });

  return {
    kind: 'layered-lr',
    width: profile.width,
    height,
    nodes: positionedRanks.flat(),
    ranks: positionedRanks
  };
};

const findFanoutHub = (graph: GraphDefinition): string | undefined => {
  const structuralEdges = graph.edges.filter((edge) => !isFeedbackEdge(edge));
  if (structuralEdges.length !== graph.nodes.length - 1 || graph.nodes.length < 5) {
    return undefined;
  }

  const outgoing = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of structuralEdges) {
    outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
  }

  return graph.nodes.find((node) => (outgoing.get(node.id) ?? 0) === graph.nodes.length - 1)?.id;
};

const createFanoutLayout = (
  graph: GraphDefinition,
  nodeRanks: readonly number[],
  hubId: string,
  profile: GraphLayoutProfile,
  nodeWidth: number
): GraphLayout => {
  const hubIndex = graph.nodes.findIndex((node) => node.id === hubId);
  const hub = graph.nodes[hubIndex];
  if (!hub) {
    throw new Error(`Unknown fanout hub "${hubId}".`);
  }

  const hubSize = estimateNodeSize(hub, nodeWidth);
  const children = graph.nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.id !== hubId);
  const rowCount = Math.ceil(children.length / 2);
  const childRows = children.map(({ node }) => estimateNodeSize(node, nodeWidth));
  const rowHeight = Math.max(...childRows.map((size) => size.height), NODE_HEIGHT);
  const childGap = 32;
  const contentHeight = hubSize.height + 62 + rowCount * rowHeight + Math.max(rowCount - 1, 0) * childGap;
  const { height, offsetY } = centerArtboardHeight(contentHeight);
  const hubPosition: PositionedNode = {
    ...hub,
    ...hubSize,
    x: profile.width / 2,
    y: offsetY + hubSize.height / 2,
    rank: nodeRanks[hubIndex] ?? 0
  };
  const leftX = profile.width * 0.28;
  const rightX = profile.width * 0.72;
  const positionedChildren: PositionedNode[] = [];
  let childY = offsetY + hubSize.height + 62 + rowHeight / 2;

  children.forEach(({ node, index }, childIndex) => {
    const size = estimateNodeSize(node, nodeWidth);
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
    width: profile.width,
    height,
    nodes: [hubPosition, ...positionedChildren],
    ranks: [[hubPosition], positionedChildren]
  };
};

const createLayout = (
  graph: GraphDefinition,
  profile: GraphLayoutProfile,
  options: GraphCompileOptions
): GraphLayout => {
  const nodeWidth = resolveNodeWidth(profile);
  const nodeRanks = buildRanks(graph);
  const rawRanks = buildRawRanks(graph, nodeRanks, nodeWidth);
  const fanoutHub = findFanoutHub(graph);

  if (fanoutHub) {
    return createFanoutLayout(graph, nodeRanks, fanoutHub, profile, nodeWidth);
  }

  if (rawRanks.every((rank) => rank.length === 1)) {
    return createSerpentineLayout(rawRanks, profile, nodeWidth, options.serpentineColumns);
  }

  const lrWidth = rawRanks.length * nodeWidth + Math.max(rawRanks.length - 1, 0) * RANK_GAP;
  const canUseLr =
    !profile.vertical &&
    graph.direction === 'LR' &&
    Math.max(...rawRanks.map((rank) => rank.length)) <= 3;

  if (canUseLr && lrWidth <= profile.width - MARGIN_X * 2) {
    return createLayeredLrLayout(rawRanks, profile, nodeWidth);
  }

  return createLayeredTbLayout(rawRanks, profile, nodeWidth);
};

const renderNodeLabel = (node: PositionedNode): string => {
  const lines = nodeLines(node.label, node.width);
  const startY = node.y - ((lines.length - 1) * NODE_LINE_HEIGHT) / 2;

  return lines
    .map(
      (line, index) =>
        `<tspan x="${node.x}" y="${startY + index * NODE_LINE_HEIGHT}">${escapeHtml(line)}</tspan>`
    )
    .join('');
};

const boundsFromPoints = (points: readonly { x: number; y: number }[]): Bounds => ({
  minX: Math.min(...points.map((point) => point.x)),
  minY: Math.min(...points.map((point) => point.y)),
  maxX: Math.max(...points.map((point) => point.x)),
  maxY: Math.max(...points.map((point) => point.y))
});

const regularEdgePath = (
  from: PositionedNode,
  to: PositionedNode
): EdgeRoute => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    const direction = Math.sign(dx) || 1;
    const startX = from.x + (from.width / 2) * direction;
    const startY = from.y;
    const endX = to.x - (to.width / 2) * direction;
    const endY = to.y;
    const middleX = (startX + endX) / 2;
    const points = [
      { x: startX, y: startY },
      { x: middleX, y: startY },
      { x: middleX, y: endY },
      { x: endX, y: endY }
    ];

    return {
      path: `M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}`,
      labelX: middleX,
      labelY: (startY + endY) / 2 - 8,
      bounds: boundsFromPoints(points)
    };
  }

  const direction = Math.sign(dy) || 1;
  const startX = from.x;
  const startY = from.y + (from.height / 2) * direction;
  const endX = to.x;
  const endY = to.y - (to.height / 2) * direction;
  const middleY = (startY + endY) / 2;
  const points = [
    { x: startX, y: startY },
    { x: startX, y: middleY },
    { x: endX, y: middleY },
    { x: endX, y: endY }
  ];

  return {
    path: `M ${startX} ${startY} V ${middleY} H ${endX} V ${endY}`,
    labelX: (startX + endX) / 2 + 8,
    labelY: middleY - 8,
    bounds: boundsFromPoints(points)
  };
};

const fanoutEdgePath = (
  from: PositionedNode,
  to: PositionedNode,
  profile: GraphLayoutProfile
): EdgeRoute => {
  const goesLeft = to.x < from.x;
  const laneX = goesLeft ? MARGIN_X / 2 : profile.width - MARGIN_X / 2;
  const startX = from.x + (goesLeft ? -from.width / 2 : from.width / 2);
  const endX = to.x + (goesLeft ? -to.width / 2 : to.width / 2);
  const points = [
    { x: startX, y: from.y },
    { x: laneX, y: from.y },
    { x: laneX, y: to.y },
    { x: endX, y: to.y }
  ];

  return {
    path: `M ${startX} ${from.y} H ${laneX} V ${to.y} H ${endX}`,
    labelX: laneX + (goesLeft ? 8 : -8),
    labelY: (from.y + to.y) / 2,
    bounds: boundsFromPoints(points)
  };
};

const longEdgePath = (
  from: PositionedNode,
  to: PositionedNode,
  longEdgeIndex: number,
  profile: GraphLayoutProfile
): EdgeRoute => {
  const laneX = profile.width - 8 - longEdgeIndex * LONG_EDGE_LANE_GAP;
  const startX = from.x + from.width / 2;
  const endX = to.x + to.width / 2;
  const points = [
    { x: startX, y: from.y },
    { x: laneX, y: from.y },
    { x: laneX, y: to.y },
    { x: endX, y: to.y }
  ];

  return {
    path: `M ${startX} ${from.y} H ${laneX} V ${to.y} H ${endX}`,
    labelX: laneX - 8,
    labelY: (from.y + to.y) / 2 - 8,
    bounds: boundsFromPoints(points)
  };
};

const feedbackEdgePath = (
  from: PositionedNode,
  to: PositionedNode,
  layout: GraphLayout
): EdgeRoute => {
  const startX = from.x;
  const startY = from.y - from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  const leftNodeBoundary = Math.min(
    ...layout.nodes.map((node) => node.x - node.width / 2)
  );
  const laneX = Math.max(MARGIN_X / 2, leftNodeBoundary - 20);
  const verticalBend = Math.min(44, Math.max(28, Math.abs(startY - endY) * 0.18));
  const c1x = laneX;
  const c1y = startY - verticalBend;
  const c2x = laneX;
  const c2y = endY + verticalBend;
  const points = [
    { x: startX, y: startY },
    { x: c1x, y: c1y },
    { x: c2x, y: c2y },
    { x: endX, y: endY }
  ];

  return {
    path: `M ${startX} ${startY} C ${c1x} ${c1y} ${c2x} ${c2y} ${endX} ${endY}`,
    labelX: laneX + 10,
    labelY: (startY + endY) / 2 - 6,
    bounds: boundsFromPoints(points)
  };
};

const edgePath = (
  from: PositionedNode,
  to: PositionedNode,
  layout: GraphLayout,
  longEdgeIndex: number,
  profile: GraphLayoutProfile
): EdgeRoute => {
  if (layout.kind === 'fanout') {
    return fanoutEdgePath(from, to, profile);
  }

  if (to.rank - from.rank > 1) {
    return longEdgePath(from, to, longEdgeIndex, profile);
  }

  return regularEdgePath(from, to);
};

const compileEdges = (
  graph: GraphDefinition,
  layout: GraphLayout,
  profile: GraphLayoutProfile
): CompiledEdge[] => {
  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
  let longEdgeIndex = 0;

  return graph.edges.flatMap((edge) => {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!from || !to) {
      return [];
    }

    const feedback = isFeedbackEdge(edge);
    const isLong = !feedback && to.rank - from.rank > 1;
    const initialRoute = feedback
      ? feedbackEdgePath(from, to, layout)
      : edgePath(from, to, layout, isLong ? longEdgeIndex++ : 0, profile);
    const route = edge.label && profile.id === 'mobile'
      ? {
          ...initialRoute,
          labelX: clamp(
            initialRoute.labelX,
            edgeLabelHalfWidth(edge.label) + 4,
            profile.width - edgeLabelHalfWidth(edge.label) - 4
          )
        }
      : initialRoute;

    return [{ edge, route, feedback }];
  });
};

const stableId = (
  graph: GraphDefinition,
  options: GraphCompileOptions,
  profile: GraphLayoutProfileName
): string => {
  const source = profile === 'desktop'
    ? JSON.stringify({ graph, options })
    : JSON.stringify({ graph, options, profile });
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `graph-arrow-${(hash >>> 0).toString(36)}`;
};

const legacyViewport = (layout: GraphLayout, options: GraphCompileOptions): SvgViewport => {
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

const mergeBounds = (bounds: readonly Bounds[]): Bounds => ({
  minX: Math.min(...bounds.map((item) => item.minX)),
  minY: Math.min(...bounds.map((item) => item.minY)),
  maxX: Math.max(...bounds.map((item) => item.maxX)),
  maxY: Math.max(...bounds.map((item) => item.maxY))
});

const contentViewport = (
  layout: GraphLayout,
  edges: readonly CompiledEdge[],
  options: GraphCompileOptions
): SvgViewport => {
  if (options.viewport !== 'content' || layout.nodes.length === 0) {
    return { x: 0, y: 0, width: layout.width, height: layout.height };
  }

  const nodeBounds = layout.nodes.map((node): Bounds => ({
    minX: node.x - node.width / 2,
    minY: node.y - node.height / 2,
    maxX: node.x + node.width / 2,
    maxY: node.y + node.height / 2
  }));
  const edgeBounds = edges.flatMap(({ edge, route }) => {
    const result: Bounds[] = [route.bounds];
    if (edge.label) {
      result.push({
        minX: route.labelX - edgeLabelHalfWidth(edge.label),
        minY: route.labelY - EDGE_LABEL_HALF_HEIGHT,
        maxX: route.labelX + edgeLabelHalfWidth(edge.label),
        maxY: route.labelY + EDGE_LABEL_HALF_HEIGHT
      });
    }
    return result;
  });
  const bounds = mergeBounds([...nodeBounds, ...edgeBounds]);
  const padding = Math.max(options.viewportPadding ?? 24, 0);

  const x = Math.max(0, bounds.minX - padding);
  const maxX = Math.min(layout.width, bounds.maxX + padding);

  return {
    x,
    y: bounds.minY - padding,
    width: Math.max(maxX - x, 1),
    height: Math.max(bounds.maxY - bounds.minY + padding * 2, 1)
  };
};

const svgNumber = (value: number): string => Number(value.toFixed(2)).toString();

const renderSvg = (
  graph: GraphDefinition,
  layout: GraphLayout,
  edges: readonly CompiledEdge[],
  viewport: SvgViewport,
  arrowId: string,
  profile: GraphLayoutProfileName
): string => {
  const edgesMarkup = edges
    .map(({ edge, route, feedback }) => {
      const label = edge.label
        ? `<text class="graph-edge-label" x="${route.labelX}" y="${route.labelY}">${escapeHtml(edge.label)}</text>`
        : '';
      const edgeClass = feedback ? 'graph-edge graph-edge--feedback' : 'graph-edge';

      return `<g class="${edgeClass}"><path d="${route.path}" marker-end="url(#${arrowId})"/>${label}</g>`;
    })
    .join('');

  const nodesMarkup = layout.nodes
    .map(
      (node) => `<g class="graph-node graph-node--${node.kind}">
  <rect x="${node.x - node.width / 2}" y="${node.y - node.height / 2}" width="${node.width}" height="${node.height}" rx="4"/>
  <text x="${node.x}" y="${node.y}">${renderNodeLabel(node)}</text>
</g>`
    )
    .join('');

  const aria = graph.title ? ` aria-label="${escapeHtml(graph.title)}"` : ' aria-label="Architecture diagram"';
  const svgWidth = Math.ceil(viewport.width);
  const svgHeight = Math.ceil(viewport.height);
  const viewBox = [viewport.x, viewport.y, viewport.width, viewport.height].map(svgNumber).join(' ');

  return `<svg class="article-graph__svg" data-graph-profile="${profile}" data-graph-layout="${layout.kind}" width="${svgWidth}" height="${svgHeight}" viewBox="${viewBox}" role="img"${aria}>
  <defs>
    <marker id="${arrowId}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 8 4 L 0 8 z" class="graph-arrow"/>
    </marker>
  </defs>
  ${edgesMarkup}
  ${nodesMarkup}
</svg>`;
};

const compileVariant = (
  graph: GraphDefinition,
  profileName: GraphLayoutProfileName,
  options: GraphCompileOptions,
  useLegacyViewport: boolean
): { layout: GraphLayout; svg: string } => {
  const profile = profileByName(profileName);
  const layout = createLayout(graph, profile, options);
  const edges = compileEdges(graph, layout, profile);
  const viewport = useLegacyViewport
    ? legacyViewport(layout, options)
    : contentViewport(layout, edges, options);
  const arrowId = stableId(graph, options, profileName);

  return {
    layout,
    svg: renderSvg(graph, layout, edges, viewport, arrowId, profileName)
  };
};

export function compileGraphVariantSvg(
  graph: GraphDefinition,
  profile: GraphLayoutProfileName,
  options: GraphCompileOptions = {}
): string {
  return compileVariant(graph, profile, options, false).svg;
}

/**
 * Backwards-compatible desktop renderer used by the hero and existing callers.
 * Desktop geometry and content viewport semantics remain unchanged.
 */
export function compileGraphSvg(
  graph: GraphDefinition,
  options: GraphCompileOptions = {}
): string {
  const { layout, svg } = compileVariant(graph, 'desktop', options, true);
  const title = graph.title ? `<figcaption>${escapeHtml(graph.title)}</figcaption>` : '';

  return `<figure class="article-graph" data-graph-layout="${layout.kind}">
${title}
<div class="article-graph__viewport">
<div class="article-graph__stage">
${svg}
</div>
</div>
</figure>`;
}
