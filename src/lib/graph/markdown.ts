import { compileGraphSvg } from './compiler';
import { parseGraph } from './parser';

type CodeNode = {
  readonly type: 'code';
  readonly lang?: string | null;
  readonly value: string;
};

const roughFilter = (id: string): string => `<filter id="${id}" x="-5%" y="-14%" width="110%" height="128%">
  <feTurbulence type="fractalNoise" baseFrequency="0.014 0.045" numOctaves="2" seed="11" result="noise"/>
  <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.15" xChannelSelector="R" yChannelSelector="G"/>
</filter>`;

/**
 * Adds a deterministic hand-drawn treatment without changing the compiler layout.
 * Geometry stays editorial and precise; only the rendered strokes are displaced
 * and echoed so diagrams retain the same composition while feeling hand sketched.
 */
export function applyHandDrawnSkin(markup: string): string {
  const arrowId = markup.match(/id="(graph-arrow-[A-Za-z0-9-]+)"/)?.[1];
  if (!arrowId) {
    return markup;
  }

  const roughId = `${arrowId}-rough`;

  return markup
    .replace(
      '<figure class="article-graph"',
      '<figure class="article-graph" data-graph-skin="handwrite"'
    )
    .replace('<defs>', `<defs>\n    ${roughFilter(roughId)}`)
    .replace(/<rect ([^>]+?)\/>/g, (_match, attributes: string) =>
      `<rect ${attributes} filter="url(#${roughId})"/><rect class="graph-sketch-echo" ${attributes} filter="url(#${roughId})" transform="translate(0.8 -0.55)"/>`
    )
    .replace(
      /<g class="graph-edge"><path ([^>]+?)\/?>(.*?)<\/g>/g,
      (_match, attributes: string, tail: string) => {
        const echoAttributes = attributes.replace(/\smarker-end="[^"]+"/, '');
        return `<g class="graph-edge"><path ${attributes} filter="url(#${roughId})"/><path class="graph-sketch-echo" ${echoAttributes} filter="url(#${roughId})" transform="translate(0.65 -0.45)"/>${tail}</g>`;
      }
    )
    .replace(
      'class="graph-arrow"/>',
      `class="graph-arrow" filter="url(#${roughId})"/>`
    );
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
