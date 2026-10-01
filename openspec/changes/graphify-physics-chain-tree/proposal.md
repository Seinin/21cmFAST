> **状态：已被取代（2026-09-30）** —— 本 change 要解决的病（一级分组用代码阶段 S07/S08/S12… 分类，回答不了"这个量属于哪个天体物理过程"）仍然成立，下面的论证因此保留；但**口径已换**：一级不再按"天体物理过程"打包成 8 个过程块 + 2 条带，而是**一个块 = 一个代码模块（`.c` 主体）**，外加 L0 常数与网格层 / L1 共享内核层两个横切层。新口径、以及配套的代码锚与自检，见 change `graphify-chain-code-modules`（本 change 不再实施）。
>
> 顺带说明"被取代"的判据：本 change 的"块"由人按物理过程手写分组，新口径的"块"由模块边界给出（`blocks.items[].codeAnchor` 指向真实文件与函数，自检逐条核对），所以"块 = 什么"从一段散文变成了一句可证伪的断言。

## Why

物理图谱页（第三页）的一级分组用的是 `docs/notes/atlas/L1-stages.md` 的**代码阶段**分类（S07 / S08 / S12 / S13 / S14 / S15，加旁路 S04），以 7 个 `stage:S*` 复合框呈现。该分类回答"这段代码归谁管"，回答不了"这个量属于哪个天体物理过程"。

使用者真正要的口径是**天体物理过程**：一个过程（电离史、气体热史、Lyα 耦合…）由若干物理量按等式串起来，是一个能独立读懂的整体。实测两种"分组"都会把过程拆散：

- 按代码阶段装框：⑤气体热史（`L_X` / `ε_heat` / `T_K`）被拆到 S14 与外部，横跨多个阶段框；
- 按节点深度分层：层 2 会同时混进 4 个不同过程的量（④电离史 / ⑤气体热史 / ⑥Lyα / ⑦自旋温度），层 4 会把 `dn/dM`（①晕统计）与 `标度关系`（③星系形成）并到一起。

本次改为：**一个天体物理过程 = 一个块**。主图只有 10 个块节点，块与块之间只画"跨块接口"（流过去的量写在边标签上）；块内部的结构放进**子图标签页**（沿用既有的子图导航机制）。分档（上中下）只作视觉分档，不携带逻辑含义——逻辑一律靠边表达。

## What Changes

- **主图 = 10 个块**：8 个天体物理过程块（①晕质量函数 ②晕质量阈值 ③星系形成与源项 ④电离史 ⑤气体热史 ⑥Lyα 耦合 ⑦自旋温度 ⑧亮温方程）+ ⓪环境/给定带 + ⑨观测量带。块内成员恰为全部 24 个物理节点，**每个节点只属于一个块**，无遗漏、无重复。
- **块间只画接口**：主图的边 = 跨块边 24 条，标签写明跨界流动的量（如 `①→③ dn/dM(M,z)`、`④→⑤ Q_HII`）。块内边 10 条不在主图画，进子图才画。
- **子图 = 过程展开**：8 个过程块各一个标签页，内容 = 成员量 + 块内边（内部推导链）+ 外部输入以灰显"上下文"出现（只在主图算节点）。⓪与⑨内部各有 3 个连通分量（互相不相连），是"带"不是"过程"，MUST NOT 可进入。
- **BREAKING**：删除 7 个 `stage:S*` 阶段框（`type: group`），阶段号（S07、S08…）降级为节点属性；`Graphify/scripts/lib/physicsStages.mjs` 的"按阶段分层"退场。
- **BREAKING**：原「旁路与实现细节」两类对象按物理归属归位——`phi_uv` / `tau_e` → ⑨观测量、`source_grid` → ③、`hmf_impl` → ①，它们都成为块的成员；一级不再有"默认收起的一层"，底部折叠条随之退场（"证据（代码/文献）默认收起"这条纪律保留）。
- **补齐两条缺失边**：`k_target → p21`、`hmf_impl → dn_dm` 在数据里不存在（各自的两个端点成了零边孤立节点，`crossLevel.levels` 给的是 0）。不补则 ⓪→⑨、①内部都不连通。
- **分档只是美术**：主图的档位由真源按因果层级手写（生成器只搬），只决定 y 坐标；页面 MUST NOT 用档位做筛选、隐藏或任何语义判断，24 条接口边全部照画（实测全部自下而上，无需处理回边）。
- 21 个 `step:S*` 实现步骤（`method`）不是物理量，MUST NOT 进入主图，仍由所属量的子图 / 属性页承载。
- 共用渲染层（`GraphCanvas` 等）的 compound 机制保留（画布页仍在用），但物理链页 MUST NOT 再产生 compound 实例。

## Capabilities

### Modified Capabilities

- `graphify-physics-chain`：核心改动。「一级只呈现物理主链」改写为「一级是十个过程块」，划分依据从"阶段名单"改为"块声明"；「旁路与实现细节默认收起且一键可达」REMOVED（对象已归入块）。新增：块的划分与成员纪律（含"不得有零边物理节点"）、块间只画接口、可进入的块 = 内部连通的过程、子图 = 过程展开（外部输入灰显）、分档只是视觉。
- `graphify-subgraph-tabs`：「进入子图的入口」的"可进入"判据增加一条数据侧开关——生成物把节点标为不可进入时（`enterable: false`），双击与属性页入口 MUST NOT 导航。缺省行为不变（有子节点的非容器节点可进入）。

## Impact

- 真源与生成物：`docs/notes/physics-chain/chain.json` 增 `blocks` 段（10 个块 + 成员 id）并补两条缺边 → `Graphify/scripts/build-physics-chain.mjs` → `Graphify/src/generated/physics-chain.json`（新增 `graph.blocks`；`graph.nodes` 里 24 个物理节点的 `parent` 从 `stage:*` 改指向 `block:*`；块节点坐标按档位算出）。
- 退场：`Graphify/scripts/lib/physicsStages.mjs`（阶段分层口径）、`graph.nodes` 里 7 个 `stage:S*`、`physics-chain.json` 里的阶段框相关字段；`Graphify/scripts/check-physics-chain.mjs` 的阶段断言改写为块断言（成员覆盖率、块内连通性、块间边数、零边节点）。
- 前端：`Graphify/src/components/PhysicsChainView.tsx`（主图口径、图例、折叠条退场）、`Graphify/src/lib/physicsChain.ts`（块读取与检索/状态条口径）、`Graphify/src/graph/styles.ts` 或 `palette.ts`（`process` 种类的画布样式）。
- 不新增第三方依赖；不改动 `Graphify/data/graph.json`（画布 atlas 数据）与画布页行为。
- 文档：`docs/notes/graphify/` 与 `docs/DIRECTORY.md` 补记本次口径转换（"按代码阶段分层" → "按天体物理过程打包 + 子图"）。
