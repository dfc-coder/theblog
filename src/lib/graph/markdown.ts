import { compileDiagram } from './compile';
export { applyHandDrawnSkin } from './skin';

type CodeNode = {
  readonly type: 'code';
  readonly lang?: string | null;
  readonly value: string;
};

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
      if (node.lang !== 'graph') return;

      const { svg } = compileDiagram(node.value);
      return {
        type: 'html' as const,
        value: svg
      };
    }
  };
}
