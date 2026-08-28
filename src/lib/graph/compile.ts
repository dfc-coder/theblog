import { compileGraphSvg, createGraphLayout } from './compiler';
import type { GraphDefinition, GraphLayout } from './model';
import { parseGraph } from './parser';
import { applyHandDrawnSkin } from './skin';
import { validateDiagram } from './validation';

export interface CompileResult {
  readonly definition: GraphDefinition;
  readonly layout: GraphLayout;
  readonly svg: string;
}

export function compileDiagram(source: string): CompileResult {
  const definition = parseGraph(source);
  validateDiagram(definition);

  const options = {
    layout: definition.options.layout,
    ...(definition.options.columns !== undefined
      ? { serpentineColumns: definition.options.columns }
      : {}),
    viewport: definition.options.viewport
  } as const;

  const layout = createGraphLayout(definition, options);
  const cleanSvg = compileGraphSvg(definition, options);
  const svg = definition.options.skin === 'handdrawn'
    ? applyHandDrawnSkin(cleanSvg)
    : cleanSvg;

  return { definition, layout, svg };
}
