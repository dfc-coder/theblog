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

  it('escapes labels before rendering SVG', () => {
    const graph = parseGraph('a: <script>alert(1)</script>');
    const svg = compileGraphSvg(graph);

    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(svg).not.toContain('<script>');
  });

  it('renders diagrams at their intrinsic geometry instead of stretching every graph to the article width', () => {
    const graph = parseGraph('a: A\nb: B\na -> b');
    const svg = compileGraphSvg(graph);

    expect(svg).toContain('class="article-graph__stage"');
    expect(svg).toMatch(/<svg[^>]+width="\d+" height="\d+" viewBox="0 0 \d+ \d+"/);
    expect(svg).not.toContain('style="min-width:');
  });
});
