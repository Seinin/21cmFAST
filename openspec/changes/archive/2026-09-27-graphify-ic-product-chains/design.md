## Context

现状（已逐处核对）：

- IC 子图 = 3 个 `group` 容器 + 13 个步骤节点（共 16 个 `ic:*`），22 条 IC 内部边；成员表的唯一来源是 `scripts/lib/ic-blocks.mjs`，被 5 个脚本共用（`check-canvas` / `import-atlas-graph` / `reset-atlas-nodes` / `restructure-initial-conditions-blocks` / `restructure-tabs`）。
- `check-canvas.mjs` 里硬编码了「三块框内共 13 个步骤」；`restructure-tabs.mjs` 会删掉除 `ic:art-inputs` 外的 `ic:art-*`，并断言产物名只出现在**边标签**里；`import-atlas-graph.mjs` 的第二步会先删同名块再重建三个块，但**不重建 IC 内部关系**。
- 服务端 `server/lib/mergeDraft.mjs` 的导入合并**先按 id、再按 label** 去重（`:83/:106-109`）——这是一条与"同名重复份"直接相关的既有行为。

**C 端事实（`src/py21cmfast/src/InitialConditions.c`，`ComputeInitialConditions` :547–:776）**：

| 事实 | 位置 |
| :-- | :-- |
| `HIRES_box_saved` 是**完整 δ_k** 的副本（抽样 + 共轭修正之后、反变换之前） | `:667-669`（常规分支）；外部密度分支在 `:660-665` |
| 反变换只改工作盒 `HIRES_box`，不动 `HIRES_box_saved` | `:673-675` |
| 尾段前先把 δ_k 拷回工作盒 | `:699 memcpy(HIRES_box, HIRES_box_saved, …)` |
| ⑥ 低分辨密度：滤波（仅 `DIM!=HII_DIM`）→ 反变换 → 采样 | `:702-703` / `:710` / `:715-732` |
| ⑦ ZA 速度：读 `box_saved` 求梯度 → 可选滤波（仅 `!PERTURB_ON_HIGH_RES`）→ 反变换 → 采样 | `:740`；函数 `:299-364`（读 `:327`，滤波 `:332`，反变换 `:339`） |
| ⑧ vcb：读 `box_saved` → 自适应滤波 → 反变换 → 采样累加平方 | `:735`；函数 `:141-238`（读 `:188`，滤波 `:198`，反变换 `:205`） |
| ⑨ 2LPT：从 `box_saved` 起算 φ₁/φ₂ → 求梯度 → 反变换 → 采样，**并把 φ₂ 写回 `box_saved`** | `:752`；函数 `:366-544`（`:425/:455`、覆写 `:507`） |
| 条件：⑦ 由 `PERTURB_ON_HIGH_RES` 决定落在高/低分辨 | `:585`（指针绑定）、`:310`、`:330` |
| 条件：⑧ 由 `USE_RELATIVE_VELOCITIES` | `:734` |
| 条件：⑨ 由 `PERTURB_ALGORITHM == 2` | `:751` |
| 资源：种子池 / 两个 k 空间工作盒 / 功率谱表 / FFTW 计划 | 创建 `:572` / `:608,:610` / `:619` / 首个变换 `:673`；释放 `:770` / `:765,:766` / `:768` / `:760-762` |

**结论**：四条尾段（⑥⑦⑧⑨）全部从**完整 δ_k** 派生、各自自带滤波与反变换；`实空间化`（`dft_c2r`）只是 δ_hires 这一条产物的生产者。**真正的分歧点在 ④（共轭修正给出完整 δ_k）**，不在 ⑤。

## Goals / Non-Goals

**Goals:**

- 进子图看到的是**几条各自自足的产物链**，而不是"一个大块里四个尾段抢同一个前缀"。
- `实空间化` 不再是 4 条出边的枢纽（每份最多 2 条）。
- 依赖按**代码事实**修正（δ_k 的出处、vcb 的输入、清理入边的资源语义）。
- 定义仍是单一来源，5 个消费脚本与断言、README 同步。

**Non-Goals:**

- 不标条件虚线（`conditional`）——`PERTURB_ON_HIGH_RES` / `USE_RELATIVE_VELOCITIES` / `PERTURB_ALGORITHM` 的条件表达是另一件事，一次只改一种语义。
- 不动主图、其它子图、话题/标签机制；不新增节点字段、不改前端与服务端。
- 不给 vcb 单独画一条 `②ps → vcb` 直连边：链内的前缀（自己的 ③④）已经承载对 ② 的依赖，旧图那条是重复表达。
- 不修 `scripts/build-initial-conditions-graph.mjs` 里那条陈旧定义（`ic:art-saved` 被记成实空间化的产物、真凶是 ④），它已不参与当前数据的生成；只在 design 里记一笔。

## Decisions

**D1：链的起点定在 ④（完整 δ_k），而不是 ⑤。**
依 `:667-669`/`:699`/`:327`/`:188`/`:425`。旧图把 `HIRES_box_saved` 记成实空间化的产物，导致 vcb 被接在 ⑤ 上——那是错的，本次一并改对。

**D2：三条链各带自己的 ③④，共 4 个重复份。**
密度链保留原 id（`ic:proc-sample` / `ic:proc-conj`），速度链与 vcb 链各用 `ic:vel:*` / `ic:vcb:*` 前缀副本。这样"原 id 上的文档与源码引用"零 churn，重复份只复制字段（label / summary / refs / type / tags / conditional / note 逐字相同，只有 `id` / `parent` / `position` 不同）。

**D3：收尾入边只接"首次出现的那一份"。**
资源只被创建一次，因此清理的 4 条入边仍接 `ic:proc-seed`（种子池）、`ic:proc-ps`（功率谱表）、密度链的 `ic:proc-sample`（两个 k 空间工作盒）、密度链的 `ic:proc-realize`（FFTW 计划缓存）——前两条保持原样，后两条**把标签从数据口径改成资源口径**（旧标签 `δ_k（半空间）` / `HIRES_box_saved` 描述的是数据流，不是被释放的资源）。接成"每条链各一条"会让清理节点又变成多入边枢纽。

**D4：定义文件改名 `ic-blocks.mjs` → `ic-chains.mjs`，导出形状保持不变**（`ICS` / `LEGACY_IC_FRAME` / `IC_BLOCKS` / `IC_BLOCK_IDS` / `IC_MEMBER_BLOCK`），另加 `IC_RETIRED_BLOCK_IDS`、`IC_DUPLICATES`、`IC_CHAIN_EDGES`、`layoutIcChains()`、`applyIcChains()`。5 个消费脚本共用同一份成员表是上一轮刻意建立的约定，本次不改这个结构。

**D5：删除 `restructure-initial-conditions-blocks.mjs`。**
它的目标形状（三块）已被取代，留着就是"再跑一次把结构改回去"的地雷；它那套尺寸估计与网格排位（与 `src/graph/pack.ts` 同口径）搬进 `ic-chains.mjs`，由迁移脚本与 `import-atlas-graph.mjs` 共用。历史记录留在归档变更里。

**D6：坐标在 `ic-chains.mjs` 里统一算。**
五块竖排（块间距大于块内间距）、块内按列折行（>7 列折 4 列）、整块纵向居中。**坐标必须互不相同**——渲染器会把"一批共享同一坐标的节点"判为占位数据并触发 `.enter` 过渡（`check-canvas.mjs:57-60` 有记录），自检读到的是过渡中间值。

**D7：重复份不引入新概念。**
没有新字段、没有新类型，`mergeDraft` 的 label 去重不受影响：重复份只在"直接写盘"的迁移路径产生，导入路径不会产出同名节点；若将来有草案携带同标签节点，那双份本来就会按既有规则合并——这是既有行为，本次不碰（`check-canvas` 会加一条"重复份 id 唯一、label 逐字一致"的断言把当前形态钉住）。

## Risks / Trade-offs

- [硬编码 13] `check-canvas.mjs:416` 写死「三块框内共 13 个步骤」→ 断言块整体重写为链口径，否则必然失败。
- [同名 label 与导入去重] 见 D7；只走直接写盘，不经 `POST /api/graph/import`。
- [误伤其它结构] `restructure-tabs.mjs` 会删 `ic:art-*`（除 `art-inputs`）并断言产物名只在边标签里——本方案天然满足（产物仍写在边标签上、不新增产物节点）。
- [坐标重叠] 走 D6 的统一排位，且断言里加一条"五个框的模型包围盒互不重叠"。
- [既有断言过严] 原脚本有"`ic:*` 与成员表精确一一对应"的断言，拆链后成员集合包含重复份，断言口径要跟着改成"成员表 ∪ 重复份 = 图上 `ic:*`"。

## Migration Plan

1. 立项 + 写 `ic-chains.mjs`（五块成员表 / 重复份映射 / 关系计划 / 排位 / `applyIcChains`）。
2. 迁移脚本 `restructure-ic-product-chains.mjs`：dry-run 默认可核对（打印五块成员与新旧计数）→ `--apply` 写回（写前备份 `data/graph.before-ic-chains.json` + 原子写 + `tryParseGraph` 断言）；幂等（已是目标形状就退出）。
3. 脚本面同步：`import-atlas-graph.mjs` 改调 `applyIcChains`、`restructure-tabs.mjs` / `reset-atlas-nodes.mjs` 改引用路径、删除 `restructure-initial-conditions-blocks.mjs`、`ic-blocks.mjs` 删除。
4. 断言与文档：`check-canvas.mjs` 的 IC 块重写；`README.md` 五处；`docs/notes/INITIAL_CONDITIONS.md` 只在真有"三块"提法时改。
5. 验证：`npx tsc -b`、`npm run lint`、`timeout 150 npm run check:canvas`、`npm run check:styles`、`npm run check:code` + Windows 侧无头 Edge 探针（`?g=atlas:fig1:prep:ics`，断言五框与"实空间化最多两条出边"）。
6. 归档并内联同步 `graphify-code-topology`。

回滚：`data/graph.before-ic-chains.json` + 服务端快照；脚本可重复运行（幂等）。
