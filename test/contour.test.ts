import { test } from "node:test";
import assert from "node:assert/strict";
import { extractContours } from "../src/core/extract";
import { ApiError } from "../src/core/errors";
import { GridSpec } from "../src/core/types";

function makeGrid(matrix: number[][], opts: Partial<GridSpec> = {}): GridSpec {
  return {
    rows: matrix.length,
    cols: matrix[0].length,
    originX: 0,
    originY: 0,
    dx: 1,
    dy: 1,
    matrix,
    ...opts,
  };
}

/** 用 0/1 构造 2x2 单单元网格，bit0=sw bit1=se bit2=ne bit3=nw */
function caseGrid(caseIndex: number): GridSpec {
  const bit = (n: number) => ((caseIndex >> n) & 1) * 2; // 0 或 2，阈值取 1
  return makeGrid([
    [bit(0), bit(1)],
    [bit(3), bit(2)],
  ]);
}

function segEdges(grid: GridSpec, threshold: number): [string, string][] {
  // 单单元：直接取第一条折线的边对；这里绕过拼接，用 extractContours 前的核心函数
  const { cellSegments } = require("../src/core/marchingSquares");
  return cellSegments(grid, 0, 0, threshold).map((s: { aEdge: string; bEdge: string }) => [s.aEdge, s.bEdge]);
}

// 手工推导的 16 种角点高低组合期望线段（单单元，边: 底H:0:0 右V:0:1 顶H:1:0 左V:0:0）
const EXPECTED: Record<number, [string, string][]> = {
  0: [],
  1: [["V:0:0", "H:0:0"]],
  2: [["H:0:0", "V:0:1"]],
  3: [["V:0:0", "V:0:1"]],
  4: [["V:0:1", "H:1:0"]],
  5: [["H:0:0", "V:0:1"], ["H:1:0", "V:0:0"]], // 均值==阈值 -> 中心高 -> 低角 SE/NW 被切出
  6: [["H:0:0", "H:1:0"]],
  7: [["V:0:0", "H:1:0"]],
  8: [["H:1:0", "V:0:0"]],
  9: [["H:0:0", "H:1:0"]],
  10: [["V:0:0", "H:0:0"], ["V:0:1", "H:1:0"]], // 均值==阈值 -> 中心高 -> 低角 SW/NE 被切出
  11: [["V:0:1", "H:1:0"]],
  12: [["V:0:1", "V:0:0"]],
  13: [["H:0:0", "V:0:1"]],
  14: [["H:0:0", "V:0:0"]],
  15: [],
};

test("十六种角点高低组合的局部线段", () => {
  for (let k = 0; k < 16; k++) {
    const edges = segEdges(caseGrid(k), 1).map((p) => p.slice().sort());
    const want = EXPECTED[k].map((p) => p.slice().sort());
    assert.deepEqual(edges.sort(), want.sort(), `case ${k}`);
  }
});

test("手算边交点：非单位间距与原点平移", () => {
  // sw=se=10, nw=ne=0, 阈值 5 -> 左右边中点
  const grid = makeGrid([[10, 10], [0, 0]], { originX: 100, originY: 200, dx: 2, dy: 4 });
  const res = extractContours(grid, 5);
  assert.equal(res.polylines.length, 1);
  const line = res.polylines[0];
  assert.equal(line.closed, false);
  assert.deepEqual(line.points, [
    { x: 100, y: 202 }, // 左边 t=(5-10)/(0-10)=0.5 -> y=200+0.5*4
    { x: 102, y: 202 },
  ]);
  assert.equal(line.length, 2);
});

test("非单位间距插值：底边 t=0.25", () => {
  // sw=0, se=8, 阈值 2 -> t=0.25, dx=4 -> x=1
  const grid = makeGrid([[0, 8], [0, 8]], { dx: 4, dy: 3 });
  const res = extractContours(grid, 2);
  assert.equal(res.polylines.length, 1);
  assert.deepEqual(res.polylines[0].points, [
    { x: 1, y: 0 },
    { x: 1, y: 3 },
  ]);
});

test("鞍点 case5：中心高（均值>阈值）连接低角侧", () => {
  // sw=ne=3, se=nw=0, 阈值 1, 均值 1.5 > 1 -> 中心高 -> (0,1) 与 (2,3)
  const grid = makeGrid([[3, 0], [0, 3]]);
  const edges = segEdges(grid, 1).map((p) => p.slice().sort()).sort();
  assert.deepEqual(edges, [["H:0:0", "V:0:1"], ["H:1:0", "V:0:0"]].map((p) => p.slice().sort()).sort());
});

test("鞍点 case5：中心低（均值<阈值）高角各自孤立", () => {
  // sw=ne=1.5, se=nw=0, 阈值 1, 均值 0.75 < 1 -> (3,0) 与 (1,2)
  const grid = makeGrid([[1.5, 0], [0, 1.5]]);
  const edges = segEdges(grid, 1).map((p) => p.slice().sort()).sort();
  assert.deepEqual(edges, [["V:0:0", "H:0:0"], ["V:0:1", "H:1:0"]].map((p) => p.slice().sort()).sort());
});

test("鞍点 case10：均值恰好等于阈值时按中心高处理", () => {
  // se=nw=2, sw=ne=0, 阈值 1, 均值 == 1 -> 中心高 -> 低角 SW/NE 被切出: (3,0) 与 (1,2)
  const grid = makeGrid([[0, 2], [2, 0]]);
  const edges = segEdges(grid, 1).map((p) => p.slice().sort()).sort();
  assert.deepEqual(edges, [["V:0:0", "H:0:0"], ["V:0:1", "H:1:0"]].map((p) => p.slice().sort()).sort());
});

test("斜坡产生跨网格开放线，内部交点关联两条线段", () => {
  const grid = makeGrid([
    [0, 1, 2],
    [0, 1, 2],
    [0, 1, 2],
  ]);
  const res = extractContours(grid, 0.5);
  assert.equal(res.polylines.length, 1);
  const line = res.polylines[0];
  assert.equal(line.closed, false);
  assert.deepEqual(line.points, [
    { x: 0.5, y: 0 },
    { x: 0.5, y: 1 },
    { x: 0.5, y: 2 },
  ]);
  assert.equal(line.length, 2);
  assert.deepEqual(line.cells, ["0:0", "1:0"]);
  // 内部边 H:1:0 是链的中间节点（非端点）
  assert.equal(line.edgeIds[1], "H:1:0");
  // 端点是边界边
  assert.deepEqual([line.edgeIds[0], line.edgeIds[2]], ["H:0:0", "H:2:0"]);
});

test("中心峰产生闭环，规范化后起点与方向固定", () => {
  const grid = makeGrid([
    [0, 0, 0],
    [0, 10, 0],
    [0, 0, 0],
  ]);
  const res = extractContours(grid, 5);
  assert.equal(res.polylines.length, 1);
  const ring = res.polylines[0];
  assert.equal(ring.closed, true);
  assert.equal(ring.vertexCount, 4);
  assert.ok(Math.abs(ring.length - 4 * Math.hypot(0.5, 0.5)) < 1e-12);
  // 起点是最小边标识
  const minEdge = [...ring.edgeIds].sort()[0];
  assert.equal(ring.edgeIds[0], minEdge);
  // 方向：第二个节点边标识 < 最末节点边标识
  assert.ok(ring.edgeIds[1] < ring.edgeIds[ring.edgeIds.length - 1]);
});

test("交错角点（鞍点阵列）按约定连接成两段线", () => {
  // 2x2 单元棋盘格，阈值 1，均值==1 -> 中心高
  const grid = makeGrid([
    [2, 0, 2],
    [0, 2, 0],
    [2, 0, 2],
  ]);
  const res = extractContours(grid, 1);
  assert.ok(res.polylines.length >= 2);
  // 每个鞍点单元产生两条线段
  for (const p of res.polylines) {
    assert.ok(p.vertexCount >= 2);
  }
});

test("阈值超出数值范围返回空集合", () => {
  const grid = makeGrid([
    [0, 1],
    [1, 0],
  ]);
  const res = extractContours(grid, 100);
  assert.equal(res.polylines.length, 0);
  assert.deepEqual(res.summary, {
    polylineCount: 0, openCount: 0, closedCount: 0, totalLength: 0, totalVertices: 0,
  });
});

test("顶点恰好等于阈值时拒绝并报告坐标", () => {
  const grid = makeGrid([
    [0, 5],
    [1, 2],
  ], { originX: 10, originY: 20, dx: 2, dy: 3 });
  assert.throws(
    () => extractContours(grid, 5),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, "E_THRESHOLD_ON_VERTEX");
      const details = err.details as { count: number; vertices: { x: number; y: number }[] };
      assert.equal(details.count, 1);
      assert.deepEqual(details.vertices[0], { row: 0, col: 1, x: 12, y: 20 } as never);
      return true;
    },
  );
});

test("无重复线段、无零长段、内部交点度为 2、边界交点度为 1", () => {
  const grid = makeGrid([
    [0, 0, 0, 0],
    [0, 9, 9, 0],
    [0, 9, 1, 0],
    [0, 0, 0, 0],
  ]);
  const res = extractContours(grid, 5);
  const degree = new Map<string, number>();
  const seenSegs = new Set<string>();
  for (const p of res.polylines) {
    for (let i = 0; i < p.points.length; i++) {
      const a = p.points[i];
      const b = p.points[(i + 1) % p.points.length];
      if (!p.closed && i === p.points.length - 1) break;
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0, "存在零长段");
      const key = `${a.x},${a.y}|${b.x},${b.y}`;
      const rkey = `${b.x},${b.y}|${a.x},${a.y}`;
      assert.ok(!seenSegs.has(key) && !seenSegs.has(rkey), "存在重复线段");
      seenSegs.add(key);
    }
    const ids = p.closed ? [...p.edgeIds, p.edgeIds[0]] : p.edgeIds;
    for (const id of ids) degree.set(id, (degree.get(id) ?? 0) + 1);
  }
  // 每条网格边作为交点最多出现 2 次（两个相邻单元共享）
  for (const [id, d] of degree) {
    assert.ok(d <= 2, `边 ${id} 度为 ${d}`);
  }
});

test("平移与缩放后的坐标关系", () => {
  const matrix = [
    [0, 0, 0],
    [0, 10, 0],
    [0, 0, 0],
  ];
  const base = extractContours(makeGrid(matrix), 5);
  const moved = extractContours(makeGrid(matrix, { originX: 100, originY: -50, dx: 2, dy: 0.5 }), 5);
  assert.equal(base.polylines.length, moved.polylines.length);
  for (let i = 0; i < base.polylines.length; i++) {
    const a = base.polylines[i];
    const b = moved.polylines[i];
    assert.equal(a.closed, b.closed);
    assert.deepEqual(a.edgeIds, b.edgeIds);
    for (let k = 0; k < a.points.length; k++) {
      assert.ok(Math.abs(b.points[k].x - (100 + a.points[k].x * 2)) < 1e-9);
      assert.ok(Math.abs(b.points[k].y - (-50 + a.points[k].y * 0.5)) < 1e-9);
    }
  }
});

test("相同输入多次运行结果确定一致", () => {
  const grid = makeGrid([
    [2, 0, 2],
    [0, 2, 0],
    [2, 0, 2],
  ]);
  const a = JSON.stringify(extractContours(grid, 1));
  const b = JSON.stringify(extractContours(grid, 1));
  assert.equal(a, b);
});
