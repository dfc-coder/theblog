import { describe, expect, it } from 'vitest';
import { layoutDiagram } from '../src/lib/graph/layout';
import type { LayoutProfile } from '../src/lib/graph/model';
import { parseGraph } from '../src/lib/graph/parser';

const compactDesktop: LayoutProfile = {
  width: 100,
  nodeWidth: 16,
  nodeHeight: 6,
  nodeGap: 4,
  rankGap: 6,
  maxColumns: 4,
  direction: 'auto'
};

describe('cycle layout', () => {
  it('derives ReAct shape from the forward structure instead of node-count slots', () => {
    const scene = layoutDiagram(
      parseGraph(`
        direction: LR
        request: REQUEST
        router: ROUTER
        reason[accent]: REASON
        tools: TOOLS
        verify: VERIFY
        reflect[accent]: REFLECT
        model: LOCAL MODEL
        request -> router
        router -> reason | PLAN
        reason -> tools
        tools -> verify | RESULT
        verify -> reflect
        reflect ~> reason | RETRY
        verify -> model
        model ~> reason
      `),
      compactDesktop
    );

    const byId = new Map(scene.nodes.map((node) => [node.id, node]));
    const reason = byId.get('reason')!;
    const tools = byId.get('tools')!;
    const verify = byId.get('verify')!;
    const reflect = byId.get('reflect')!;
    const model = byId.get('model')!;

    expect(scene.topology).toBe('cycle');
    expect(scene.layout).toBe('cycle');

    expect(reason.x).toBeLessThan(tools.x);
    expect(reflect.x).toBeLessThan(verify.x);
    expect(model.x).toBeLessThan(verify.x);
    expect(reason.y).toBeLessThan(reflect.y);
    expect(tools.y).toBeLessThan(verify.y);
    expect(reflect.y).toBeLessThan(model.y);

    expect(scene.edges.filter((edge) => edge.kind === 'feedback')).toHaveLength(2);
  });
});
