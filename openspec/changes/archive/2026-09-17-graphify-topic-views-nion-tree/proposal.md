## Why

Graphify 当前主图把 Nion 积分拆成 7 个并列分支（定义/被积函数/积分区间/积分引擎/MINI 变体/跳变修正/未决），这是「按实现位置分类」，不是自顶向下的物理分解——用户无法从「Nion 积分 = 两个乘子」出发逐层下钻；同时所有内容挤在一张画布上，未决口径混在正题里。

本次要把主图重建为「Nion 积分 → 两个乘子 → 物理量 → 关键子量」的四层多叉树（约 40 节点、零环、可逐层收纳），并引入 **topic（话题）= 图谱级视图** 让一张画布只承载一个话题，话题切换即整图替换。

## What Changes

- **话题模型**：节点新增 `topics: string[]` 多归属字段，`meta.topics` 保存话题注册表（`id/name/description`）；一个节点可同时属于多个话题，切换话题`不重建、不删除`节点。
- **顶栏话题选择**：TopBar 新增「话题」下拉，选中后整张画布只显示该话题内容，并显示各话题的节点数。
- **可见性过滤层**：`visible(t) = {n : t ∈ n.topics} ∪ ancestors(...)`——漏算祖先会让 compound 容器结构断裂；祖先作为上下文降透明度呈现。过滤与既有折叠机制正交、合并为一次 `cy.batch()`，因此**节点位置与折叠状态在切换后保留**。
- **详情页话题 chips**：Inspector 显示节点所属话题，点击可切换。
- **两层默认折叠**：初始折叠深度 = 1（打开即「根 + 两个乘子」共 3 个方块），「全部收起/全部展开」语义保持「只留顶层/全展开」不变。
- **主图重建**：根「Nion 积分」严格只有两个子节点——① 条件质量函数 `dn_c/dlnM(M|δ_R)` ② 单晕光子产出 `N_ion(M)`；每支再展开其所涉物理量，共 4 层约 40 节点；**主树话题 0 条边**（纯 parent 多叉树 ⇒ 结构上不可能成环），原有 19 条跨支语义改写进摘要。
- **未决内容改由话题承载**：不再出现 `type=question` 的节点（类型定义与图例保留，骨架视图仍在用），未决口径集中到 `pending`「待确认」话题，该话题有本话题自己的顶层根。
- **大纲格式 v2（BREAKING，仅影响生成器输入）**：`data/nion.outline.json` 由 `{meta, root, branches[], links[]}` 改为 `{meta, topics[], nodes[]}`（扁平节点 + `parent` + `topics`）——扁平是「一节点多话题」的前提。
- **生成器校验加严**：`scripts/build-nion-graph.mjs` 在既有「锚点零失配、fail-fast」之上新增单父、无环（DFS）、深度 ≤4、话题引用必须存在于注册表、话题闭包统计，并支持 `--topics` 预览某话题的可见集与顶层方块数。
- **向后兼容**：`topics` 缺省为空数组 ⇒ 旧图与 `build-skeleton.mjs` 产物视为「不做话题过滤」，仍可正常打开。

## Capabilities

### New Capabilities

- `graphify-topic-views`: 话题（图谱级视图）的注册表、节点多归属、顶栏切换、可见性过滤（成员 ∪ 祖先闭包）、详情页话题展示、旧图兼容与「切换不丢位置/折叠态」的行为要求
- `graphify-tree-authoring`: 自顶向下多叉树大纲 v2 的编写与生成校验（单父、无环、深度上限、话题闭包、锚点零失配、fail-fast），以及逐层收纳与默认折叠深度的行为要求

### Modified Capabilities

（无：`openspec/specs/` 下现有三个能力均为 FDM 物理建模，本次不改变其需求）

## Impact

- **数据**：`Graphify/data/nion.outline.json`（格式 v2，重写）、`Graphify/data/nion-draft.json`（生成产物）、`Graphify/data/graph.json`（`--replace` 覆盖，覆盖前自动快照到 `data/history/`，现有 29 份可回滚）
- **服务端**：`Graphify/server/lib/schema.mjs`（`nodeSchema` 新增 `topics`；`graphSchema.meta` 新增话题注册表并校验 id 存在于注册表）；`store.mjs` / `mergeDraft.mjs` 走既有字段透传
- **前端**：`src/lib/types.ts`（含 `cloneGraph` 深拷贝新字段——漏拷会导致保存丢数据）、`src/state/graphStore.ts`（`activeTopicId`，视图状态不入 undo 栈）、`src/App.tsx`（可见集 `useMemo` 与下传）、`src/components/TopBar.tsx`、`src/components/GraphCanvas.tsx`、`src/components/Inspector.tsx`、`src/graph/cytoscapeSetup.ts`
- **脚本**：`scripts/build-nion-graph.mjs`
- **文档**：`docs/DIRECTORY.md` §8.1（改写）与 §7（变更记录）
- **不受影响**：markdown 阅读器与 LaTeX 管线、fcose 布局参数、store 快照逻辑、`docs/notes/` 正文、C 源码与 Python 侧代码
