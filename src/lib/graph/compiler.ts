import type { GraphDefinition, GraphLayout, GraphNode, PositionedNode } from './model';

const NODE_MIN_WIDTH = 148;
const NODE_MAX_WIDTH = 320;
const NODE_LINE_HEIGHT = 18;
const NODE_PADDING_X = 22;
const NODE_PADDING_Y = 14;
const RANK_GAP = 82;
const NODE_GAP = 34;
const MARGIN = 34;
const LONG_EDGE_GUTTER = 44;

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const estimateNodeSize = (node: GraphNode) => {
  const lines = node.label.split('\n');
  const longest = Math.max(...lines.map((line) => line.length), 1);
  const width = Math.min(NODE_MAX_WIDTH, Math.max(NODE_MIN_WIDTH, longest * 8 + NODE_PADDING_X * 2));
  const height = lines.length * NODE_LINE_HEIGHT + NODE_PADDING_Y * 2;

  return { width, height };
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

const createLayout = (graph: GraphDefinition): GraphLayout => {
  const nodeRanks = buildRanks(graph);
  const rankCount = Math.max(...nodeRanks) + 1;
  const rawRanks: { node: GraphNode; width: number; height: number; rank: number }[][] = Array.from(
    { length: rankCount },
    () => []
  );

  graph.nodes.forEach((node, index) => {
    const rank = nodeRanks[index] ?? 0;
    rawRanks[rank]?.push({ node, ...estimateNodeSize(node), rank });
  });

  const longEdgeCount = graph.edges.filter((edge) => {
    const fromIndex = graph.nodes.findIndex((node) => node.id === edge.from);
    const toIndex = graph.nodes.findIndex((node) => node.id === edge.to);
    return (nodeRanks[toIndex] ?? 0) - (nodeRanks[fromIndex] ?? 0) > 1;
  }).length;
  const sideGutter = longEdgeCount > 0 ? LONG_EDGE_GUTTER + Math.min(longEdgeCount - 1, 3) * 12 : 0;
  const positionedRanks: PositionedNode[][] = [];

  if (graph.direction === 'TB') {
    const rankWidths = rawRanks.map((rank) =>
      rank.reduce((total, item, index) => total + item.width + (index > 0 ? NODE_GAP : 0), 0)
    );
    const contentWidth = Math.max(...rankWidths, NODE_MIN_WIDTH);
    let y = MARGIN;

    rawRanks.forEach((rank, rankIndex) => {
      const rankHeight = Math.max(...rank.map((item) => item.height), NODE_LINE_HEIGHT + NODE_PADDING_Y * 2);
      let x = MARGIN + (contentWidth - (rankWidths[rankIndex] ?? 0)) / 2;
      const positioned: PositionedNode[] = [];

      for (const item of rank) {
        positioned.push({
          ...item.node,
          width: item.width,
          height: item.height,
          x: x + item.width / 2,
          y: y + rankHeight / 2,
          rank: item.rank
        });
        x += item.width + NODE_GAP;
      }

      positionedRanks.push(positioned);
      y += rankHeight + RANK_GAP;
    });

    return {
      width: contentWidth + MARGIN * 2 + sideGutter,
      height: Math.max(MARGIN * 2, y - RANK_GAP + MARGIN),
      nodes: positionedRanks.flat(),
      ranks: positionedRanks
    };
  }

  const rankHeights = rawRanks.map((rank) =>
    rank.reduce((total, item, index) => total + item.height + (index > 0 ? NODE_GAP : 0), 0)
  );
  const contentHeight = Math.max(...rankHeights, NODE_LINE_HEIGHT + NODE_PADDING_Y * 2);
  let x = MARGIN;
  let totalWidth = MARGIN * 2;

  rawRanks.forEach((rank, rankIndex) => {
    const rankWidth = Math.max(...rank.map((item) => item.width), NODE_MIN_WIDTH);
    let y = MARGIN + (contentHeight - (rankHeights[rankIndex] ?? 0)) / 2;
    const positioned: PositionedNode[] = [];

    for (const item of rank) {
      positioned.push({
        ...item.node,
        width: item.width,
        height: item.height,
        x: x + rankWidth / 2,
        y: y + item.height / 2,
        rank: item.rank
      });
      y += item.height + NODE_GAP;
    }

    positionedRanks.push(positioned);
    x += rankWidth + RANK_GAP;
    totalWidth = x - RANK_GAP + MARGIN;
  });

  return {
    width: totalWidth,
    height: contentHeight + MARGIN * 2 + sideGutter,
    nodes: positionedRanks.flat(),
    ranks: positionedRanks
  };
};

const renderNodeLabel = (node: PositionedNode): string => {
  const lines = node.label.split('\n');
  const startY = node.y - ((lines.length - 1) * NODE_LINE_HEIGHT) / 2;

  return lines
    .map(
      (line, index) =>
        `<tspan x="${node.x}" y="${startY + index * NODE_LINE_HEIGHT}">${escapeHtml(line)}</tspan>`
    )
    .join('');
};

const edgePath = (
  from: PositionedNode,
  to: PositionedNode,
  graph: GraphDefinition,
  layout: GraphLayout,
  longEdgeIndex: number
): { path: string; labelX: number; labelY: number } => {
  const rankDistance = to.rank - from.rank;

  if (graph.direction === 'TB') {
    const startX = from.x;
    const startY = from.y + from.height / 2;
    const endX = to.x;
    const endY = to.y - to.height / 2;

    if (rankDistance > 1) {
      const laneX = layout.width - MARGIN - longEdgeIndex * 12;
      return {
        path: `M ${startX} ${startY} V ${startY + 24} H ${laneX} V ${endY - 24} H ${endX} V ${endY}`,
        labelX: laneX - 8,
        labelY: (startY + endY) / 2
      };
    }

    const middleY = (startY + endY) / 2;
    return {
      path: `M ${startX} ${startY} V ${middleY} H ${endX} V ${endY}`,
      labelX: startX === endX ? startX + 10 : (startX + endX) / 2,
      labelY: middleY - 8
    };
  }

  const startX = from.x + from.width / 2;
  const startY = from.y;
  const endX = to.x - to.width / 2;
  const endY = to.y;

  if (rankDistance > 1) {
    const laneY = layout.height - MARGIN - longEdgeIndex * 12;
    return {
      path: `M ${startX} ${startY} H ${startX + 24} V ${laneY} H ${endX - 24} V ${endY} H ${endX}`,
      labelX: (startX + endX) / 2,
      labelY: laneY - 8
    };
  }

  const middleX = (startX + endX) / 2;
  return {
    path: `M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}`,
    labelX: middleX + 8,
    labelY: startY === endY ? startY - 10 : (startY + endY) / 2
  };
};

const stableId = (graph: GraphDefinition): string => {
  const source = JSON.stringify(graph);
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `graph-arrow-${(hash >>> 0).toString(36)}`;
};

export function compileGraphSvg(graph: GraphDefinition): string {
  const layout = createLayout(graph);
  const arrowId = stableId(graph);
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
      const route = edgePath(from, to, graph, layout, isLong ? longEdgeIndex++ : 0);
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
  const minWidth = Math.min(Math.ceil(layout.width), 640);

  return `<figure class="article-graph">
${title}
<div class="article-graph__viewport">
<svg class="article-graph__svg" viewBox="0 0 ${Math.ceil(layout.width)} ${Math.ceil(layout.height)}" role="img"${aria} style="min-width:${minWidth}px">
  <defs>
    <marker id="${arrowId}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 8 4 L 0 8 z" class="graph-arrow"/>
    </marker>
  </defs>
  ${edges}
  ${nodes}
</svg>
</div>
</figure>`;
}
