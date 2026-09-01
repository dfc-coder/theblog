import type {
  GraphDiagramDefinition,
  GraphSceneEdge,
  GraphSceneNode,
  LayoutProfile,
  Point
} from './model';

export type ComponentBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

const nodeMap = (nodes: readonly GraphSceneNode[]) => new Map(nodes.map((node) => [node.id, node]));

const nodeBounds = (node: GraphSceneNode): ComponentBounds => ({
  x: node.x - node.width / 2,
  y: node.y - node.height / 2,
  width: node.width,
  height: node.height
});

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const regularRoute = (from: GraphSceneNode, to: GraphSceneNode): readonly Point[] => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const direction = Math.sign(dx) || 1;
    const start = { x: from.x + (from.width / 2) * direction, y: from.y };
    const end = { x: to.x - (to.width / 2) * direction, y: to.y };
    const middleX = (start.x + end.x) / 2;
    return [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end];
  }

  const direction = Math.sign(dy) || 1;
  const start = { x: from.x, y: from.y + (from.height / 2) * direction };
  const end = { x: to.x, y: to.y - (to.height / 2) * direction };
  const middleY = (start.y + end.y) / 2;
  return [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end];
};

const compactPolyline = (points: readonly Point[]): readonly Point[] => {
  const compact: Point[] = [];
  for (const point of points) {
    const previous = compact[compact.length - 1];
    if (previous && previous.x === point.x && previous.y === point.y) continue;
    compact.push(point);
  }

  if (compact.length <= 2) return compact;
  const simplified: Point[] = [compact[0]!];
  for (let index = 1; index < compact.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1]!;
    const current = compact[index]!;
    const next = compact[index + 1]!;
    const sameX = previous.x === current.x && current.x === next.x;
    const sameY = previous.y === current.y && current.y === next.y;
    if (!sameX && !sameY) simplified.push(current);
  }
  simplified.push(compact[compact.length - 1]!);
  return simplified;
};

const labelPosition = (points: readonly Point[]): Point | undefined => {
  if (points.length < 2) return undefined;
  let bestStart = points[0]!;
  let bestEnd = points[1]!;
  let bestLength = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length > bestLength) {
      bestLength = length;
      bestStart = start;
      bestEnd = end;
    }
  }

  return {
    x: (bestStart.x + bestEnd.x) / 2,
    y: (bestStart.y + bestEnd.y) / 2 - 2
  };
};

const feedbackRoute = (
  from: GraphSceneNode,
  to: GraphSceneNode,
  bounds: ComponentBounds,
  index: number,
  profile: LayoutProfile
): { points: readonly Point[]; label: Point } => {
  const useLeft = index % 2 === 0;
  const laneGap = Math.max(profile.nodeGap, profile.rankGap * 0.35);
  const minX = profile.nodeGap / 2;
  const maxX = profile.width - profile.nodeGap / 2;
  const laneX = useLeft
    ? clamp(bounds.x - laneGap, minX, maxX)
    : clamp(bounds.x + bounds.width + laneGap, minX, maxX);

  const fromBox = nodeBounds(from);
  const toBox = nodeBounds(to);
  const start = useLeft
    ? { x: fromBox.x, y: from.y }
    : { x: fromBox.x + fromBox.width, y: from.y };
  const end = useLeft
    ? { x: toBox.x, y: to.y }
    : { x: toBox.x + toBox.width, y: to.y };
  const bend = Math.max(profile.nodeGap * 1.5, Math.abs(start.y - end.y) * 0.18);
  const c1 = { x: laneX, y: start.y + (start.y <= end.y ? -bend : bend) };
  const c2 = { x: laneX, y: end.y + (start.y <= end.y ? bend : -bend) };

  return {
    points: [start, c1, c2, end],
    label: { x: laneX + (useLeft ? profile.nodeGap * 0.45 : -profile.nodeGap * 0.45), y: (start.y + end.y) / 2 }
  };
};

const unionBounds = (left: ComponentBounds, right: ComponentBounds): ComponentBounds => {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.width, right.x + right.width);
  const maxY = Math.max(left.y + left.height, right.y + right.height);
  return { x, y, width: maxX - x, height: maxY - y };
};

export function routeEdges(
  graph: GraphDiagramDefinition,
  nodes: readonly GraphSceneNode[],
  componentByNode: ReadonlyMap<string, number>,
  componentBounds: ReadonlyMap<number, ComponentBounds>,
  profile: LayoutProfile
): GraphSceneEdge[] {
  const byId = nodeMap(nodes);
  const feedbackCount = new Map<number, number>();

  return graph.edges.map((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) throw new Error(`Unknown node in edge ${edge.from} -> ${edge.to}.`);

    const kind = edge.kind ?? 'default';
    if (kind !== 'feedback') {
      const points = compactPolyline(regularRoute(from, to));
      return {
        from: edge.from,
        to: edge.to,
        ...(edge.label ? { label: edge.label } : {}),
        kind,
        path: { kind: 'polyline', points },
        ...(edge.label ? { labelPosition: labelPosition(points) } : {})
      };
    }

    const fromComponent = componentByNode.get(edge.from);
    const toComponent = componentByNode.get(edge.to);
    const componentId = fromComponent ?? toComponent ?? -1;
    const fromBounds = fromComponent === undefined ? nodeBounds(from) : componentBounds.get(fromComponent) ?? nodeBounds(from);
    const toBounds = toComponent === undefined ? nodeBounds(to) : componentBounds.get(toComponent) ?? nodeBounds(to);
    const bounds = fromComponent === toComponent ? fromBounds : unionBounds(fromBounds, toBounds);
    const index = feedbackCount.get(componentId) ?? 0;
    feedbackCount.set(componentId, index + 1);
    const route = feedbackRoute(from, to, bounds, index, profile);

    return {
      from: edge.from,
      to: edge.to,
      ...(edge.label ? { label: edge.label } : {}),
      kind,
      path: { kind: 'curve', points: route.points },
      ...(edge.label ? { labelPosition: route.label } : {})
    };
  });
}
