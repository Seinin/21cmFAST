## Why

进入 `compute_initial_conditions` 的子图，看到的只是一个把 13 个步骤全兜住的容器「初始条件（S09）」——和父图里"框内联展开"看到的一模一样：**这一层没有给出任何分解信息**。它同时违反既有两条要求：`graphify-code-topology` 的「递归同构的分层口径」（每层要先给骨架，不能"某一层突然变成平铺的清单"）与「不等深的三至五层 / Scenario: 无填充节点」（只有单个子节点的层级不得是不承载分解信息的空壳）。

（顺带一个失效的理由：该框自己的摘要写的是"收进一个大框，一级视图才不会被它铺满"，但它挂在模块内部、从不进一级视图。）

## What Changes

- **删除** `atlas:ic-frame`（「初始条件（S09）」容器）。
- **新增三个装饰容器**（`group`）直接挂在 `atlas:fig1:prep:ics`（`compute_initial_conditions`）下，成为该模块的三块骨架：
  - 「初始加载（参数 · 种子 · 功率谱）」← `ic:art-inputs`、`ic:proc-seed`、`ic:proc-ps`
  - 「核心计算（密度场 · 低分辨场 · 速度场）」← `ic:proc-sample`、`ic:proc-conj`、`ic:proc-realize`、`ic:proc-lowres`、`ic:proc-v1`、`ic:proc-vcb`、`ic:proc-2lpt-phi`、`ic:proc-2lpt-v`
  - 「产物与收尾（交付下游 · 资源回收）」← `ic:proc-cleanup`、`ic:proc-downstream`
- **13 个 `ic:*` 节点的 `parent` 重挂**到对应分组框；**节点内容、框内 21 条关系、产物写在边标签上、容器不参与关系**全部不变。全图节点 57 → 59（删 1 增 3），关系 54 不变。
- **归属断言改写（不是删除）**：`scripts/restructure-tabs.mjs` 的 `expectChildren(IC_FRAME, 13)` 与"`ic:*` 应全部在 S09 框里"改为「三块成员集合精确相等」+「`ic:*` 全部落在 `atlas:fig1:prep:ics` 子树内」，强度不降低。
- **工具链同步**：`restructure-tabs.mjs`（常量 / 断言 / 布局段）、`reset-atlas-nodes.mjs`（保留名单）、`import-atlas-graph.mjs`（回退值）——三处都还写着 `atlas:ic-frame`，重跑会把这层结构压回旧形状。
- **追溯补齐**：`docs/notes/INITIAL_CONDITIONS.md` 的 §8 追溯表补「三块 ↔ atlas S09.1–S09.5」对照；`Graphify/README.md` 的子图一节补这条口径。

## Capabilities

### New Capabilities

（无：本次是纯结构修正 + 工具链同步，不引入新的行为契约。）

### Modified Capabilities

（无：不改数据模型、接口与画布行为；本次只是让数据满足 `graphify-code-topology` 里**既有**的「递归同构的分层口径」与「不等深的三至五层 / 无填充节点」两条 requirement。已在本变更的 `.openspec.yaml` 设 `skip_specs: true`，不新增/修改任何 requirement。）

## Impact

- **数据**：`Graphify/data/graph.json`（删 1 个 group、新增 3 个 group、13 个节点改 parent）。备份文件（`data/graph.before-*.json`、`data/graph.history/`）不得改动。
- **脚本**：新增 `scripts/restructure-initial-conditions-blocks.mjs`；修改 `restructure-tabs.mjs`、`reset-atlas-nodes.mjs`、`import-atlas-graph.mjs`；自检 `scripts/check-canvas.mjs` 增加断言。
- **文档**：`Graphify/README.md`、`docs/notes/INITIAL_CONDITIONS.md`（§8 追溯表）。
- **前端 / 服务端**：**无需改动**——渲染器对 `group` 的处理已通用（E lane 同形态），schema 不新增字段；模块徽标由「进入子图 · 1」变为「进入子图 · 3」是数据驱动的自然结果。
- **依赖**：无新增。
