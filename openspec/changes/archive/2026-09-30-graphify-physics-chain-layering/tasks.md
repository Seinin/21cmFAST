## 1. 口径与生成物

- [x] 1.1 新建 `Graphify/scripts/lib/physicsStages.mjs`：导出 `PHYSICS_CHAIN_STAGES`（物理主链阶段）、`BYPASS_STAGES`（旁路/诊断出口）、`stageLayerOf(stageId)`、`isBypassHint(hints)`，注释写明判据出处（真源 `docs/notes/physics-chain/chain.json` 实际出现的阶段）。验证：直接 import 该模块能打印出两份名单，且名单里的阶段都能在真源里找到。
- [x] 1.2 `Graphify/scripts/build-physics-chain.mjs` 删掉自带的 `BYPASS_STAGES` 字面量与 `startsWith('S04')` 判据，改为 import 1.1 的共享口径；**除新增标记外生成行为逐字不变**（阶段数、节点数、边数、论文归属都不变）。验证：`npm run build:chain` 通过，且重新生成的 `physics-chain.json` 与改动前相比只有加法。
- [x] 1.3 生成物加分层标记：过程框写 `chain: 'main' | 'bypass'`；旁路阶段下辖的量与其框挂新话题 `topic:bypass`；把「旁路与后处理」写进话题注册表；工程节点保持既有 `topic:impl`。验证：`npm run build:chain` 通过，并逐条打印核对（S04 框 `chain === 'bypass'`、S04 下辖量 topics 含 `topic:bypass`、注册表里两个话题都在）。
- [x] 1.4 生成器写前校验增加：每个过程框的 `chain` 取值合法、每个旁路阶段下辖的量都带 `topic:bypass`、非 `engineering` 节点都不带 `topic:impl`。验证：临时把一条数据改坏 → `npm run build:chain` 必须非零退出并指出节点；恢复后重新通过。

## 2. 自检断言（必须可证伪）

- [x] 2.1 `Graphify/scripts/check-physics-chain.mjs` 删掉它自己复写的那份 `startsWith('S04')` 判据，改用 1.1 的共享口径。验证：`npm run check:chain` 全绿。
- [x] 2.2 新增断言：默认可见的一级过程框集合**恰好等于**主链口径（多一个或漏一个都失败并指出是哪个阶段）；旁路阶段下辖的量与工程节点**不在**默认可见集里。验证：`npm run check:chain` 全绿；再临时把 S04 移回主链名单跑一次，自检必须失败（证明这条能证伪"一级混进旁路"）。
- [x] 2.3 新增工程话题纪律断言：每个 `engineering` 节点带 `topic:impl`、每个非工程节点都不带、`topic:impl` 在注册表里。验证：`npm run check:chain` 全绿；临时摘掉一个工程节点的 `topic:impl` 一次，自检必须失败。
- [x] 2.4 把 2.x 附近那条"过程框数 = 过程数"恒等式的标题改成按数据算（现在的标题写着「一级只有 9 个框」而实际一级框是 7 个），并保留它只作结构一致性检查，不替代 2.2。验证：`npm run check:chain` 输出里的数量与实际生成物一致。

## 3. 本页数据层

- [x] 3.1 把 `Graphify/src/lib/physicsChain.ts`（现在 0 处 import 的死文件）接回使用，只新增本页要用的函数：`chainLayerOf(nodeOrStageId)`（读 `chain` 标记）、`searchChain(query)`（四路命中：参数 / 物理量 / 过程名 / 论文出处，每条带 `layer` 标注与数量说明）、`chainStats()`（物理过程数、子过程数、参数数、文献数）；不动它已有的导出。验证：`npx tsc -b` 通过；由 6.x 的检索任务在页面上实测命中。
- [x] 3.2 核对 `searchChain` 的命中口径与生成物字段一致（参数→量→开关边计数、论文出处→带该出处的量），并在文件里用注释写明"以生成物为准"。验证：对 `F_STAR10`、一个过程名、一处论文出处各跑一次，命中数量与生成物里数出来的一致。

## 4. 一级与折叠条

- [x] 4.1 视图默认状态改为关闭 `topic:impl` 与 `topic:bypass` 两个话题，一级只剩物理主链（不改生成物里的框总数）。验证：浏览器探针断言一级可见过程框数等于主链口径、且页面文本不含「旁路 · 」。
- [x] 4.2 新增常驻折叠条（画布区域底部居中）：标题写「旁路与实现细节（N 项）· 不属于物理链」+ 展开/收起按钮，N 现算（旁路阶段的量 + 工程节点）。验证：探针读取该条文本，含项数说明与「不属于物理链」。
- [x] 4.3 折叠条与检查器 `onOpenTopic` 写同一个状态（`topic:impl` 与 `topic:bypass` 都置为展开）。验证：探针点折叠条 → 旁路框与工程节点同时出现、可选中；再点检查器里的话题 → 折叠条同步显示为展开。
- [x] 4.4 清掉视图里算了没用的 `implCount`（或让它就是 4.2 的 N）。验证：`npm run lint` 无 unused 警告。

## 5. 证据默认收起

- [x] 5.1 `Graphify/src/components/Inspector.tsx` 加可选 `evidence?: 'inline' | 'collapsed'`（默认 `inline`）：`collapsed` 时引用段渲染为两个默认收起的入口「看实现 (N)」（`file` 非空的引用）/「看文献 (M)」（`docId` 非空的引用），**收起时不生成任何路径与行号 DOM**，并把该段移到「关系 / 子图入口」之后（物理在前、证据在最后）。验证：`npm run check:canvas`、`npm run check:code` 全绿（画布页行为不变），且探针断言物理链页收起前文本不含 `.c:` / `.py:`。
- [x] 5.2 物理链页给 `Inspector` 传 `collapsed`：点「看实现」展开列出文件与行区间，点条目打开 `CodePreviewDrawer` 并定位到那几行；点「看文献」展开引用点并打开文档阅读。验证：探针断言"展开前无文件行号、展开后有、点击后抽屉打开"。

## 6. 检索与状态条按视图分流

- [x] 6.1 `Graphify/src/components/TopBar.tsx` 新增 `searchGraph` 与可选 `resultBadgeOf`；`App.tsx` 按 `view` 传画布图（不传徽标 → 保持现状）或本页图 + 来源徽标。验证：`npm run lint`、`npx tsc -b` 通过，且画布页检索的命中与选中行为不变。
- [x] 6.2 `App.tsx` 的切页副作用改为**两个方向都清**检索词与残留选中（现在 `view === 'canvas'` 时直接 return，从物理链切回画布会把本页关键词带过去）。验证：探针：物理链页检索后切回画布 → 检索框为空、画布选中状态未被这次检索改动。
- [x] 6.3 本页检索选中命中项时，用一次性请求（`chainFocus: { kind, id, nonce }`）让 `PhysicsChainView` 消费：选中该对象，若它属于被收起的那一层则先展开折叠条。验证：探针检索一个只存在于收起层的对象 → 结果标注「旁路与实现细节」、折叠条自动展开、该对象被选中。
- [x] 6.4 `Graphify/src/components/StatusBar.tsx` 加可选 `selfStats`（物理过程 / 子过程 / 参数 / 文献 + 当前对象名）：传了只渲染本页口径，跳过画布口径（节点数、关系数、布局、缩放、本视图可见数、保存状态）；不传就是现状。验证：探针在物理链页读状态条文本，含四个数量与当前对象名、不含缩放与保存状态；切回画布页恢复画布口径。

## 7. 文档

- [x] 7.1 `Graphify/README.md` 修「视图切换」那一行（写的是已归档的三页与 `?view=matrix` / `?view=physics`）与生成/自检命令（改 `build:chain` / `check:chain`），并补一节「分层纪律：一级只讲物理」写明判据出处。验证：`grep -n "check:physics-map\|view=matrix\|参数矩阵" Graphify/README.md` 不再命中相关描述（历史归档段落除外）。
- [x] 7.2 `Graphify/docs/DESIGN.md` 补同一套分层语言纪律（一级 / 二级 / 三级证据 / 旁路各只讲什么）与"判据放 lib、视图只读标记"。验证：人读一遍，与 `scripts/lib/physicsStages.mjs` 的注释口径一致。

## 8. 回归与归档

- [x] 8.1 全套回归：`npm run build`（`tsc -b` + `vite build`）、`npm run lint`、`npm run check:styles`、`check:canvas`、`check:code`、`check:graph`、`check:store`、`check:chain` 全绿。验证：逐条命令输出通过。
- [x] 8.2 浏览器硬断言（无头跑完即删）：一级区域文本不含 `Python`、`后端`、`.c:`、`.py:`；折叠条默认收起（展开前看不到 S04 的框）；展开后能看到旁路框与工程节点；「看实现」点击前无文件行号；检索一个只存在于收起层的对象 → 标注来源且自动展开。验证：断言脚本退出码为 0。
- [x] 8.3 归档：`openspec validate "graphify-physics-chain-layering" --strict` 通过后归档本变更。验证：`openspec list` 里该变更不再处于 active。
