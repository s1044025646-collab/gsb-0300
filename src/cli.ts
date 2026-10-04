import * as fs from 'node:fs';
import { toErrorPayload } from './errors';
import { ContourService } from './service';
import { Store } from './store';
import { startServer } from './server';

const USAGE = `用法: node dist/cli.js <命令> [参数]
命令:
  serve [--port=N]                 启动 HTTP 服务（默认自动选择空闲端口）
  import <grid.json> [--name=名称] 导入网格
  extract <gridId> <threshold>     执行等值线提取
  cell <gridId> <col> <row> <threshold>  查询单元判定与边插值
  export <extractionId> [out.json] 导出折线 JSON
  history [gridId]                 查看提取历史
  compare <gridId> <t1> <t2>       比较两个阈值的结果摘要
  demo                             运行内置演示
网格 JSON 格式: { "rows":N, "cols":M, "x0":0, "y0":0, "dx":1, "dy":1, "values":[[...],...] }
数据目录: 环境变量 CONTOUR_DATA_DIR，默认 ./data
`;

function argValue(args: string[], prefix: string): string | undefined {
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === 'help' || cmd === '--help') {
    process.stdout.write(USAGE);
    return;
  }
  if (cmd === 'serve') {
    const portArg = argValue(args, '--port=');
    await startServer(portArg ? Number(portArg) : undefined);
    return;
  }
  if (cmd === 'demo') {
    const { runDemo } = require('./demo');
    runDemo();
    return;
  }

  const service = new ContourService(new Store());
  try {
    switch (cmd) {
      case 'import': {
        const file = args[1];
        if (!file) throw new Error('缺少网格文件路径');
        const body = JSON.parse(fs.readFileSync(file, 'utf8'));
        const { id } = service.importGrid(body, argValue(args, '--name='));
        console.log(JSON.stringify({ id }, null, 2));
        break;
      }
      case 'extract': {
        const { id, result } = service.extract(Number(args[1]), args[2]);
        console.log(JSON.stringify({ id, stats: result.stats }, null, 2));
        break;
      }
      case 'cell': {
        const out = service.cellQuery(Number(args[1]), Number(args[2]), Number(args[3]), Number(args[4]));
        console.log(JSON.stringify(out, null, 2));
        break;
      }
      case 'export': {
        const { result } = service.getExtractionResult(Number(args[1]));
        const json = JSON.stringify(result, null, 2);
        if (args[2]) {
          fs.writeFileSync(args[2], json);
          console.log(`已导出到 ${args[2]}`);
        } else {
          console.log(json);
        }
        break;
      }
      case 'history': {
        const gridId = args[1] !== undefined ? Number(args[1]) : undefined;
        console.log(JSON.stringify(service.store.listExtractions(gridId), null, 2));
        break;
      }
      case 'compare': {
        console.log(JSON.stringify(service.compare(Number(args[1]), args[2], args[3]), null, 2));
        break;
      }
      default:
        process.stderr.write(`未知命令: ${cmd}\n${USAGE}`);
        process.exitCode = 2;
    }
  } catch (err) {
    console.error(JSON.stringify({ error: toErrorPayload(err) }, null, 2));
    process.exitCode = 1;
  } finally {
    service.store.close();
  }
}

void main();
