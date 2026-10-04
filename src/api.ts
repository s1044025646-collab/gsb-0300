import * as http from "node:http";
import { toErrorBody } from "./core/errors";
import * as svc from "./service";

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(text);
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("请求体不是合法 JSON"));
      }
    });
    req.on("error", reject);
  });
}

function num(v: string | null): number | undefined {
  if (v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;
      const method = req.method ?? "GET";

      if (method === "POST" && path === "/grids") {
        return sendJson(res, 201, svc.importGrid(await readBody(req)));
      }
      if (method === "GET" && path === "/grids") {
        return sendJson(res, 200, svc.listGrids());
      }
      let m = path.match(/^\/grids\/(\d+)$/);
      if (method === "GET" && m) {
        const g = svc.getGrid(Number(m[1]));
        return sendJson(res, 200, g);
      }
      m = path.match(/^\/grids\/(\d+)\/extractions$/);
      if (method === "POST" && m) {
        const body = (await readBody(req)) as Record<string, unknown>;
        const out = svc.runExtraction(Number(m[1]), body.threshold);
        return sendJson(res, 201, out);
      }
      m = path.match(/^\/grids\/(\d+)\/cell$/);
      if (method === "GET" && m) {
        const r = num(url.searchParams.get("r"));
        const c = num(url.searchParams.get("c"));
        const t = num(url.searchParams.get("threshold"));
        if (r === undefined || c === undefined || t === undefined) {
          return sendJson(res, 400, { code: "E_VALIDATION", message: "需要查询参数 r, c, threshold" });
        }
        return sendJson(res, 200, svc.getCellDebug(Number(m[1]), r, c, t));
      }
      m = path.match(/^\/grids\/(\d+)\/compare$/);
      if (method === "GET" && m) {
        const t1 = num(url.searchParams.get("t1"));
        const t2 = num(url.searchParams.get("t2"));
        if (t1 === undefined || t2 === undefined) {
          return sendJson(res, 400, { code: "E_VALIDATION", message: "需要查询参数 t1, t2" });
        }
        return sendJson(res, 200, svc.compareThresholds(Number(m[1]), t1, t2));
      }
      m = path.match(/^\/extractions\/(\d+)$/);
      if (method === "GET" && m) {
        return sendJson(res, 200, svc.getExtraction(Number(m[1])));
      }
      m = path.match(/^\/extractions\/(\d+)\/polylines\.json$/);
      if (method === "GET" && m) {
        const rec = svc.getExtraction(Number(m[1]));
        if (rec.status !== "ok" || !rec.result) {
          return sendJson(res, 409, { code: "E_VALIDATION", message: "该提取未成功，无可导出的折线", details: rec.error });
        }
        return sendJson(res, 200, rec.result);
      }
      if (method === "GET" && path === "/extractions") {
        const g = num(url.searchParams.get("grid_id"));
        return sendJson(res, 200, svc.listExtractions(g));
      }
      return sendJson(res, 404, { code: "E_NOT_FOUND", message: `未知路由 ${method} ${path}` });
    } catch (err) {
      const body = toErrorBody(err);
      const status = body.code === "E_NOT_FOUND" ? 404
        : body.code === "E_LIMIT_EXCEEDED" ? 413
        : body.code === "E_THRESHOLD_ON_VERTEX" ? 422
        : body.code === "E_VALIDATION" ? 400
        : 500;
      return sendJson(res, status, body);
    }
  });
}

export function startServer(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(port, () => {
      const addr = server.address();
      const actual = typeof addr === "object" && addr ? addr.port : port;
      console.log(`等值线服务已启动: http://127.0.0.1:${actual}`);
      resolve(actual);
    });
  });
}
