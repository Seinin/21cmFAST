## 1. 话题可见性规则（唯一真源）

- [x] 1.1 `Graphify/src/lib/topics.ts`：`TopicVisibility` 去掉 `context`、`TopicView` 去掉 `contextIds`，`visible` 收敛为成员集；新增提升后父级映射 `parentOverride`（成员 → 最近的同话题祖先，无则 `null`）；`topicVisibleCount` 语义变为成员数；`topicVisibilityKey` 纳入 `parentOverride`。验证：用 `node --experimental-strip-types` 直载该模块对 `Graphify/data/graph.json` 复算，`nion`/`engine`/`pending` 可见数为 40/14/8，且 `engine` 的提升后顶层块为 `nion:cond-mf:kernel`、`nion:single:mini`、`engine:root` 三个
- [x] 1.2 接线 `Graphify/src/App.tsx`（`topicFilter` 携带提升映射、去掉 context）与 `Graphify/src/state/graphStore.ts`（`setActiveTopic` 的保留选中判定改按成员集）。验证：`npx tsc -b` 通过，且 `Graphify/src` 下 grep 不到 `contextIds`
- [x] 1.3 `Graphify/src/components/GraphCanvas.tsx` 的 `topicFilter` / `topicKey` props 类型随新契约更新，`Graphify/src/components/TopBar.tsx` 计数仍走 `topicVisibleCount`。验证：`npx tsc -b` 通过，话题条目显示 40/14/8

## 2. 画布渲染态

- [x] 2.1 `Graphify/src/graph/cytoscapeSetup.ts`：`topicFilter` 字段改为携带提升映射，渲染器保存最近一次 `sync(graph)` 的图谱引用以便还原真实父级；确认不在 `sync()` 内并联提升逻辑。验证：类型检查通过，`sync()` 中的父子对账仍只按真实父级
- [x] 2.2 `applyCollapseState()` 重写为「结构提升 → 可见性隐藏（含任一端不可见的关系）→ 折叠」三步，无过滤时以真实父级还原，删除 `topic-context` 相关代码。验证：headless cytoscape 实测「话题 A → 话题 B → 全部」往返后每个节点 `parent` 与初始快照逐项相等，且话题视图下两端不都在话题内的关系为 `display:none`
- [x] 2.3 取景改为只对可见节点。验证：在含隐藏元素的情形下对比 `cy.fit(undefined, 80)` 与实际取景所用的 zoom/pan，确认隐藏元素不再进入取景包围盒

## 3. 容器外观

- [x] 3.1 `Graphify/src/graph/styles.ts`：`node:parent` 去掉 `border-width` / `border-opacity` / `border-style`，标签移入分组区域内部，保留分组底色；删除 `node.topic-context` 规则；`node.collapsed` 的描边与高亮保持不变；同步头部状态类注释。验证：`Graphify/src` 下 grep 不到 `topic-context`，且 `node:parent` 无 border 属性而 `node.collapsed` 仍有描边

## 4. 生成器与文档口径

- [x] 4.1 `Graphify/scripts/build-nion-graph.mjs`：§4 的可见性计算与 `--topics` 输出对齐新规则（可见 = 成员、去掉「上下文」一栏、顶层方块按提升后计算），同步文件头注释与用法说明。验证：运行该脚本的 `--topics` 输出中 `engine` 可见数为 14、顶层方块为 3 个
- [x] 4.2 `docs/DIRECTORY.md`：§8.1 的「话题视图」行改写为新规则，§7 追加一条变更记录。验证：文档中不再出现「祖先降透明度作上下文」一类表述

## 5. 端到端验证

- [x] 5.1 跑 `npm run build` 与 `npx eslint src scripts`。验证：两条命令退出码为 0，无新增错误（既有 warning 可保留）
- [x] 5.2 交叉核对前端复算与脚本输出。验证：两侧的可见数与顶层块逐项一致；浏览器内的点击/拖拽手感在结论中如实标注为待人工确认

## 6. 主 spec 与归档

- [x] 6.1 把 delta 同步进 `openspec/specs/graphify-topic-views/spec.md` 并新建 `openspec/specs/graphify-canvas-appearance/spec.md`，移除 delta 操作头。验证：主 spec 中「可见集包含祖先闭包」已被「可见集仅含话题成员」取代，且无残留 `## MODIFIED Requirements` 等操作头
- [x] 6.2 归档该 change。验证：`openspec list` 中无残留的活跃 change
