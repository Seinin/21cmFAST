## Context

见 `proposal.md` 的 Why。写这份设计时实测到的现状（都可在仓库里复核）：

- `Graphify/scripts/build-physics-chain.mjs` 自己写死 `BYPASS_STAGES = new Set(['S04'])`，用两处：旁路框不进主树/单独分道（第 595、604、652 行）、框名前缀「旁路 · 」（第 708 行）；节点身份标签的判据是另一处字面量 `codeHints[0].startsWith('S04')`（第 346、510 行）。
- `Graphify/scripts/check-physics-chain.mjs` 又独立复写一份 `startsWith('S04')` 判据（第 324 行）。于是"什么是旁路"在三个地方各写一遍。
- 计划里原打算"一级集合直接采用 `build-physics-graph.mjs` 的 `DEFAULT_STAGES`（与参数矩阵同口径）"——该文件与 `physics-map` / `PhysicsMapView` / `physics-map.json` 已整体归档到 `Graphify/attic/param-matrix-and-physics-map/`，**这条路已不存在**，口径必须新立一份并只此一份。
- 生成物里过程框已经带 `layer: 'process'`；旁路阶段 S04 的框**确实建在了一级**（只是被摆在右侧单独的"旁路道"、框名带「旁路 · 」前缀）。工程节点 `hmf_impl`、`source_grid` 带 `topic:impl`，分别挂在 `stage:S07`、`stage:S12` 框内。
- `check-physics-chain.mjs` 第 377-379 行那条"过程框数 = 过程数（一级就是这些框）"是**恒等式**：两侧都由同一份阶段归并算出来，任何"一级混进旁路/工程"都不会让它失败；它的标题还写着「一级只有 9 个框」，而实际一级框是 7 个。
- `PhysicsChainView.tsx` 已经有"默认收起实现细节"的机制（`topicVisibility(CHAIN_GRAPH, ['topic:impl'])` 喂给 `topicFilter`），但 `implCount`（第 146 行）算出来**没被任何地方使用**；展开只能靠检查器点话题（`onOpenTopic`，第 351-353 行）。
- 顶栏检索：`App` 持 `searchQuery`，`TopBar` 用 `graph`（**画布那份图**）算结果，`onSelectResult` 打到画布 store 的 `select`。物理链页的选中状态在该页组件内部（`useState`），外部拿不到。
- `StatusBar` 直接读画布 store（节点数/关系数/选中/保存态），`App` 在物理链页也照传 `zoom`/`visibleCount`（第 907-912 行）。
- `Graphify/src/lib/physicsChain.ts`（270 行、本页数据层）**当前 0 处 import**，是上次迭代留下的死文件。
- `Graphify/README.md` 仍在描述已归档的「参数矩阵 / 物理图谱」两页与 `check:physics` / `check:physics-map` 命令。

## Goals / Non-Goals

**Goals:**

- "一级只讲物理"变成**默认行为 + 可证伪断言**，而不是靠肉眼或恒等式。
- "什么是旁路 / 工程"只有一份声明，生成器与自检共用。
- 收起的东西一键可达（页面自带入口），可核查性不因为收起而下降。
- 本页的检索与状态条都只按本页数据说话，且不污染画布页。

**Non-Goals:**

- 不动 `data/graph.json`、不动画布页的行为与外观（含它的引用列表）。
- 不新建工程阶段框：真源里没有 S01–S03/S05/S06/S16 的内容，本轮**不凭印象补**（计划里"工程与装配 7 个阶段"在当前真源下只能是已有的旁路阶段 + 2 个工程节点，见 Decisions D2）。
- 不重排 `data/graph.json`、不改参数与论文数据、不加依赖。
- 不补 S09/S10/S11（真源缺内容，那是另一件事）。

## Decisions

### D1：口径抽成 `scripts/lib/physicsStages.mjs`，生成器与自检共用

导出：`PHYSICS_CHAIN_STAGES`（物理主链阶段）、`BYPASS_STAGES`（旁路/诊断出口）、`stageLayerOf(stageId) → 'main' | 'bypass'`、`isBypassHint(hints)`。注释写明判据出处（真源 `docs/notes/physics-chain/chain.json` 里实际出现的阶段 + atlas L1 的阶段名）。

**为什么不用真源 `chain.json` 存名单**：真源是从两份 PDF 逐字转录的**物理内容**，不该塞工具的工程口径；它由人手维护、没有断言保护。折中：名单放 lib，由自检断言"名单里的每个阶段都在真源里出现"防漂移。

**代价**：又多一个 lib 文件。可接受——它把现有三处字面量收敛成一处的直接收益。

### D2：一级"只留物理"= 默认可见集，不改生成物的全量结构

生成物**仍然为每个阶段建框**（含 S04），只多做两件加法：

1. 过程框加分层标记 `chain: 'main' | 'bypass'`（框已有 `layer: 'process'`，不动它）；
2. 旁路阶段的量与其框挂新话题 `topic:bypass`（「旁路与后处理」），工程节点保持既有 `topic:impl`；两个话题都进话题注册表。

视图把"两个话题都关闭"作为默认状态 → 一级只剩物理主链。折叠条 = 打开这两个话题的开关。

**为什么用话题而不是让视图按 `chain === 'bypass'` 自己过滤框**：画布的 `topicVisibility()` 除了算成员集，还会算 `hierParentOf`（成员在本视图下的层级父级：父被隐藏时改用最近的可见祖先）。走话题 = 复用这套计算；自己过滤框会出现"框被隐藏、成员被抬成顶层"，反而把旁路量混进一级。

**已知副作用与实测结论**：注册表变成 2 个话题后，默认收起时 `allHidden`（`hidden.length >= registry.length`）为真。已确认它只被 `App` 当作 `topicsAllClosed` 传给**画布页**的 `GraphCanvas`（物理链页没传），因此本页不会冒出画布那条"话题全部关闭"的恢复浮层——恢复入口就是本页的折叠条。**这条要留一条探针**（见 Risks）。

**另一个必须交代的影响**：旁路框被收起后，指向它的 `bypass` 类跨层边不再画出。这是"不在主链上"的应有表现；自检里那套跨层成因重算用的 `graphEdges` 是**全量**（不看可见集），不受影响。

### D3：折叠条常驻在画布区域底部居中

新组件放 `PhysicsChainView` 的容器内，`absolute bottom-3 left-1/2 -translate-x-1/2`：标题写「旁路与实现细节（N 项）· 不属于物理链」，右侧一个展开/收起按钮。N = 旁路阶段的量 + 工程节点数（现算）。

**为什么放底部**：顶部已被占满——画布自己的浮层（`inset-x-3 top-3` 的缩放与图例）、左上角的参数词条抽屉、顶部居中的子图标签条；底部空着（状态条在 App 层的画布容器**之外**）。

**状态收口**：`PhysicsChainView` 用一个 `showHidden` 取代现在的 `showImpl`；折叠条按钮与检查器 `onOpenTopic`（`topic:impl` / `topic:bypass` 都算）写同一个状态，两个入口不会各说各话。

### D4：本页检索按视图分流，跨组件用"一次性定位请求"

- `App` 继续持有 `searchQuery`（切页清空，两个方向都清——现在只清"离开画布"那一侧，`view === 'canvas'` 时直接 return，导致从物理链切回画布会把本页关键词带进画布）。
- `TopBar` 新增 `searchGraph` 与 `resultBadgeOf?: (kind, id) => string | null`：App 按 `view` 传画布图（现状）或本页图 + 来源徽标回调；画布页不传徽标 → 保持现在的「节点 / 关系」两种徽标。
- 物理链页的命中由 `lib/physicsChain.ts` 的 `searchChain(query)` 算（四路：参数 / 物理量 / 过程名 / 论文出处），每条带 `layer` 与数量说明；`TopBar` 只渲染 + 回调。
- 选中命中项：App 置一个一次性请求 `chainFocus: { kind, id, nonce }`，作为 prop 传给 `PhysicsChainView`；后者 `useEffect` 消费它 → `select(...)`，若目标层被收起则先 `setShowHidden(true)`。

**为什么不把本页选中状态提进 `App`**：这一页"数据各用各的"是既有纪律（自检断言视图源码不含 `useGraphStore`），选中状态留在页内、App 只递一个请求 prop，耦合面最小。

### D5：证据默认收起 = 给 `Inspector` 加一个可选 prop

`Inspector` 是画布页共用的**编辑**组件（引用列表带加/删按钮），不能在它里面无条件改。加可选 `evidence?: 'inline' | 'collapsed'`（默认 `inline`）：

- `collapsed`：引用段渲染成两个默认收起的入口「看实现 (N)」（`file` 非空的引用）/「看文献 (M)」（`docId` 非空的引用）；**收起时不生成任何路径与行号的 DOM**；该段移到「关系 / 子图入口」之后（物理在前、证据在最后）。
- `inline`（画布页）：逐字不变。

**为什么不用 `<details>` 包一层就算了**：收起状态必须不渲染路径文本，否则"展开前不得出现文件与行号"这条既过不了探针、也是真的泄漏。

### D6：状态条按视图分流 = 可选入参，不拆组件

`StatusBar` 加可选 `selfStats?: { processes; subprocesses; params; papers; selectionLabel }`：传了就只渲染本页口径（并跳过缩放、保存态、本视图可见数这些画布口径），没传就是现在这样。数量现算（`lib/physicsChain.ts` 提供）：物理过程数取主链阶段数、子过程数取 `graph.subgraphs` 的步骤总数、参数数取 `paramMatrix` 条目数、文献数取带论文引用的节点数。

**为什么不拆成两个组件**：状态条是"一条"，两页共用同一视觉与高度，拆开会出现两套样式各自漂移。

### D7：README 只修与两页相关的段落

修「视图切换」那一行（三页变两页、去掉已归档的 `?view=matrix` / `?view=physics`）与自检/生成命令行（改 `build:chain` / `check:chain`），补一节「分层纪律：一级只讲物理」写明判据出处。不重写整份 README。

## Risks / Trade-offs

- [收起后 `topicVisibility.allHidden` 为真，可能触发画布的"话题全部关闭"浮层，与本页折叠条重复] → 已确认本页没传 `topicsAllClosed`；留一条探针断言"默认状态下画布中央不出现话题恢复浮层"，并在实现时再核一遍 `GraphCanvas` 那条分支的触发条件。
- [旁路/工程被收起会让使用者以为数据缺失] → 折叠条写明项数并注明"不属于物理链"；检索命中被收起项时标注来源并自动展开。
- [新断言仍可能"跟着口径走"（改口径就自动通过）] → 断言分两层：一层查"生成物的默认可见集 == 口径"（一致性），一层独立重算"旁路阶段的量与工程节点确实不在默认可见集里"（不许静默放宽），并保留既有"遍查真源与源码"的那些断言。
- [把 `lib/physicsChain.ts` 接回使用会带出它的旧口径（surface/subgraph 那一套）] → 只新增本页真正要用的函数（分层、检索、口径计数），不动它已有的导出；若发现与生成物字段冲突，以生成物为准并在注释里写明。
- [给 `Inspector` 加 prop 可能被画布页误用] → 默认值 `inline`，画布页不传；自检已有"物理链页复用 `Inspector`"断言照旧，新增"画布页引用列表行为不变"的回归（`check:canvas` / 探针）。
- [一级框从 7 个减到 6 个（S04 移出）会让既有"框数 = 过程数"那条恒等式标题里的"9"更假] → 本轮把该标题改成按数据算，并把恒等式替换为可证伪断言；不改生成物里框的总数（旁路框仍在产物里）。

## Migration Plan

纯加法 + 默认行为变更，无数据迁移、无新依赖：

1. 先生成物与自检（口径、标记、断言）——此时页面外观不变（视图还没读新标记），`check:chain` 必须全绿。
2. 再改视图（折叠条、证据收起、检索、状态条）。
3. 回退：删掉 `chain` 标记与 `topic:bypass`、把视图默认状态改回"只关 `topic:impl`"、`StatusBar` / `TopBar` 不传新 prop，即回到当前形态（四处都是可选入参）。

## Open Questions

两个都**不影响本轮要建的东西**，各取默认值；实现时若评审要改，都只改一处：

- 折叠条展开后是否把旁路框整块高亮一次（示意"这些是刚展开出来的"）？→ 默认**不高亮**：只展开，与"话题开关"语义一致，不额外加动效。
- 状态条「文献数」取"带论文引用的量数"还是"引用点总数"？→ 默认取**带论文引用的量数**（与"参数数 = 有映射的参数数"同构）；要改只动 `lib/physicsChain.ts` 里的一个取值。
