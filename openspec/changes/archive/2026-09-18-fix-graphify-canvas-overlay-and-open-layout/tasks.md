## 1. 布局路径：展开/收起不跳视野 + 打开即排布一次

- [x] 1.1 `Graphify/src/graph/layout.ts` 的模块级 `runLayout` 增加 `options?: { fit?: boolean }` 覆盖并透传给布局选项；验证 `npx tsc -b` 通过，且不传该参数时行为与现状一致（打开/切布局仍取景）
- [x] 1.2 `Graphify/src/graph/cytoscapeSetup.ts` 的 `GraphRenderer.runLayout(kind, { fit, anchor })`：`fit:false` 时记录 `(zoom0, pan0, 锚点模型坐标 m0)`，在 `layoutstop` 之后按 `rendered = model * zoom + pan` 反解 `pan1`（等价于 `pan0 + (m0 − m1) * z0`），把锚点钉回原屏幕位置；先定缩放再整体写 `pan`，避免 `cy.zoom()` 以视口中心微调 pan 后算错补偿；验证：层级布局下展开一层后缩放不变、被操作节点仍停在原屏幕位置
- [x] 1.3 `applyExpansion` 的层级分支改为走 `{ fit: false, anchor }`（其它布局仍用 `runLocalLayout`；工具条整体展开/收起仍取景）；验证：节点旁的键、右键菜单「展开/收起」与双击节点三种入口触发的重排都不再让画面整体换位
- [x] 1.4 新增一次性标志 `pendingInitialLayout` 与 `layoutIfPending(): boolean`（当前无可见节点时不消费标志），并在 `sync()` 末尾接线、短路原 `needsLayout` 分支（后者本身就是「打开即按当前布局排布」）；验证：以「数据先到」的时序打开图谱时按当前布局重排一次，空图不报错
- [x] 1.5 `Graphify/src/components/GraphCanvas.tsx` 的话题过滤 effect 改为 `layoutIfPending() ? 跳过取景 : fit()`；验证：切换话题不重排（节点坐标跨话题保持一致），刷新页面后必定重排一次
- [x] 1.6 工具条切换排布方案时立刻按新方案重排一次（`[props.layout]` effect 里 `runLayout(props.layout)`，用 `layoutKindRef` 跳过首次挂载以免与 `layoutIfPending` 重复排布）
- [x] 1.7 重复选择「当前已选」方案也触发重排：`App.tsx` 新增 `handleLayoutChange`，`kind === layout` 时显式调 `canvasApiRef.current.relayout()`（state 不变、effect 不会跑的场景）；顺带把缩放步长 0.18→0.25、滚轮灵敏度 0.22→0.6（缩放手感来自实现期间的反馈，不属于 spec 要求）

## 2. 浮层约束与遮蔽

- [x] 2.1 画布根容器加 `overflow-hidden`（**不加 `isolate`**：那会让画布内 `fixed z-[80]` 的右键菜单被 DOM 靠后的详情面板盖住）；验证：贴右缘节点的浮层按钮被收进画布矩形内，不再绘制在右侧详情面板之上
- [x] 2.2 新增模块级纯函数 `placeOverlay(node, desired, viewport)`（`viewport` 取 `cy.width()/height()`，不额外存 state）；验证：右侧空间不足时按钮镜像到节点左侧、上下越界时夹紧到边界内侧，节点中心移出视野时返回 `null`
- [x] 2.3 连线手柄与展开/收起键改用 `bx/by` 定位（保留 `handle.x/y` 作为连线预览起点）；验证：拖线预览起点仍为节点中心，平移画布使节点离开视野后不再绘制浮层
- [x] 2.4 `GraphCanvasProps` 新增 `overlayOpen?: boolean`，`Graphify/src/App.tsx` 传 `reader.open || nodeDialog.open || edgeDialog.open || importOpen || historyOpen || helpOpen || !!confirm`；为真时清掉粘住的键、宽限、连线预览、拖放目标与右键菜单；验证：打开阅读抽屉或任一弹窗期间不绘制连线手柄、扩展键与连线预览，关闭后按当前悬停/选中状态恢复

## 3. 展开/收起键可发现、可反复使用

- [x] 3.1 去掉 `refreshHandle` 的 `zoom < 0.6` 门槛，改为「焦点节点可见 + 其渲染位置在画布视野内 + 无弹层打开」；验证：把视图缩到很小后，悬停节点仍能拿到键（不再出现「所有节点都没有键」）
- [x] 3.2 键保持**悬浮可见**：只在焦点节点（悬停 → 刚移开指针的宽限期内 → 点过粘住的 → 选中的）旁画一个键，收起态是带 `+N` 的展开键、展开态是收起键（抽出 `ExpandKeyButton`，不再有「收起态常显」）；验证：悬停任意带未展开下层的节点都能看到 `+N`，缩放级别不影响
- [x] 3.3 指针宽限 200ms：在 `onHoverNode(null)` 记录「离开节点」的时刻起算（进入节点时刷新），指针停在键上时由 `onPointerEnter/Leave` 持续续期；验证：指针从节点移向键的过程中键不消失，能稳定点中收起
- [x] 3.4 点击粘住 `stickyKeyRef`（在画布空白点击、选中节点/连线、弹层打开时清除；图上编辑导致的位置回写不会清除它）；验证：收起触发重排后，该节点的键仍在原位置可用，可立即再次展开
- [x] 3.5 画布根容器挂 `pointermove`（rAF 合并）驱动 `refreshHandle`，`ResizeObserver` 也一并刷新；验证：指针进入/离开键时显示与隐藏及时，静止时不产生多余重渲染

## 4. 校验与人工回归

- [x] 4.1 `npx tsc -b`、`npx eslint src scripts`、`npm run build` 全部通过（lint 仅剩 Inspector/ui-button 两处既有 warning）
- [x] 4.2 逐条目视回归 delta spec 的 Scenario：贴右缘节点按钮在画布内、节点移出视野浮层消失、阅读抽屉/弹窗期间不显影、悬停出现 `+N`（缩放很小也在）、收起后立即再展开、层级布局展开收起不跳视野、打开即层级整齐、切话题位置不变、切换排布方案立刻重排并取景、**重复点同一方案也重排取景**；另加手感项：缩放按钮与滚轮速率合适
- [x] 4.3 一并收尾归档 change `2026-09-17-graphify-decompound-node-budget` 中未勾的 5.4：浏览器人工回归可见节点计数与超限拦截提示
