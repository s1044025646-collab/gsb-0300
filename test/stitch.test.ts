import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractContours } from '../src/extract';
import { GridSpec } from '../src/types';

function slopeGrid(rows: number, cols: number, x0 = 0, y0 = 0, dx = 1, dy = 1): GridSpec {
  const values: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) row.push(c + r);
    values.push(row);
  }
  return { rows, cols, x0, y0, dx, dy, values };
}

function peakGrid(): GridSpec {
  const values: number[][] = [];
  for (let r = 0; r < 5; r++) {
    const row: number[] = [];
    for (let c = 0; c < 5; c++) row.push(Math.max(Math.abs(c - 2), Math.abs(r - 2)) === 0 ? 1 : 0);
    values.push(row);
  }
  return { rows: 5, cols: 5, x0: 0, y0: 0, dx: 1, dy: 1, values };
}

test('内部交点位于共享边，边界交点是开链端点', () => {
  const rows = 5, cols = 5;
  const result = extractContours(slopeGrid(rows, cols), 2.5);
  assert.equal(result.polylines.length, 1);
  const pl = result.polylines[0];
  assert.equal(pl.type, 'open');
  const isBoundaryEdge = (id: string): boolean => {
    const [kind, c, r] = id.split(':');
    if (kind === 'H') return Number(r) === 0 || Number(r) === rows - 1;
    return Number(c) === 0 || Number(c) === cols - 1;
  };
  const endpoints = [pl.edgeIds[0], pl.edgeIds[pl.edgeIds.length - 1]];
  for (const k of endpoints) assert.ok(isBoundaryEdge(k), `端点 ${k} 应在边界边上`);
  for (const k of pl.edgeIds.slice(1, -1)) {
    assert.ok(!isBoundaryEdge(k), `内部点 ${k} 应在共享边上（关联两条线段）`);
  }
});

test('中心峰产生闭环，长度与顶点数正确', () => {
  const result = extractContours(peakGrid(), 0.5);
  assert.equal(result.polylines.length, 1);
  const pl = result.polylines[0];
  assert.equal(pl.type, 'closed');
  assert.equal(pl.vertexCount, 4);
  // 过四边中点的菱形，边长 √0.5，周长 2√2
  assert.ok(Math.abs(pl.length - 2 * Math.SQRT2) < 1e-12);
  assert.equal(pl.cells.length, 4);
});

test('无重复线段、无零长段', () => {
  const result = extractContours(slopeGrid(6, 7), 3.5);
  const segKeys = new Set<string>();
  for (const pl of result.polylines) {
    const keys = pl.type === 'closed' ? [...pl.edgeIds, pl.edgeIds[0]] : pl.edgeIds;
    for (let i = 0; i + 1 < keys.length; i++) {
      const seg = [keys[i], keys[i + 1]].sort().join('|');
      assert.ok(!segKeys.has(seg), `重复线段 ${seg}`);
      segKeys.add(seg);
    }
    for (let i = 0; i + 1 < pl.points.length; i++) {
      const d = Math.hypot(pl.points[i + 1].x - pl.points[i].x, pl.points[i + 1].y - pl.points[i].y);
      assert.ok(d > 0, '存在零长段');
    }
  }
});

test('确定性：相同输入多次运行结果一致', () => {
  const a = JSON.stringify(extractContours(slopeGrid(5, 5), 2.5));
  const b = JSON.stringify(extractContours(slopeGrid(5, 5), 2.5));
  assert.equal(a, b);
});

test('平移缩放后的坐标关系', () => {
  const base = extractContours(slopeGrid(4, 4), 1.5);
  const moved = extractContours(slopeGrid(4, 4, 10, 20, 2, 3), 1.5);
  assert.equal(base.polylines.length, moved.polylines.length);
  for (let i = 0; i < base.polylines.length; i++) {
    const pa = base.polylines[i];
    const pb = moved.polylines[i];
    assert.equal(pa.edgeIds.join(','), pb.edgeIds.join(','), '拓扑（边标识序列）一致');
    for (let k = 0; k < pa.points.length; k++) {
      assert.ok(Math.abs(pb.points[k].x - (10 + 2 * pa.points[k].x)) < 1e-12);
      assert.ok(Math.abs(pb.points[k].y - (20 + 3 * pa.points[k].y)) < 1e-12);
    }
  }
});

test('交错角点按约定连接为两段线', () => {
  const grid: GridSpec = {
    rows: 2, cols: 2, x0: 0, y0: 0, dx: 1, dy: 1,
    values: [[1, 0], [0, 1]],
  };
  const result = extractContours(grid, 0.5);
  assert.equal(result.polylines.length, 2);
  assert.ok(result.polylines.every((p) => p.type === 'open' && p.vertexCount === 2));
});
