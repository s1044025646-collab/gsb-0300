import { getDb, nowIso } from "./db";
import { ApiError } from "./core/errors";
import { extractContours } from "./core/extract";
import {
  cellCorners,
  cellEdgePairs,
  cellSegments,
  classifyCell,
  saddleCenterHigh,
} from "./core/marchingSquares";
import { validateGridInput, validateThreshold } from "./core/validate";
import { ExtractionResult, GridSpec, RULE_VERSION } from "./core/types";

function rowToGrid(row: Record<string, unknown>): GridSpec & { id: number; name: string } {
  return {
    id: row.id as number,
    name: row.name as string,
    rows: row.rows as number,
    cols: row.cols as number,
    originX: row.origin_x as number,
    originY: row.origin_y as number,
    dx: row.dx as number,
    dy: row.dy as number,
    matrix: JSON.parse(row.matrix_json as string) as number[][],
  };
}

export function importGrid(input: unknown): { id: number; name: string; rows: number; cols: number } {
  const spec = validateGridInput(input);
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO grids (name, rows, cols, origin_x, origin_y, dx, dy, matrix_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const res = stmt.run(
    spec.name, spec.rows, spec.cols, spec.originX, spec.originY, spec.dx, spec.dy,
    JSON.stringify(spec.matrix), nowIso(),
  );
  return { id: Number(res.lastInsertRowid), name: spec.name, rows: spec.rows, cols: spec.cols };
}

export function getGrid(id: number): GridSpec & { id: number; name: string } {
  const row = getDb().prepare(`SELECT * FROM grids WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) throw new ApiError("E_NOT_FOUND", `网格 ${id} 不存在`);
  return rowToGrid(row);
}

export function listGrids(): unknown[] {
  const rows = getDb().prepare(
    `SELECT id, name, rows, cols, origin_x, origin_y, dx, dy, created_at FROM grids ORDER BY id`,
  ).all();
  return rows;
}

export function runExtraction(gridId: number, thresholdInput: unknown): { id: number; result: ExtractionResult } {
  const threshold = validateThreshold(thresholdInput);
  const grid = getGrid(gridId);
  const db = getDb();
  try {
    const result = extractContours(grid, threshold);
    const res = db.prepare(
      `INSERT INTO extractions (grid_id, threshold, rule_version, status, error_json, result_json, created_at)
       VALUES (?, ?, ?, 'ok', NULL, ?, ?)`,
    ).run(gridId, threshold, RULE_VERSION, JSON.stringify(result), nowIso());
    return { id: Number(res.lastInsertRowid), result };
  } catch (err) {
    // 失败诊断可保存，但 status 为 failed，绝不冒充成功的空结果
    const diag = err instanceof ApiError
      ? { code: err.code, message: err.message, details: err.details ?? null }
      : { code: "E_INTERNAL", message: String(err), details: null };
    db.prepare(
      `INSERT INTO extractions (grid_id, threshold, rule_version, status, error_json, result_json, created_at)
       VALUES (?, ?, ?, 'failed', ?, NULL, ?)`,
    ).run(gridId, threshold, RULE_VERSION, JSON.stringify(diag), nowIso());
    throw err;
  }
}

export function getExtraction(id: number): { id: number; gridId: number; threshold: number; ruleVersion: string; status: string; result?: ExtractionResult; error?: unknown; createdAt: string } {
  const row = getDb().prepare(`SELECT * FROM extractions WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) throw new ApiError("E_NOT_FOUND", `提取记录 ${id} 不存在`);
  return {
    id: row.id as number,
    gridId: row.grid_id as number,
    threshold: row.threshold as number,
    ruleVersion: row.rule_version as string,
    status: row.status as string,
    result: row.result_json ? (JSON.parse(row.result_json as string) as ExtractionResult) : undefined,
    error: row.error_json ? JSON.parse(row.error_json as string) : undefined,
    createdAt: row.created_at as string,
  };
}

export function listExtractions(gridId?: number): unknown[] {
  const db = getDb();
  const rows = gridId === undefined
    ? db.prepare(`SELECT id, grid_id, threshold, rule_version, status, created_at FROM extractions ORDER BY id`).all()
    : db.prepare(`SELECT id, grid_id, threshold, rule_version, status, created_at FROM extractions WHERE grid_id = ? ORDER BY id`).all(gridId);
  return rows;
}

export function getCellDebug(gridId: number, r: number, c: number, thresholdInput: unknown): unknown {
  const threshold = validateThreshold(thresholdInput);
  const grid = getGrid(gridId);
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= grid.rows - 1 || c >= grid.cols - 1) {
    throw new ApiError("E_VALIDATION", `单元坐标越界: r=${r}, c=${c}（合法范围 0..${grid.rows - 2}, 0..${grid.cols - 2}）`);
  }
  const corners = cellCorners(grid, r, c);
  const caseIndex = classifyCell(corners, threshold);
  const onThreshold = Object.entries(corners)
    .filter(([, v]) => v === threshold)
    .map(([k]) => k);
  return {
    cell: { row: r, col: c },
    corners,
    threshold,
    caseIndex,
    caseBits: caseIndex.toString(2).padStart(4, "0"),
    isSaddle: caseIndex === 5 || caseIndex === 10,
    saddleCenterHigh: caseIndex === 5 || caseIndex === 10 ? saddleCenterHigh(corners, threshold) : undefined,
    cornerOnThreshold: onThreshold.length > 0 ? onThreshold : undefined,
    edgePairs: onThreshold.length > 0 ? [] : cellEdgePairs(caseIndex, corners, threshold),
    segments: onThreshold.length > 0 ? [] : cellSegments(grid, r, c, threshold),
  };
}

export interface CompareSummary {
  gridId: number;
  t1: number;
  t2: number;
  a: ExtractionResult["summary"];
  b: ExtractionResult["summary"];
  diff: {
    polylineCount: number;
    openCount: number;
    closedCount: number;
    totalLength: number;
    totalVertices: number;
  };
}

export function compareThresholds(gridId: number, t1: unknown, t2: unknown): CompareSummary {
  const ta = validateThreshold(t1);
  const tb = validateThreshold(t2);
  const grid = getGrid(gridId);
  const ra = extractContours(grid, ta);
  const rb = extractContours(grid, tb);
  return {
    gridId,
    t1: ta,
    t2: tb,
    a: ra.summary,
    b: rb.summary,
    diff: {
      polylineCount: rb.summary.polylineCount - ra.summary.polylineCount,
      openCount: rb.summary.openCount - ra.summary.openCount,
      closedCount: rb.summary.closedCount - ra.summary.closedCount,
      totalLength: rb.summary.totalLength - ra.summary.totalLength,
      totalVertices: rb.summary.totalVertices - ra.summary.totalVertices,
    },
  };
}
