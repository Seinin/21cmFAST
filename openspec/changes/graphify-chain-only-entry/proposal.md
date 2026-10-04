## Why

站点现在打开就落在「画布」（工程视角图谱，`data/graph.json`）：那是面向实现的草稿层——可编辑、可另存、可导入，还带一整套工程侧控件；要看物理链还得在顶栏切一下。对外该展示的是物理链页（论文口径的推进链），画布不该成为第一屏，也不该对外开着一个可编辑的工程视图。

## What Changes

- 顶栏「画布 | 物理链」分段控件不再出现：`TopBar.tsx` 的 `VIEWS` 只留「物理链」一项（控件按"多于一项"才渲染，因此自动消失）。
- 默认视图改为物理链：`App.tsx` 的 `view` 初值由 `'canvas'` 改为 `'chain'`，打开站点即物理链页。
- **BREAKING**：URL 不再能打开画布——`?view=canvas` 进入仍落物理链页（初值不读视图参数，同步时只写 `view=chain`），对外不再提供工程视角画布页。
- 画布视图的代码、数据（`data/graph.json`）、生成物与后端接口**全部保留**（物理链页复用同一套渲染与交互）；画布专属控件（本页检索、撤销/重做、布局、话题、标签、导入、历史、另存）与画布专属快捷键随视图不再可达而不再出现——既有的 `canvasOnly` / `view !== 'canvas'` 判据已经覆盖。
- 文档口径同步：`Graphify/README.md` 的「视图切换」一节改写为"只有物理链页"。

## Capabilities

### New Capabilities
- `graphify-site-surface`: 站点对外暴露的页面集合与进入方式——只开放物理链页、打开即落该页、画布视图不可由界面或 URL 打开、画布视图退役后画布专属控件不出现、画布实现与数据保留。

### Modified Capabilities
- 无。`graphify-physics-chain` / `graphify-topic-views` / `graphify-global-tags` 里「切回画布页」「顶栏话题控件」这类需求是**以画布页为载体的措辞**：画布页不对外可达之后，跨页场景自动成立、控件不出现也不违背，本变更用新能力里的一条总则覆盖它们，不改写四段长需求（理由与代价见 design.md 的 D6）。

## Impact

- 代码：`Graphify/src/App.tsx`（视图初值）、`Graphify/src/components/TopBar.tsx`（`VIEWS`）——两处小改，无删除。
- 不动：画布相关组件与状态、`Graphify/src/generated/physics-chain.json`、`Graphify/data/graph.json`、`Graphify/server/`、`docs/notes/physics-chain/` 的产物与真源。
- 文档：`Graphify/README.md`（「视图切换」一节）。
- 门禁：`cd Graphify && npm run build`、`check:styles`、`check:canvas`、`check:tabs`、`check:store`、`check:graph`、`check:tags`、`check:chain`、`check:copy`。
