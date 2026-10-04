# 规则标量网格等值线提取与拼接后端

基于 TypeScript + Node.js + SQLite（`node:sqlite`，无原生编译依赖）的本地后端，
自行实现 Marching Squares 单元分类、边上线性插值交点与跨单元拼接。仅提供 HTTP API 与 CLI，
无图像界面，不调用任何现成等值线 / GIS 引擎。

## 环境要求

- Windows 本地，Node.js >= 22.5（使用内置 `node:sqlite`，开发环境为 Node 25）
- 不需要 Docker / WSL / 外部在线服务

## 快速开始

```powershell
npm install        # 仅安装 typescript 与 @types/node（开发依赖）
npm run build      # 编译到 dist/
npm test           # 构建并运行全部测试
npm start          # 启动 HTTP 服务（默认端口 0 = 自动选择空闲端口）
npm run demo       # 运行演示（斜坡开链 / 中心峰闭环 / 鞍点约定 / 越界空集合 / 历史回读）
```

数据目录默认为项目内 `data/`（可用环境变量 `CONTOUR_DATA_DIR` 覆盖），
SQLite 数据库文件为 `data/contour.db`，重启进程后历史记录仍可读取。

## 核心约定

- 数值定义在网格顶点，矩阵至少 2 行 2 列，行长度一致，全部为有限实数；
  `dx`、`dy` 必须为正有限实数，原点为有限实数。
- 角点编号：bit0=SW、bit1=SE、bit2=NE、bit3=NW（值严格大于阈值记为“高”）；
  边编号：0=底、1=右、2=顶、3=左。
- 网格边全局标识：水平边 `H:r:c`、垂直边 `V:r:c`。跨单元拼接只按边标识复用交点，
  不依赖浮点坐标字符串判断是否同一点。
- **鞍点约定**：四角交错（case 5 / 10）时按四角均值判定中心高低，
  均值恰好等于阈值时中心视为高；中心高则同号角经中心相通。
  这是本项目的确定性连接约定（规则版本 `marching-squares-v1`），
  不宣称实现完整的双线性拓扑判别。
- **阈值落在顶点上即拒绝**：任何网格顶点恰好等于阈值时，本次提取被拒绝并报告
  顶点行列号与物理坐标（错误码 `E_THRESHOLD_ON_VERTEX`，HTTP 422），
  不通过 epsilon 或移动阈值来消除歧义，原始矩阵与阈值各自保留。
- 闭环以最小边标识为固定起点并规范方向；开链首端边标识小于末端；
  折线按首边标识排序，相同输入多次运行结果完全一致。
- 每条折线记录：物理坐标点列、经过的网格边标识、关联单元、顶点数量与长度，来源可回查。

## HTTP API

默认监听 `PORT` 环境变量或 `--port` 指定的端口，缺省为 0（自动选择空闲端口），启动时打印实际端口。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/grids` | 导入网格 `{name, matrix, origin:{x,y}, spacing:{dx,dy}}` |
| GET | `/grids` / `/grids/:id` | 列出 / 查看网格 |
| POST | `/grids/:id/extractions` | 执行提取 `{threshold}`，保存结果快照 |
| GET | `/grids/:id/cell?r=&c=&threshold=` | 查询单元判定（case 编号、鞍点判定、边插值） |
| GET | `/grids/:id/compare?t1=&t2=` | 比较两个阈值的结果摘要 |
| GET | `/extractions?grid_id=` | 提取历史 |
| GET | `/extractions/:id` | 提取记录（含结果或失败诊断） |
| GET | `/extractions/:id/polylines.json` | 导出折线 JSON |

错误返回 `{code, message, details}`，错误码：
`E_VALIDATION`(400)、`E_THRESHOLD_ON_VERTEX`(422)、`E_NOT_FOUND`(404)、
`E_LIMIT_EXCEEDED`(413)、`E_INTERNAL`(500)。
失败的提取会以 `status="failed"` 保存诊断，绝不冒充成功的空结果。

## CLI

```powershell
node dist/src/cli.js serve [--port N]                  # 启动 API（默认自动选空闲端口）
node dist/src/cli.js import grid.json                  # 导入网格
node dist/src/cli.js grids                             # 列出网格
node dist/src/cli.js extract <gridId> <threshold>      # 提取并保存快照
node dist/src/cli.js extraction <id>                   # 查看提取记录
node dist/src/cli.js cell <gridId> <r> <c> <threshold> # 单元判定与边插值
node dist/src/cli.js export <extractionId> out.json    # 导出折线 JSON
node dist/src/cli.js history [gridId]                  # 提取历史
node dist/src/cli.js compare <gridId> <t1> <t2>        # 阈值比较摘要
```

## 限制

- 网格上限：1024 x 1024 顶点、100000 条折线（可在 `src/core/validate.ts` 的 `LIMITS` 调整）。
- 仅面向本地小规模精确计算，不做并行、不处理海量地形。
- 不含地理投影、地形填洼、河流计算；鞍点连接为确定性约定而非完整双线性判别。
- `node:sqlite` 在 Node 25 仍为实验特性（启动时有 ExperimentalWarning，不影响功能）。

## 目录结构

- `src/core/marchingSquares.ts` 单元分类、边交点插值、鞍点约定
- `src/core/stitch.ts` 按网格边标识拼接开链 / 闭环与规范化
- `src/core/extract.ts` 提取编排；`src/core/validate.ts` 参数校验与限制
- `src/service.ts` 业务逻辑；`src/db.ts` SQLite 持久化；`src/api.ts` HTTP；`src/cli.ts` CLI
- `test/` 十六种角点组合、手算交点、鞍点两种判定及相等约定、拼接性质、平移缩放等测试
- `demo/demo.ts` 演示脚本
