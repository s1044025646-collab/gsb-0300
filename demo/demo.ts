/* 演示：斜坡开链、中心峰闭环、交错角点鞍点约定、阈值越界空集合、修改阈值新报告、历史回读 */
import { extractContours } from "../src/core/extract";
import { GridSpec } from "../src/core/types";
import * as svc from "../src/service";

function grid(matrix: number[][], opts: Partial<GridSpec> = {}): GridSpec {
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

function show(title: string, fn: () => void): void {
  console.log(`\n=== ${title} ===`);
  fn();
}

show("1. 斜坡 -> 跨网格开放线", () => {
  const res = extractContours(grid([
    [0, 1, 2, 3],
    [0, 1, 2, 3],
    [0, 1, 2, 3],
  ]), 1.5);
  for (const p of res.polylines) {
    console.log(`开链 ${p.id}: 顶点数=${p.vertexCount} 长度=${p.length} 单元=${p.cells.join(",")}`);
    console.log("  点:", p.points.map((pt) => `(${pt.x},${pt.y})`).join(" -> "));
  }
});

show("2. 中心峰 -> 闭环", () => {
  const res = extractContours(grid([
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 9, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ]), 4);
  for (const p of res.polylines) {
    console.log(`闭环 ${p.id}: 顶点数=${p.vertexCount} 长度=${p.length.toFixed(4)} 单元=${p.cells.join(",")}`);
    console.log("  点:", p.points.map((pt) => `(${pt.x},${pt.y})`).join(" -> "));
  }
});

show("3. 交错角点（鞍点）-> 按均值约定连接的两段线", () => {
  const g = grid([
    [2, 0],
    [0, 2],
  ]);
  const res = extractContours(g, 1); // 四角均值 == 1 == 阈值 -> 中心视为高
  console.log(`折线数=${res.polylines.length}（约定：均值>=阈值时中心为高，低角 SW/NE 各自被切出）`);
  for (const p of res.polylines) {
    console.log(`  ${p.id}: 点=${p.points.map((pt) => `(${pt.x},${pt.y})`).join(" -> ")}`);
  }
});

show("4. 阈值在数值范围外 -> 空集合", () => {
  const res = extractContours(grid([
    [0, 1],
    [1, 0],
  ]), 100);
  console.log("摘要:", res.summary);
});

show("5. 导入网格、修改阈值产生新报告、历史回读（重启后仍可读取）", () => {
  const imported = svc.importGrid({
    name: "demo-peak",
    matrix: [
      [0, 0, 0, 0, 0],
      [0, 2, 2, 2, 0],
      [0, 2, 9, 2, 0],
      [0, 2, 2, 2, 0],
      [0, 0, 0, 0, 0],
    ],
    origin: { x: 0, y: 0 },
    spacing: { dx: 1, dy: 1 },
  });
  console.log(`导入网格 id=${imported.id}`);
  const a = svc.runExtraction(imported.id, 1);
  const b = svc.runExtraction(imported.id, 5);
  console.log(`阈值 1 -> ${a.result.summary.polylineCount} 条折线（提取记录 #${a.id}）`);
  console.log(`阈值 5 -> ${b.result.summary.polylineCount} 条折线（提取记录 #${b.id}）`);
  const cmp = svc.compareThresholds(imported.id, 1, 5);
  console.log("比较摘要:", JSON.stringify(cmp.diff));
  const history = svc.listExtractions(imported.id);
  console.log(`历史记录 ${history.length} 条，已持久化到 data/contour.db，重启进程后可用 'history' 命令读取`);
});
