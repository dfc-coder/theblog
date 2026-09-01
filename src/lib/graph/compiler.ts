import type { GraphDiagramDefinition, LayoutProfile } from './model';
import { layoutDiagram } from './layout';
import { renderSvg } from './render-svg';

export type GraphLayoutProfileName = 'desktop' | 'mobile';

export interface GraphCompileOptions {
  readonly serpentineColumns?: number;
  readonly viewport?: 'artboard' | 'content';
  readonly viewportPadding?: number;
}

const DESKTOP_PROFILE: LayoutProfile = {
  width: 720,
  nodeWidth: 152,
  nodeHeight: 46,
  nodeGap: 20,
  rankGap: 60,
  maxColumns: 4,
  direction: 'auto'
};

const MOBILE_PROFILE: LayoutProfile = {
  width: 336,
  nodeWidth: 134,
  nodeHeight: 46,
  nodeGap: 20,
  rankGap: 42,
  maxColumns: 2,
  direction: 'TB'
};

const profileFor = (
  name: GraphLayoutProfileName,
  options: GraphCompileOptions
): LayoutProfile => {
  const base = name === 'mobile' ? MOBILE_PROFILE : DESKTOP_PROFILE;
  if (options.serpentineColumns === undefined) return base;
  return { ...base, maxColumns: Math.max(1, Math.floor(options.serpentineColumns)) };
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export function compileGraphVariantSvg(
  graph: GraphDiagramDefinition,
  profileName: GraphLayoutProfileName,
  options: GraphCompileOptions = {}
): string {
  const scene = layoutDiagram(graph, profileFor(profileName, options));
  return renderSvg(scene, { classPrefix: 'graph' }, {
    profile: profileName,
    viewport: options.viewport === 'content' ? 'content' : 'scene',
    viewportPadding: options.viewportPadding
  });
}

export function compileGraphSvg(
  graph: GraphDiagramDefinition,
  options: GraphCompileOptions = {}
): string {
  const scene = layoutDiagram(graph, profileFor('desktop', options));
  const svg = renderSvg(scene, { classPrefix: 'graph' }, {
    profile: 'desktop',
    viewport: options.viewport === 'content' ? 'content' : 'scene',
    viewportPadding: options.viewportPadding
  });
  const title = graph.title ? `<figcaption>${escapeHtml(graph.title)}</figcaption>` : '';

  return `<figure class="article-graph" data-graph-layout="${scene.layout}">
${title}
<div class="article-graph__viewport">
<div class="article-graph__stage">
${svg}
</div>
</div>
</figure>`;
}
