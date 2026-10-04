import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ContourError } from './errors';
import { ExtractionResult, GridSpec } from './types';

export interface GridRow {
  id: number;
  name: string;
  rows: number;
  cols: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  created_at: string;
}

export interface ExtractionRow {
  id: number;
  grid_id: number;
  threshold: number;
  rule_version: string;
  status: 'success' | 'failed';
  result_json: string | null;
  error_json: string | null;
  created_at: string;
}

export class Store {
  readonly db: DatabaseSync;
  readonly dbPath: string;

  constructor(dataDir?: string) {
    const dir = dataDir ?? process.env.CONTOUR_DATA_DIR ?? path.join(process.cwd(), 'data');
    fs.mkdirSync(dir, { recursive: true });
    this.dbPath = path.join(dir, 'contours.db');
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS grids (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        rows INTEGER NOT NULL,
        cols INTEGER NOT NULL,
        x0 REAL NOT NULL,
        y0 REAL NOT NULL,
        dx REAL NOT NULL,
        dy REAL NOT NULL,
        values_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS extractions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grid_id INTEGER NOT NULL REFERENCES grids(id),
        threshold REAL NOT NULL,
        rule_version TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('success','failed')),
        result_json TEXT,
        error_json TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  saveGrid(name: string, grid: GridSpec): number {
    const stmt = this.db.prepare(
      'INSERT INTO grids (name, rows, cols, x0, y0, dx, dy, values_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    );
    const res = stmt.run(name, grid.rows, grid.cols, grid.x0, grid.y0, grid.dx, grid.dy, JSON.stringify(grid.values), new Date().toISOString());
    return Number(res.lastInsertRowid);
  }

  getGrid(id: number): GridRow | null {
    const row = this.db.prepare('SELECT id,name,rows,cols,x0,y0,dx,dy,created_at FROM grids WHERE id=?').get(id) as GridRow | undefined;
    return row ?? null;
  }

  getGridSpec(id: number): GridSpec | null {
    const row = this.db.prepare('SELECT rows,cols,x0,y0,dx,dy,values_json FROM grids WHERE id=?').get(id) as
      | { rows: number; cols: number; x0: number; y0: number; dx: number; dy: number; values_json: string }
      | undefined;
    if (!row) return null;
    return { rows: row.rows, cols: row.cols, x0: row.x0, y0: row.y0, dx: row.dx, dy: row.dy, values: JSON.parse(row.values_json) };
  }

  listGrids(): GridRow[] {
    return this.db.prepare('SELECT id,name,rows,cols,x0,y0,dx,dy,created_at FROM grids ORDER BY id').all() as unknown as GridRow[];
  }

  requireGrid(id: number): GridRow {
    const g = this.getGrid(id);
    if (!g) throw new ContourError('NOT_FOUND', `网格 ${id} 不存在`, { gridId: id });
    return g;
  }

  /** 保存成功结果；失败诊断以 status='failed' 保存，result_json 必为 NULL，不冒充空结果。 */
  saveExtraction(gridId: number, threshold: number, ruleVersion: string, result: ExtractionResult): number {
    const res = this.db
      .prepare('INSERT INTO extractions (grid_id, threshold, rule_version, status, result_json, error_json, created_at) VALUES (?,?,?,?,?,NULL,?)')
      .run(gridId, threshold, ruleVersion, 'success', JSON.stringify(result), new Date().toISOString());
    return Number(res.lastInsertRowid);
  }

  saveFailure(gridId: number, threshold: number, ruleVersion: string, error: { code: string; message: string; details?: unknown }): number {
    const res = this.db
      .prepare('INSERT INTO extractions (grid_id, threshold, rule_version, status, result_json, error_json, created_at) VALUES (?,?,?,?,NULL,?,?)')
      .run(gridId, threshold, ruleVersion, 'failed', JSON.stringify(error), new Date().toISOString());
    return Number(res.lastInsertRowid);
  }

  getExtraction(id: number): ExtractionRow | null {
    const row = this.db.prepare('SELECT * FROM extractions WHERE id=?').get(id) as ExtractionRow | undefined;
    return row ?? null;
  }

  requireExtraction(id: number): ExtractionRow {
    const e = this.getExtraction(id);
    if (!e) throw new ContourError('NOT_FOUND', `提取记录 ${id} 不存在`, { extractionId: id });
    return e;
  }

  listExtractions(gridId?: number): ExtractionRow[] {
    if (gridId === undefined) {
      return this.db.prepare('SELECT * FROM extractions ORDER BY id').all() as unknown as ExtractionRow[];
    }
    return this.db.prepare('SELECT * FROM extractions WHERE grid_id=? ORDER BY id').all(gridId) as unknown as ExtractionRow[];
  }
}
