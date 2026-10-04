export interface GridSpec {
  rows: number;
  cols: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  /** values[row][col]，共 rows 行、每行 cols 个有限实数 */
  values: number[][];
}

export interface Point {
  x: number;
  y: number;
}

export interface Polyline {
  type: 'open' | 'closed';
  /** 物理坐标顶点序列；闭环首尾不重复记录 */
  points: Point[];
  /** 每个顶点对应的网格边标识（H:c:r / V:c:r），来源可回查 */
  edgeIds: string[];
  /** 关联单元 [col,row]，去重并排序 */
  cells: Array<[number, number]>;
  vertexCount: number;
  length: number;
}

export interface ExtractionResult {
  ruleVersion: string;
  threshold: number;
  grid: { rows: number; cols: number; x0: number; y0: number; dx: number; dy: number };
  polylines: Polyline[];
  stats: {
    polylineCount: number;
    openCount: number;
    closedCount: number;
    segmentCount: number;
    totalLength: number;
  };
}
