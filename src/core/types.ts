export interface GridSpec {
  rows: number;
  cols: number;
  originX: number;
  originY: number;
  dx: number;
  dy: number;
  matrix: number[][];
}

export interface Point {
  x: number;
  y: number;
}

export interface Segment {
  cellKey: string;
  row: number;
  col: number;
  aEdge: string;
  bEdge: string;
  a: Point;
  b: Point;
}

export interface Polyline {
  id: string;
  closed: boolean;
  points: Point[];
  edgeIds: string[];
  cells: string[];
  vertexCount: number;
  length: number;
}

export interface ExtractionResult {
  ruleVersion: string;
  threshold: number;
  polylines: Polyline[];
  summary: {
    polylineCount: number;
    openCount: number;
    closedCount: number;
    totalLength: number;
    totalVertices: number;
  };
}

export const RULE_VERSION = "marching-squares-v1";
