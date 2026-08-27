import { compileGraphSvg } from './compiler';
import { parseGraph } from './parser';

type MarkdownNode = {
  type?: string;
  lang?: string | null;
  value?: string;
  children?: MarkdownNode[];
};

const transform = (node: MarkdownNode): void => {
  if (!node.children) {
    return;
  }

  node.children = node.children.map((child) => {
    if (child.type === 'code' && child.lang === 'graph') {
      return {
        type: 'html',
        value: compileGraphSvg(parseGraph(child.value ?? ''))
      };
    }

    transform(child);
    return child;
  });
};

export function remarkGraph() {
  return (tree: MarkdownNode) => {
    transform(tree);
  };
}
