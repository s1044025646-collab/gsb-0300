import * as http from 'node:http';
import { toErrorPayload } from './errors';
import { ContourService } from './service';

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 64 * 1024 * 1024) reject(new Error('请求体过大'));
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

export function createServer(service: ContourService): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean); // e.g. ['api','grids','1']
      const method = req.method ?? 'GET';

      if (method === 'GET' && url.pathname === '/api/health') {
        return sendJson(res, 200, { ok: true });
      }

      if (parts[0] === 'api' && parts[1] === 'grids' && parts.length === 2) {
        if (method === 'GET') return sendJson(res, 200, { grids: service.store.listGrids() });
        if (method === 'POST') {
          const body = (await readBody(req)) as Record<string, unknown>;
          const { id } = service.importGrid(body, typeof body.name === 'string' ? body.name : undefined);
          return sendJson(res, 201, { id });
        }
      }

      if (parts[0] === 'api' && parts[1] === 'grids' && parts.length >= 3) {
        const gridId = Number(parts[2]);
        if (!Number.isInteger(gridId)) return sendJson(res, 400, { error: { code: 'BAD_REQUEST', message: '网格 id 非法' } });

        if (parts.length === 3 && method === 'GET') {
          const grid = service.store.requireGrid(gridId);
          return sendJson(res, 200, { grid, values: service.store.getGridSpec(gridId)!.values });
        }
        if (parts[3] === 'extractions' && parts.length === 4) {
          if (method === 'GET') return sendJson(res, 200, { extractions: service.store.listExtractions(gridId) });
          if (method === 'POST') {
            const body = (await readBody(req)) as Record<string, unknown>;
            const { id, result } = service.extract(gridId, body.threshold);
            return sendJson(res, 201, { id, result });
          }
        }
        if (parts[3] === 'cell' && parts.length === 4 && method === 'GET') {
          const q = url.searchParams;
          const out = service.cellQuery(gridId, q.get('col'), q.get('row'), q.get('threshold'));
          return sendJson(res, 200, out);
        }
        if (parts[3] === 'compare' && parts.length === 4 && method === 'GET') {
          const q = url.searchParams;
          return sendJson(res, 200, service.compare(gridId, q.get('t1'), q.get('t2')));
        }
      }

      if (parts[0] === 'api' && parts[1] === 'extractions' && parts.length === 3 && method === 'GET') {
        const id = Number(parts[2]);
        if (!Number.isInteger(id)) return sendJson(res, 400, { error: { code: 'BAD_REQUEST', message: '提取 id 非法' } });
        const { record, result } = service.getExtractionResult(id);
        return sendJson(res, 200, { record: { ...record, result_json: undefined }, result });
      }
      if (parts[0] === 'api' && parts[1] === 'extractions' && parts.length === 2 && method === 'GET') {
        return sendJson(res, 200, { extractions: service.store.listExtractions() });
      }

      return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `未匹配的路由：${method} ${url.pathname}` } });
    } catch (err) {
      const payload = toErrorPayload(err);
      const status = payload.code === 'NOT_FOUND' ? 404 : payload.code === 'INTERNAL' ? 500 : 400;
      return sendJson(res, status, { error: payload });
    }
  });
}
