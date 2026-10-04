import { ContourError } from './errors';
import { GridSpec } from './types';

export const LIMITS = {
  maxVertices: Number(process.env.CONTOUR_MAX_VERTICES ?? 1_000_000),
  maxPolylines: Number(process.env.CONTOUR_MAX_POLYLINES ?? 100_000),
};

export function validateGrid(input: unknown): GridSpec {
  if (typeof input !== 'object' || input === null) {
    throw new ContourError('BAD_REQUEST', '网格定义必须是对象');
  }
  const g = input as Record<string, unknown>;
  const rows = Number(g.rows);
  const cols = Number(g.cols);
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 2 || cols < 2) {
    throw new ContourError('INVALID_DIMENSIONS', '矩阵至少需要两行两列，且 rows/cols 必须为整数', { rows: g.rows, cols: g.cols });
  }
  if (rows * cols > LIMITS.maxVertices) {
    throw new ContourError('LIMIT_EXCEEDED', `网格顶点数 ${rows * cols} 超过上限 ${LIMITS.maxVertices}`, { rows, cols });
  }
  const x0 = Number(g.x0);
  const y0 = Number(g.y0);
  if (!Number.isFinite(x0) || !Number.isFinite(y0)) {
    throw new ContourError('INVALID_ORIGIN', '网格原点 x0/y0 必须为有限实数', { x0: g.x0, y0: g.y0 });
  }
  const dx = Number(g.dx);
  const dy = Number(g.dy);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx <= 0 || dy <= 0) {
    throw new ContourError('INVALID_SPACING', '横纵间距 dx/dy 必须为正有限实数', { dx: g.dx, dy: g.dy });
  }
  if (!Array.isArray(g.values) || g.values.length !== rows) {
    throw new ContourError('RAGGED_MATRIX', `values 必须为 ${rows} 行的数组`, { expected: rows, actual: Array.isArray(g.values) ? g.values.length : null });
  }
  const values: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row = g.values[r];
    if (!Array.isArray(row) || row.length !== cols) {
      throw new ContourError('RAGGED_MATRIX', `第 ${r} 行长度必须为 ${cols}`, { row: r, actual: Array.isArray(row) ? row.length : null });
    }
    const outRow: number[] = new Array(cols);
    for (let c = 0; c < cols; c++) {
      const v = Number(row[c]);
      if (!Number.isFinite(v)) {
        throw new ContourError('NON_FINITE_VALUE', `顶点 (${c},${r}) 的值不是有限实数`, { col: c, row: r, value: row[c] });
      }
      outRow[c] = v;
    }
    values.push(outRow);
  }
  return { rows, cols, x0, y0, dx, dy, values };
}

export function validateThreshold(threshold: unknown): number {
  const t = Number(threshold);
  if (!Number.isFinite(t)) {
    throw new ContourError('INVALID_THRESHOLD', '阈值必须为有限实数', { threshold });
  }
  return t;
}

/** 任何顶点恰好等于阈值时拒绝提取，并列出坐标（不做 epsilon 调整）。 */
export function assertNoVertexEqualsThreshold(grid: GridSpec, threshold: number): void {
  const hits: Array<{ col: number; row: number }> = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (grid.values[r][c] === threshold) {
        hits.push({ col: c, row: r });
      }
    }
  }
  if (hits.length > 0) {
    throw new ContourError(
      'VALUE_EQUALS_THRESHOLD',
      `存在 ${hits.length} 个顶点的值恰好等于阈值 ${threshold}，本次提取被拒绝（不会通过 epsilon 或移动阈值消除歧义）`,
      { threshold, vertices: hits },
    );
  }
}
