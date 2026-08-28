import { describe, expect, it } from 'vitest';
import { compileDiagram } from '../src/lib/graph/compile';
import { compileGraphSvg } from '../src/lib/graph/compiler';
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

  it('renders every diagram on the same 720 editorial artboard', () => {
    const compact = compileGraphSvg(parseGraph('a: A\nb: B\na -> b'));
    const longer = compileGraphSvg(
      parseGraph('a: A\nb: B\nc: C\nd: D\ne: E\na -> b\nb -> c\nc -> d\nd -> e')
    );

    expect(compact).toMatch(/<svg[^>]+width="720" height="\d+" viewBox="0 0 720 \d+"/);
    expect(longer).toMatch(/<svg[^>]+width="720" height="\d+" viewBox="0 0 720 \d+"/);
  });

  it('uses the same compact module width for short and long one-line labels', () => {
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

  it('uses a balanced fanout composition for one-to-many diagrams', () => {
    const svg = compileGraphSvg(
      parseGraph(`
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
      `)
    );

    expect(svg).toContain('data-graph-layout="fanout"');
    expect(svg).toContain('width="720"');
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
});

describe('diagram DSL vNext acceptance', () => {
  it('defaults to auto layout, artboard viewport and handdrawn skin', () => {
    const graph = parseGraph('a: A');
    expect(graph.options).toEqual({
      layout: 'auto',
      viewport: 'artboard',
      skin: 'handdrawn'
    });
  });

  it('parses layout, columns, viewport and skin declaratively', () => {
    const graph = parseGraph(`
      layout: serpentine
      columns: 3
      viewport: content
      skin: clean
      a: A
      b: B
      a -> b
    `);

    expect(graph.options).toEqual({
      layout: 'serpentine',
      columns: 3,
      viewport: 'content',
      skin: 'clean'
    });
  });

  it('rejects duplicate configuration directives with a line number', () => {
    expect(() => parseGraph('layout: auto\nlayout: serpentine\na: A')).toThrow(
      'Graph line 2: duplicate "layout" directive.'
    );
  });

  it('rejects unsupported directive values with actionable errors', () => {
    expect(() => parseGraph('layout: circular\na: A')).toThrow('Graph line 1: unsupported layout');
    expect(() => parseGraph('columns: 0\na: A')).toThrow('Graph line 1: columns must be an integer between 1 and 4.');
    expect(() => parseGraph('columns: 2.5\na: A')).toThrow('Graph line 1: columns must be an integer between 1 and 4.');
    expect(() => parseGraph('viewport: adaptive\na: A')).toThrow('Graph line 1: viewport must be');
    expect(() => parseGraph('skin: sketch\na: A')).toThrow('Graph line 1: skin must be');
  });

  it('rejects columns for explicit non-serpentine layouts', () => {
    expect(() => parseGraph('layout: fanout\ncolumns: 3\na: A')).toThrow(
      'Graph line 2: "columns" can only be used with layout "auto" or "serpentine".'
    );
  });

  it('forces each explicit layout instead of relying on auto heuristics', () => {
    const chain = `
      a: A
      b: B
      c: C
      a -> b
      b -> c
    `;

    expect(compileDiagram(`layout: serpentine\n${chain}`).layout.kind).toBe('serpentine');
    expect(compileDiagram(`layout: layered-lr\n${chain}`).layout.kind).toBe('layered-lr');
    expect(compileDiagram(`layout: layered-tb\n${chain}`).layout.kind).toBe('layered-tb');

    const fanout = compileDiagram(`
      layout: fanout
      hub: HUB
      a: A
      b: B
      c: C
      d: D
      hub -> a
      hub -> b
      hub -> c
      hub -> d
    `);
    expect(fanout.layout.kind).toBe('fanout');
  });

  it('uses columns as the serpentine row-width constraint', () => {
    const { layout } = compileDiagram(`
      layout: serpentine
      columns: 2
      a: A
      b: B
      c: C
      d: D
      e: E
      a -> b
      b -> c
      c -> d
      d -> e
    `);

    expect(Math.max(...layout.ranks.map((rank) => rank.length))).toBeLessThanOrEqual(2);
  });

  it('uses content viewport without clipping routed feedback geometry', () => {
    const { svg } = compileDiagram(`
      layout: serpentine
      columns: 3
      viewport: content
      skin: clean
      a: A
      b: B
      c: C
      d: D
      a -> b
      b -> c
      c -> d
      d ~> b | feedback
    `);

    expect(svg).not.toContain('viewBox="0 0 720');
    expect(svg).toContain('graph-edge graph-edge--feedback');
    expect(svg).toMatch(/graph-edge--feedback"><path d="M [^"]+ C [^"]+"/);
  });

  it('selects clean or deterministic handdrawn rendering from the DSL', () => {
    const source = 'layout: layered-lr\na: A\nb: B\na -> b';
    const clean = compileDiagram(`skin: clean\n${source}`).svg;
    const handdrawn = compileDiagram(`skin: handdrawn\n${source}`).svg;

    expect(clean).not.toContain('data-graph-skin="handwrite"');
    expect(clean).toContain('marker-end=');
    expect(handdrawn).toContain('data-graph-skin="handwrite"');
    expect(handdrawn).not.toContain('marker-end=');
    expect(compileDiagram(`skin: handdrawn\n${source}`).svg).toBe(handdrawn);
  });

  it('compiles feedback without consumer-side SVG path overrides', () => {
    const { svg } = compileDiagram(`
      direction: LR
      layout: serpentine
      columns: 3
      viewport: content
      skin: handdrawn
      observe: OBSERVAR
      understand: ENTENDER
      learn[terminal]: APRENDER
      decide: DECIDIR
      implement: IMPLEMENTAR
      production[accent]: PRODUCCIÓN
      observe -> understand | contexto
      understand -> learn
      learn -> decide | trade-offs
      decide -> implement
      implement -> production
      production ~> learn
    `);

    expect(svg).toContain('graph-edge graph-edge--feedback');
    expect(svg).toContain('graph-edge-stroke--primary');
  });

  it('keeps markdown graph fences on the high-level compiler path', () => {
    const plugin = graphMdastPlugin();
    const result = plugin.code({ type: 'code', lang: 'graph', value: 'skin: clean\na: A' });
    expect(result?.type).toBe('html');
    expect(result?.value).toContain('<svg');
    expect(result?.value).not.toContain('data-graph-skin="handwrite"');
  });
});
