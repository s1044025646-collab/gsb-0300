# 规则标量网格等值线提取与拼接后端

纯本地后端（仅 API 与 CLI），使用 TypeScript + Node.js + SQLite（`node:sqlite`，无原生依赖、无外部服务）。
对规则二维标量网格执行 Marching Squares 等值线提取，输出物理坐标下的开放折线与闭合环。

## 核心约定

- 数值定义在网格**顶点**，矩阵至少 2 行 2 列，`dx`/`dy` 为正有限实数，只处理有限实数。
- 原始矩阵与阈值各自保留，**不修改输入高程**来消除歧义。
- 单元分类按四角与阈值的高低关系（严格大于为高）生成局部线段，边上位置采用线性插值。
- 共享边交点通过**网格边标识**（`H:列:行` / `V:列:行`）复用，不靠浮点坐标字符串猜测。
- 鞍点（四角交错）固定采用**四角均值判定中心高低**，连接使中心区域与同号角相通的线段；
  **均值恰好等于阈值时中心视为高**。这是本项目的确定性连接约定（规则版本 `msq-mean-v1`），
  不宣称实现完整的双线性拓扑判别。
- 任何网格顶点**恰好等于阈值**时明确拒绝该次提取并指出坐标（错误码 `VALUE_EQUALS_THRESHOLD`），
  不偷偷加 epsilon 或移动阈值。
- 闭环采用固定起点与方向规范化，开放链有稳定排序，相同输入多次运行结果一致。
- 每条折线记录关联单元、顶点数量、长度与每顶点的网格边标识，来源可回查。

## 环境要求

- Windows 本地，Node.js ≥ 22.5（推荐 ≥ 24，使用内置 `node:sqlite`），无需 Docker / WSL / 外部 API。

## 常用命令

```powershell
npm install        # 安装开发依赖（typescript、@types/node）
npm run build      # 编译到 dist/
npm test           # 构建并运行全部测试
npm start          # 启动 HTTP 服务（默认自动选择空闲端口）
npm run demo       # 运行内置演示（斜坡/中心峰/鞍点/阈值越界/比较/重启读取）
```

## CLI

```powershell
node dist/src/cli.js serve [--port=N]                  # 启动服务，默认端口 0 = 自动选空闲端口
node dist/src/cli.js import grid.json [--name=名称]    # 导入网格
node dist/src/cli.js extract <gridId> <threshold>      # 执行提取
node dist/src/cli.js cell <gridId> <col> <row> <threshold>  # 查询单元判定与边插值
node dist/src/cli.js export <extractionId> [out.json]  # 导出折线 JSON
node dist/src/cli.js history [gridId]                  # 提取历史
node dist/src/cli.js compare <gridId> <t1> <t2>        # 比较两个阈值的结果摘要
node dist/src/cli.js demo                              # 内置演示
```

网格 JSON 格式：

```json
{ "rows": 3, "cols": 3, "x0": 0, "y0": 0, "dx": 1, "dy": 1,
  "values": [[0, 1, 2], [0, 1, 2], [0, 1, 2]] }
```

`values[row][col]` 为顶点 `(col, row)` 处的值，物理坐标 `x = x0 + col*dx`，`y = y0 + row*dy`。

## HTTP API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| POST | `/api/grids` | 导入网格，请求体即网格 JSON（可带 `name`） |
| GET | `/api/grids` | 网格列表 |
| GET | `/api/grids/:id` | 网格详情（含矩阵） |
| POST | `/api/grids/:id/extractions` | 执行提取，体 `{ "threshold": 0.5 }` |
| GET | `/api/grids/:id/extractions` | 该网格的提取历史 |
| GET | `/api/grids/:id/cell?col=&row=&threshold=` | 单元判定与边插值细节 |
| GET | `/api/grids/:id/compare?t1=&t2=` | 两个阈值的结果摘要比较 |
| GET | `/api/extractions` / `/api/extractions/:id` | 提取记录 / 折线结果 |

错误响应统一为 `{ "error": { "code", "message", "details?" } }`。

## 错误码

- `INVALID_DIMENSIONS` 行/列不是整数或小于 2
- `RAGGED_MATRIX` 矩阵行数或行长度不一致
- `NON_FINITE_VALUE` 存在非有限值（NaN/Infinity）
- `INVALID_ORIGIN` / `INVALID_SPACING` 原点非有限 / 间距非正有限数
- `INVALID_THRESHOLD` 阈值非有限实数
- `VALUE_EQUALS_THRESHOLD` 顶点恰好等于阈值（`details.vertices` 列出坐标）
- `LIMIT_EXCEEDED` 网格顶点数或折线数超上限
- `NOT_FOUND` / `BAD_REQUEST` / `INTERNAL`

## 数据与配置

- 数据目录：环境变量 `CONTOUR_DATA_DIR`，默认项目内 `./data`，数据库文件 `contours.db`。
- SQLite 保存网格版本（矩阵快照）、阈值、规则版本与结果快照；
  失败诊断以 `status='failed'` 保存（`result_json` 为 NULL），不会冒充成功的空结果。
- 上限（可用环境变量调整）：`CONTOUR_MAX_VERTICES`（默认 1,000,000）、`CONTOUR_MAX_POLYLINES`（默认 100,000）。
- 端口：`--port=N` 或环境变量 `PORT`，默认 0（操作系统分配空闲端口）。

## 测试覆盖

- 十六种角点高低组合的单元分类与局部线段
- 非单位间距下的边插值（手算坐标核对）
- 鞍点两种中心判定及均值等于阈值时的约定
- 手算边交点检查物理坐标（非快照对比）
- 内部交点位于共享边、边界交点为开链端点、无重复线段与零长段
- 平移缩放后的坐标关系、确定性重跑
- 阈值越界返回空集合、顶点等于阈值拒绝
- SQLite 持久化：修改阈值产生新报告、重启后读取旧网格与拼接解释、失败诊断不冒充成功

## 限制

- 仅本地小规模精确计算，不做并行、不处理海量地形。
- 不含地理投影、地形填洼、河流计算与图像界面。
- 鞍点采用固定均值约定，非完整双线性拓扑判别。
