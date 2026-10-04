## 1. 类型与偏好底座

- [x] 1.1 `Graphify/src/lib/types.ts`：`spanKind` 联合补上 `'feedback'`，`levelSpan` 的注释改成含负值口径（主序为正、跨红移回流为负）；验证：`cd Graphify && npx tsc -b` 无输出
- [x] 1.2 `Graphify/src/lib/viewPreferences.ts` 新增布尔读写对（读：缺键 / 非法 / 存储不可用一律回退默认 `false`，且 `window` 不存在时不抛错；写：与默认值相同就删键）；验证：`tsc -b` 干净，且在 Node 下调用读函数返回默认值（自检脚本能跑）
- [x] 1.3 开关状态由物理链页本地持有（`useState`，挂载时读本机偏好、切换时写回），**不进共享 store**——门禁断言这一页不 import `useGraphStore`（D2）；验证：`tsc -b` 干净，`src/state/graphStore.ts` 与 `src/state/undo.ts` 都没有该字段（不进共享状态、不进撤销栈）

## 2. 渲染：类名、样式、开合

- [x] 2.1 `Graphify/src/graph/cytoscapeSetup.ts`：边字段映射里加一条——跨红移回流边带 `feedback` 类名（与既有 `crossLink` 映射并列，两页共用同一映射，工程图谱无此字段因此不受影响）；验证：打开物理链页，2 条回流边带上该类名
- [x] 2.2 `Graphify/src/graph/styles.ts`：加 `edge.feedback` 独立样式（颜色与线型与主序边、与 `cross-link` 点线都能区分，箭头显式朝上，满足浅底对比度口径），并把"关闭态不画"的规则写在既有 `edge[?focusOnly]` 规则**之后**；验证：开合两态下该位置的有无正确，关闭态鼠标悬停不命中它
- [x] 2.3 `Graphify/src/components/GraphCanvas.tsx`：开关状态变化时用 `toggleClass` 切"关闭态"类（与既有 `show-label` 同一套手法，不重建元素）；验证：开合开关前后打印元素坐标摘要，逐字不变
- [x] 2.4 关闭态口径核算：默认可见边（排除跨红移回流边）构成的强连通分量必须为 0 个；验证：按 `check:chain` 同口径跑一遍并输出 0 环

## 3. 开关控件与只读入口

- [x] 3.1 `Graphify/src/components/CanvasOverlays.tsx` 新增可选 prop（开关状态、切换回调、报数文案），不传就不渲染；`PhysicsChainView.tsx` 接线，条数从生成物算（数 `spanKind === 'feedback'` 的边）；验证：物理链页浮层出现「跨红移反馈 · 2 条」，画布页浮层不出现
- [x] 3.2 产物里没有回流边时控件写明原因、不渲染成永远为空的开关；验证：临时清空真源 `feedback` 段并重新生成，控件写明原因；恢复后重新生成并逐字比对产物（源码层断言已加，界面侧见 5.x）
- [x] 3.3 `Graphify/src/components/PhysicsChainView.tsx`：从只读入口（关系列表 / 检索命中 / 外部定位）落到一条被藏起来的回流边时，自动打开开关并定位选中（沿用既有 `focusOnly` 处置那一段）；验证：关闭态下从检查器关系列表点中回流边，开关自动打开、该边可见且为选中态

## 4. 自检与门禁

- [x] 4.1 `Graphify/scripts/check-physics-chain.mjs` 新增一节：回流边存在、`levelSpan < 0`、`kind` / `spanKind` 均为 `'feedback'`、`crossLink` 与 `surface` 为真、不带 `focusOnly`、标签与真源逐字一致；并反向断言工程图谱 `data/graph.json` 里没有回流边；验证：`npm run check:chain` 全绿
- [x] 4.2 自检按同一字段重算并断言"关＝0 环、开＝恰好 1 个环簇（成员全是一级块、覆盖每条回流边两端）"，条数与环数都从产物算、不写死；验证：反面演练——摘掉一条回流边的种类标记，自检当场失败并点名该边所指的环，复原后全绿
- [x] 4.3 门禁全跑：`npm run check:chain` / `check:copy` / `tsc -b` / `eslint` / `build`；验证：全部通过（eslint 只有改动前既有的 3 条 warning）
- [x] 4.4 自检按管辖范围断言：每条回流边的两端其 `parent` 均为空（一级块），且逐个块重算子图可见集后，其中回流边数必须为 0；同时断言"默认可见 ⊎ 回流 = 全部边"（关掉开关少掉的恰好是回流那几条，同轮内的红移依赖一条未少）；验证：`npm run check:chain` 全绿

## 5. 浏览器实走

- [x] 5.1 默认态实走：打开物理链页，主图上没有跨红移回流边、可见边无环、开关为关且报「2 条」，其余边的样式与改动前逐字一致 —— 实走：默认态主图无跨红移回流边、可见边无环、开关为关且报「2 条」，其余边的样式与改动前一致
- [x] 5.2 打开态实走：打开开关，2 条回流边显现、箭头朝上、与点线交叉边一眼可分；再关闭再打开再关闭，往返后坐标与字样逐字复原 —— 实走：打开后 2 条回流边显现、箭头朝上、与点线交叉边一眼可分；往返开合后坐标与字样逐字复原
- [x] 5.3 记忆与边界实走：刷新后保持、切到画布页再切回保持、本机存储被禁用时回退默认关且不报错不白屏 —— 实走：刷新后保持、切到画布页再切回保持；本机存储被禁用时回退默认关，不报错、不白屏
- [x] 5.4 只读入口实走：关闭态下从检查器关系列表点中一条回流边，开关自动打开、边可见；切到画布页确认浮层上没有该开关、可见边与样式逐字不变 —— 实走：关闭态下从检查器关系列表点中一条回流边，开关自动打开、边可见；画布页浮层上没有该开关
- [x] 5.5 子图与边界实走：进入「气体热与自旋温度」「电离场」两个块（送出那两个量的一侧）的子图，开合开关，可见边与坐标逐字不变、不出现块间回流弧；这两块里打开开关后应各出现一条落点边（与收方块那条同端点对、同档样式，去处那个量灰显为对外输入）；再进入「网格化源项」（收方块）的子图，确认打开时两条成员级落点与来处都在场、关掉时一并消失、再打开一并复原且坐标逐字不变（见任务 6.5）；并确认子图里带 `(z)` 的同红移依赖边照常可见、线型与颜色未变 —— 实走：进「气体热与自旋温度」「电离场」两个来源块的子图开合开关，可见边与坐标逐字不变、不出现块间回流弧；收方块那两条成员级落点随开关在场 / 消失 / 复原

## 6. 子图里的落点（一级讲回声，进块里指着两个量说）

- [x] 6.1 `Graphify/src/lib/types.ts`：`GraphEdge` 补 `fromNode` / `toNode`（回流记的两端量）与 `subgraphOf`（这条边只属于哪个块的标签页），`spanKind` 联合补 `'feedback-input'`；验证：`cd Graphify && npx tsc -b` 无输出
- [x] 6.2 `Graphify/src/components/PhysicsChainView.tsx`：按产物派生落点（`fromNode → toNode` 的成员级边 + 声明只属于哪一块），并把对面的量并进本块的对外输入（复用既有灰显口径）；产物与生成物一个字节不改（自检的幂等段守着）；验证：`npm run check:chain` 全绿
- [x] 6.3 `Graphify/src/graph/styles.ts` / `cytoscapeSetup.ts`：落点与一级的弧**同一档样式**（选择器 `edge.feedback, edge.feedback-input`）；渲染器按 `subgraphOf` 在别的标签页里收口（`display: none`，不增删元素）；验证：`npm run check:chain` 的源码断言与 `npm run check:styles` 全绿
- [x] 6.4 自检新增一节（`scripts/check-physics-chain.mjs`）：逐条对账"落点两端量各就各位（`toNode` 只属收方块、`fromNode` 只属来源块，互不越界）""每条弧在两端块的可见集里两端都在""别处两端同场处必有一条本块自己的关系"；并按视图那份投影（`contexts` + 回流两端）建层级，真跑 `tabVisibleIds` / `tabContextIds` 逐块对账；验证：`npm run check:chain` 全绿
- [x] 6.5 浏览器实走：开关打开时进入「网格化源项」子图，看到两条成员级边（品红长划、标签是两端量名、注里带上一轮与代码落点），来处那两个量灰显；关掉开关，这两条边与来处一起不画，再打开一并复原、各元素坐标逐字不变；再进入「气体热与自旋温度」「电离场」两个来源块的子图，各看到一条同端点对、同档样式的落点边（去处那个量灰显，属性页写明"上一轮把它送了出去"），且不挂灰细那档；最后进入别的块的子图，确认这两条落点都不出现 —— 实走：「网格化源项」子图打开时看到两条成员级边（品红长划、标签是两端量名），来处那两个量灰显；关掉一并消失、再打开一并复原且坐标逐字不变；两个来源块各有一条同端点对、同档样式的落点边；别的块的子图里不出现落点
- [x] 6.6 `Graphify/src/lib/types.ts`：`GraphNode` 补 `feedbackInputOf`（这个量是哪些块"读的上一轮那份"，值是读它的块 id）——回流在子图里的来处，与边的 `subgraphOf` 同一路，产物里没有这个字段；验证：`cd Graphify && npx tsc -b` 无输出
- [x] 6.7 `Graphify/src/components/PhysicsChainView.tsx`：派生 `inputOf`（量 → 读它上一轮的块；本块自己声明为对外输入的不算）并挂进页面那份投影的节点上；投影与开关状态无关，开合不增删元素；`selectWithReveal` 从边与节点两侧都补上"点中即打开开关"；验证：`npm run check:chain` 全绿
- [x] 6.8 `Graphify/src/graph/styles.ts` / `cytoscapeSetup.ts`：关闭态扩到三样（`edge.feedback` / `edge.feedback-input` / 落点那些盒子的 `node.feedback-context`），渲染器按 `feedbackInputOf` 在当前块挂 `feedback-context`、按开关切这三样的 `feedback-off`；验证：`npm run check:chain` 与 `npm run check:styles` 全绿
- [x] 6.9 落点补上**来源块那一侧**：`PhysicsChainView.tsx` 的派生改成每条弧在两端块各派一条（`#input` 声明给 `target`、`#output` 声明给 `source`），并派生 `sentToNextRound` / `outputOf` 把 `toNode` 并进来源块的对外输入（并进前按本块已声明的 `contexts` 去重——电离场声明了 `Ṅ_ion`，同时又把 `Ṅ_ion` 送了出去）；`GraphNode` 补 `feedbackOutputOf`，渲染器按它挂 `feedback-context`；`cytoscapeSetup.ts` 的 `context-edge` 排除 `feedback-input`（灰细那档会压掉落点自己的样式）；验证：`cd Graphify && npx tsc -b` 无输出且 `npm run check:chain` 全绿（落点 4 条 = 2 条弧 × 2 端）
- [x] 6.10 自检的落点一节改成按**两端块**对账：投影可见集把"上一轮送出去的目的地"也算进来、真跑 `tabVisibleIds` / `tabContextIds` 的那份层级与本页投影逐字一致、落点条数断言改成 `弧数 × 2`，并新增源码断言"两端各派一条（`#input` / `#output`）""`context-edge` 排除落点边""并进对外输入前去重"；验证：`npm run check:chain` 全绿
- [x] 6.11 落点边显式鼓开：`styles.ts` 为 `edge.feedback-input` 单起一档，设 `unbundled-bezier` + `control-point-distances`（它与本轮的产物边同端点对、方向相反，两条都走直线会完全叠住——渲染器的自动错开只在同一种 `curve-style` 的平行边之间生效）；自检加数据侧断言"子图里没有两条同端点对、都走直线的产物边"与源码断言"落点边换了曲线"；验证：`npm run check:chain`（251 项，报告同端点对的边对 2 处靠曲线分开）与 `npm run check:styles`（63 条规则）全绿
