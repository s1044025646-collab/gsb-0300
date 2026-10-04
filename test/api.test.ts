import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createServer } from '../src/api';
import { ContourService } from '../src/service';
import { Store } from '../src/store';

async function withServer(fn: (base: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contour-api-'));
  const store = new Store(dir);
  const server = createServer(new ContourService(store));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    store.close();
  }
}

test('HTTP API 全流程', async () => {
  await withServer(async (base) => {
    const grid = {
      rows: 3, cols: 3, x0: 0, y0: 0, dx: 1, dy: 1,
      values: [[0, 1, 2], [0, 1, 2], [0, 1, 2]],
    };
    const imp = await fetch(`${base}/api/grids`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(grid) });
    assert.equal(imp.status, 201);
    const { id } = (await imp.json()) as { id: number };

    const ext = await fetch(`${base}/api/grids/${id}/extractions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threshold: 0.5 }) });
    assert.equal(ext.status, 201);
    const extBody = (await ext.json()) as any;
    assert.equal(extBody.result.polylines.length, 1);

    const got = await fetch(`${base}/api/extractions/${extBody.id}`);
    assert.equal(got.status, 200);

    const cell = await fetch(`${base}/api/grids/${id}/cell?col=0&row=0&threshold=0.5`);
    assert.equal(cell.status, 200);
    const cellBody = (await cell.json()) as any;
    assert.equal(cellBody.caseIndex, 6);

    const cmp = await fetch(`${base}/api/grids/${id}/compare?t1=0.5&t2=1.5`);
    assert.equal(cmp.status, 200);

    const hist = await fetch(`${base}/api/grids/${id}/extractions`);
    const histBody = (await hist.json()) as any;
    assert.ok(histBody.extractions.length >= 3);

    // 错误码：顶点等于阈值
    const bad = await fetch(`${base}/api/grids/${id}/extractions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threshold: 1 }) });
    assert.equal(bad.status, 400);
    const badBody = (await bad.json()) as any;
    assert.equal(badBody.error.code, 'VALUE_EQUALS_THRESHOLD');

    const nf = await fetch(`${base}/api/grids/999`, );
    assert.equal(nf.status, 404);
  });
});

