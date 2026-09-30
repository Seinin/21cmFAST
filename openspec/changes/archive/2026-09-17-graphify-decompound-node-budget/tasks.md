## 1. 层级与可见性模型（纯函数）

- [x] 1.1 新增 `Graphify/src/graph/hierarchy.ts`：`MAX_VISIBLE_NODES = 25`、`buildHierarchy` / `visibleIdsOf` / `autoExpand` / `trimToBudget`，并导出层级边 id 前缀与判定函数；验证方式是文件不 import cytoscape，`tsc -b` 通过
- [x] 1.2 用真实 `data/graph.json` 跑一次临时校验脚本：断言顶层 3 个、容器 20 个、叶子 39 个、`visibleIdsOf(autoExpand())` 不超过 25，且同一数据两次 `autoExpand` 结果完全一致；验证方式是脚本全 PASS 后删除脚本
- [x] 1.3 `Graphify/src/lib/topics.ts`：删除 `DEFAULT_FOLD_DEPTH`，`parentOverride` 更名 `hierParentOf` 并更新语义注释，`topicVisibilityKey` 注释同步；验证方式是 `grep -rn "DEFAULT_FOLD_DEPTH\|parentOverride" Graphify/src` 无命中

## 2. 渲染层去 compound

- [x] 2.1 `Graphify/src/graph/cytoscapeSetup.ts`：删除 `orderByParent`、`realParent`、`effectiveParent`、`sourceParents` 与 `data.parent` 赋值；节点 data 只保留展示字段（`childCount` 改为直系子节点数，移除 `foldLabel` 相关的后代计数）；验证方式是元素不再出现 `node:parent`（`cy.nodes().filter(n => n.isParent()).length === 0`）
- [x] 2.2 同一文件：以 `expandedIds` 替代 `collapsedIds`，实现幂等的 `applyVisibility()`（先对全部节点与边 `removeStyle('display')`，再按可见集设 `none`，最后同步层级边）；删除 `applyCollapseState` / `foldToDepth` / `foldOnFirstLoad` / `isFoldable` / `visibleRoots` / `CollapseInfo` / `onCollapseChange`；验证方式是 `tsc -b` 通过且无残留引用
- [x] 2.3 同一文件：新增 `expandNode`（预算拦截，返回是否成功）/ `collapseNode` / `expandToBudget` / `collapseAll` / `expansionInfo` / `resetExpansion` / `setTopicFilter`，handlers 改为 `onVisibilityChange` + `onBudgetExceeded`；验证方式是 `expandNode` 在可见数达 25 时返回 false 且可见集与位置均不变
- [x] 2.4 同一文件：`sync` 的边清理循环跳过层级边（按 `hier:true`），并在节点增删后调用 `applyVisibility()`；`tap` / `cxttap` 忽略层级边；验证方式是连续两次 `sync` 后层级边数量稳定不增不减
- [x] 2.5 同一文件：展开/收起后的重排按布局分流——层级布局整树重排、其它布局沿用 `runLocalLayout`（`fit:false`）；保留 `node.visible()` 过滤与 `onLayoutError` 上报；验证方式是 `tsc -b` 通过，且 `fit` / `nodeAt` / `renderedPosition` 仍只用 `element.visible()`

## 3. 样式与默认布局

- [x] 3.1 `Graphify/src/graph/styles.ts`：删除 `compoundRules`（`node:parent`、`node.collapsed`）与 `.collapsed` 相关注释；新增 `edge.hier-edge`（细实线、无箭头、低饱和、最低 z-index、无标签）与 `node.branch`（虚线描边 + 「名称 · N」标签）；验证方式是样式表构建后不含 `node:parent` / `node.collapsed` 选择器
- [x] 3.2 `Graphify/src/graph/layout.ts`：改写 fcose 参数里关于复合容器的注释，按树形微调 `breadthfirst`（`avoidOverlap` 等）；验证方式是 `LAYOUT_LABELS` 与 `LayoutKind` 不变、布局切换仍可用
- [x] 3.3 `Graphify/src/App.tsx`：默认布局 `'fcose'` → `'breadthfirst'`；`topicFilter` 改用 `hierParentOf`；新增可见计数 state 并传给 `StatusBar`；验证方式是首屏状态条显示「布局：层级」

## 4. 交互与状态显示

- [x] 4.1 `Graphify/src/components/GraphCanvas.tsx`：接线 `onVisibilityChange`（可见计数）与 `onBudgetExceeded`（固定 id 的 toast「已到上限 25，请收起其他分支或切到细分话题」）；折叠入口改为 `expandNode` / `collapseNode`；`topicKey` 副作用里 `foldToDepth` → `resetExpansion`；工具条回调改为 `collapseAll` / `expandToBudget`；验证方式是操作后无遗留引用、`tsc -b` 通过
- [x] 4.2 同一文件：实现节点旁的悬浮扩展键——悬停或选中带未展开直系子节点的节点时浮出一枚圆形键（未展开显示向下角标 + 数量，已展开显示收起键），缩放低于约 0.6 时隐藏，跟随沿用现有 rAF 机制；验证方式是手动缩放后键的显隐符合预期且不与连线手柄重叠
- [x] 4.3 同一文件：双击节点改为展开/收起一层（替换原来的双击容器折叠）；验证方式是双击一个带下层的节点，只出现其直系子节点
- [x] 4.4 `Graphify/src/components/ContextMenu.tsx`：「折叠/展开子章节」改为「展开下一层 · N」/「收起子节点 · N」，state 字段语义改为直系子节点数 + 是否已展开；验证方式是右键菜单文案与行为一致
- [x] 4.5 `Graphify/src/components/CanvasOverlays.tsx`：工具条文案改为「全部收起」/「展开到上限（25）」，`collapsedCount` → `hiddenBranchCount` 语义对齐；图例补一条层级连线样式说明；验证方式是图例中出现层级连线条目
- [x] 4.6 `Graphify/src/components/StatusBar.tsx`：新增「可见 N / 25」，接近上限转琥珀、达到上限转红；验证方式是在上限状态下计数为红色
- [x] 4.7 `Graphify/src/components/HelpDialog.tsx`：在「浏览」手势说明里补一条「逐层展开：悬停或选中节点后点其旁边的扩展键，或双击节点」，并说明画布节点上限；验证方式是帮助面板中出现该说明
- [x] 4.8 `Graphify/src/lib/types.ts` 与 `Graphify/src/state/graphStore.ts`：把「parent 为 compound 容器」「切换话题不丢折叠态」等注释改写为层级/展开语义；验证方式是 `grep -rn "compound" Graphify/src` 只剩无歧义的历史说明或零命中

## 5. 验证与文档

- [x] 5.1 运行 `Graphify` 下的 `npx tsc -b`、`npx eslint src scripts`、`npx vite build`，三项全绿
- [x] 5.2 用真实数据校验关键行为（临时脚本，跑完删除）：① 默认裁剪后可见数 ≤ 25 且顶层全在；② 达上限时 `expandNode` 返回 false 且可见集与位置不变；③ 话题往返（全部 → nion → 全部）后可见集与层级边集合与首次一致；④ `trimToBudget` 在数据变化后不超限
- [x] 5.3 `docs/DIRECTORY.md`：§7 变更记录补一行（日期 2026-09-17），§8.1/§8.2 中关于 compound 折叠、默认折叠深度 1、3 个折叠方块的表述改写为「层级连线 + 25 节点预算 + 逐层展开」；验证方式是 `docs/DIRECTORY.md` 中不再把容器当作现行机制描述
- [x] 5.4 人工回归（需浏览器）：硬刷新后确认无分组框与折叠方块、顶栏与画布正常、状态条显示「可见 N / 25」；逐层展开至上限时出现拒绝提示；切换布局到「层级」后根在上按层铺开；话题往返后连线与层级连线都恢复
