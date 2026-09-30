## Why

切到某个话题后画布上仍残留大量「仅因是祖先而可见」的节点：它们以降透明度样式与话题成员同屏出现，让话题视图看起来没切干净，同时带来一圈显眼的容器描边。上游把这套折中写成了「可见集 = 成员 ∪ 祖先闭包」的规则，但用户要的呈现是**只留本话题**：非本话题的节点与关系整块隐藏，容器不再描边。

## What Changes

- 话题可见集收敛为**仅该话题成员**：非本话题节点（含作为祖先的容器）MUST 完全隐藏，取消「降透明度作上下文」这一中间档。
- 父链越出话题的成员**提升为顶层块**（reparent，模型坐标不变），话题内部的父子关系与折叠/展开行为原样保留。以 `engine` 为例：可见节点由 17 变为 14，画布显示 `nion:cond-mf:kernel`、`nion:single:mini`、`engine:root` 三个并列顶层块。
- **非本话题的关系一并隐藏**：一条关系仅当两端都在话题内时才绘制。
- **容器分组不再描边**：去掉带色边框线与外挂标签框，改为极淡的分组底色；折叠后的方块保留描边与高亮，因为它是可点击实体而非分组轮廓。
- 生成器 `--topics` 统计口径同步：可见 = 成员，去掉「上下文」计数与「仅作上下文的祖先」清单，顶层方块按提升后计算。
- **BREAKING**（相对既有主 spec）：「可见集包含祖先闭包」requirement 被整体替换；`TopicVisibility.context` / `TopicView.contextIds` 字段与 `.topic-context` 样式类从代码中移除。

## Capabilities

### New Capabilities

- `graphify-canvas-appearance`: 画布上分组容器的视觉表达规则——分组以底色而非边框表达，折叠方块保留描边以表明可交互。

### Modified Capabilities

- `graphify-topic-views`: 「可见集包含祖先闭包」被替换为「可见集仅含话题成员」（含越界成员提升为顶层、话题内层级保留）；「顶栏话题切换」的条目计数口径改为成员数并收敛措辞；「话题归属持久化不丢」中提及「成员及其祖先上下文」的 scenario 一并收敛。

## Impact

- 前端渲染：`Graphify/src/lib/topics.ts`（可见性规则唯一真源）、`Graphify/src/graph/cytoscapeSetup.ts`（渲染态三步重算、还原真实父级、`fit` 只对可见元素取景）、`Graphify/src/graph/styles.ts`（容器外观）。
- 前端接线：`Graphify/src/App.tsx`（`topicFilter` / `topicKey` 组装）、`Graphify/src/components/GraphCanvas.tsx`（props 类型与其副作用）、`Graphify/src/state/graphStore.ts`（`setActiveTopic` 选中态判定）、`Graphify/src/components/TopBar.tsx`（计数显示口径）。
- 脚本：`Graphify/scripts/build-nion-graph.mjs`（话题统计与 `--topics` 预览输出）。
- 文档：`docs/DIRECTORY.md` §7 变更记录与 §8.1「话题视图」行。
- 数据：`Graphify/data/graph.json` **不需要重建或重导**——本次只改可见性判定，`nodes` / `edges` / `topics` 归属不变。
- 依赖：无新增；`node.move({parent})` 已在 `sync()` 中使用，cytoscape 版本仍为 3.34.3。
