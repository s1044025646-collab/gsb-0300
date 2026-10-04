import { GridSpec, Point } from './types';

/**
 * 规则版本：Marching Squares，鞍点按四角均值判定中心高低，
 * 均值恰好等于阈值时中心视为高。这是本项目的确定性连接约定，
 * 不宣称实现完整的双线性拓扑判别。
 */
export const RULE_VERSION = 'msq-mean-v1';

/** 网格边标识：H:c:r 为 (c,r)-(c+1,r) 横边；V:c:r 为 (c,r)-(c,r+1) 纵边。 */
export function hEdge(col: number, row: number): string {
  return `H:${col}:${row}`;
}
export function vEdge(col: number, row: number): string {
  return `V:${col}:${row}`;
}

/** 单元角点顺序：c0=(i,j) c1=(i+1,j) c2=(i+1,j+1) c3=(i,j+1)。 */
export function cellCorners(grid: GridSpec, col: number, row: number): [number, number, number, number] {
  return [
    grid.values[row][col],
    grid.values[row][col + 1],
    grid.values[row + 1][col + 1],
    grid.values[row + 1][col],
  ];
}

/** 单元四条边的网格边标识：0=底 1=右 2=顶 3=左。 */
export function cellEdges(col: number, row: number): [string, string, string, string] {
  return [hEdge(col, row), vEdge(col + 1, row), hEdge(col, row + 1), vEdge(col, row)];
}

/** 四角高低位掩码（严格大于阈值为高；等于阈值已在提取前被拒绝）。 */
export function caseIndex(corners: [number, number, number, number], threshold: number): number {
  let idx = 0;
  for (let k = 0; k < 4; k++) {
    if (corners[k] > threshold) idx |= 1 << k;
  }
  return idx;
}

/** 非鞍点情形的局部线段表（边编号对）。 */
const BASE_SEGMENTS: Record<number, Array<[number, number]>> = {
  1: [[3, 0]],
  2: [[0, 1]],
  3: [[3, 1]],
  4: [[1, 2]],
  6: [[0, 2]],
  7: [[3, 2]],
  8: [[2, 3]],
  9: [[0, 2]],
  11: [[1, 2]],
  12: [[3, 1]],
  13: [[0, 1]],
  14: [[3, 0]],
};

/**
 * 返回单元的局部线段（边编号对）。鞍点（5、10）按四角均值判定中心高低，
 * 连接使中心区域与同号角相通的线段；均值等于阈值时中心视为高。
 */
export function cellSegments(corners: [number, number, number, number], threshold: number): Array<[number, number]> {
  const idx = caseIndex(corners, threshold);
  if (idx === 0 || idx === 15) return [];
  if (idx === 5 || idx === 10) {
    const mean = (corners[0] + corners[1] + corners[2] + corners[3]) / 4;
    const centerHigh = mean >= threshold;
    if (idx === 5) {
      // 高角 c0、c2
      return centerHigh ? [[3, 2], [0, 1]] : [[3, 0], [1, 2]];
    }
    // 高角 c1、c3
    return centerHigh ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
  }
  return BASE_SEGMENTS[idx];
}

/** 解析网格边标识为两端顶点坐标。 */
export function edgeEndpoints(grid: GridSpec, edgeId: string): { a: Point; b: Point; va: number; vb: number } {
  const [kind, cs, rs] = edgeId.split(':');
  const c = Number(cs);
  const r = Number(rs);
  if (kind === 'H') {
    return {
      a: { x: grid.x0 + c * grid.dx, y: grid.y0 + r * grid.dy },
      b: { x: grid.x0 + (c + 1) * grid.dx, y: grid.y0 + r * grid.dy },
      va: grid.values[r][c],
      vb: grid.values[r][c + 1],
    };
  }
  return {
    a: { x: grid.x0 + c * grid.dx, y: grid.y0 + r * grid.dy },
    b: { x: grid.x0 + c * grid.dx, y: grid.y0 + (r + 1) * grid.dy },
    va: grid.values[r][c],
    vb: grid.values[r + 1][c],
  };
}

/** 边上线性插值交点（真实交点必在边内部，因为等于阈值的顶点已被拒绝）。 */
export function edgeIntersection(grid: GridSpec, edgeId: string, threshold: number): Point {
  const { a, b, va, vb } = edgeEndpoints(grid, edgeId);
  const t = (threshold - va) / (vb - va);
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

export interface CellQuery {
  col: number;
  row: number;
  corners: [number, number, number, number];
  caseIndex: number;
  saddle: boolean;
  centerMean: number | null;
  centerHigh: boolean | null;
  segments: Array<{ edgeA: string; edgeB: string; pointA: Point; pointB: Point }>;
}

/** 查询单个单元的判定与边插值细节。 */
export function describeCell(grid: GridSpec, col: number, row: number, threshold: number): CellQuery {
  const corners = cellCorners(grid, col, row);
  const idx = caseIndex(corners, threshold);
  const edges = cellEdges(col, row);
  const saddle = idx === 5 || idx === 10;
  const mean = (corners[0] + corners[1] + corners[2] + corners[3]) / 4;
  const segs = cellSegments(corners, threshold).map(([ea, eb]) => ({
    edgeA: edges[ea],
    edgeB: edges[eb],
    pointA: edgeIntersection(grid, edges[ea], threshold),
    pointB: edgeIntersection(grid, edges[eb], threshold),
  }));
  return {
    col,
    row,
    corners,
    caseIndex: idx,
    saddle,
    centerMean: saddle ? mean : null,
    centerHigh: saddle ? mean >= threshold : null,
    segments: segs,
  };
}
