## Context

现状（Why 见 proposal.md）：

- **排布**：`Graphify/src/graph/ordered.ts`（分层对齐）用 `collectRows` 按「可见 compound 父节点」分行——本质是「每条层带各自成一条横向带子，再竖着堆叠」，**没有「父在子正上方」的树层语义**；`Graphify/src/graph/pack.ts`（精细整理）同理。两者都把 `pom` 的相对位置交给重心法（`sortRowByBarycenter`），并已有两条「语义顺序不可优化」的保护：`isStackRow`（一摞容器）与 `hasSequenceOrder`（①→⑦ 步骤流）。
- **结构数据已就绪**：父子关系在节点的 `parent` 字段里，`hierarchy.ts` + `cytoscapeSetup.ts:1070-1075` 在悬停时给**邻域**（节点 + 出入边）挂 `highlighted`。概念分组也已存在（S09 的 5 个 group、入口 B 的 3 个 lane），**本次不需要动 `data/graph.json`**。
- **箭头**：`Graphify/src/graph/styles.ts:337` 的基础 `edge` 规则硬编码 `'target-arrow-shape': 'triangle'`；`:445` 有一条 `edge[!directed]` 把它抹掉（无向不画箭头）。

约束：不得新增第三方布局依赖（`layout.ts` 注释已记载 cytoscape 内置 `breadthfirst` 在 `nodeDimensionsIncludeLabels` 下遇到被隐藏的复合容器会抛错）；`scripts/normalize-layout.mjs` 与 `pack.ts` 是两份同口径实现，必须同步；`check:canvas`、`check:tabs` 需同步断言。

## Goals / Non-Goals

**Goals:**

- 排布按**真实父子层级的深度**分层，产出「父在上、子在下、兄弟并排」的多叉树；兄弟顺序以语义为准，不被交叉优化打乱。
- 语义边的箭头从「常显」改为**按需显现**（四种时机），且默认视角下画布上没有箭头。
- 顺带消除 `graphify-canvas-layout` 里「默认使用内置层级布局」与新树形排布、与「布局方式按标签页独立」之间的矛盾。

**Non-Goals:**

- **不拆装饰容器体系**：层带 / S09 框 / E lane 继续以复合框合围子节点。拆框会连带改 `graphify-subgraph-tabs` 的「主图层带与模块结构」与外观的「装饰容器样式」，属另一次变更。
- 不改 `data/graph.json`、不改 `server/`、不引入 dagre / elk。
- 不改关系名的默认显示时机（仍为悬停模块 / 悬停该条 / 选中该条 / 「常显边标签」开关）。

## Decisions

### D1 排布改为「按可见父子树深度分层」

给每个可见节点算它在可见父子树中的深度（根 = 0），同深度为一层；层内按逻辑顺序排序；父节点的横坐标取「其子节点横坐标的质心」，再用既有的 `resolveOverlaps` 保证同层不重叠。

- **为什么不用 cytoscape 内置 `breadthfirst`**：它在 `nodeDimensionsIncludeLabels` 下遇到被隐藏的复合容器会抛错（`layout.ts` 注释已记载实测），且不认端口吸附与装饰框合围；自研算法已有自检覆盖。
- **为什么保留 `hasSequenceOrder` / `isStackRow`**：交叉优化只对「无序的一堆」有意义，对层带（语义顺序 = ①→⑤）和步骤流（③④⑤）会读反；本次把这两条保护从「行内」提升为「层内兄弟顺序」的硬约束。
- 备选（已否）：保留现有「按可见父节点分行」，只把框换成树——那样主图仍是五条并列的带子，读不出父子关系。

### D2 箭头挪进既有状态规则，并限定为有向

把 `target-arrow-shape: 'triangle'` 从基础 `edge` 规则**移入**四条既有状态规则：`.hovered`（悬停单条）、`:selected`（选中单条）、`.show-label`（常显开关）、`.highlighted`（悬停模块的邻接边）；基础规则改 `'none'`。

- **必须同时处理的坑**：`edge[!directed] { 'target-arrow-shape': 'none' }` 原本靠「基础给箭头、它抹掉无向」工作。基础改成 `none` 后它形同虚设，而四条状态规则会**给无向边也加上箭头**——违反「无向关系在任何时机都不显箭头」。因此四条状态的箭头选择器 MUST 限定为有向（`edge.highlighted[directed]` 等），并保留 `edge[!directed]` 的 `none` 覆盖作为兜底（注意 cytoscape 规则顺序：后写的覆盖先写的）。
- **为什么复用这四条**：它们都已存在且分别对应规格里的四种时机，本次只挪一条属性、不加 class、不加交互。

### D3 默认布局：以「默认使用树形排布」替换旧需求

`DEFAULT_LAYOUT_KIND` 不再是「打开后什么都不做」，打开图谱时按树形排布一次；**新标签页仍以 `manual` 起步**（它的位置就是整理产物，不该被冲掉），与「布局方式按标签页独立」不冲突。

- 备选（已否）：保留 `manual` 且不要求重排——会丢掉原需求「打开即可读」的意图，也会与既有的「打开时按当前布局重排一次而非沿用历史坐标」场景冲突。

### D4 概念 / 子概念的层级来源 = 数据里已有的分组

S09 的 5 个 group、入口 B 的 3 个 lane 直接充当概念层，其子节点为子概念层。

- 备选（已否）：按依赖关系自动推导概念——会产出不可预期、无法稳定复现的分组。

## Risks / Trade-offs

- **[主图被拉得很高，一屏装不下]** → 沿用既有一屏预算 + `FIT_MIN_ZOOM` 折行策略；`check:canvas` 增加「整块在 0.85 以上装进画布」的断言。
- **[箭头默认不画后，非悬停状态下看不出某条关系是否有向]** → 图例必须写明「箭头按需显现」，并明示无向关系恒定无箭头；无向与有向在默认态仅靠线型区分，属接受项。
- **[`normalize-layout.mjs` 与 `pack.ts` 两份实现漂移]** → 新增一条自检，比对脚本产出坐标与前端产出坐标一致。
- **[装饰容器仍在，树层之间隔着框线，与「纯树」观感有差]** → 本次刻意不动容器体系（见 Non-Goals），留待后续按观感决定。

## Migration Plan

无数据迁移：`data/graph.json` 不动。旧坐标会在打开时被树形排布覆盖，且只作为**本机未保存改动**（不自动写盘）；用户保存后才写进工作文件。回滚 = 还原三处（`DEFAULT_LAYOUT_KIND`、`styles.ts` 箭头规则、`ordered.ts` 分层口径）。
