export type GraphDirection = 'TB' | 'LR';
export type GraphNodeKind = 'default' | 'terminal' | 'accent' | 'muted';

export interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly kind: GraphNodeKind;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
}

export interface GraphDefinition {
  readonly title?: string;
  readonly direction: GraphDirection;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

export interface PositionedNode extends GraphNode {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rank: number;
}

export interface GraphLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly PositionedNode[];
  readonly ranks: readonly (readonly PositionedNode[])[];
}
