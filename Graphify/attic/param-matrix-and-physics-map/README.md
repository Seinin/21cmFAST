# attic：参数矩阵 + 物理图谱（已从应用移除）

这两份东西**已经从应用、脚本与规格里移除**，只是留在这里兜底。它们的来源是早期"物理视角"的两次尝试：

| 名字 | 是什么 | 数据源 |
| --- | --- | --- |
| **参数矩阵**（`matrix`） | 15 个天体物理参数 × 9 个物理过程的格子表，格子里是角色（入公式 / 赋值 / 开关），列尾给支配参数 Top-3 | `src/generated/physics-graph.json`（由 `scripts/build-physics-graph.mjs` 从 atlas 文档 + 源码生成） |
| **物理图谱**（`physics`） | atlas 的 16 个阶段 → 71 个子过程 → 实现落点（文件 + 行区间）与论文出处，带四路检索 | `src/generated/physics-map.json`（由 `scripts/build-physics-map.mjs` 生成） |

## 为什么留底而不是直接删

`Graphify/` 在仓库里**没有被 git 跟踪**（`git status` 里是 `??`），所以删除不可逆。按用户的要求"删除矩阵和物理图谱的所有信息"，处理方式是**先挪进来再从应用里摘掉**——对使用者而言两个页面已经不存在了，但后悔了能捞回来。

## 恢复办法

### 1. 文件搬回原位（对照表）

| attic 里的位置 | 原位置 |
| --- | --- |
| `scripts/build-physics-graph.mjs`、`scripts/check-physics-graph.mjs` | `Graphify/scripts/` |
| `scripts/build-physics-map.mjs`、`scripts/check-physics-map.mjs` | `Graphify/scripts/` |
| `scripts/lib/physicsMapData.mjs` | `Graphify/scripts/lib/` |
| `src/lib/physicsMatrix.ts`、`src/lib/physicsMap.ts`、`src/lib/paramAliases.ts`、`src/lib/paramAliases.json` | `Graphify/src/lib/` |
| `src/components/MatrixView.tsx`、`MatrixCell.tsx`、`ProcessDetailSheet.tsx`、`PhysicsMapView.tsx`、`PhysicsMapDetail.tsx` | `Graphify/src/components/` |
| `src/generated/physics-graph.json`、`src/generated/physics-map.json` | `Graphify/src/generated/`（也可直接用生成脚本重跑出来） |
| `openspec/specs/graphify-physics-matrix/`、`graphify-physics-map/` | `openspec/specs/` |
| `openspec/changes/2026-09-28-graphify-physics-*/` | `openspec/changes/archive/` |

### 2. 恢复接线（当时都改在这几处）

- `src/components/TopBar.tsx`：`GraphView` 联合类型加回取值；`VIEWS` 加回条目（矩阵用 `Grid3x3`、物理图谱用 `Atom`）；分段控件当时按"多于一项才显示"渲染。
- `src/App.tsx`：`view` 初值读 `?view=matrix|physics`；`matrixStatus` / `physicsStatus` 两个上报状态；渲染分支 `view === 'matrix' ? <MatrixView .../> : view === 'physics' ? <PhysicsMapView .../> : <画布整行>`；`StatusBar` 的两个统计属性。
- `src/components/StatusBar.tsx`：`view` 的三值口径与 `matrix` / `physics` 两个属性与分支。
- `src/components/HelpDialog.tsx`：第三页的读法说明。
- `package.json`：`build:physics`、`check:physics`、`build:physics-map`、`check:physics-map` 四个脚本。
- `README.md` / `docs/DESIGN.md`：两页的功能行与说明段。

### 3. 真源与重跑

两份图谱的**真源一直没动**：`docs/notes/atlas/`（分层文档，L0–L4 + INDEX）与 `src/py21cmfast` 源码；`scripts/lib/atlasDocs.mjs`、`paramScan.mjs`、`pyInputs.mjs`、`sourceCitations.mjs` 这些公共解析库**也留在原位**（新的物理链图谱继续用它们）。所以即使不搬回文件，把 `build-physics-graph.mjs` / `build-physics-map.mjs` 从这儿复制出去、再补回 `package.json` 的脚本，就能重新生成那两份数据。
