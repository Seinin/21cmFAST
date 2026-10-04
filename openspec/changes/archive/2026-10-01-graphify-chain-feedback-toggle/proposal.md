## Why

物理链页主图今天有一个真实的 4 块环簇：`网格化源项 → X 射线源的历史卷积 → 气体热与自旋温度 →（电离场）→ 网格化源项`。它来自 2 条**跨红移回流**——`T_S(z)` 与 `Q_HII(z)` 回流到下一轮 `HaloBox`（`HaloBox.c:495/496`，生成物标 `kind: "feedback"`、`levelSpan` 为负）。去掉这 2 条，全图 0 环。

问题在于它们与主序边同样式、同权重地画在同一张自上而下的时序图上：跨红移回流是**跨迭代**关系（上一轮红移 → 下一轮），不是同一轮内的先后，混在主序里就是"顺序读不出来、只看得到一堆像环的依赖"。这类关系默认不该占主序视图的位置。

生成物里标记已经齐备（`kind: "feedback"`、`spanKind: "feedback"`、`levelSpan < 0`、`crossLink: true`，真源 `chain.json` 有独立 `feedback` 段），缺的只是一个开关与它打开后的样式。

## What Changes

- 物理链页新增**一个开关「跨红移反馈」**（画布页不出现）：默认**关**＝画布上不画反馈边；打开＝照常显示。关闭态下主图无环（只剩主序与依赖边），打开后那 2 条回流边显现。
- 反馈边走**独立样式**，与既有的 `crossLink` 点线区分：标签为 `T_S(z) → Ṅ_ion(z)` / `Q_HII(z) = 1 − x_HI(z) → Ṅ_ion(z)`，箭头显式朝上（回流方向与自上而下的主序相反）。
- 开关**自己报数**（「跨红移反馈 · 2 条」），默认关闭时这条知识也不至于无处可寻；状态记在本机浏览器（`localStorage`），刷新与切页后保持，**不进图谱数据、不进撤销栈、不改坐标、不触发重排**。
- 检查器「关系」列表里点中一条被藏起来的反馈边时，开关**自动打开并定位**——沿用 `focusOnly` 接口边的既有处置（`PhysicsChainView.tsx` 里已有一段为此而写：不让出现"选中了一条看不见的边"）。
- **进到块里，这条关系落到成员级，并随开关一起开合**：一级的弧是"块 → 块"，子图里是"上一轮送出的量 → 这一步读它的量"（产物那条弧上记的两端量），对面的那个量一并灰显为对外输入。这条关系在**弧两端块各显形一次**：收方块那侧讲"这一步把它读进来"，来源块那侧讲"上一轮把它送出去"——只画收方块，来源块的读者看到的是本轮的 `Ṅ_ion → Q_HII`（与回流反向），或（如气体热与自旋温度块）压根看不到 `Ṅ_ion` 在场。开关管的是这件事的**全部视图面**——一级的弧、子图里这两条落点边、落点那些盒子，同进同出（一个显一个隐会读成"这是两件事"）；每条落点只声明给它所属的那一块，主图与别的子图都不画。显隐仍落在样式层：投影（`subgraphOf` / `feedbackInputOf` / `feedbackOutputOf`）与开关状态无关，开合只切类名，不增删元素、不动坐标。
- 真源、生成器、生成物**不改**；补一处类型缺口：`src/lib/types.ts` 的 `spanKind` 联合当前缺 `'feedback'`（产物已在写这个值）。
- 自检新增可证伪断言：反馈边必须存在、`levelSpan` 必须为负、`kind` 必须为 `'feedback'`、标签与真源逐字一致；并断言工程图谱 `data/graph.json` 里没有反馈边（开关对画布页因此零影响）。
- 画布页（工程图谱）行为**逐字不变**：那里没有反馈边可藏，浮层不出现该开关。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graphify-physics-chain`: 新增三条要求——跨红移回流默认不画（含"关＝0 环、开＝回声"的可证伪口径，以及"开关辖这件事的全部视图面：一级的弧 + 收方块子图里的成员级落点与来处，三者同进同出"）、开关报数且状态记在本机、被藏起来的关系仍有入口（关系列表与检查器点中即开）。一级划分、检索四路、状态条口径、摆位尺寸均不改。
- `graphify-canvas-appearance`: 新增一条要求——反馈边的样式与主序边、交叉边都不同（颜色 / 线型 / 箭头方向），且关闭状态下它 MUST NOT 占据画布。

## Impact

- 视图：`Graphify/src/graph/styles.ts`（`edge.feedback` / `edge.feedback-input` 样式；关闭态一条辖三样：`edge.feedback`、`edge.feedback-input`、落点那些盒子的 `node.feedback-context`；`context-edge` 那档排除 `feedback-input`）、`Graphify/src/graph/cytoscapeSetup.ts`（`spanKind` → 类名；新增 `setFeedbackVisible`；按 `subgraphOf` 收口落点的显形范围、按 `feedbackInputOf` / `feedbackOutputOf` 在当前块标出落点两端；按开关切这三样的「关闭态」类）、`Graphify/src/components/CanvasOverlays.tsx`（浮层开关与口径文案，按既有可选 prop 惯例：不传就不显示）、`Graphify/src/components/GraphCanvas.tsx`（把开关状态转给渲染器与浮层）、`Graphify/src/components/PhysicsChainView.tsx`（本地状态、接线与只读入口；按产物在弧两端块各派生一条落点、并进对外输入并去重、标出落点两端）、`Graphify/src/lib/viewPreferences.ts`（新增布尔读写对，现只有字符串数组）、`Graphify/src/lib/types.ts`（`spanKind` 补 `'feedback'` 与 `'feedback-input'`；`GraphEdge` 补 `fromNode` / `toNode` / `subgraphOf`；`GraphNode` 补 `feedbackInputOf` / `feedbackOutputOf`）
- 自检 / 门禁：`Graphify/scripts/check-physics-chain.mjs`（新增断言与 `[呈现面]` 出口）、`npm run check:chain` / `check:copy` / `tsc -b`
- 真源与产物：`docs/notes/physics-chain/chain.json`、`Graphify/src/generated/physics-chain.json` **均不改**（`feedback` 段与生成标记已在位）
- 依赖：**无新增**；与 in-progress 的 `graphify-chain-hide-stage-codes` / `graphify-chain-leaf-refs` 不冲突（后者改标签与落点，本变更只改一类边的可见性）
