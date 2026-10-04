import { ApiError } from "./errors";
import { GridSpec } from "./types";

export const LIMITS = {
  minRows: 2,
  minCols: 2,
  maxRows: 1024,
  maxCols: 1024,
  maxVertices: 1024 * 1024,
  maxPolylines: 100000,
  maxOnThresholdReported: 20,
};

export interface GridInput {
  name?: string;
  matrix: number[][];
  origin: { x: number; y: number };
  spacing: { dx: number; dy: number };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function validateGridInput(input: unknown): GridSpec & { name: string } {
  if (typeof input !== "object" || input === null) {
    throw new ApiError("E_VALIDATION", "请求体必须是对象");
  }
  const body = input as Record<string, unknown>;
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "unnamed";

  const matrix = body.matrix;
  if (!Array.isArray(matrix) || matrix.length < LIMITS.minRows) {
    throw new ApiError("E_VALIDATION", `矩阵至少需要 ${LIMITS.minRows} 行`);
  }
  if (matrix.length > LIMITS.maxRows) {
    throw new ApiError("E_LIMIT_EXCEEDED", `行数超过上限 ${LIMITS.maxRows}`);
  }
  if (!Array.isArray(matrix[0]) || matrix[0].length < LIMITS.minCols) {
    throw new ApiError("E_VALIDATION", `矩阵至少需要 ${LIMITS.minCols} 列`);
  }
  const cols = (matrix[0] as unknown[]).length;
  if (cols > LIMITS.maxCols) {
    throw new ApiError("E_LIMIT_EXCEEDED", `列数超过上限 ${LIMITS.maxCols}`);
  }
  if (matrix.length * cols > LIMITS.maxVertices) {
    throw new ApiError("E_LIMIT_EXCEEDED", `顶点总数超过上限 ${LIMITS.maxVertices}`);
  }
  const values: number[][] = [];
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!Array.isArray(row) || row.length !== cols) {
      throw new ApiError("E_VALIDATION", `矩阵第 ${r} 行长度不一致，应为 ${cols}`);
    }
    const outRow: number[] = [];
    for (let c = 0; c < cols; c++) {
      const v = row[c];
      if (!isFiniteNumber(v)) {
        throw new ApiError("E_VALIDATION", `矩阵[${r}][${c}] 不是有限实数: ${String(v)}`);
      }
      outRow.push(v);
    }
    values.push(outRow);
  }

  const origin = body.origin as Record<string, unknown> | undefined;
  const spacing = body.spacing as Record<string, unknown> | undefined;
  if (!origin || !isFiniteNumber(origin.x) || !isFiniteNumber(origin.y)) {
    throw new ApiError("E_VALIDATION", "origin.x / origin.y 必须是有限实数");
  }
  if (!spacing || !isFiniteNumber(spacing.dx) || !isFiniteNumber(spacing.dy)) {
    throw new ApiError("E_VALIDATION", "spacing.dx / spacing.dy 必须是有限实数");
  }
  if (spacing.dx <= 0 || spacing.dy <= 0) {
    throw new ApiError("E_VALIDATION", "spacing.dx / spacing.dy 必须为正数");
  }

  return {
    name,
    rows: values.length,
    cols,
    originX: origin.x,
    originY: origin.y,
    dx: spacing.dx,
    dy: spacing.dy,
    matrix: values,
  };
}

export function validateThreshold(threshold: unknown): number {
  if (!isFiniteNumber(threshold)) {
    throw new ApiError("E_VALIDATION", "threshold 必须是有限实数");
  }
  return threshold;
}

/** 任何顶点恰好等于阈值时拒绝提取，并报告坐标（不偷偷加 epsilon）。 */
export function assertNoVertexOnThreshold(grid: GridSpec, threshold: number): void {
  const hits: { row: number; col: number; x: number; y: number }[] = [];
  let total = 0;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (grid.matrix[r][c] === threshold) {
        total++;
        if (hits.length < LIMITS.maxOnThresholdReported) {
          hits.push({
            row: r,
            col: c,
            x: grid.originX + c * grid.dx,
            y: grid.originY + r * grid.dy,
          });
        }
      }
    }
  }
  if (total > 0) {
    throw new ApiError(
      "E_THRESHOLD_ON_VERTEX",
      `阈值 ${threshold} 恰好落在 ${total} 个网格顶点上，本次提取被拒绝（不修改输入高程或阈值来消除歧义）`,
      { threshold, count: total, vertices: hits },
    );
  }
}
