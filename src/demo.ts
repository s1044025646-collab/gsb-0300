import * as fs from 'node:fs';
import * as path from 'node:path';
import { ContourService } from './service';
import { Store } from './store';

function slopeGrid() {
  // 5x5，值 = x + y，阈值 2.5 → 一条跨网格的开放线
  const values: number[][] = [];
  for (let r = 0; r < 5; r++) {
    const row: number[] = [];
    for (let c = 0; c < 5; c++) row.push(c + r);
    values.push(row);
  }
  return { rows: 5, cols: 5, x0: 0, y0: 0, dx: 1, dy: 1, values };
}

function peakGrid() {
  // 5x5 中心峰，阈值 0.5 → 闭环
  const values: number[][] = [];
  for (let r = 0; r < 5; r++) {
    const row: number[] = [];
    for (let c = 0; c < 5; c++) {
      const d = Math.max(Math.abs(c - 2), Math.abs(r - 2));
      row.push(d === 0 ? 1 : 0);
    }
    values.push(row);
  }
  return { rows: 5, cols: 5, x0: 0, y0: 0, dx: 1, dy: 1, values };
}

function saddleGrid() {
  // 2x2 顶点（一个单元）交错角点：高-低 / 低-高，阈值 0.5
  // 四角均值 = 0.5 = 阈值 → 中心视为高 → 连接使高角相通的两段线
  return { rows: 2, cols: 2, x0: 0, y0: 0, dx: 1, dy: 1, values: [[1, 0], [0, 1]] };
}

export function runDemo(dataDir?: string): void {
  const dir = dataDir ?? path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  const service = new ContourService(new Store(dir));

  const demos: Array<{ name: string; grid: ReturnType<typeof slopeGrid>; thresholds: number[] }> = [
    { name: '斜坡（跨网格开放线）', grid: slopeGrid(), thresholds: [2.5, 3.5] },
    { name: '中心峰（闭环）', grid: peakGrid(), thresholds: [0.5] },
    { name: '交错角点鞍点（两段线）', grid: saddleGrid(), thresholds: [0.5] },
  ];

  for (const d of demos) {
    const { id } = service.importGrid(d.grid, d.name);
    console.log(`\n=== ${d.name}  gridId=${id} ===`);
    for (const t of d.thresholds) {
      const { id: exId, result } = service.extract(id, t);
      console.log(`阈值 ${t} → extractionId=${exId}`, JSON.stringify(result.stats));
      for (const pl of result.polylines) {
        console.log(`  ${pl.type} 顶点数=${pl.vertexCount} 长度=${pl.length.toFixed(4)} 单元=${JSON.stringify(pl.cells)}`);
        console.log(`    点列=${JSON.stringify(pl.points.map((p) => [p.x, p.y]))}`);
      }
    }
  }

  // 阈值超出数值范围 → 空集合
  const { id: gid } = service.importGrid(slopeGrid(), '斜坡（阈值越界演示）');
  const out = service.extract(gid, 100);
  console.log(`\n=== 阈值 100 超出范围 → 空集合 ===`, JSON.stringify(out.result.stats));

  // 比较两个阈值
  console.log('\n=== 比较阈值 2.5 与 3.5 ===');
  console.log(JSON.stringify(service.compare(gid, 2.5, 3.5), null, 2));

  // 模拟重启：关闭后重新打开，读取旧网格与拼接解释
  service.store.close();
  const reopened = new ContourService(new Store(dir));
  const grids = reopened.store.listGrids();
  console.log(`\n=== 重启后读取：共 ${grids.length} 个网格 ===`);
  const first = grids[0];
  const cell = reopened.cellQuery(first.id, 1, 1, 2.5);
  console.log(`网格 ${first.id} 单元 (1,1) 判定:`, JSON.stringify(cell));
  reopened.store.close();
}

if (require.main === module) {
  runDemo();
}
