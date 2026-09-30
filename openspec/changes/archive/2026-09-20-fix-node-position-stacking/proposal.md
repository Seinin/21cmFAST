## Why

用户反馈「有个节点叫做光子守恒红移校准…，鼠标移上去就变成热化学率系数」。上一轮按「悬停逻辑」修了一版（展开键不再压标签、弱化档不再压字、标签筛选与必显解耦），**没解决**——因为根因不在悬停，而在**坐标数据**：

- `Graphify/data/graph.json` 的 181 个节点里，**170 个坐标是 `(0,0)`**（只有 11 个阶段根有真实坐标）；用户点名的「光子守恒红移校准的接入」与「热化学率系数与光电截面」都在这一堆里。
- 170 个节点叠在同一个点，指针命中的是堆在最上层的那一个，它的标签被放行显示压在最上面 —— 看起来就像「这个节点变成了另一个名字」。
- 脏数据是应用自己写进去的：`emitPositions()` 把**全部**节点坐标（含当时不可见、从未排布过的）一起回存，而隐藏节点的坐标就是 cytoscape 的默认 `(0,0)`；首屏 `sync()` 那次布局只覆盖当时的可见集（11 个根），随后 `resetExpansion()` 把自动展开出来的节点显示出来时**没有任何布局**（`layoutIfPending()` 已被消费），它们就一直留在原点。手动展开走 `applyExpansion()` 反而会重排，所以只有「首屏自动展开 / 切话题」这条路径会留下堆叠。
- 一次污染之后 `needsLayout` 永远为假，画布再也不会为这些节点排布，问题变成常驻。

附带放大器：标签挂在节点下方（`text-valign: bottom` + `text-margin-y: 10`），而 `mouseover, 'node'` 只在指针落进**节点矩形**时触发 —— 悬停在文字上不算悬停该节点，密集时就会命中下方另一个节点。

## What Changes

- **加载自愈（不动数据文件）**：新增纯函数模块 `src/graph/positions.ts`，把「≥3 个节点共享同一坐标」判为堆叠占位，这些节点的坐标在加载时被忽略（视为未排布），由布局重新排布。用户点名的两个节点各自落位。
- **不再产生占位坐标**：渲染器新增「已排布」记账（`placedIds`），`emitPositions()` 只回存**当前可见且确实被排布过**的节点；隐藏的、从未排布过的节点一律不回存，从源头断掉污染链（`applyPositions` 只合并传入项，因此「少回存」不会覆盖已有合法坐标）。
- **新揭示的节点必须落位**：新增 `ensurePlaced()`，在 `resetExpansion()`（首屏 / 切话题 / 改开关集合三条路径的共同入口）末尾检查「可见但未排布」的节点，存在则补一次整树重排（与「手动展开一层」的既有行为一致），并保证只取景一次、不出现「先按旧坐标取景再跳」。
- **悬停在标签文字上等于悬停该节点**：命中测试改为「先判节点方块，再判**当前已显示**标签的矩形」（复用 `labels.ts` 现成的候选矩形与测量缓存），悬停来源收敛为核心级 `mousemove` 单一入口。
- **BREAKING**（数据口径）：从此以后节点坐标必须对应一次真实排布或一次用户拖动；占位坐标不再被持久化。不改数据模型与落盘格式（`node.position` 本就可空），不改服务端接口，不新增依赖，不重新导入草案。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `graphify-canvas-layout`: 新增「节点坐标必须是真实排布结果」——未排布的节点 MUST NOT 被持久化成占位坐标；加载时 MUST 把「多个节点共享同一坐标」判为未排布并交给布局重排；当前可见的节点 MUST 全部具备互不重合的排布。
- `graphify-canvas-appearance`: 新增「悬停命中包含已显示的标签矩形」——指针落在某个节点的名称文字上 MUST 视为悬停该节点，MUST NOT 命中它下方的其它节点。
- `graphify-topic-views`: 「切换话题保留位置与折叠状态」补一条例外——可见集中首次出现尚未排布过的节点时，允许补一次重排（其余情况仍 MUST NOT 重排）；同时把「切换话题只取景不重排」的表述限定到该例外之外。

## Impact

- 前端源码：`src/graph/positions.ts`（新增）、`src/graph/labels.ts`（命中测试）、`src/graph/cytoscapeSetup.ts`（`sync` 接自愈、`placedIds` 记账、`emitPositions` 收窄、`ensurePlaced`、悬停单一入口）、`src/components/GraphCanvas.tsx`（话题 effect 的取景编排）
- 规格与文档：`openspec/specs/graphify-canvas-layout`、`graphify-canvas-appearance`、`graphify-topic-views` 三份主 spec（经本 change 的 delta 同步）、`docs/DIRECTORY.md` §7 与 §8.1
- 数据：不主动改 `data/graph.json`；自愈只影响渲染，文件在后续正常保存时自然被洗干净（隐藏且未排布过的节点不再被写坐标）
- 不涉及：图谱 schema、服务端接口、Python/C 源码、依赖清单
- 回归：`npx tsc -b`、`npx eslint src scripts`、`npm run build`；纯函数与 headless cytoscape 断言（真实 `data/graph.json`：自愈恰好命中那 170 个节点；可见节点两两坐标不重复；标签矩形中心命中自身）；浏览器人工核对
