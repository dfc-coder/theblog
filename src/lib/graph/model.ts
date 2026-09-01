export type GraphDirection = 'TB' | 'LR';
export type GraphNodeKind = 'default' | 'terminal' | 'accent' | 'muted';
export type GraphEdgeKind = 'default' | 'feedback';

export interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly kind?: GraphNodeKind;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly kind?: GraphEdgeKind;
}

export interface GraphDiagramDefinition {
  readonly kind: 'graph';
  readonly title?: string;
  readonly direction?: GraphDirection;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

export type DiagramDefinition = GraphDiagramDefinition;

export type GraphTopology =
  | 'chain'
  | 'fanout'
  | 'fanin'
  | 'branch-join'
  | 'cycle'
  | 'layered';

export type GraphLayoutKind =
  | 'serpentine'
  | 'layered-lr'
  | 'layered-tb'
  | 'fanout'
  | 'fanin'
  | 'cycle';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type ScenePath =
  | { readonly kind: 'polyline'; readonly points: readonly Point[] }
  | { readonly kind: 'curve'; readonly points: readonly Point[] };

export interface GraphSceneNode {
  readonly id: string;
  readonly label: string;
  readonly kind: GraphNodeKind;
  readonly lines: readonly string[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GraphSceneEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly kind: GraphEdgeKind;
  readonly path: ScenePath;
  readonly labelPosition?: Point;
}

export interface GraphScene {
  readonly kind: 'graph';
  readonly width: number;
  readonly height: number;
  readonly topology: GraphTopology;
  readonly layout: GraphLayoutKind;
  readonly nodes: readonly GraphSceneNode[];
  readonly edges: readonly GraphSceneEdge[];
}

export type DiagramScene = GraphScene;

export type LayoutDirection = 'auto' | GraphDirection;

export interface LayoutProfile {
  readonly width: number;
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  readonly nodeGap: number;
  readonly rankGap: number;
  readonly maxColumns: number;
  readonly direction?: LayoutDirection;
}

export interface Theme {
  readonly classPrefix?: string;
}
