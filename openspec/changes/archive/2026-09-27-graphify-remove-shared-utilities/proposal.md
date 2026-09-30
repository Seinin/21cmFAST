## Why

上一轮加入的「复用件」能力（节点标记 + 画布右上角小扳手 + 两档「收起它的关系」）在使用后被判定**不再需要**：它给画布增加了一层额外概念与四个交互入口，而它想解决的问题（通用件箭头多）用既有手段（话题过滤、收起大框、看节点摘要）已足够。因此整体撤除，让画布与数据回到没有这个概念的干净状态。

同时，该功能已经以 8 条 requirement 的形式写进主规格——实现撤掉而规则留着，就会出现「规格说有、代码没有」的不一致。规则一并撤除，规格与实际能力重新对齐。

## What Changes

- **数据**：清掉 13 个节点的复用件标记；**BREAKING**（节点字段移除）：全图保持 59 节点 / 54 关系，数据文件里不再出现该键。
- **前端**：节点类型字段、调色常量、渲染器的标记上报与隐藏集合、画布右上角标识与订阅、右键菜单两个入口、属性面板开关与说明、顶栏控件、图例项、store 的纯视图状态与三个动作——全部移除。外观与交互回到引入该功能之前。
- **服务端**：节点 schema、JSON schema、路由的字段读写、草案合并处理全部移除；读接口不再返回该字段。
- **脚本**：源码复用审计与打标脚本删除；画布自检里针对标识与关系收起的断言删除。
- **文档**：`Graphify/README.md` 的整节说明删除。
- **规则**：主规格里 8 条相关 requirement 标为 REMOVED（各带 Reason 与 Migration）；未归档的 `graphify-shared-utilities` 变更目录整目录删除（视为从未立项）。
- **保持不变**：初始条件子图的三块骨架（数据 / 脚本 / 断言 / 文档 / 已归档变更）一律不动；标记类浮层的三处通用刷新改进保留（它们与本次功能无关，且顺带修好了红点陈旧的问题）。

## Capabilities

### New Capabilities

（无。）

### Modified Capabilities

- `graphify-code-topology`：移除 `复用件的认定口径`、`同名模块全部打标`、`复用件标记在数据链路中不丢` 三条要求（该要素类别不再存在）。
- `graphify-canvas-appearance`：移除 `复用件标识`、`图例说明复用件标识` 两条要求（画布不再有该标识与图例项）。
- `graphify-topic-views`：移除 `按模块隐藏关系`、`一键隐藏全部复用件关系`、`关系隐藏是纯视图状态` 三条要求（这套视图能力随复用件一并撤除）。

## Impact

- **数据**：`Graphify/data/graph.json`（清 13 个标记）；备份与历史快照（`data/graph.before-*.json`、`data/history/`）**不改动**——注意它们里仍留有该字段，**恢复这类旧快照前需先删掉该键**，否则不再通过 schema（见 design 的风险条）。
- **前端**：`src/lib/types.ts`、`src/graph/palette.ts`、`src/graph/cytoscapeSetup.ts`、`src/components/{GraphCanvas,ContextMenu,Inspector,TopBar,CanvasOverlays}.tsx`、`src/state/graphStore.ts`。
- **服务端**：`server/lib/schema.mjs`、`server/schema/graph.schema.json`、`server/routes/graph.mjs`、`server/lib/mergeDraft.mjs`。
- **脚本**：`scripts/mark-shared-utilities.mjs`（删除）、`scripts/check-canvas.mjs`（删一段断言块）。
- **文档**：`Graphify/README.md`。
- **依赖**：无新增。
- **运行态要求**：字段移除后必须**重启 dev 服务**——schema 的布尔默认值会在读盘时把该键补回来，不重启则数据「清完又长出来」。
