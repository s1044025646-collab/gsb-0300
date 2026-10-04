import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellSegments, caseIndex, edgeIntersection, describeCell } from '../src/marching';
import { extractContours } from '../src/extract';
import { GridSpec } from '../src/types';

const T = 0.5;
const L = 0; // 低
const H = 1; // 高

// 角点顺序 c0=(0,0) c1=(1,0) c2=(1,1) c3=(0,1)；边 0=底 1=右 2=顶 3=左
const CASES: Array<{ corners: [number, number, number, number]; idx: number; segs: Array<[number, number]> }> = [
  { corners: [L, L, L, L], idx: 0, segs: [] },
  { corners: [H, L, L, L], idx: 1, segs: [[3, 0]] },
  { corners: [L, H, L, L], idx: 2, segs: [[0, 1]] },
  { corners: [H, H, L, L], idx: 3, segs: [[3, 1]] },
  { corners: [L, L, H, L], idx: 4, segs: [[1, 2]] },
  { corners: [H, L, H, L], idx: 5, segs: [[3, 2], [0, 1]] }, // 鞍点，均值 0.5=阈值 → 中心高
  { corners: [L, H, H, L], idx: 6, segs: [[0, 2]] },
  { corners: [H, H, H, L], idx: 7, segs: [[3, 2]] },
  { corners: [L, L, L, H], idx: 8, segs: [[2, 3]] },
  { corners: [H, L, L, H], idx: 9, segs: [[0, 2]] },
  { corners: [L, H, L, H], idx: 10, segs: [[3, 0], [1, 2]] }, // 鞍点，均值=阈值 → 中心高
  { corners: [H, H, L, H], idx: 11, segs: [[1, 2]] },
  { corners: [L, L, H, H], idx: 12, segs: [[3, 1]] },
  { corners: [H, L, H, H], idx: 13, segs: [[0, 1]] },
  { corners: [L, H, H, H], idx: 14, segs: [[3, 0]] },
  { corners: [H, H, H, H], idx: 15, segs: [] },
];

test('十六种角点高低组合', () => {
  for (const c of CASES) {
    assert.equal(caseIndex(c.corners, T), c.idx, `caseIndex ${JSON.stringify(c.corners)}`);
    assert.deepEqual(cellSegments(c.corners, T), c.segs, `segments idx=${c.idx}`);
  }
});

test('鞍点：中心低时换向连接', () => {
  // case 5（c0、c2 高），均值 0.35 < 0.5 → 中心低
  assert.deepEqual(cellSegments([0.6, 0.1, 0.6, 0.1], 0.5), [[3, 0], [1, 2]]);
  // case 10（c1、c3 高），均值 0.35 < 0.5 → 中心低
  assert.deepEqual(cellSegments([0.1, 0.6, 0.1, 0.6], 0.5), [[0, 1], [2, 3]]);
});

test('鞍点：均值恰好等于阈值时中心视为高', () => {
  // case 5，均值 = 0.5
  assert.deepEqual(cellSegments([0.9, 0.2, 0.7, 0.2], 0.5), [[3, 2], [0, 1]]);
  // case 10，均值 = 0.5
  assert.deepEqual(cellSegments([0.2, 0.9, 0.2, 0.7], 0.5), [[3, 0], [1, 2]]);
});

test('非单位间距的边插值（手算）', () => {
  const grid: GridSpec = {
    rows: 2, cols: 2, x0: 10, y0: 20, dx: 4, dy: 2,
    values: [[0, 2], [0, 0]],
  };
  // 底边 H:0:0：va=0 vb=2，阈值 0.5 → t=0.25 → x=10+0.25*4=11, y=20
  assert.deepEqual(edgeIntersection(grid, 'H:0:0', 0.5), { x: 11, y: 20 });
  // 右边 V:1:0：va=2 vb=0，t=(0.5-2)/(0-2)=0.75 → x=14, y=20+0.75*2=21.5
  assert.deepEqual(edgeIntersection(grid, 'V:1:0', 0.5), { x: 14, y: 21.5 });
});

test('手算边交点：3x3 斜坡', () => {
  // values[r][c] = c，阈值 0.5 → 竖直等值线 x=0.5，从底边到顶边
  const grid: GridSpec = {
    rows: 3, cols: 3, x0: 0, y0: 0, dx: 1, dy: 1,
    values: [[0, 1, 2], [0, 1, 2], [0, 1, 2]],
  };
  const result = extractContours(grid, 0.5);
  assert.equal(result.polylines.length, 1);
  const pl = result.polylines[0];
  assert.equal(pl.type, 'open');
  assert.equal(pl.vertexCount, 3);
  assert.deepEqual(pl.points, [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }, { x: 0.5, y: 2 }]);
  assert.equal(pl.length, 2);
});

test('顶点等于阈值时拒绝并指出坐标', () => {
  const grid: GridSpec = {
    rows: 2, cols: 2, x0: 0, y0: 0, dx: 1, dy: 1,
    values: [[0, 0.5], [0, 1]],
  };
  assert.throws(
    () => extractContours(grid, 0.5),
    (err: any) => err.code === 'VALUE_EQUALS_THRESHOLD' && err.details.vertices.some((v: any) => v.col === 1 && v.row === 0),
  );
});

test('阈值超出数值范围返回空集合', () => {
  const grid: GridSpec = {
    rows: 2, cols: 2, x0: 0, y0: 0, dx: 1, dy: 1,
    values: [[0, 1], [2, 3]],
  };
  const result = extractContours(grid, 100);
  assert.equal(result.polylines.length, 0);
  assert.equal(result.stats.segmentCount, 0);
});

test('describeCell 输出鞍点判定细节', () => {
  const grid: GridSpec = {
    rows: 2, cols: 2, x0: 0, y0: 0, dx: 1, dy: 1,
    values: [[1, 0], [0, 1]],
  };
  const d = describeCell(grid, 0, 0, 0.5);
  assert.equal(d.caseIndex, 5);
  assert.equal(d.saddle, true);
  assert.equal(d.centerMean, 0.5);
  assert.equal(d.centerHigh, true);
  assert.equal(d.segments.length, 2);
});
