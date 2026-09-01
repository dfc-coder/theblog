import { describe, expect, it } from 'vitest';
import { compileGraphSvg, compileGraphVariantSvg } from '../src/lib/graph/compiler';
import { applyHandDrawnSkin, graphMdastPlugin } from '../src/lib/graph/markdown';
import { parseGraph } from '../src/lib/graph/parser';

describe('graph DSL', () => {
  it('parses nodes, kinds, direction and labeled edges', () => {
    const graph = parseGraph(`
      title: Request flow
      direction: LR
      client[terminal]: CLIENT
      router: ROUTER
      api[accent]: API
      client -> router
      router -> api | business
    `);

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

  it('parses feedback edges without including them in DAG validation', () => {
    const graph = parseGraph(`
      direction: LR
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

    const compiled = compileGraphSvg(graph, {
      serpentineColumns: 3,
      viewport: 'content',
      viewportPadding: 30
    });
    const sketched = applyHandDrawnSkin(compiled);

    expect(compiled).toContain('graph-edge graph-edge--feedback');
    expect(compiled).toMatch(/graph-edge--feedback"><path d="M [^"]+ C [^"]+"/);
    expect(sketched).toContain('graph-edge graph-edge--feedback');
    expect(sketched).toContain('graph-edge-stroke--primary');
    expect(sketched).not.toContain('marker-end=');
  });

  it('rejects references to unknown nodes', () => {
    expect(() => parseGraph('a: A\na -> missing')).toThrow('unknown node "missing"');
  });

  it('rejects structural cycles during compilation', () => {
    const graph = parseGraph('a: A\nb: B\na -> b\nb -> a');
    expect(() => compileGraphSvg(graph)).toThrow('contains a cycle');
  });

  it('escapes labels before rendering SVG even when the label wraps', () => {
    const graph = parseGraph('a: <script>alert(1)</script>');
    const svg = compileGraphSvg(graph);

    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&lt;/sc');
    expect(svg).toContain('ript&gt;');
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('</script>');
  });

  it('keeps the legacy desktop renderer on the 720px editorial artboard', () => {
    const compact = compileGraphSvg(parseGraph('a: A\nb: B\na -> b'));
    const longer = compileGraphSvg(
      parseGraph('a: A\nb: B\nc: C\nd: D\ne: E\na -> b\nb -> c\nc -> d\nd -> e')
    );

    expect(compact).toMatch(/<svg[^>]+width="720" height="\d+" viewBox="0 0 720 \d+"/);
    expect(longer).toMatch(/<svg[^>]+width="720" height="\d+" viewBox="0 0 720 \d+"/);
  });

  it('uses a dedicated 336-unit mobile artboard without changing graph semantics', () => {
    const graph = parseGraph(`
      title: Request flow
      direction: LR
      client[terminal]: CLIENT
      router[accent]: ROUTER
      api: API
      client -> router
      router -> api | business
    `);
    const desktop = compileGraphVariantSvg(graph, 'desktop');
    const mobile = compileGraphVariantSvg(graph, 'mobile');

    expect(desktop).toContain('data-graph-profile="desktop"');
    expect(desktop).toContain('width="720"');
    expect(mobile).toContain('data-graph-profile="mobile"');
    expect(mobile).toContain('width="336"');

    for (const label of ['CLIENT', 'ROUTER', 'API', 'business']) {
      expect(desktop).toContain(label);
      expect(mobile).toContain(label);
    }
  });

  it('uses the same compact module width for short and long one-line desktop labels', () => {
    const short = compileGraphSvg(parseGraph('a: A'));
    const long = compileGraphSvg(parseGraph('a: CONTEXT ASSEMBLER'));

    expect(short).toContain('width="152" height="46"');
    expect(long).toContain('width="152" height="46"');
  });

  it('wraps long chains into a serpentine composition instead of one long row or column', () => {
    const svg = compileGraphSvg(
      parseGraph(`
        direction: LR
        a: ROUTE
        b: RETRIEVE
        c: ASSEMBLE
        d: GENERATE
        e: GUARD
        a -> b
        b -> c
        c -> d
        d -> e
      `)
    );

    expect(svg).toContain('data-graph-layout="serpentine"');
    expect(svg).toContain('width="720"');
  });

  it('limits mobile serpentine rows to two nodes', () => {
    const svg = compileGraphVariantSvg(
      parseGraph(`
        direction: LR
        a: ROUTE
        b: RETRIEVE
        c: ASSEMBLE
        d: GENERATE
        e: GUARD
        a -> b
        b -> c
        c -> d
        d -> e
      `),
      'mobile'
    );
    const yPositions = [...svg.matchAll(/<rect x="[^"]+" y="([^"]+)"/g)].map((match) => match[1]);
    const counts = new Map<string, number>();

    for (const y of yPositions) {
      if (y) counts.set(y, (counts.get(y) ?? 0) + 1);
    }

    expect(svg).toContain('data-graph-layout="serpentine"');
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });

  it('can tighten a serpentine viewport and force a hero-specific column count', () => {
    const svg = compileGraphSvg(
      parseGraph(`
        a: REALITY
        b: OBSERVE
        c: UNDERSTAND
        d: DECIDE
        e: BUILD
        f: PRODUCTION
        g: LEARN
        a -> b
        b -> c
        c -> d
        d -> e
        e -> f
        f -> g
      `),
      {
        serpentineColumns: 3,
        viewport: 'content',
        viewportPadding: 30
      }
    );

    expect(svg).toContain('data-graph-layout="serpentine"');
    expect(svg).not.toContain('viewBox="0 0 720');
    expect(svg).toMatch(/<svg[^>]+width="\d+" height="\d+" viewBox="\d+(?:\.\d+)? \d+(?:\.\d+)? \d+(?:\.\d+)? \d+(?:\.\d+)?"/);
  });

  it('uses vertical layered composition for branched mobile graphs even when LR is requested', () => {
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

    const mobile = compileGraphVariantSvg(graph, 'mobile');
    expect(mobile).toContain('data-graph-layout="layered-tb"');
  });

  it('generalizes content viewport to non-serpentine mobile layouts', () => {
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
    const mobile = compileGraphVariantSvg(graph, 'mobile', {
      viewport: 'content',
      viewportPadding: 18
    });

    expect(mobile).toContain('data-graph-layout="layered-tb"');
    expect(mobile).not.toContain('viewBox="0 0 336');
  });

  it('uses a balanced fanout composition for one-to-many diagrams', () => {
    const graph = parseGraph(`
      hub[accent]: EVALUATION
      a: ROUTING
      b: KNOWLEDGE
      c: SUPPORT
      d: LANGUAGE
      e: LATENCY
      f: CONSISTENCY
      hub -> a
      hub -> b
      hub -> c
      hub -> d
      hub -> e
      hub -> f
    `);
    const desktop = compileGraphSvg(graph);
    const mobile = compileGraphVariantSvg(graph, 'mobile');

    expect(desktop).toContain('data-graph-layout="fanout"');
    expect(desktop).toContain('width="720"');
    expect(mobile).toContain('data-graph-layout="fanout"');
    expect(mobile).toContain('width="336"');
  });

  it('replaces perfect primitives with deterministic hand-drawn geometry', () => {
    const compiled = compileGraphSvg(
      parseGraph('a[terminal]: VISITOR\nb[accent]: ROUTER\na -> b | request')
    );
    const sketched = applyHandDrawnSkin(compiled);

    expect(sketched).toContain('data-graph-skin="handwrite"');
    expect(sketched).toContain('graph-node-shape');
    expect(sketched).toContain('graph-node-echo');
    expect(sketched).toContain('graph-hatch');
    expect(sketched).toContain('graph-edge-stroke--primary');
    expect(sketched).toContain('graph-edge-stroke--secondary');
    expect(sketched).toContain('graph-arrow-hand--primary');
    expect(sketched).not.toContain('<feTurbulence');
    expect(sketched).not.toContain('marker-end=');
    expect(sketched).toContain('width="720"');
    expect(sketched).toContain('request');
    expect(sketched.lastIndexOf('graph-edge-labels')).toBeGreaterThan(
      sketched.lastIndexOf('graph-node')
    );
    expect(applyHandDrawnSkin(compiled)).toBe(sketched);
  });

  it('skins standalone mobile SVG markup deterministically', () => {
    const compiled = compileGraphVariantSvg(
      parseGraph('a[terminal]: VISITOR\nb[accent]: ROUTER\na -> b | request'),
      'mobile'
    );
    const sketched = applyHandDrawnSkin(compiled);

    expect(sketched).toContain('data-graph-profile="mobile"');
    expect(sketched).toContain('graph-node-shape');
    expect(sketched).not.toContain('marker-end=');
    expect(applyHandDrawnSkin(compiled)).toBe(sketched);
  });

  it('renders one semantic figure with desktop and mobile variants at build time', () => {
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
    expect(markup).toContain('data-graph-profile="desktop"');
    expect(markup).toContain('data-graph-profile="mobile"');
  });
});
