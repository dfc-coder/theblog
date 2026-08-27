import { describe, expect, it } from 'vitest';
import { compileGraphSvg } from '../src/lib/graph/compiler';
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
    expect(graph.edges[1]).toEqual({ from: 'router', to: 'api', label: 'business' });
  });

  it('rejects references to unknown nodes', () => {
    expect(() => parseGraph('a: A\na -> missing')).toThrow('unknown node "missing"');
  });

  it('rejects cycles during compilation', () => {
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

  it('renders every diagram on the same 720px editorial artboard', () => {
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
});
