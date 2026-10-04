import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContourService } from '../src/service';
import { Store } from '../src/store';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'contour-test-'));
}

const GRID = {
  rows: 3, cols: 3, x0: 0, y0: 0, dx: 1, dy: 1,
  values: [[0, 1, 2], [0, 1, 2], [0, 1, 2]],
};

test('导入、提取、历史与重启后读取', () => {
  const dir = tmpDir();
  const service = new ContourService(new Store(dir));
  const { id: gridId } = service.importGrid(GRID, 't');
  const e1 = service.extract(gridId, 0.5);
  const e2 = service.extract(gridId, 1.5);
  assert.notEqual(e1.id, e2.id, '修改阈值产生新报告');
  assert.equal(service.store.listExtractions(gridId).length, 2);
  service.store.close();

  // 模拟重启
  const reopened = new ContourService(new Store(dir));
  const grids = reopened.store.listGrids();
  assert.equal(grids.length, 1);
  const { result } = reopened.getExtractionResult(e1.id);
  assert.equal(result.threshold, 0.5);
  assert.equal(result.polylines.length, 1);
  const cell = reopened.cellQuery(gridId, 0, 0, 0.5);
  assert.equal(cell.caseIndex, 6);
  reopened.store.close();
});

test('失败诊断保存但不冒充成功空结果', () => {
  const dir = tmpDir();
  const service = new ContourService(new Store(dir));
  const { id: gridId } = service.importGrid({
    rows: 2, cols: 2, x0: 0, y0: 0, dx: 1, dy: 1,
    values: [[0, 0.5], [1, 2]],
  });
  assert.throws(() => service.extract(gridId, 0.5), (err: any) => err.code === 'VALUE_EQUALS_THRESHOLD');
  const history = service.store.listExtractions(gridId);
  assert.equal(history.length, 1);
  assert.equal(history[0].status, 'failed');
  assert.equal(history[0].result_json, null);
  assert.ok(history[0].error_json!.includes('VALUE_EQUALS_THRESHOLD'));
  assert.throws(() => service.getExtractionResult(history[0].id), (err: any) => err.code === 'BAD_REQUEST');
  service.store.close();
});

test('比较两个阈值的结果摘要', () => {
  const dir = tmpDir();
  const service = new ContourService(new Store(dir));
  const { id: gridId } = service.importGrid(GRID);
  const cmp = service.compare(gridId, 0.5, 1.5);
  assert.equal(cmp.t1.stats.polylineCount, 1);
  assert.equal(cmp.t2.stats.polylineCount, 1);
  assert.equal(cmp.diff.polylineCount, 0);
  service.store.close();
});

test('参数校验错误码', () => {
  const dir = tmpDir();
  const service = new ContourService(new Store(dir));
  assert.throws(() => service.importGrid({ rows: 1, cols: 2, x0: 0, y0: 0, dx: 1, dy: 1, values: [[1, 2]] }), (e: any) => e.code === 'INVALID_DIMENSIONS');
  assert.throws(() => service.importGrid({ rows: 2, cols: 2, x0: 0, y0: 0, dx: -1, dy: 1, values: [[1, 2], [3, 4]] }), (e: any) => e.code === 'INVALID_SPACING');
  assert.throws(() => service.importGrid({ rows: 2, cols: 2, x0: 0, y0: 0, dx: 1, dy: 1, values: [[1, NaN], [3, 4]] }), (e: any) => e.code === 'NON_FINITE_VALUE');
  assert.throws(() => service.importGrid({ rows: 2, cols: 2, x0: 0, y0: 0, dx: 1, dy: 1, values: [[1], [3, 4]] }), (e: any) => e.code === 'RAGGED_MATRIX');
  assert.throws(() => service.extract(999, 0.5), (e: any) => e.code === 'NOT_FOUND');
  service.store.close();
});

