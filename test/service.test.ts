import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// 在加载 db 模块前指向临时数据目录
process.env.CONTOUR_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "contour-test-"));

const svc = require("../src/service") as typeof import("../src/service");

const slopeGrid = {
  name: "slope",
  matrix: [
    [0, 1, 2],
    [0, 1, 2],
    [0, 1, 2],
  ],
  origin: { x: 0, y: 0 },
  spacing: { dx: 1, dy: 1 },
};

test("导入网格并校验尺寸", () => {
  const g = svc.importGrid(slopeGrid);
  assert.equal(g.rows, 3);
  assert.equal(g.cols, 3);
  assert.throws(() => svc.importGrid({ matrix: [[1, 2], [1]] , origin: {x:0,y:0}, spacing:{dx:1,dy:1} }), /长度不一致/);
  assert.throws(() => svc.importGrid({ matrix: [[1, 2], [NaN, 1]], origin: {x:0,y:0}, spacing:{dx:1,dy:1} }), /有限实数/);
  assert.throws(() => svc.importGrid({ matrix: [[1, 2], [3, 4]], origin: {x:0,y:0}, spacing:{dx:0,dy:1} }), /正数/);
});

test("提取成功保存快照；失败保存诊断但不冒充空结果", () => {
  const g = svc.importGrid(slopeGrid);
  const ok = svc.runExtraction(g.id, 0.5);
  assert.equal(ok.result.summary.polylineCount, 1);
  const rec = svc.getExtraction(ok.id);
  assert.equal(rec.status, "ok");
  assert.equal(rec.ruleVersion, "marching-squares-v1");

  // 阈值 1 恰好等于顶点值 -> 拒绝，历史里保存 failed 诊断
  assert.throws(() => svc.runExtraction(g.id, 1), /阈值/);
  const history = svc.listExtractions(g.id) as { status: string }[];
  assert.equal(history.filter((h) => h.status === "failed").length, 1);
  assert.equal(history.filter((h) => h.status === "ok").length, 1);
});

test("单元判定查询与阈值比较摘要", () => {
  const g = svc.importGrid(slopeGrid);
  const cell = svc.getCellDebug(g.id, 0, 0, 0.5) as { caseIndex: number; segments: unknown[] };
  assert.equal(cell.caseIndex, 6); // sw=0,se=1,nw=0,ne=1 -> bit1|bit2... se=1>0.5, ne=1>0.5
  assert.equal(cell.segments.length, 1);

  const peak = svc.importGrid({
    name: "peak",
    matrix: [
      [0, 0, 0],
      [0, 10, 0],
      [0, 0, 0],
    ],
    origin: { x: 0, y: 0 },
    spacing: { dx: 1, dy: 1 },
  });
  const cmp = svc.compareThresholds(peak.id, 1, 4);
  assert.equal(cmp.a.polylineCount, 1);
  assert.equal(cmp.b.polylineCount, 1);
  assert.equal(cmp.a.closedCount, 1);
  assert.ok(cmp.diff.totalLength !== 0);
});

test("阈值超出范围返回空集合但状态为 ok", () => {
  const g = svc.importGrid(slopeGrid);
  const res = svc.runExtraction(g.id, 99);
  assert.equal(res.result.summary.polylineCount, 0);
  assert.equal(svc.getExtraction(res.id).status, "ok");
});

