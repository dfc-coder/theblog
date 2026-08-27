import { compileGraphSvg } from './compiler';
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
const EDGE_PATTERN = /<g class="graph-edge"><path d="([^"]+)" marker-end="[^"]+"\/>(.*?)<\/g>/g;
const MARKER_PATTERN = /\s*<marker id="graph-arrow-[^"]+"[\s\S]*?<\/marker>\s*/g;

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

const renderRoughEdges = (markup: string, graphKey: string): string => {
  let edgeIndex = 0;

  return markup.replace(EDGE_PATTERN, (_match, path: string, tail: string) => {
    const edgeKey = `${graphKey}:edge:${edgeIndex}`;
    edgeIndex += 1;
    const stroke = roughOrthogonalStroke(path, edgeKey);
    const arrow = roughArrowHead(stroke.points, `${edgeKey}:arrow`);

    return `<g class="graph-edge">
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
 */
export function applyHandDrawnSkin(markup: string): string {
  const graphKey = markup.match(/id="(graph-arrow-[A-Za-z0-9-]+)"/)?.[1] ?? 'graph';

  let sketched = markup.replace(
    '<figure class="article-graph"',
    '<figure class="article-graph" data-graph-skin="handwrite"'
  );

  sketched = renderRoughEdges(sketched, graphKey);
  sketched = renderRoughNodes(sketched, graphKey);
  sketched = sketched.replace(MARKER_PATTERN, '\n');

  return hoistEdgeLabels(sketched);
}

/**
 * Sätteri MDAST plugin used by Astro 7.
 *
 * Only `graph` code fences cross into JavaScript. The compiler runs at build time
 * and replaces the fence with escaped, static SVG markup, so diagrams add no
 * browser-side JavaScript or runtime dependency.
 */
export function graphMdastPlugin() {
  return {
    name: 'editorial-graph',
    code(node: CodeNode) {
      if (node.lang !== 'graph') {
        return;
      }

      const graph = parseGraph(node.value);
      const markup = compileGraphSvg(graph);

      return {
        type: 'html' as const,
        value: applyHandDrawnSkin(markup)
      };
    }
  };
}
