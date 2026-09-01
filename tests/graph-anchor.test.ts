import { describe, expect, it } from 'vitest';
import { layoutDiagram } from '../src/lib/graph/layout';
import type { GraphDiagramDefinition, LayoutProfile } from '../src/lib/graph/model';

const graph: GraphDiagramDefinition = {
  kind: 'graph',
  direction: 'LR',
  nodes: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' }
  ],
  edges: [{ from: 'a', to: 'b' }]
};

const base: LayoutProfile = {
  width: 100,
  nodeWidth: 20,
  nodeHeight: 8,
  nodeGap: 3,
  rankGap: 10,
  maxColumns: 4,
  direction: 'LR'
};

describe('Diagram Engine node anchors', () => {
  it('changes edge attachment without changing layout composition', () => {
    const boxes = layoutDiagram(graph, base);
    const glyphs = layoutDiagram(graph, { ...base, anchorWidth: 2, anchorHeight: 2 });

    expect(glyphs.nodes).toEqual(boxes.nodes);

    const boxPath = boxes.edges[0]!.path.points;
    const glyphPath = glyphs.edges[0]!.path.points;
    expect(glyphPath[0]!.x).toBeLessThan(boxPath[0]!.x);
    expect(glyphPath[glyphPath.length - 1]!.x).toBeGreaterThan(boxPath[boxPath.length - 1]!.x);
  });
});
