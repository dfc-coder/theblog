import { describe, expect, it } from 'vitest';
import { compileGraphSvg, compileGraphVariantSvg } from '../src/lib/graph/compiler';
import { layoutDiagram } from '../src/lib/graph/layout';
import { applyHandDrawnSkin, graphMdastPlugin } from '../src/lib/graph/markdown';
import type { GraphDiagramDefinition, GraphScene, LayoutProfile } from '../src/lib/graph/model';
import { parseGraph } from '../src/lib/graph/parser';

const blogDesktop: LayoutProfile = {
  width: 720,
  nodeWidth: 152,
  nodeHeight: 46,
  nodeGap: 20,
  rankGap: 60,
  maxColumns: 4,
  direction: 'auto'
};

const compactDesktop: LayoutProfile = {
  width: 100,
  nodeWidth: 16,
  nodeHeight: 6,
  nodeGap: 4,
  rankGap: 6,
  maxColumns: 4,
  direction: 'auto'
};

const overlaps = (left: GraphScene['nodes'][number], right: GraphScene['nodes'][number]) =>
  Math.abs(left.x - right.x) < (left.width + right.width) / 2 &&
  Math.abs(left.y - right.y) < (left.height + right.height) / 2;

const expectNoNodeOverlap = (scene: GraphScene) => {
  for (let left = 0; left < scene.nodes.length; left += 1) {
    for (let right = left + 1; right < scene.nodes.length; right += 1) {
      expect(overlaps(scene.nodes[left]!, scene.nodes[right]!)).toBe(false);
    }
  }
};

describe('Diagram Engine v1', () => {
  it('parses the blog DSL into an explicit graph family', () => {
    const graph = parseGraph(`
      title: Request flow
      direction: LR
      client[terminal]: CLIENT
      router: ROUTER
      api[accent]: API
      client -> router
      router -> api | business
    `);

    expect(graph.kind).toBe('graph');
    expect(graph.direction).toBe('LR');
    expect(graph.nodes).toEqual([
      { id: 'client', label: 'CLIENT', kind: 'terminal' },
      { id: 'router', label: 'ROUTER', kind: 'default' },
      { id: 'api', label: 'API', kind: 'accent' }
    ]);
    expect(graph.edges[1]).toEqual({
      from: 'router',
      to: 'api',
      label: 'business',
      kind: 'default'
    });
  });

  it('parses feedback as graph semantics rather than animation order', () => {
    const graph = parseGraph(`
      observe: OBSERVE
      understand: UNDERSTAND
      learn: LEARN
      observe -> understand
      understand -> learn
      learn ~> observe | feedback
    `);

    expect(graph.edges[2]).toEqual({
      from: 'learn',
      to: 'observe',
      label: 'feedback',
      kind: 'feedback'
    });
  });

  it('rejects invalid definitions explicitly', () => {
    expect(() => parseGraph('a: A\na: AGAIN')).toThrow('duplicate node "a"');
    expect(() => parseGraph('a: A\na -> missing')).toThrow('unknown node "missing"');
    expect(() => parseGraph('a: A\nb: B\na -> b\na -> b')).toThrow('duplicate edge a -> b');
  });

  it('accepts structured graph definitions without using the parser', () => {
    const graph: GraphDiagramDefinition = {
      kind: 'graph',
      direction: 'LR',
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' }
      ],
      edges: [{ from: 'a', to: 'b' }]
    };

    const scene = layoutDiagram(graph, compactDesktop);
    expect(scene.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(scene.edges).toHaveLength(1);
  });

  it('discovers a chain and wraps it only when it no longer fits', () => {
    const scene = layoutDiagram(
      parseGraph(`
        direction: LR
        a: A
        b: B
        c: C
        d: D
        e: E
        a -> b
        b -> c
        c -> d
        d -> e
      `),
      blogDesktop
    );

    expect(scene.topology).toBe('chain');
    expect(scene.layout).toBe('serpentine');
    expectNoNodeOverlap(scene);
  });

  it('discovers fan-out', () => {
    const scene = layoutDiagram(
      parseGraph(`
        hub: HUB
        a: A
        b: B
        c: C
        hub -> a
        hub -> b
        hub -> c
      `),
      blogDesktop
    );

    expect(scene.topology).toBe('fanout');
    expect(scene.layout).toBe('fanout');
    expectNoNodeOverlap(scene);
  });

  it('discovers fan-in', () => {
    const scene = layoutDiagram(
      parseGraph(`
        a: A
        b: B
        c: C
        hub: HUB
        a -> hub
        b -> hub
        c -> hub
      `),
      blogDesktop
    );

    expect(scene.topology).toBe('fanin');
    expect(scene.layout).toBe('fanin');
    expectNoNodeOverlap(scene);
  });

  it('discovers branch and join without requiring a layout hint', () => {
    const scene = layoutDiagram(
      parseGraph(`
        direction: LR
        input: INPUT
        left: LEFT
        right: RIGHT
        output: OUTPUT
        input -> left
        input -> right
        left -> output
        right -> output
      `),
      blogDesktop
    );

    expect(scene.topology).toBe('branch-join');
    expect(scene.layout).toBe('layered-lr');
    expectNoNodeOverlap(scene);
  });

  it('condenses ReAct into a compact cycle instead of a long DAG', () => {
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

    expect(scene.topology).toBe('cycle');
    expect(scene.layout).toBe('cycle');
    expect(scene.height).toBeLessThan(50);
    expectNoNodeOverlap(scene);

    const byId = new Map(scene.nodes.map((node) => [node.id, node]));
    expect(byId.get('request')!.x).toBeLessThan(byId.get('router')!.x);
    expect(byId.get('router')!.x).toBeLessThan(byId.get('reason')!.x);

    const feedback = scene.edges.filter((edge) => edge.kind === 'feedback');
    expect(feedback).toHaveLength(2);
    expect(feedback.every((edge) => edge.path.kind === 'curve')).toBe(true);
    expect(feedback.every((edge) => edge.path.points.every((point) => point.x >= 0 && point.x <= scene.width))).toBe(true);
  });

  it('is deterministic', () => {
    const graph = parseGraph(`
      direction: LR
      a: A
      b: B
      c: C
      a -> b
      b -> c
      c ~> a
    `);

    expect(layoutDiagram(graph, compactDesktop)).toEqual(layoutDiagram(graph, compactDesktop));
  });

  it('uses separate desktop and mobile geometry without changing semantics', () => {
    const graph = parseGraph(`
      direction: LR
      input: INPUT
      left: LEFT
      right: RIGHT
      output: OUTPUT
      input -> left
      input -> right
      left -> output
      right -> output
    `);
    const desktop = compileGraphVariantSvg(graph, 'desktop');
    const mobile = compileGraphVariantSvg(graph, 'mobile');

    expect(desktop).toContain('data-graph-profile="desktop"');
    expect(desktop).toContain('width="720"');
    expect(mobile).toContain('data-graph-profile="mobile"');
    expect(mobile).toContain('width="336"');
    expect(desktop).toContain('data-graph-topology="branch-join"');
    expect(mobile).toContain('data-graph-topology="branch-join"');

    for (const label of ['INPUT', 'LEFT', 'RIGHT', 'OUTPUT']) {
      expect(desktop).toContain(label);
      expect(mobile).toContain(label);
    }
  });

  it('keeps the editorial renderer compatible with long labels and a 720-unit desktop profile', () => {
    const short = compileGraphSvg(parseGraph('a: A'));
    const long = compileGraphSvg(parseGraph('a: CONTEXT ASSEMBLER'));

    expect(short).toContain('width="152" height="46"');
    expect(long).toContain('width="152" height="46"');
    expect(short).toMatch(/<svg[^>]+width="720"/);
  });

  it('renders feedback as a bounded curve and keeps the hand-drawn skin independent', () => {
    const compiled = compileGraphSvg(
      parseGraph('a[terminal]: VISITOR\nb[accent]: ROUTER\na -> b\nb ~> a | retry')
    );
    const sketched = applyHandDrawnSkin(compiled);

    expect(compiled).toContain('graph-edge graph-edge--feedback');
    expect(compiled).toMatch(/graph-edge--feedback"><path d="M [^"]+ C [^"]+"/);
    expect(sketched).toContain('graph-node-shape');
    expect(sketched).toContain('graph-edge-stroke--primary');
    expect(sketched).not.toContain('marker-end=');
    expect(applyHandDrawnSkin(compiled)).toBe(sketched);
  });

  it('escapes labels before rendering', () => {
    const svg = compileGraphSvg(parseGraph('a: <script>alert(1)</script>'));
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
  });

  it('renders one semantic blog figure with desktop and mobile scenes at build time', () => {
    const plugin = graphMdastPlugin();
    const rendered = plugin.code({
      type: 'code',
      lang: 'graph',
      value: 'title: Flow\na: A\nb: B\na -> b'
    });
    const markup = rendered?.value ?? '';

    expect((markup.match(/<figure/g) ?? []).length).toBe(1);
    expect((markup.match(/<svg/g) ?? []).length).toBe(2);
    expect(markup).toContain('article-graph__stage--desktop');
    expect(markup).toContain('article-graph__stage--mobile');
  });
});
