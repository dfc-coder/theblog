export type GraphDirection = 'TB' | 'LR';
export type GraphNodeKind = 'default' | 'terminal' | 'accent' | 'muted';
export type GraphEdgeKind = 'default' | 'feedback';
export type GraphLayoutKind = 'serpentine' | 'layered-tb' | 'layered-lr' | 'fanout';
export type DiagramLayoutMode = 'auto' | GraphLayoutKind;
export type DiagramViewport = 'artboard' | 'content';
export type DiagramSkin = 'clean' | 'handdrawn';

export interface DiagramOptions {
  readonly layout: DiagramLayoutMode;
  readonly columns?: number;
  readonly viewport: DiagramViewport;
  readonly skin: DiagramSkin;
}

export const DEFAULT_DIAGRAM_OPTIONS: DiagramOptions = {
  layout: 'auto',
  viewport: 'artboard',
  skin: 'handdrawn'
};

export interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly kind: GraphNodeKind;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly kind?: GraphEdgeKind;
}

export interface GraphDefinition {
  readonly title?: string;
  readonly direction: GraphDirection;
  readonly options: DiagramOptions;
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
  readonly kind: GraphLayoutKind;
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly PositionedNode[];
  readonly ranks: readonly (readonly PositionedNode[])[];
}
