import { compileGraphVariantSvg } from './compiler';
import { parseGraph } from './parser';
import {
  roughArrowHead,
  roughHatching,
  roughNodeBox,
  roughOrthogonalStroke
} from './rough';

type CodeNode = {
  readonly type: 'code';
  readonly lang?: string | null;
  readonly value: string;
};

const EDGE_LABEL_PATTERN = /<text class="graph-edge-label"[^>]*>.*?<\/text>/g;
const NODE_PATTERN = /<g class="graph-node graph-node--([a-z-]+)">\s*<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" rx="4"\/>\s*(<text[\s\S]*?<\/text>)\s*<\/g>/g;
const EDGE_PATTERN = /<g class="graph-edge([^"]*)"><path d="([^"]+)" marker-end="[^"]+"\/>(.*?)<\/g>/g;
const MARKER_PATTERN = /\s*<marker id="graph-arrow-[^"]+"[\s\S]*?<\/marker>\s*/g;

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const hoistEdgeLabels = (markup: string): string => {
  const labels: string[] = [];
  const withoutLabels = markup.replace(EDGE_LABEL_PATTERN, (label) => {
    labels.push(label);
    return '';
  });

  if (labels.length === 0) {
    return withoutLabels;
  }

  return withoutLabels.replace(
    '</svg>',
    `  <g class="graph-edge-labels">${labels.join('')}</g>\n</svg>`
  );
};

const renderRoughNodes = (markup: string, graphKey: string): string =>
  markup.replace(
    NODE_PATTERN,
    (_match, kind: string, rawX: string, rawY: string, rawWidth: string, rawHeight: string, text: string) => {
      const x = Number(rawX);
      const y = Number(rawY);
      const width = Number(rawWidth);
      const height = Number(rawHeight);
      const nodeKey = `${graphKey}:node:${x}:${y}:${width}:${height}`;
      const box = roughNodeBox(x, y, width, height, nodeKey);
      const hatching = roughHatching(x, y, width, height, `${nodeKey}:hatch`)
        .map((path) => `<path class="graph-hatch" d="${path}"/>`)
        .join('');

      return `<g class="graph-node graph-node--${kind}" data-node-width="${width}" data-node-height="${height}">
  <path class="graph-node-shape" d="${box.primary}"/>
  <path class="graph-node-echo" d="${box.secondary}"/>
  <g class="graph-hatching">${hatching}</g>
  ${text}
</g>`;
    }
  );

const feedbackCurveStroke = (path: string) => {
  const values = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const points = values.length >= 8
    ? [
        { x: values[0] ?? 0, y: values[1] ?? 0 },
        { x: values[2] ?? 0, y: values[3] ?? 0 },
        { x: values[4] ?? 0, y: values[5] ?? 0 },
        { x: values[6] ?? 0, y: values[7] ?? 0 }
      ]
    : [];

  return {
    points,
    primary: path,
    secondary: path
  };
};

const renderRoughEdges = (markup: string, graphKey: string): string => {
  let edgeIndex = 0;

  return markup.replace(EDGE_PATTERN, (_match, classSuffix: string, path: string, tail: string) => {
    const edgeKey = `${graphKey}:edge:${edgeIndex}`;
    edgeIndex += 1;
    const isFeedback = classSuffix.includes('graph-edge--feedback');
    const stroke = isFeedback
      ? feedbackCurveStroke(path)
      : roughOrthogonalStroke(path, edgeKey);
    const arrow = roughArrowHead(stroke.points, `${edgeKey}:arrow`);

    return `<g class="graph-edge${classSuffix}">
  <path class="graph-edge-stroke graph-edge-stroke--primary" d="${stroke.primary}"/>
  <path class="graph-edge-stroke graph-edge-stroke--secondary" d="${stroke.secondary}"/>
  <path class="graph-arrow-hand graph-arrow-hand--primary" d="${arrow.primary}"/>
  <path class="graph-arrow-hand graph-arrow-hand--secondary" d="${arrow.secondary}"/>
  ${tail}
</g>`;
  });
};

/**
 * Replaces perfect SVG primitives with deterministic hand-drawn geometry while
 * preserving the compiler's positions, dimensions and graph layout.
 *
 * The function accepts both the legacy complete figure and a standalone SVG so
 * the Markdown renderer can skin desktop/mobile variants independently.
 */
export function applyHandDrawnSkin(markup: string): string {
  const graphKey = markup.match(/id="(graph-arrow-[A-Za-z0-9-]+)"/)?.[1] ?? 'graph';

  let sketched = markup.includes('<figure class="article-graph"')
    ? markup.replace(
        '<figure class="article-graph"',
        '<figure class="article-graph" data-graph-skin="handwrite"'
      )
    : markup;

  sketched = renderRoughEdges(sketched, graphKey);
  sketched = renderRoughNodes(sketched, graphKey);
  sketched = sketched.replace(MARKER_PATTERN, '\n');

  return hoistEdgeLabels(sketched);
}

const responsiveGraphMarkup = (source: string): string => {
  const graph = parseGraph(source);
  const desktop = applyHandDrawnSkin(compileGraphVariantSvg(graph, 'desktop'));
  const mobile = applyHandDrawnSkin(
    compileGraphVariantSvg(graph, 'mobile', {
      viewport: 'content',
      viewportPadding: 18
    })
  );
  const title = graph.title ? `<figcaption>${escapeHtml(graph.title)}</figcaption>` : '';

  return `<figure class="article-graph" data-graph-skin="handwrite">
${title}
<div class="article-graph__viewport">
  <div class="article-graph__stage article-graph__stage--desktop">${desktop}</div>
  <div class="article-graph__stage article-graph__stage--mobile">${mobile}</div>
</div>
</figure>`;
};

/**
 * Sätteri MDAST plugin used by Astro 7.
 *
 * Only `graph` code fences cross into JavaScript. Both responsive variants are
 * compiled at build time, so diagrams add no browser-side JavaScript or runtime
 * layout dependency.
 */
export function graphMdastPlugin() {
  return {
    name: 'editorial-graph',
    code(node: CodeNode) {
      if (node.lang !== 'graph') {
        return;
      }

      return {
        type: 'html' as const,
        value: responsiveGraphMarkup(node.value)
      };
    }
  };
}
