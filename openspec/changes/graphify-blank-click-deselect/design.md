# 1. 清在哪一层：数据源，不是渲染器

点空白这件事的入口只有一个：渲染器在 `cy.on('tap')` 里判定 `event.target === cy`，回调 `onClearSelection`（`graph/cytoscapeSetup.ts`），画布模板 `GraphCanvas` 接住它（那段里现在还顺手关右键菜单、取消连线）。所以"要清哪些状态"必须写成**数据源的一个方法**，而不是让模板去认两页各自的 store 与局部 state：

- `GraphSource` 增 `clearHighlight()`（名字说的是结果：回到"什么都没点亮"；它比"清选中"多清一点，所以不叫 `clearSelection`，免得以后有人以为它只管选中）；
- 画布页 = 缺省实现（共享 store）：`select(null, null)` + `setActiveTags([])`；
- 物理链页 = provider 提供：`select(null, null)` + `setActiveParam(null)` + `setActiveProcess(null)` + `setActiveTagIds([])`。

模板里那一段从 `select(null, null)` 改成 `clearHighlight()`，其余（关菜单、取消连线）逐字不动。`graphSource.tsx` 的接口注释与缺省实现同步。

# 2. 为什么不把"清勾选"塞进 store 的 `select`

`select(null, null)` 在画布页有七个调用点（属性页关闭、切页、清检索…）。把"清标签勾选"塞进它，会顺手改掉这七处的行为——那些路径只是"取消选中"，勾选该留着。点空白是一个**手势**，不是"选中变空"的必然推论；因此清勾选只挂在 `clearHighlight()` 这一条通路上。

# 3. 不清什么

- **子图标签页**：标签页是"看到哪儿"，不是"选中了什么"。点空白 MUST NOT 切回主图——`focus` / `openSubgraph` 不接这个手势。
- **右键点空白**：`cxttap` 那条通路不接这个手势，画布菜单照旧。
- **连线模式**：沿用既有的"点空白取消这次连线"（`onConnectCancel`），本变更不改它。
- **悬停**：`mousemove` / `mouseout` 那套不动；指针本来就随着点击离开空白处附近时自己清。

# 4. 幂等

双击空白会连发两次 tap：清空本身幂等（再清一次仍是空），不引入额外行为。所以不需要去分辨"单击 / 双击"，也就不必给渲染器加双击延迟判定——那会让单击有肉眼可见的迟滞。
