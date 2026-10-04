import { createServer } from './api';
import { ContourService } from './service';
import { Store } from './store';

export function startServer(port?: number, dataDir?: string): Promise<number> {
  const store = new Store(dataDir);
  const service = new ContourService(store);
  const server = createServer(service);
  // 默认端口 0：由系统分配空闲端口
  const listenPort = port ?? Number(process.env.PORT ?? 0);
  return new Promise((resolve) => {
    server.listen(listenPort, () => {
      const addr = server.address();
      const actual = typeof addr === 'object' && addr ? addr.port : listenPort;
      console.log(`等值线服务已启动: http://127.0.0.1:${actual}  数据目录: ${store.dbPath}`);
      resolve(actual);
    });
  });
}

if (require.main === module) {
  const portArg = process.argv.find((a) => a.startsWith('--port='));
  const port = portArg ? Number(portArg.split('=')[1]) : undefined;
  void startServer(port);
}
