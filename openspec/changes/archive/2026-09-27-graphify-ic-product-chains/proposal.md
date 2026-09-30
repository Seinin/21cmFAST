## Why

进入 `compute_initial_conditions` 的子图时，现在是三块骨架（初始加载 / 核心计算 / 产物与收尾），中间的「核心计算」把**四个产物的尾段与它们共用的前缀画在同一块里**：`实空间化` 那一步因此挂了 4 条出边（→ 低分辨 / 一阶速度 / 相对速度 / 二阶修正），读图时要顺着同一堆箭头来回找。用户要求把「各个产物的链条拆开」，共用的核心步骤**不要写在一起**，而是分成几个容器各自写。

核实过程中还发现一处**事实错误**要顺手改对：`HIRES_box_saved` 是**完整 δ_k**（`InitialConditions.c:667-669`，抽样 + 共轭之后、反变换之前；或外部密度正向变换 `:665`），四条尾段 ⑥⑦⑧⑨ 全部由它派生、各自再做滤波 / 反变换 / 采样。旧图把它记成「实空间化」的产物，于是边也接错了（vcb 被接在实空间化上）。本次按代码事实把链的起点定在「共轭修正给出完整 δ_k」这一步。

## What Changes

- **五块容器**：`前置（输入 · 种子 · 功率谱）`、`密度链（高分辨密度 · 低分辨密度）`、`速度链（一阶 ZA · 二阶 2LPT）`、`vcb 链（重子-暗物质相对速度）`、`产物与收尾（交付下游 · 资源回收）`。旧容器 `ic:g-core` 撤掉。
- **链内自足**：抽样③、共轭④ 在**速度链与 vcb 链里各有一份同名副本**（同一标签、同一源码引用，靠容器区分）；密度链保留原来的四个 id，因此文档与引用 churn 最小。⑨（2LPT）会覆写 δ_k，所以排在本链末尾。
- **边按代码事实重写**：分歧点在 ④（完整 δ_k）而不是 ⑤；`实空间化` 最多两条出边。清理的入边**只接首次出现的那一份**（前置的种子与功率谱、密度链的抽样与实空间化），保持「资源只被创建一次」的语义；这两条的标签也从"数据"改成"资源"（两个 k 空间工作盒 / FFTW 计划缓存）。
- **定义文件改名**：`scripts/lib/ic-blocks.mjs` → `scripts/lib/ic-chains.mjs`，导出形状不变，另加**重复份映射**与**关系计划 + `applyIcChains()` 构造器**（迁移脚本与 `import-atlas-graph.mjs` 共用，避免重建主图时回到旧形状）。
- **规则**：`graphify-code-topology` 加一条要求，把「主图里同一计算单元只建一个节点」与「剖分图内部可以按产物链重复展示份」的边界写死（否则下一个人会当成漏合并）。
- **产物仍然写在边标签上**（`δ_hires` / `δ_lowres` / `ZA 速度 vx·vy·vz` / `lowres_vcb` / `2LPT 速度`），不新增产物节点。
- **不做**：条件参数（`PERTURB_ON_HIGH_RES` / `USE_RELATIVE_VELOCITIES` / `PERTURB_ALGORITHM==2`）这次不标 `conditional` 虚线——那是另一件事，避免一次改动里混两种语义。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graphify-code-topology`: 新增「剖分图内部的展示份可按产物链重复」——数据实体（同一个计算单元）仍只建一个节点、跨阶段口径不变；但**进入某个模块的子图后**，为了把每条产物链画成自足的容器，允许同一步骤在需要它的链里各有一份展示，前提是标签与源码引用与本体一致、且必须落在容器内可区分。

## Impact

- **数据**：`data/graph.json` 由迁移脚本改写——`ic:` 节点 16 → 22（+3 新容器 −1 旧容器 +4 重复份），IC 内部关系 22 → 26 条；`atlas:*` 一个都不动。
- **脚本**：`scripts/lib/ic-chains.mjs`（由 `ic-blocks.mjs` 改名重写）、`scripts/restructure-ic-product-chains.mjs`（新增迁移脚本）、`scripts/restructure-initial-conditions-blocks.mjs`（删除，它的目标形状已被取代）、`check-canvas.mjs`（IC 断言块从"三块"重写为"链"）、`import-atlas-graph.mjs`（改调 `applyIcChains`）、`restructure-tabs.mjs` / `reset-atlas-nodes.mjs`（改 import 路径与注释）。
- **文档**：`README.md` 五处提法（容器举例 / 剖分图框举例 / 两个脚本的说明 / "三块骨架"整段）；`docs/notes/INITIAL_CONDITIONS.md` 的扇形图本就与新结构一致，仅在确有"三块"提法时同步。
- **前端与服务端**：零改动（不新增字段、不改 schema），数据改完刷新页面即可见。
