## Why

物理链页左栏目前只有**一个**检索面（参数词条），而要的第二面——**天体物理过程**——在生成物里已经不存在：`graphify-chain-code-modules` 把一级的划分依据从「天体物理过程（**按论文等式打包**）」换成了「代码模块（`.c` + `Compute*` + 输出盒子）」，于是 `Lyα 耦合` / `气体热史` / `自旋温度` 被并成一块 `M8 气体热与自旋温度`，过程这一层随之从生成物里消失（旧稿只留在 `chain.json.bak-20260930`）。

用户点名要的正是这一层——`Lyα 耦合`、`UV 电离`、`X 射线`。这些过程的共性是**用外部论文的拟合律或物理公式**（复合系数 Abel 1997 / Spitzer 1978、平均自由程 fit from Songaila+2010、UV 光度函数 Sun & Furlanetto 2016、自旋温度盒 Meiksin+2021 等），所以它们天然与参数面互为查找——这正是「检索矩阵」的第二条轴。

同时，左栏那个跨分组的「N 个代码类」总计数徽标**不在任何 spec 要求里**（spec 只要求分组与词条各自给出条数），用户明确不需要它。

## What Changes

- 左栏顶部改成**两个并排的检索面**：「参数」（现有参数词条）与「**天体物理过程**」（新）。默认仍打开参数面，行为与现状一致。
- 过程面词条：一条 = 一个天体物理过程（共 8 条，**逐条转录自旧稿** `chain.json.bak-20260930` 的 `blocks.items` 里 `kind: process` 的那批）；每行给出过程名、它下辖的量数、它用到的论文出处数。
- **互为矩阵**：点中一个过程 → 本页定位到它的主块并选中（复用既有定位与选中），并点亮参数面里与它相关的参数（由成员量反查，复用既有的「参数 × 节点矩阵」，**不另造归属表**）；反之在参数面点中一个参数 → 过程面点亮读了它的过程。
- **兜底小节**（常驻、默认收起、写明「不是过程」）：两条「带」（`环境与给定` / `观测量`）+ 旧划分覆盖不到的量（`matter_power` / `vcb` / `perturb_field` / `filtered_xray`）。
- 真源新增 `processes`（过程名 + 成员 id + 主块 + 论文出处口径），生成器原样烘进 `physics-chain.json`；自检**钉住「不重不漏」**（每个量与驱动量恰好属于一个过程或一条带）。
- **REMOVED**：左栏「N 个代码类」总计数徽标。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graphify-physics-chain`: 新增四条要求（左栏并排两个检索面 / 过程清单的单一真源 / 过程与参数互为矩阵 / 兜底小节）与过程清单的「不重不漏」自检断言。一级划分口径、检索四路、状态条口径均**不改**；`graphify-chain-param-sidebar` 正在改的「本页检索与来源标注」本变更**不重复修改**（避免两份 MODIFIED delta 打架）。

## Impact

- 真源：`docs/notes/physics-chain/chain.json`（新增 `processes`）
- 生成器 / 自检：`Graphify/scripts/build-physics-chain.mjs`、`Graphify/scripts/check-physics-chain.mjs`
- 生成物：`Graphify/src/generated/physics-chain.json`
- 视图：`Graphify/src/components/ChainSearchPanel.tsx`（页签、删徽标、过程词条）、`Graphify/src/lib/physicsChain.ts`（过程清单读取与矩阵反查）、`Graphify/src/components/PhysicsChainView.tsx`
- 依赖：**无新增**（不动 Python / C）；依赖 `graphify-chain-param-sidebar`（in-progress，13/14）先归档，否则「参数面」在 spec 里无依据
- 与 `graphify-chain-code-modules`（in-progress，27/31）**不冲突**：一级划分不动，本变更只加一条平行的检索轴
