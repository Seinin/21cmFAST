## Context

- 图例由 `Graphify/src/components/CanvasOverlays.tsx` 的 `GraphLegend` 画，两页共用（`GraphCanvas` 是模板，画布页走共享 store、物理链页自带数据源）。
- 现状：节点那一段已经从 `usedTypes` 派生（`NODE_TYPE_ORDER` 按 `graph.nodes` 过滤，正确）；边那一段是写死的 `EDGE_TYPE_ORDER.slice(0, 4)`（依赖 / 相关 / 源自 / 引用），颜色写死 `EDGE_COLOR`，只有 `relates_to` 画虚线。
- 画布上真画的线型在 `Graphify/src/graph/styles.ts`：基础语义边（灰 `EDGE_COLOR` 实线 + 有向箭头）、`edge[!directed]`（无箭头）、`relates_to`（虚线）、`contradicts`（琥珀 `CONTRADICTS_COLOR` 点线）、`edge.conditional`（虚线）、`edge.cross-link`（紫灰 `CROSS_LINK_COLOR` 点线弧）、`edge.feedback` / `edge.feedback-input`（品红 `FEEDBACK_COLOR` 长划虚线弧，跟随开关整体显隐）、`edge.context-edge`（`#94A3B8` 细线，子图里的对外输入）。
- 层级：码里没有 `edge.hier-edge` 这条线型（`HIERARCHY_EDGE_COLOR` 定义了但无人引用），父子关系由 compound 容器表达；主规格里"图例 MUST 同时列出层级连线"因此在当前码上没有对应物。
- 约束：图例是 DOM 浮层，画布是 cytoscape canvas；颜色不能走 CSS 变量，只能从 `palette.ts` 取。

## Goals / Non-Goals

**Goals:**

- 图例条目一律派生：节点种类沿用既有派生，线型新增派生，两页各列各的。
- 线型条目的色值与画布样式同源（同一常量），不出现"图例深、画布浅"这类漂移。
- 图例停靠画布左下角、默认收起，点开向上铺，点空白收起。
- 展开态纯视图：不写数据、不标脏、不动可见集与坐标。

**Non-Goals:**

- 不改画布上任何线型的样式，也不改样式表规则（只读它）。
- 不动节点种类色表、条目顺序与标签文案。
- 不改物理链页的数据源、检索、状态条与跨红移开关行为。
- 不补画"层级连线"本身（那属于未实施的 `graphify-tree-layout`）；本机制只保证它一旦被画出来就自动进图例。
- 不给图例加交互（点条目筛选、点条目定位），保持只读。
- 不做"图例记住上次展开态"——每次进页都是收起。

## Decisions

**1. 条目从渲染器此刻持有的元素派生，而不是从图数据再算一遍。**

判据只有 cytoscape 里那些元素此刻带着什么（类名 `cross-link` / `feedback` / `feedback-input` / `conditional` / `context-edge`，属性 `directed` / `type`），以及它们此刻可不可见。理由：数据里 `edge.conditional` 是源头，但此刻画不画还取决于 `feedback-off`（开关关着）、`subgraphOf`（别的块的子图边）与可见性收口——从数据算会把"此刻没画"的条目也列上，正好违背"只列真画了的"。

做法：`GraphRenderer` 增只读方法 `presentEdgeStyles()`，遍历当前边、跳过不可见者、按类名与属性归到线型 id、返回去重列表；`GraphCanvas` 在既有的刷新时机（与红点 / 子图光晕同一处）取一次存进 state。

备选（否）：在 React 里用 `graph.edges` 现算——要在两处维护同一套"什么算条件边"的知识，且必然把此刻没画的边算进来。

**2. 线型 → 标签 / 色值的表放 `palette.ts`，样式表继续用那些单个色常量。**

`palette.ts` 已经是"画布配色单一来源"，`styles.ts` 与 `CanvasOverlays.tsx` 都 import 它；把表放这里，图例与画布由构造保证同色，门禁再钉一道。

备选（否）：放 `lib/types.ts`（`NODE_TYPE_LABELS` 的家）——那里不 import palette，表会变成第二个色值来源。

**3. 收起态与展开态都留在 `GraphCanvas`。**

空白点击的手势在 `GraphCanvas` 的 `onClearSelection` 回调里（渲染器 `event.target === cy` 触发）。展开态放同一处，"点空白收起"与"点空白清点亮"在同一次回调里完成，不需要跨组件通信或全局事件。

备选（否）：`GraphLegend` 自持 `useState`——空白点击拿不到它，只能靠 context 或 window 事件，更绕。

**4. 位置：整条浮层从右上角搬到左下角。**

右上角那列已经三层（缩放条 / 跨红移反馈开关 / 图例），图例在最下面且换行时最先变大；搬到底部与那列分开，收起态只占一行。

**5. 收起入口用按钮呈现，展开的浮层落在它上方。**

画布下边界之外没有空间，向下铺会越过画布；向上铺还能让入口保持在原位不动。

## Risks / Trade-offs

- [图例与画布再次漂移] → 表里的色值直接引用 `styles.ts` 同用的那些常量；门禁加断言把两处钉在一起。
- [渲染器把不可见边也算进来] → `presentEdgeStyles()` 只数此刻可见的边，开关关着的回流、别的块的子图边都不进列表。
- [门禁断言与 DOM 结构耦合] → 断言只针对可测的部分（派生函数在真实图上的返回值、表与样式表的同色关系），不写死 DOM 结构。
- [主规格「图例含层级连线」与现状冲突] → 这是既有的码与规格分歧（码里父子关系由容器表达，没有这条线型），归属未实施的 `graphify-tree-layout`；本机制在它被画出来时会自动列上，故本变更不改那条需求，只把"只列真画了的"写成新需求。
