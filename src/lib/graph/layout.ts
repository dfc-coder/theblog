import type {
  DiagramDefinition,
  DiagramScene,
  GraphDiagramDefinition,
  GraphLayoutKind,
  GraphNode,
  GraphScene,
  GraphSceneNode,
  GraphTopology,
  LayoutProfile
} from './model';
import { routeEdges, type ComponentBounds } from './routing';

type Component = {
  id: number;
  nodeIds: string[];
  cyclic: boolean;
};

type ComponentLayout = Component & {
  width: number;
  height: number;
  nodes: GraphSceneNode[];
  rank: number;
};

type ComponentGraph = {
  components: Component[];
  componentByNode: Map<string, number>;
  outgoing: Map<number, Set<number>>;
  incoming: Map<number, Set<number>>;
};

const edgeKey = (from: string, to: string, kind: string, label: string): string =>
  `${kind}:${from}->${to}:${label}`;

const validateGraph = (graph: GraphDiagramDefinition): void => {
  if (graph.nodes.length === 0) throw new Error('Graph has no nodes.');

  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) throw new Error(`Duplicate node "${node.id}".`);
    ids.add(node.id);
  }

  const edges = new Set<string>();
  for (const edge of graph.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      throw new Error(`Unknown node in edge ${edge.from} -> ${edge.to}.`);
    }
    const key = edgeKey(edge.from, edge.to, edge.kind ?? 'default', edge.label ?? '');
    if (edges.has(key)) throw new Error(`Duplicate edge ${edge.from} -> ${edge.to}.`);
    edges.add(key);
  }
};

const maxChars = (profile: LayoutProfile): number => {
  if (profile.nodeWidth < 40) return Number.POSITIVE_INFINITY;
  return Math.max(16, Math.floor(profile.nodeWidth / 7.6));
};

const wrapText = (label: string, profile: LayoutProfile): string[] => {
  const limit = maxChars(profile);
  if (!Number.isFinite(limit)) return label.split('\n');

  return label.split('\n').flatMap((rawLine) => {
    const line = rawLine.trim();
    if (line.length <= limit) return [line];
    const words = line.split(/\s+/);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= limit) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (word.length <= limit) {
        current = word;
        continue;
      }
      for (let offset = 0; offset < word.length; offset += limit) {
        lines.push(word.slice(offset, offset + limit));
      }
      current = '';
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  });
};

const nodeSize = (node: GraphNode, profile: LayoutProfile): GraphSceneNode => {
  const lines = wrapText(node.label, profile);
  const extraLines = Math.max(0, lines.length - 1);
  return {
    id: node.id,
    label: node.label,
    kind: node.kind ?? 'default',
    lines,
    x: 0,
    y: 0,
    width: profile.nodeWidth,
    height: profile.nodeHeight + extraLines * Math.max(1, profile.nodeHeight * 0.38)
  };
};

const stronglyConnectedComponents = (graph: GraphDiagramDefinition): string[][] => {
  const order = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) outgoing.get(edge.from)?.push(edge.to);
  for (const values of outgoing.values()) values.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  let currentIndex = 0;
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const result: string[][] = [];

  const visit = (id: string): void => {
    indexes.set(id, currentIndex);
    lowLinks.set(id, currentIndex);
    currentIndex += 1;
    stack.push(id);
    onStack.add(id);

    for (const target of outgoing.get(id) ?? []) {
      if (!indexes.has(target)) {
        visit(target);
        lowLinks.set(id, Math.min(lowLinks.get(id)!, lowLinks.get(target)!));
      } else if (onStack.has(target)) {
        lowLinks.set(id, Math.min(lowLinks.get(id)!, indexes.get(target)!));
      }
    }

    if (lowLinks.get(id) !== indexes.get(id)) return;
    const component: string[] = [];
    while (stack.length) {
      const member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
      if (member === id) break;
    }
    component.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    result.push(component);
  };

  for (const node of graph.nodes) if (!indexes.has(node.id)) visit(node.id);
  result.sort((left, right) => (order.get(left[0] ?? '') ?? 0) - (order.get(right[0] ?? '') ?? 0));
  return result;
};

const analyzeComponents = (graph: GraphDiagramDefinition): ComponentGraph => {
  const selfLoops = new Set(graph.edges.filter((edge) => edge.from === edge.to).map((edge) => edge.from));
  const groups = stronglyConnectedComponents(graph);
  const components: Component[] = groups.map((nodeIds, id) => ({
    id,
    nodeIds,
    cyclic: nodeIds.length > 1 || nodeIds.some((nodeId) => selfLoops.has(nodeId))
  }));
  const componentByNode = new Map<string, number>();
  for (const component of components) {
    for (const nodeId of component.nodeIds) componentByNode.set(nodeId, component.id);
  }

  const outgoing = new Map(components.map((component) => [component.id, new Set<number>()]));
  const incoming = new Map(components.map((component) => [component.id, new Set<number>()]));
  for (const edge of graph.edges) {
    const from = componentByNode.get(edge.from);
    const to = componentByNode.get(edge.to);
    if (from === undefined || to === undefined || from === to) continue;
    outgoing.get(from)?.add(to);
    incoming.get(to)?.add(from);
  }

  return { components, componentByNode, outgoing, incoming };
};

const componentRanks = (analysis: ComponentGraph): Map<number, number> => {
  const indegree = new Map(analysis.components.map((component) => [component.id, analysis.incoming.get(component.id)?.size ?? 0]));
  const rank = new Map(analysis.components.map((component) => [component.id, 0]));
  const queue = analysis.components.filter((component) => (indegree.get(component.id) ?? 0) === 0).map((component) => component.id);
  let visited = 0;

  while (queue.length) {
    queue.sort((a, b) => a - b);
    const current = queue.shift()!;
    visited += 1;
    for (const target of analysis.outgoing.get(current) ?? []) {
      rank.set(target, Math.max(rank.get(target) ?? 0, (rank.get(current) ?? 0) + 1));
      const remaining = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }

  if (visited !== analysis.components.length) throw new Error('Component graph must be acyclic.');
  return rank;
};

const classifyGraph = (graph: GraphDiagramDefinition, analysis: ComponentGraph): GraphTopology => {
  if (analysis.components.some((component) => component.cyclic)) return 'cycle';
  if (graph.nodes.length <= 1) return 'chain';

  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outdegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outdegree.set(edge.from, (outdegree.get(edge.from) ?? 0) + 1);
  }

  const isChain = graph.nodes.every((node) => (indegree.get(node.id) ?? 0) <= 1 && (outdegree.get(node.id) ?? 0) <= 1);
  if (isChain) return 'chain';

  const fanout = graph.nodes.find((node) => (outdegree.get(node.id) ?? 0) === graph.nodes.length - 1);
  if (fanout && graph.edges.length === graph.nodes.length - 1) return 'fanout';

  const fanin = graph.nodes.find((node) => (indegree.get(node.id) ?? 0) === graph.nodes.length - 1);
  if (fanin && graph.edges.length === graph.nodes.length - 1) return 'fanin';

  const split = graph.nodes.some((node) => (outdegree.get(node.id) ?? 0) >= 2);
  const join = graph.nodes.some((node) => (indegree.get(node.id) ?? 0) >= 2);
  if (split && join) return 'branch-join';
  return 'layered';
};

const structuralRankGroups = (
  component: Component,
  graph: GraphDiagramDefinition
): string[][] | undefined => {
  const members = new Set(component.nodeIds);
  const order = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const outgoing = new Map(component.nodeIds.map((id) => [id, new Set<string>()]));
  const indegree = new Map(component.nodeIds.map((id) => [id, 0]));
  const rank = new Map(component.nodeIds.map((id) => [id, 0]));

  for (const edge of graph.edges) {
    if (edge.kind === 'feedback' || edge.from === edge.to || !members.has(edge.from) || !members.has(edge.to)) continue;
    const targets = outgoing.get(edge.from)!;
    if (targets.has(edge.to)) continue;
    targets.add(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const queue = component.nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  let visited = 0;
  while (queue.length) {
    queue.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    const current = queue.shift()!;
    visited += 1;
    for (const target of outgoing.get(current) ?? []) {
      rank.set(target, Math.max(rank.get(target) ?? 0, (rank.get(current) ?? 0) + 1));
      const remaining = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }

  if (visited !== component.nodeIds.length) return undefined;
  const maxRank = Math.max(...rank.values(), 0);
  const groups = Array.from({ length: maxRank + 1 }, () => [] as string[]);
  for (const id of component.nodeIds) groups[rank.get(id) ?? 0]!.push(id);
  return groups;
};

const fallbackCycleSlots = (count: number): readonly { col: number; row: number }[] => {
  if (count <= 1) return [{ col: 0, row: 0 }];
  if (count === 2) return [{ col: 0, row: 0 }, { col: 1, row: 0 }];
  const columns = Math.ceil(count / 2);
  const slots: { col: number; row: number }[] = [];
  for (let index = 0; index < Math.min(columns, count); index += 1) slots.push({ col: index, row: 0 });
  for (let index = columns; index < count; index += 1) slots.push({ col: columns - 1 - (index - columns), row: 1 });
  return slots;
};

const layoutCyclicComponent = (
  component: Component,
  graph: GraphDiagramDefinition,
  sourceNodes: ReadonlyMap<string, GraphNode>,
  profile: LayoutProfile,
  rank: number
): ComponentLayout => {
  const groups = structuralRankGroups(component, graph);
  const sizedById = new Map(component.nodeIds.map((id) => [id, nodeSize(sourceNodes.get(id)!, profile)]));

  if (!groups) {
    const slots = fallbackCycleSlots(component.nodeIds.length);
    const sized = component.nodeIds.map((id) => sizedById.get(id)!);
    const cols = Math.max(...slots.map((slot) => slot.col)) + 1;
    const rows = Math.max(...slots.map((slot) => slot.row)) + 1;
    const maxNodeHeight = Math.max(...sized.map((node) => node.height));
    const width = cols * profile.nodeWidth + Math.max(0, cols - 1) * profile.nodeGap;
    const height = rows * maxNodeHeight + Math.max(0, rows - 1) * profile.nodeGap;
    const nodes = sized.map((node, index) => {
      const slot = slots[index] ?? { col: 0, row: 0 };
      return {
        ...node,
        x: slot.col * (profile.nodeWidth + profile.nodeGap) + profile.nodeWidth / 2,
        y: slot.row * (maxNodeHeight + profile.nodeGap) + maxNodeHeight / 2
      };
    });
    return { ...component, width, height, nodes, rank };
  }

  const direction = profile.direction && profile.direction !== 'auto' ? profile.direction : (graph.direction ?? 'LR');
  if (direction === 'TB') {
    const rowHeights = groups.map((group) => Math.max(...group.map((id) => sizedById.get(id)!.height)));
    const rowWidths = groups.map((group) =>
      group.reduce((sum, id, index) => sum + sizedById.get(id)!.width + (index ? profile.nodeGap : 0), 0)
    );
    const width = Math.max(...rowWidths, profile.nodeWidth);
    const height = rowHeights.reduce((sum, value, index) => sum + value + (index ? profile.nodeGap : 0), 0);
    const nodes: GraphSceneNode[] = [];
    let y = 0;
    groups.forEach((group, groupIndex) => {
      const rowHeight = rowHeights[groupIndex] ?? profile.nodeHeight;
      let x = (width - (rowWidths[groupIndex] ?? 0)) / 2;
      for (const id of group) {
        const node = sizedById.get(id)!;
        nodes.push({ ...node, x: x + node.width / 2, y: y + rowHeight / 2 });
        x += node.width + profile.nodeGap;
      }
      y += rowHeight + profile.nodeGap;
    });
    return { ...component, width, height, nodes, rank };
  }

  const blocks = groups.map((group) => {
    const width = Math.max(...group.map((id) => sizedById.get(id)!.width), profile.nodeWidth);
    const height = group.reduce((sum, id, index) => sum + sizedById.get(id)!.height + (index ? profile.nodeGap : 0), 0);
    return { group, width, height };
  });
  const rows = Array.from({ length: Math.ceil(blocks.length / 2) }, (_, row) => blocks.slice(row * 2, row * 2 + 2));
  const rowWidths = rows.map((row) => row.reduce((sum, block, index) => sum + block.width + (index ? profile.nodeGap : 0), 0));
  const rowHeights = rows.map((row) => Math.max(...row.map((block) => block.height)));
  const width = Math.max(...rowWidths, profile.nodeWidth);
  const height = rowHeights.reduce((sum, value, index) => sum + value + (index ? profile.nodeGap : 0), 0);
  const nodes: GraphSceneNode[] = [];
  let y = 0;

  rows.forEach((row, rowIndex) => {
    const visual = rowIndex % 2 === 0 ? row : [...row].reverse();
    const rowHeight = rowHeights[rowIndex] ?? profile.nodeHeight;
    let x = (width - (rowWidths[rowIndex] ?? 0)) / 2;
    for (const block of visual) {
      let blockY = y + (rowHeight - block.height) / 2;
      for (const id of block.group) {
        const node = sizedById.get(id)!;
        nodes.push({ ...node, x: x + block.width / 2, y: blockY + node.height / 2 });
        blockY += node.height + profile.nodeGap;
      }
      x += block.width + profile.nodeGap;
    }
    y += rowHeight + profile.nodeGap;
  });

  return { ...component, width, height, nodes, rank };
};

const buildComponentLayouts = (
  graph: GraphDiagramDefinition,
  analysis: ComponentGraph,
  ranks: ReadonlyMap<number, number>,
  profile: LayoutProfile
): ComponentLayout[] => {
  const sourceNodes = new Map(graph.nodes.map((node) => [node.id, node]));

  return analysis.components.map((component) => {
    if (component.cyclic) {
      return layoutCyclicComponent(component, graph, sourceNodes, profile, ranks.get(component.id) ?? 0);
    }

    const id = component.nodeIds[0]!;
    const node = sourceNodes.get(id)!;
    const sized = nodeSize(node, profile);
    return {
      ...component,
      width: sized.width,
      height: sized.height,
      nodes: [{ ...sized, x: sized.width / 2, y: sized.height / 2 }],
      rank: ranks.get(component.id) ?? 0
    };
  });
};

const preferredDirection = (graph: GraphDiagramDefinition, profile: LayoutProfile): 'LR' | 'TB' => {
  if (profile.direction && profile.direction !== 'auto') return profile.direction;
  return graph.direction ?? 'LR';
};

const pad = (profile: LayoutProfile): number => Math.max(profile.nodeGap, 2);

const placeComponent = (component: ComponentLayout, x: number, y: number): ComponentLayout => ({
  ...component,
  nodes: component.nodes.map((node) => ({ ...node, x: x + node.x, y: y + node.y }))
});

const rankGroups = (components: readonly ComponentLayout[]): ComponentLayout[][] => {
  const maxRank = Math.max(...components.map((component) => component.rank), 0);
  const groups: ComponentLayout[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const component of components) groups[component.rank]?.push(component);
  return groups;
};

const layeredLr = (
  components: readonly ComponentLayout[],
  profile: LayoutProfile
): { components: ComponentLayout[]; height: number; layout: GraphLayoutKind } | undefined => {
  const groups = rankGroups(components);
  const rankWidths = groups.map((group) => Math.max(...group.map((component) => component.width), 0));
  const contentWidth = rankWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, groups.length - 1) * profile.rankGap;
  const padding = pad(profile);
  if (contentWidth > profile.width - padding * 2) return undefined;

  const stackHeights = groups.map((group) =>
    group.reduce((sum, component, index) => sum + component.height + (index ? profile.nodeGap : 0), 0)
  );
  const contentHeight = Math.max(...stackHeights, profile.nodeHeight);
  const height = contentHeight + padding * 2;
  const result: ComponentLayout[] = [];
  let x = (profile.width - contentWidth) / 2;

  groups.forEach((group, rank) => {
    const rankWidth = rankWidths[rank] ?? 0;
    let y = padding + (contentHeight - (stackHeights[rank] ?? 0)) / 2;
    for (const component of group) {
      result.push(placeComponent(component, x + (rankWidth - component.width) / 2, y));
      y += component.height + profile.nodeGap;
    }
    x += rankWidth + profile.rankGap;
  });

  return { components: result, height, layout: 'layered-lr' };
};

const layeredTb = (
  components: readonly ComponentLayout[],
  profile: LayoutProfile
): { components: ComponentLayout[]; height: number; layout: GraphLayoutKind } => {
  const groups = rankGroups(components);
  const padding = pad(profile);
  const visualRows: { components: ComponentLayout[]; rank: number }[] = [];

  groups.forEach((group, rank) => {
    let current: ComponentLayout[] = [];
    let width = 0;
    for (const component of group) {
      const nextWidth = width + (current.length ? profile.nodeGap : 0) + component.width;
      if (current.length && (current.length >= profile.maxColumns || nextWidth > profile.width - padding * 2)) {
        visualRows.push({ components: current, rank });
        current = [];
        width = 0;
      }
      width += (current.length ? profile.nodeGap : 0) + component.width;
      current.push(component);
    }
    if (current.length) visualRows.push({ components: current, rank });
  });

  const rowHeights = visualRows.map((row) => Math.max(...row.components.map((component) => component.height)));
  let contentHeight = rowHeights.reduce((sum, value) => sum + value, 0);
  for (let index = 1; index < visualRows.length; index += 1) {
    contentHeight += visualRows[index - 1]!.rank === visualRows[index]!.rank ? profile.nodeGap : profile.rankGap;
  }
  const result: ComponentLayout[] = [];
  let y = padding;

  visualRows.forEach((row, rowIndex) => {
    const rowWidth = row.components.reduce((sum, component, index) => sum + component.width + (index ? profile.nodeGap : 0), 0);
    const rowHeight = rowHeights[rowIndex] ?? profile.nodeHeight;
    let x = (profile.width - rowWidth) / 2;
    for (const component of row.components) {
      result.push(placeComponent(component, x, y + (rowHeight - component.height) / 2));
      x += component.width + profile.nodeGap;
    }
    const next = visualRows[rowIndex + 1];
    if (next) y += rowHeight + (next.rank === row.rank ? profile.nodeGap : profile.rankGap);
  });

  return { components: result, height: contentHeight + padding * 2, layout: 'layered-tb' };
};

const serpentine = (
  components: readonly ComponentLayout[],
  profile: LayoutProfile
): { components: ComponentLayout[]; height: number; layout: GraphLayoutKind } => {
  const padding = pad(profile);
  const maxWidth = Math.max(...components.map((component) => component.width));
  const fitColumns = Math.max(1, Math.floor((profile.width - padding * 2 + profile.nodeGap) / (maxWidth + profile.nodeGap)));
  const columns = Math.max(1, Math.min(profile.maxColumns, fitColumns, components.length));
  const rows: ComponentLayout[][] = [];
  for (let index = 0; index < components.length; index += columns) rows.push(components.slice(index, index + columns));
  const rowHeights = rows.map((row) => Math.max(...row.map((component) => component.height)));
  const contentHeight = rowHeights.reduce((sum, value, index) => sum + value + (index ? profile.rankGap : 0), 0);
  const result: ComponentLayout[] = [];
  let y = padding;

  rows.forEach((row, rowIndex) => {
    const rowHeight = rowHeights[rowIndex] ?? profile.nodeHeight;
    const rowWidth = row.reduce((sum, component, index) => sum + component.width + (index ? profile.nodeGap : 0), 0);
    const positions: number[] = [];
    let x = (profile.width - rowWidth) / 2;
    for (const component of row) {
      positions.push(x);
      x += component.width + profile.nodeGap;
    }
    row.forEach((component, index) => {
      const visualIndex = rowIndex % 2 === 0 ? index : row.length - 1 - index;
      result.push(placeComponent(component, positions[visualIndex] ?? padding, y + (rowHeight - component.height) / 2));
    });
    y += rowHeight + profile.rankGap;
  });

  return { components: result, height: contentHeight + padding * 2, layout: 'serpentine' };
};

const fanoutLayout = (
  graph: GraphDiagramDefinition,
  components: readonly ComponentLayout[],
  analysis: ComponentGraph,
  profile: LayoutProfile,
  reverse: boolean
): { components: ComponentLayout[]; height: number; layout: GraphLayoutKind } => {
  const degrees = components.map((component) => ({
    component,
    degree: reverse ? (analysis.incoming.get(component.id)?.size ?? 0) : (analysis.outgoing.get(component.id)?.size ?? 0)
  }));
  const hub = degrees.sort((a, b) => b.degree - a.degree || a.component.id - b.component.id)[0]!.component;
  const children = components.filter((component) => component.id !== hub.id);
  const padding = pad(profile);
  const columns = Math.max(1, Math.min(2, profile.maxColumns));
  const rows: ComponentLayout[][] = [];
  for (let index = 0; index < children.length; index += columns) rows.push(children.slice(index, index + columns));
  const rowHeights = rows.map((row) => Math.max(...row.map((component) => component.height)));
  const childrenHeight = rowHeights.reduce((sum, value, index) => sum + value + (index ? profile.nodeGap : 0), 0);
  const height = padding * 2 + hub.height + (children.length ? profile.rankGap + childrenHeight : 0);
  const result: ComponentLayout[] = [];
  const hubY = reverse ? height - padding - hub.height : padding;
  result.push(placeComponent(hub, (profile.width - hub.width) / 2, hubY));
  let y = reverse ? padding : padding + hub.height + profile.rankGap;

  rows.forEach((row, rowIndex) => {
    const rowHeight = rowHeights[rowIndex] ?? profile.nodeHeight;
    const rowWidth = row.reduce((sum, component, index) => sum + component.width + (index ? profile.nodeGap : 0), 0);
    let x = (profile.width - rowWidth) / 2;
    for (const component of row) {
      result.push(placeComponent(component, x, y + (rowHeight - component.height) / 2));
      x += component.width + profile.nodeGap;
    }
    y += rowHeight + profile.nodeGap;
  });

  return { components: result, height, layout: reverse ? 'fanin' : 'fanout' };
};

const componentBounds = (component: ComponentLayout): ComponentBounds => {
  const minX = Math.min(...component.nodes.map((node) => node.x - node.width / 2));
  const minY = Math.min(...component.nodes.map((node) => node.y - node.height / 2));
  const maxX = Math.max(...component.nodes.map((node) => node.x + node.width / 2));
  const maxY = Math.max(...component.nodes.map((node) => node.y + node.height / 2));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const layoutGraph = (graph: GraphDiagramDefinition, profile: LayoutProfile): GraphScene => {
  validateGraph(graph);
  if (profile.width <= 0 || profile.nodeWidth <= 0 || profile.nodeHeight <= 0) {
    throw new Error('Layout profile dimensions must be positive.');
  }

  const analysis = analyzeComponents(graph);
  const ranks = componentRanks(analysis);
  const components = buildComponentLayouts(graph, analysis, ranks, profile);
  const topology = classifyGraph(graph, analysis);
  const direction = preferredDirection(graph, profile);

  let placed: { components: ComponentLayout[]; height: number; layout: GraphLayoutKind };
  if (topology === 'fanout') {
    placed = fanoutLayout(graph, components, analysis, profile, false);
  } else if (topology === 'fanin') {
    placed = fanoutLayout(graph, components, analysis, profile, true);
  } else if (topology === 'chain') {
    placed = direction === 'LR' ? (layeredLr(components, profile) ?? serpentine(components, profile)) : layeredTb(components, profile);
  } else {
    placed = direction === 'LR' ? (layeredLr(components, profile) ?? layeredTb(components, profile)) : layeredTb(components, profile);
  }

  const nodes = placed.components.flatMap((component) => component.nodes);
  const boundsByComponent = new Map(placed.components.map((component) => [component.id, componentBounds(component)]));
  const edges = routeEdges(graph, nodes, analysis.componentByNode, boundsByComponent, profile);

  return {
    kind: 'graph',
    width: profile.width,
    height: placed.height,
    topology,
    layout: topology === 'cycle' && placed.layout === 'layered-lr' ? 'cycle' : placed.layout,
    nodes,
    edges
  };
};

export function layoutDiagram(diagram: DiagramDefinition, profile: LayoutProfile): DiagramScene {
  switch (diagram.kind) {
    case 'graph':
      return layoutGraph(diagram, profile);
  }
}
