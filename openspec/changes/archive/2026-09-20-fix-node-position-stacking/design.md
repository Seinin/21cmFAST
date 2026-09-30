## Context

见 `proposal.md - Why`。约束与既有实现：

- 渲染器 `src/graph/cytoscapeSetup.ts` 是唯一持有 cytoscape 实例的地方：`sync()`（397-494 行）负责把图谱数据落到元素上（`cy.add({ position: node.position ?? undefined, classes: node.position ? '' : 'enter' })`），`runLayout()`（501-513 行）负责重排并在结束时 `emitPositions()`（665-674 行）回存坐标，`layoutIfPending()`（519-528 行）负责「打开时按当前布局重排一次」，`resetExpansion()`（624-631 行）是首屏与切话题共用的默认展开入口。
- 上一轮（已归档 `graphify-topic-toggles-hover-stability`）刚改过同一批函数：悬停走 `syncPinnedLabels()` 叠加显示、标签筛选由 `labels.ts` 的 `computeLabelCandidates` + `pickLabels` 决定、`node.label-pinned` 抬高层级、展开键按合围盒定位。本次是在其上继续改，**这些行为保持不变**。
- `src/graph/hierarchy.ts`（`autoExpand` / `visibleIdsOf` / `trimToBudget`）与 `src/graph/layout.ts`（`runLayout(cy, kind, onError, { fit })`，`breadthfirst` 已带 `nodeDimensionsIncludeLabels: true` / `avoidOverlap: true`）都是不依赖 DOM 的纯逻辑，可在 node + headless cytoscape 下直接验证——这是本次自动化回归的基础。
- `GraphNode.position` 已是可选字段（`src/lib/types.ts`），`applyPositions`（`src/hooks/useGraphSync.ts`）只合并传入项，因此「少回存」不会误删已有合法坐标，也不需要改 schema。

## Goals / Non-Goals

**Goals:**

- 画布上任何时刻都不出现「一堆节点完全重叠」；用户点名的两个节点各自落位。
- 坐标的合法来源只有两种：一次真实排布，或一次用户拖动；占位坐标不再被写入数据。
- 悬停在名称文字上等于悬停该节点。
- 整个过程不动 `data/graph.json`、不重新导入草案、不加依赖。

**Non-Goals:**

- 不改标签的视觉（字号、位置、描边、省略规则）与上一轮的悬停高亮方式。
- 不改布局算法与参数，也不改节点/关系的取舍规则。
- 不做数据迁移脚本；文件里的占位坐标由「自愈 + 后续正常保存」自然消化。
- 不把「点击标签」也当作选中节点（本次只处理悬停；点击语义保持只认节点方块，避免误触）。

## Decisions

### D1：占位坐标的判定放在纯函数模块

新增 `src/graph/positions.ts`（不 import cytoscape，可在 node 下验证）：

```ts
/** 同一坐标被这么多个节点占用即判定为堆叠占位（真实布局不会让 3 个节点落在同一点） */
export const STACK_THRESHOLD = 3
/** 返回「坐标应被忽略（视为未排布）」的节点 id */
export function ignoredPositionIds(
  nodes: readonly { id: string; position: NodePosition | null | undefined }[],
): Set<string>
```

`sync()` 里逐节点决定 `position = ignored.has(id) ? undefined : node.position`，被忽略的节点按「无坐标」处理（`cy.add({ position: undefined, classes: 'enter' })`）。**备选**（在渲染器里就地统计）被否：那段逻辑是纯数据判定，放进已经有 DOM/cytoscape 依赖的类里就没法在 node 下断言；`hierarchy.ts` 已经确立了「纯函数模块 + 一次性脚本验证」的先例。

阈值取 **3** 的理由：真实布局（breadthfirst + `avoidOverlap`、fcose + `nodeSeparation`）不会让两个以上节点落在同一整数坐标，而用户故意把 2 个节点叠在一起是可能的行为，不该被当成脏数据清掉。当前污染是 170 个节点共享 `(0,0)`，远超阈值。

### D2：记账「已排布」，而不是猜坐标

渲染器新增 `placedIds: Set<string>`，登记三处：

- `sync()`：坐标被接受（未被 D1 忽略）的节点 —— 它们要么来自真实排布，要么来自用户拖动；
- 每次 `runLayout()` / 局部布局的 `layoutstop` 之后：当时**可见**的节点；
- 拖拽结束（`onNodeDragEnd`）：该节点。

`emitPositions()` 改为只回存 `node.visible() && this.placedIds.has(node.id())`。这是唯一的回存入口，因此「隐藏且未排布过的节点被写成 `(0,0)`」这条污染链从此断开。**备选**（把 `(0,0)` 当作「未排布」的特判）被否：`(0,0)` 也可能是合法坐标（布局的原点节点），靠坐标值猜语义迟早出错。

### D3：新揭示即落位

新增私有 `ensurePlaced(): boolean`：若存在「可见但不在 `placedIds`」的节点，则 `runLayout(this.layoutKind, { fit: false })` 并返回 `true`；用 `layoutInFlight` 标志防止同一次揭示重复触发。调用点只有一处 —— `resetExpansion()` 末尾（首屏、切话题、改开关集合三条路径都会调用它），避免在多个入口重复布局。

`resetExpansion()` 改为返回 `boolean`（是否已自行补排）。`GraphCanvas.tsx` 的编排改为：

```ts
const willPlace = renderer.resetExpansion()
if (!willPlace && !renderer.layoutIfPending()) renderer.fit()
```

**为什么必须让调用方知道**：`runLayout(..., { fit: false })` 结束时会自己 `fit()` 一次，若调用方随后再无脑 `fit()`，就会出现「布局还没跑完就按旧坐标取景 → 排布完画面跳一下」的观感；反之若补排发生了而调用方不 fit，画面会停在旧视野。**备选**（补排用 `fit: true`）被否：那样每次揭示都会重新取景，违反「展开与收起后的重排 MUST NOT 重新取景」。

首屏只排一次的保证：`sync()` 里 `needsLayout` 命中的那次布局，此时 `expandedIds` 还是空的（自动展开在紧随其后的话题 effect 里才生效），因此它覆盖的可见集不含自动展开出来的节点；D3 的补排发现「有可见但未排布的节点」再排一次 —— 两次布局仍是两次。为收敛成一次，`sync()` 在「首屏标志尚未消费」时把这次机会让给 `layoutIfPending()`（它由话题 effect 在 `resetExpansion()` 之后调用，覆盖的可见集已经包含自动展开结果），此时 D3 的补排自然空操作。

### D4：命中测试复用现成的标签矩形

`labels.ts` 新增纯函数：

```ts
/** 命中测试：渲染坐标点落在哪个节点上——先判节点方块，再判**当前已显示**的标签矩形 */
export function hitTestNode(cy: Core, point: { x: number; y: number }): string | null
```

实现**先判标签矩形、再判节点方块**（顺序很重要：标签挂在节点下方，可能与另一个节点的方块重叠，而用户指着文字时要命中的是写这行字的节点）。标签命中用 `computeLabelCandidates(cy)` 的矩形（该函数已按「显示省略」的口径给出每个可见节点的标签矩形，`measure()` 带字符串缓存），跳过 `label-off` 的节点，多个命中按「已叠加显示 → 优先级 → id 稳定序」取一个；没有标签命中时再做方块命中（`renderedBoundingBox({ includeLabels: false })`，标签不计入以免把下方邻居的方块圈进来）。

`mount()` 里把悬停来源收敛为核心级单一入口：

```ts
cy.on('mousemove', (event) => this.setHoveredId(hitTestNode(cy, event.renderedPosition)))
cy.on('mouseout', () => this.setHoveredId(null))
```

`setHoveredId()` 内部「未变化即返回」，变化时才调 `handlers.onHoverNode` 与 `syncPinnedLabels()`；上一轮的节点级 `mouseover` / `mouseout` 处理器被它取代（不再保留两套来源，避免两处状态打架）。每次指针移动是「≤25 个可见节点」的矩形扫描 + 缓存测量，开销可忽略。**备选**（继续用 `mouseover, 'node'`，另加一个标签命中器做补充）被否：两套来源会互相覆盖，悬停态容易抖动。

### D5：不动 `sync` 的其余时序

`sync()` 只改两处：坐标清洗（D1）与首屏那次布局的让位（D3）。数据变化后的自愈（`trimToBudget`）、增量添加、`options.relayout` 路径都保持原样。

## Risks / Trade-offs

- [阈值选取] 同一坐标被 2 个节点占用时不判定为堆叠 → 若将来出现「2 个节点被写成同一占位坐标」，画布上仍会有一次轻微重叠（能分辨、不影响命中）。取舍理由见 D1；真要更激进只需改 `STACK_THRESHOLD` 一个常量。
- [补排会挪动已摆好的节点] 这是用户选定的行为（与「手动展开一层」一致）；且只在「首次揭示未排布节点」时发生，稳态下切话题仍不重排。
- [命中范围扩大后的连带效果] 悬停键会跟着标签一起出现（更容易点到），但点击标签仍不选中节点 —— 若之后觉得需要用「点击标签 = 选中」，那是独立的一次交互决策。
- [占位坐标仍在文件里] 自愈只影响渲染；未排布过的节点在保存时不再被写入坐标，但**已经写进去的**那批要等它们各自被排布、或因节点被删而消失后才会从文件里消失。这是「不动数据文件」这一选择的代价，用户已确认接受。
- [headless 与真实渲染的差异] 断言在 headless cytoscape + 真实 `layout.ts` / `hierarchy.ts` 上跑，能覆盖坐标与可见集逻辑，但覆盖不到「canvas 命中顺序」这类渲染细节；命中测试另以纯函数断言（标签矩形中心 → 该节点 id）补齐。

## Migration Plan

1. 建 change 与三份 delta（本目录）。
2. 纯函数先行：`positions.ts`（含阈值常量）→ `labels.ts` 的 `hitTestNode`。
3. 渲染器接线：`sync` 清洗坐标 + `placedIds` 记账 → `emitPositions` 收窄 → `ensurePlaced` + `resetExpansion` 返回值 → 悬停单一入口。
4. `GraphCanvas.tsx` 取景编排。
5. 验证：`npx tsc -b` / `npx eslint src scripts` / `npm run build`；一次性 node 脚本（纯函数 + headless cytoscape 断言，见 tasks）；浏览器核对清单。
6. 登记 `docs/DIRECTORY.md`（§7 追加、§8.1 补坐标口径），再归档。

## Open Questions

- 无。是否把「点击标签 = 选中节点」留作后续独立决策（见 Risks）。
