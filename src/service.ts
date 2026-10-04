import { ContourError, toErrorPayload } from './errors';
import { extractContours } from './extract';
import { validateGrid, validateThreshold } from './grid';
import { RULE_VERSION, describeCell } from './marching';
import { Store } from './store';
import { ExtractionResult } from './types';

export class ContourService {
  constructor(readonly store: Store) {}

  importGrid(input: unknown, name?: string): { id: number } {
    const grid = validateGrid(input);
    const gridName = name ?? `grid-${new Date().toISOString()}`;
    const id = this.store.saveGrid(gridName, grid);
    return { id };
  }

  /** 执行提取并持久化；失败时保存失败诊断后重新抛出。 */
  extract(gridId: number, thresholdInput: unknown): { id: number; result: ExtractionResult } {
    const threshold = validateThreshold(thresholdInput);
    this.store.requireGrid(gridId);
    const spec = this.store.getGridSpec(gridId)!;
    try {
      const result = extractContours(spec, threshold);
      const id = this.store.saveExtraction(gridId, threshold, RULE_VERSION, result);
      return { id, result };
    } catch (err) {
      this.store.saveFailure(gridId, threshold, RULE_VERSION, toErrorPayload(err));
      throw err;
    }
  }

  cellQuery(gridId: number, colInput: unknown, rowInput: unknown, thresholdInput: unknown) {
    const threshold = validateThreshold(thresholdInput);
    const col = Number(colInput);
    const row = Number(rowInput);
    this.store.requireGrid(gridId);
    const spec = this.store.getGridSpec(gridId)!;
    if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= spec.cols - 1 || row >= spec.rows - 1) {
      throw new ContourError('BAD_REQUEST', `单元坐标越界：合法范围 col 0..${spec.cols - 2}, row 0..${spec.rows - 2}`, { col, row });
    }
    // 单元查询同样拒绝恰好等于阈值的顶点，保持与提取一致的约定
    const corners = [spec.values[row][col], spec.values[row][col + 1], spec.values[row + 1][col + 1], spec.values[row + 1][col]];
    if (corners.some((v) => v === threshold)) {
      throw new ContourError('VALUE_EQUALS_THRESHOLD', '单元角点值恰好等于阈值，无法给出判定', { threshold });
    }
    return describeCell(spec, col, row, threshold);
  }

  getExtractionResult(id: number): { record: ReturnType<Store['requireExtraction']>; result: ExtractionResult } {
    const record = this.store.requireExtraction(id);
    if (record.status !== 'success' || !record.result_json) {
      throw new ContourError('BAD_REQUEST', `提取记录 ${id} 是失败诊断，不含结果`, { status: record.status, error: record.error_json ? JSON.parse(record.error_json) : null });
    }
    return { record, result: JSON.parse(record.result_json) as ExtractionResult };
  }

  /** 比较同一网格两个阈值的结果摘要（各自独立提取，不覆盖历史）。 */
  compare(gridId: number, t1Input: unknown, t2Input: unknown) {
    const t1 = validateThreshold(t1Input);
    const t2 = validateThreshold(t2Input);
    const a = this.extract(gridId, t1);
    const b = this.extract(gridId, t2);
    return {
      gridId,
      t1: { threshold: t1, extractionId: a.id, stats: a.result.stats },
      t2: { threshold: t2, extractionId: b.id, stats: b.result.stats },
      diff: {
        polylineCount: b.result.stats.polylineCount - a.result.stats.polylineCount,
        openCount: b.result.stats.openCount - a.result.stats.openCount,
        closedCount: b.result.stats.closedCount - a.result.stats.closedCount,
        totalLength: b.result.stats.totalLength - a.result.stats.totalLength,
      },
    };
  }
}
