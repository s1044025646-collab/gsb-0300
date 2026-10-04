import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";

export const DATA_DIR = process.env.CONTOUR_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "contour.db");

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS grids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rows INTEGER NOT NULL,
      cols INTEGER NOT NULL,
      origin_x REAL NOT NULL,
      origin_y REAL NOT NULL,
      dx REAL NOT NULL,
      dy REAL NOT NULL,
      matrix_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS extractions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grid_id INTEGER NOT NULL REFERENCES grids(id),
      threshold REAL NOT NULL,
      rule_version TEXT NOT NULL,
      status TEXT NOT NULL,
      error_json TEXT,
      result_json TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}
