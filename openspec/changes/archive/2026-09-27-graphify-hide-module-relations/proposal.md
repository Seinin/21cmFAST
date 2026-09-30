## Why

画布上有的模块引出/引入一大串连线（通用过程被多方复用），读图时噪音很大，而这些模块本身是看图的锚点。上一轮把「按模块收起关系」连同「复用件」一起撤掉了（`openspec/changes/archive/2026-09-27-graphify-remove-shared-utilities/`），但这项能力其实与「复用件」无关：它只是"把某个模块的连线临时收起来"。用户要求把它恢复，且这次要**记在浏览器本地**（刷新后保持），而不是刷新即忘。

撤除没有落进 git 提交（Graphify 那套改动不在 git 历史里），所以本次是**重写**，不是 `git revert`。

## What Changes

- **纯视图状态（`graphStore`）**：新增 `hiddenRelationIds: string[]`（初值从浏览器本地读入）+ 动作 `toggleHiddenRelations(nodeId)` / `setHiddenRelationIds(ids)`。不入撤销栈、不写图谱数据。
- **本地记忆（`src/lib/viewPreferences.ts`，新增）**：与 `usePanelWidth` 同一套容错口径（独立命名空间键 `graphify.hiddenRelations.v1`、`try/catch` 降级、缺失/损坏一律回退默认）。**唯一差异**：这次是"记住"，而不是"刷新回默认"。
- **渲染规则（`cytoscapeSetup`）**：新增幂等入口 `setHiddenRelations(ids)`，在 `applyVisibility()` 既有的边循环里追加一条——端点命中集合的**语义关系连线**用 `display:none` 收起。节点、坐标、compound 层级结构一概不动；层级不是边元素，因此不需要额外跳过。
- **两个入口**：右键菜单加「隐藏它的关系 / 显示它的关系」（`Eye` / `EyeOff`，容器不入列）；属性面板节点区加同一开关（`Switch`，容器不显示）。
- **选中兜底**：收起后若正选中一条被收起的连线，按话题过滤的同一口径清掉选中，避免详情面板停在看不见的对象上。
- **顺带清洁**：`server/lib/codeIndex.mjs` 里读码分页引入的局部变量 `shared` 改名为 `base`（与已撤概念同名会误导检索）。
- **文档**：README 画布章节补一句"右键模块可收起/恢复它的关系，状态记在浏览器本地"。

**明确不做**：不恢复「复用件」整套（小扳手标识、源码审计脚本、数据标记、图例项、右键菜单里的说明行），也不做任何全局一键开关（用户已定）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graphify-topic-views`: 恢复 `按模块隐藏关系` 这条要求（如实记录"取代上一轮的撤除"），并新增 `隐藏关系是本地记忆的视图状态`——它取代原先被撤的"关系隐藏是纯视图状态、刷新回默认"口径：仍然不入撤销栈、不写数据，但改为**记在浏览器本地**。

## Impact

- **前端**：`src/state/graphStore.ts`、`src/lib/viewPreferences.ts`（新增）、`src/graph/cytoscapeSetup.ts`、`src/components/GraphCanvas.tsx`、`src/components/ContextMenu.tsx`、`src/components/Inspector.tsx`、`src/App.tsx`（Inspector 是纯 props 驱动，状态与回调经它注入）。
- **自检**：`scripts/check-canvas.mjs` 增一组关系收起断言（隐藏→恢复→幂等→容器不受影响）。
- **服务端**：零改动（`codeIndex.mjs` 只改一个局部变量名）。
- **数据**：零改动——隐藏状态只进 localStorage，图谱文件与 schema 都不碰。
- 不引入新依赖。
