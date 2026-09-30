# graphify-physics-matrix

## Why

工作台现在只有**工程视角**的图谱（`data/graph.json`：调度链、文件、函数、产物），它能回答"代码怎么串起来"，回答不了"**哪个天体物理参数在哪个物理过程里起作用、一个过程被哪些参数支配**"。要回答后者，需要一份**物理视角**的图谱：过程用物理语言（不能用函数名），参数取天体物理那两组，两者之间是"角色"关系。用户已明确边界：**新做一份图谱，现有工程视角图谱只读、一字不改**。

## What Changes

- 新增**物理视角图谱**：由脚本从 `docs/notes/atlas/` 分层文档与 `src/py21cmfast` 源码**生成**（不复制工程图谱），产物入库跟踪、形状沿用同一套 schema。
- 新增**参数 × 过程矩阵视图**：应用内第二个视图（顶栏可切、`?view=matrix` 可分享），行 = 15 个天体物理参数（按两个结构分带），列 = 物理过程（按主题分块），格 = 角色（入公式 / 赋值 / 开关）+ 出处，**空格 = 无关**；点格子看该过程的物理描述；行尾"管了 N 个过程"、列尾"支配参数 Top-3"。
- 新增生成与自检命令：`npm run build:physics`、`npm run check:physics`（幂等、锚点存在、出处合法、空行显式）。
- **BREAKING（对旧口径）**：参数归属不再用"工程图谱节点的 refs ±窗口"判定，改为按 atlas L3 计算单元「承担者」的函数体扫描——旧口径正是那四个天体参数（`F_STAR10` / `F_ESC10` / `HII_EFF_FACTOR` / `POP2_ION`）被误挂到"输出层"的原因。工程图谱本身不动，修正只落在新图谱里。
- 不变：画布视图、检查器、抽屉、工程图谱数据与它的生成器全部不动；不引入新依赖、不改服务端。

## Capabilities

### New Capabilities

- `graphify-physics-matrix`：物理视角图谱的生成口径（过程用物理语言、参数取两个结构、归属按计算单元函数体判定、幂等）与"参数 × 过程"矩阵视图的行为（分带行、分组列、角色格、空格即无关、过程详情、双向汇总），以及与工程视角图谱的只读边界。

### Modified Capabilities

（无：工程视角图谱与画布的行为一字不改；矩阵是新增视图，不改动任何既有要求。）

## Impact

- 新增：`scripts/build-physics-graph.mjs`、`scripts/check-physics-graph.mjs`、`scripts/lib/atlasDocs.mjs`、`scripts/lib/paramScan.mjs`、`src/generated/physics-graph.json`（生成物，入库）、`src/lib/physicsMatrix.ts`、`src/components/MatrixView.tsx`、`src/components/MatrixCell.tsx`、`src/components/ProcessDetailSheet.tsx`。
- 修改：`src/App.tsx`（视图切换 + `?view=matrix`）、`src/components/TopBar.tsx`（分段切换）、`package.json`（`build:physics` / `check:physics`）、`README.md`、`docs/DESIGN.md`。
- 只读：`data/graph.json` 与它的生成器、服务端全部代码。
