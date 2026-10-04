import { GridSpec, Point, Segment } from "./types";

/**
 * 单元角点与边编号约定（行 r 向下标增、列 c 向右，物理 y 随 r 增大）：
 *   角点 bit0=SW(r,c)  bit1=SE(r,c+1)  bit2=NE(r+1,c+1)  bit3=NW(r+1,c)
 *   边 0=底(SW-SE)  1=右(SE-NE)  2=顶(NE-NW)  3=左(NW-SW)
 * 值严格大于阈值记为“高”。顶点等于阈值的情况已在提取前整体拒绝。
 *
 * 鞍点（case 5 与 10，四角交错）采用四角均值判定中心高低；均值恰好等于
 * 阈值时中心视为高。中心高则同号角经中心相通，否则同号角各自孤立。
 * 这是本项目的确定性连接约定，不是完整的双线性拓扑判别。
 */

// 非鞍点情形的局部线段表：case -> [edgeA, edgeB][]
const BASE_SEGMENTS: Record<number, [number, number][]> = {
  0: [],
  1: [[3, 0]],
  2: [[0, 1]],
  3: [[3, 1]],
  4: [[1, 2]],
  6: [[0, 2]],
  7: [[3, 2]],
  8: [[2, 3]],
  9: [[0, 2]],
  11: [[1, 2]],
  12: [[1, 3]],
  13: [[0, 1]],
  14: [[0, 3]],
  15: [],
};

export interface CellCorners {
  sw: number;
  se: number;
  ne: number;
  nw: number;
}

export function classifyCell(corners: CellCorners, threshold: number): number {
  let idx = 0;
  if (corners.sw > threshold) idx |= 1;
  if (corners.se > threshold) idx |= 2;
  if (corners.ne > threshold) idx |= 4;
  if (corners.nw > threshold) idx |= 8;
  return idx;
}

/** 鞍点中心判定：四角均值 >= 阈值 视为中心高（含恰好相等）。 */
export function saddleCenterHigh(corners: CellCorners, threshold: number): boolean {
  const mean = (corners.sw + corners.se + corners.ne + corners.nw) / 4;
  return mean >= threshold;
}

export function cellEdgePairs(caseIndex: number, corners: CellCorners, threshold: number): [number, number][] {
  if (caseIndex === 5) {
    // SW、NE 高。中心高 -> 低角 SE/NW 各自被切出：(0,1) 与 (2,3)
    // 中心低 -> 高角各自孤立：(3,0) 与 (1,2)
    return saddleCenterHigh(corners, threshold) ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
  }
  if (caseIndex === 10) {
    // SE、NW 高。中心高 -> 低角 SW/NE 各自被切出：(3,0) 与 (1,2)
    // 中心低 -> 高角各自孤立：(0,1) 与 (2,3)
    return saddleCenterHigh(corners, threshold) ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
  }
  return BASE_SEGMENTS[caseIndex];
}

/** 网格边全局标识：水平边 H:r:c 连接 (r,c)-(r,c+1)；垂直边 V:r:c 连接 (r,c)-(r+1,c)。 */
export function gridEdgeId(cellRow: number, cellCol: number, edge: number): string {
  switch (edge) {
    case 0: return `H:${cellRow}:${cellCol}`;
    case 1: return `V:${cellRow}:${cellCol + 1}`;
    case 2: return `H:${cellRow + 1}:${cellCol}`;
    case 3: return `V:${cellRow}:${cellCol}`;
    default: throw new Error(`非法边编号 ${edge}`);
  }
}

/** 边上交点：严格位于边内部（顶点等于阈值已被拒绝），线性插值。 */
export function edgeIntersection(grid: GridSpec, cellRow: number, cellCol: number, edge: number, threshold: number): Point {
  const m = grid.matrix;
  const r = cellRow;
  const c = cellCol;
  switch (edge) {
    case 0: {
      const t = (threshold - m[r][c]) / (m[r][c + 1] - m[r][c]);
      return { x: grid.originX + (c + t) * grid.dx, y: grid.originY + r * grid.dy };
    }
    case 1: {
      const t = (threshold - m[r][c + 1]) / (m[r + 1][c + 1] - m[r][c + 1]);
      return { x: grid.originX + (c + 1) * grid.dx, y: grid.originY + (r + t) * grid.dy };
    }
    case 2: {
      const t = (threshold - m[r + 1][c]) / (m[r + 1][c + 1] - m[r + 1][c]);
      return { x: grid.originX + (c + t) * grid.dx, y: grid.originY + (r + 1) * grid.dy };
    }
    case 3: {
      const t = (threshold - m[r][c]) / (m[r + 1][c] - m[r][c]);
      return { x: grid.originX + c * grid.dx, y: grid.originY + (r + t) * grid.dy };
    }
    default: throw new Error(`非法边编号 ${edge}`);
  }
}

export function cellCorners(grid: GridSpec, r: number, c: number): CellCorners {
  const m = grid.matrix;
  return { sw: m[r][c], se: m[r][c + 1], ne: m[r + 1][c + 1], nw: m[r + 1][c] };
}

/** 生成一个单元的局部线段（带全局边标识与物理坐标）。 */
export function cellSegments(grid: GridSpec, r: number, c: number, threshold: number): Segment[] {
  const corners = cellCorners(grid, r, c);
  const idx = classifyCell(corners, threshold);
  const pairs = cellEdgePairs(idx, corners, threshold);
  return pairs.map(([ea, eb]) => ({
    cellKey: `${r}:${c}`,
    row: r,
    col: c,
    aEdge: gridEdgeId(r, c, ea),
    bEdge: gridEdgeId(r, c, eb),
    a: edgeIntersection(grid, r, c, ea, threshold),
    b: edgeIntersection(grid, r, c, eb, threshold),
  }));
}
