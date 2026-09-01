import type { DiagramScene, GraphScene, Point, ScenePath, Theme } from './model';

export type RenderOptions = {
  readonly profile?: string;
  readonly viewport?: 'scene' | 'content';
  readonly viewportPadding?: number;
};

type Viewport = { x: number; y: number; width: number; height: number };

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const number = (value: number): string => Number(value.toFixed(2)).toString();

const pathSvg = (path: ScenePath): string => {
  const points = path.points;
  const first = points[0];
  if (!first) return '';

  if (path.kind === 'curve') {
    const c1 = points[1] ?? first;
    const c2 = points[2] ?? c1;
    const end = points[3] ?? points[points.length - 1] ?? first;
    return `M ${number(first.x)} ${number(first.y)} C ${number(c1.x)} ${number(c1.y)} ${number(c2.x)} ${number(c2.y)} ${number(end.x)} ${number(end.y)}`;
  }

  let result = `M ${number(first.x)} ${number(first.y)}`;
  let previous = first;
  for (const point of points.slice(1)) {
    if (point.y === previous.y) result += ` H ${number(point.x)}`;
    else if (point.x === previous.x) result += ` V ${number(point.y)}`;
    else result += ` L ${number(point.x)} ${number(point.y)}`;
    previous = point;
  }
  return result;
};

const stableId = (scene: GraphScene): string => {
  const source = JSON.stringify({
    nodes: scene.nodes.map(({ id, x, y }) => ({ id, x, y })),
    edges: scene.edges.map(({ from, to, path }) => ({ from, to, path }))
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `graph-arrow-${(hash >>> 0).toString(36)}`;
};

const pathPoints = (scene: GraphScene): Point[] => scene.edges.flatMap((edge) => [...edge.path.points]);

const contentViewport = (scene: GraphScene, padding: number): Viewport => {
  if (scene.nodes.length === 0) return { x: 0, y: 0, width: scene.width, height: scene.height };
  const minNodeX = Math.min(...scene.nodes.map((node) => node.x - node.width / 2));
  const maxNodeX = Math.max(...scene.nodes.map((node) => node.x + node.width / 2));
  const minNodeY = Math.min(...scene.nodes.map((node) => node.y - node.height / 2));
  const maxNodeY = Math.max(...scene.nodes.map((node) => node.y + node.height / 2));
  const points = pathPoints(scene);
  const minEdgeX = points.length ? Math.min(...points.map((point) => point.x)) : minNodeX;
  const maxEdgeX = points.length ? Math.max(...points.map((point) => point.x)) : maxNodeX;
  const minEdgeY = points.length ? Math.min(...points.map((point) => point.y)) : minNodeY;
  const maxEdgeY = points.length ? Math.max(...points.map((point) => point.y)) : maxNodeY;
  const labelPositions = scene.edges.flatMap((edge) => edge.labelPosition ? [edge.labelPosition] : []);
  const minLabelX = labelPositions.length ? Math.min(...labelPositions.map((point) => point.x)) : minNodeX;
  const maxLabelX = labelPositions.length ? Math.max(...labelPositions.map((point) => point.x)) : maxNodeX;
  const minLabelY = labelPositions.length ? Math.min(...labelPositions.map((point) => point.y)) : minNodeY;
  const maxLabelY = labelPositions.length ? Math.max(...labelPositions.map((point) => point.y)) : maxNodeY;
  const minX = Math.max(0, Math.min(minNodeX, minEdgeX, minLabelX) - padding);
  const maxX = Math.min(scene.width, Math.max(maxNodeX, maxEdgeX, maxLabelX) + padding);
  const minY = Math.min(minNodeY, minEdgeY, minLabelY) - padding;
  const maxY = Math.max(maxNodeY, maxEdgeY, maxLabelY) + padding;
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
};

const renderGraphSvg = (scene: GraphScene, theme: Theme, options: RenderOptions): string => {
  const prefix = theme.classPrefix ?? 'graph';
  const arrowId = stableId(scene);
  const viewport = options.viewport === 'content'
    ? contentViewport(scene, Math.max(0, options.viewportPadding ?? 24))
    : { x: 0, y: 0, width: scene.width, height: scene.height };
  const profile = options.profile ?? 'default';

  const edges = scene.edges.map((edge) => {
    const suffix = edge.kind === 'feedback' ? ` ${prefix}-edge--feedback` : '';
    const label = edge.label && edge.labelPosition
      ? `<text class="${prefix}-edge-label" x="${number(edge.labelPosition.x)}" y="${number(edge.labelPosition.y)}">${escapeHtml(edge.label)}</text>`
      : '';
    return `<g class="${prefix}-edge${suffix}"><path d="${pathSvg(edge.path)}" marker-end="url(#${arrowId})"/>${label}</g>`;
  }).join('');

  const nodes = scene.nodes.map((node) => {
    const lineHeight = Math.max(12, node.height * 0.28);
    const startY = node.y - ((node.lines.length - 1) * lineHeight) / 2;
    const text = node.lines.map((line, index) =>
      `<tspan x="${number(node.x)}" y="${number(startY + index * lineHeight)}">${escapeHtml(line)}</tspan>`
    ).join('');
    return `<g class="${prefix}-node ${prefix}-node--${node.kind}">
  <rect x="${number(node.x - node.width / 2)}" y="${number(node.y - node.height / 2)}" width="${number(node.width)}" height="${number(node.height)}" rx="4"/>
  <text x="${number(node.x)}" y="${number(node.y)}">${text}</text>
</g>`;
  }).join('');

  const viewBox = [viewport.x, viewport.y, viewport.width, viewport.height].map(number).join(' ');
  return `<svg class="article-graph__svg" data-graph-profile="${escapeHtml(profile)}" data-graph-layout="${scene.layout}" data-graph-topology="${scene.topology}" width="${Math.ceil(viewport.width)}" height="${Math.ceil(viewport.height)}" viewBox="${viewBox}" role="img" aria-label="Architecture diagram">
  <defs>
    <marker id="${arrowId}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 8 4 L 0 8 z" class="${prefix}-arrow"/>
    </marker>
  </defs>
  ${edges}
  ${nodes}
</svg>`;
};

export function renderSvg(
  scene: DiagramScene,
  theme: Theme = {},
  options: RenderOptions = {}
): string {
  switch (scene.kind) {
    case 'graph':
      return renderGraphSvg(scene, theme, options);
  }
}
