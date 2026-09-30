## 1. 画布悬停不再改动文字

- [x] 1.1 展开/收起键改用「节点 + 标签」合围盒定位：新增 `GraphRenderer.renderedBox()`（`renderedBoundingBox({ includeLabels: true })`），`GraphCanvas` 的期望落点改为「合围盒右侧之外 + 纵向对齐节点中线」，`placeOverlay` 的镜像参考点由节点中心改为**合围盒中心**（否则翻边后仍会从左边压字）；验证：核验脚本断言旧的 `(+18,+10)` 落点与标签矩形相交、新的合围盒外侧落点不相交（两条断言均通过）
- [x] 1.2 弱化档不再压字：`node.dimmed` 由元素级 `opacity: 0.22` 改为只压 `background-opacity` / `border-opacity`（`underlay-opacity` 归零），`edge.dimmed` 由 `opacity: 0.16` 改为只压 `line-opacity`，两者都不写 `color` / `text-opacity`；验证：样式表不再出现元素级 `opacity` 弱化（全仓 grep 确认），文字浓淡只由标签省略规则决定
- [x] 1.3 标签筛选与必显解耦：`labels.ts` 去掉 `forced` / `pinned`（`pickLabels` 只按优先级 + id 稳定序），`cytoscapeSetup.ts` 的 `refreshLabels()` 不再传悬停/选中项并保留 `shownLabels`，新增 `syncPinnedLabels()` 把悬停/选中节点移出 `label-off`、加 `label-pinned` 抬高层级，`mouseover` / `mouseout` 与 `select()` 都改走它；`styles.ts` 补 `node.label-pinned`；验证：核验脚本断言筛选结果与输入顺序无关且重叠时只留高优先级；悬停路径不再调用全量筛选（代码走查 + eslint 无未用变量）

## 2. 话题可见集改多选模型

- [x] 2.1 `src/lib/topics.ts` 泛化：`topicView(graph, topicId)` → `topicVisibility(graph, hiddenTopicIds)`（可见集 = 不属于任何被关闭话题的节点；层级父级取最近的**可见**祖先；未注册 id 被忽略；`allHidden` 供空态），`topicVisibilityKey` → `topicVisibilityFingerprint`（并入被关闭集合），新增 `topicMemberIds` 并让 `topicVisibleCount` 复用它；验证：核验脚本 8 项通过——真实 181 节点图上默认不过滤、关闭 `code-ion` 后 24 个成员全隐且其余全显、未注册 id 忽略、全部关闭置 `allHidden`；合成图上父链越界者提升为顶层、可见集内层级保留、无归属节点恒显；指纹随开关变化且同一集合可复现
- [x] 2.2 `src/state/graphStore.ts` 换成 `hiddenTopicIds: string[]` + `toggleTopic` / `setHiddenTopics`，`reset()` 复位为空数组，保留「可见集变化后清掉不可见选中项」的逻辑；验证：`npx tsc -b` 通过，全仓 grep 确认 `activeTopicId` / `setActiveTopic` / `topicView` / `topicVisibilityKey` / `ALL_TOPICS` 无残留引用
- [x] 2.3 `src/App.tsx` 重新装配：用 `topicVisibility` / `topicVisibilityFingerprint` 产出 `topicFilter` / `topicKey`，新增「全选话题」与「详情页点话题 → 取消其隐藏 + 选中节点」两个处理器并下传；验证：`topicKey` 机制未变（只在可见集或层级真变时重新套用与取景），`npx tsc -b` 通过

## 3. 话题面板与文案

- [x] 3.1 新增 `src/components/ui/popover.tsx`（按现有 `ui/` 件风格薄包装 `@radix-ui/react-popover`，与 dropdown 同款配色与动画类，无新依赖）；验证：`npx tsc -b` 与 `npx eslint src` 通过
- [x] 3.2 `src/components/TopBar.tsx` 单选下拉换成 Popover 面板：搜索框（按话题名过滤 + Enter 切唯一命中）、逐行 `role="checkbox"` + `aria-checked` 复选（含勾选方块、名称、成员数）、底部「全选 / 全不选」（全开/全关时对应按钮禁用）、`ScrollArea` 式的限高滚动、无匹配时的空态提示；触发器显示「话题 已开/总数 + 可见节点数」，有话题被关闭时数字转琥珀并加圆点；验证：`npx eslint src` 0 error（首次报出两个未用导入已清理）
- [x] 3.3 `src/components/Inspector.tsx` 的话题入口语义改为「确保该话题未被关闭 + 选中该节点」（tooltip 文案同步），`App.tsx` 传入 `revealTopic`；验证：`npx tsc -b` 通过，代码走查确认不再有关闭其它话题的副作用
- [x] 3.4 文案与空态：两处预算提示由「切到细分话题」改为「收起其他分支，或在话题面板里关掉一部分话题」；`GraphCanvas` 新增「全部话题都被关闭」的空态（说明 + 「全选话题」按钮），条件与既有「图谱无节点」空态互斥；验证：`grep` 确认旧文案已无残留，两个空态条件互斥（`!isEmpty && topicsAllClosed`）

## 4. 验证与归档

- [x] 4.1 回归三件套：`npx tsc -b` 无输出、`npx eslint src scripts` 0 error（仅 2 条既有 warning）、`npm run build` 成功；全仓 grep 确认旧 API 无残留
- [x] 4.2 走查核对（自动化部分）：纯函数核验脚本 14 项断言全过（见 2.1 / 1.1 / 1.3）；需人眼确认的观感项留给用户在浏览器复核——① 悬停任意节点，其名称与其它文字内容、浓淡全程不变；② 展开键落在合围盒之外，长标签与缩小后仍不压字；③ 取消勾选某话题 → 其成员消失、其余节点坐标不动；④ 重新勾选 → 原样恢复；⑤ 搜索框按名过滤话题列表；⑥ 全不选 → 空态提示 + 「全选话题」可恢复；⑦ 详情页点话题不关闭其它话题
- [x] 4.3 登记 `docs/DIRECTORY.md`：§7 追加本次变更记录；§8.1 与 §8.2 的「话题视图 / 默认展开与预算」两行由「单选排他、只显示该话题成员」改写为「多选开关、默认全开、取消即隐藏该话题成员」，并同步新的超限提示出路与全部关闭时的空态
- [x] 4.4 用 openspec-archive-change 归档：三份 delta 同步进主 spec（`graphify-topic-views` 的 Purpose 一并改写为开关语义，`graphify-canvas-appearance` 追加两条要求，`graphify-canvas-budget` 更新提示出路），change 移入 `openspec/changes/archive/`
