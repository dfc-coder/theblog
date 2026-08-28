import { DiagramValidationError } from './errors';
import type { GraphDefinition } from './model';

export interface DiagramDirectiveLines {
  readonly columns?: number;
}

export function validateDiagram(
  graph: GraphDefinition,
  lines: DiagramDirectiveLines = {}
): void {
  const { layout, columns } = graph.options;

  if (columns !== undefined && layout !== 'auto' && layout !== 'serpentine') {
    throw new DiagramValidationError(
      '"columns" can only be used with layout "auto" or "serpentine".',
      lines.columns
    );
  }
}
