import * as fs from "node:fs";
import { toErrorBody } from "./core/errors";
import { startServer } from "./api";
import * as svc from "./service";

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function fail(err: unknown): never {
  const body = toErrorBody(err);
  console.error(`错误 [${body.code}] ${body.message}`);
  if (body.details !== undefined) console.error(JSON.stringify(body.details, null, 2));
  process.exit(1);
}

const USAGE = `用法: node dist/src/cli.js <命令> [参数]

命令:
  serve [--port N]                 启动 HTTP API（默认端口 0 = 自动选择空闲端口）
  import <grid.json>               导入网格（{name, matrix, origin:{x,y}, spacing:{dx,dy}}）
  grids                            列出网格
  extract <gridId> <threshold>     执行等值线提取并保存快照
  extraction <id>                  查看提取记录（含拼接结果与来源单元）
  cell <gridId> <r> <c> <threshold> 查询单元判定与边插值
  export <extractionId> <out.json> 导出折线 JSON
  history [gridId]                 读取提取历史
  compare <gridId> <t1> <t2>       比较两个阈值的结果摘要
`;

function main(argv: string[]): void {
  const [cmd, ...args] = argv;
  switch (cmd) {
    case "serve": {
      const idx = args.indexOf("--port");
      const port = idx >= 0 ? Number(args[idx + 1]) : Number(process.env.PORT ?? 0);
      if (!Number.isInteger(port) || port < 0 || port > 65535) fail(new Error("端口必须是 0-65535 的整数"));
      void startServer(port);
      return;
    }
    case "import": {
      const file = args[0];
      if (!file) fail(new Error("缺少网格 JSON 文件路径"));
      print(svc.importGrid(JSON.parse(fs.readFileSync(file, "utf8"))));
      return;
    }
    case "grids":
      print(svc.listGrids());
      return;
    case "extract":
      print(svc.runExtraction(Number(args[0]), Number(args[1])));
      return;
    case "extraction":
      print(svc.getExtraction(Number(args[0])));
      return;
    case "cell":
      print(svc.getCellDebug(Number(args[0]), Number(args[1]), Number(args[2]), Number(args[3])));
      return;
    case "export": {
      const rec = svc.getExtraction(Number(args[0]));
      if (rec.status !== "ok" || !rec.result) fail(new Error("该提取未成功，无可导出的折线"));
      fs.writeFileSync(args[1], JSON.stringify(rec.result, null, 2), "utf8");
      console.log(`已导出到 ${args[1]}`);
      return;
    }
    case "history":
      print(svc.listExtractions(args[0] === undefined ? undefined : Number(args[0])));
      return;
    case "compare":
      print(svc.compareThresholds(Number(args[0]), Number(args[1]), Number(args[2])));
      return;
    default:
      console.log(USAGE);
      if (cmd) process.exitCode = 1;
  }
}

try {
  main(process.argv.slice(2));
} catch (err) {
  fail(err);
}
