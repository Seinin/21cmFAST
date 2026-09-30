## Context

见 `proposal.md - Why`。约束来自现有实现（本次不改数据模型、不加依赖）：

- 画布渲染器 `src/graph/cytoscapeSetup.ts` 已经把「可见性 + 层级 + 标签 + 焦点高亮」集中在一个类里：`setTopicFilter(filter: TopicVisibility | null)`、`applyVisibility()`、`refreshLabels()`、`setFocus()`。
- 标签省略的几何计算在纯模块 `src/graph/labels.ts`（`computeLabelCandidates` / `pickLabels`），标签显示口径由 `styles.ts` 的 `node.label-off { text-opacity: 0 }` 独占（不写节点数据）。
- 话题可见集算法在纯模块 `src/lib/topics.ts`，输出通用形状 `TopicVisibility { members, hierParentOf }`；渲染端只吃这个形状，因此本次改动不触碰画布与层级边代码。
- 依赖已具备：`@radix-ui/react-popover` 在 `package.json` 里但 `src/components/ui/` 下没有包装件；**没有** `@radix-ui/react-checkbox`。
- 上一轮同类改动（已归档的 `graphify-light-theme-label-legibility`）引入了恒定屏幕字号与按需省略；本次修的是它的悬停副作用，因此相关 spec 条目要按新语义改写而不是推翻。

## Goals / Non-Goals

**Goals:**

- 指针在画布上移动时，除「被悬停节点自己的标签由省略态转为显示」外，不产生任何文字变化。
- 浮层控件在任何标签长度、折行数与缩放级别下都不与标签矩形相交。
- 话题控件变成「默认全开的复选开关 + 搜索」，语义与用户直觉一致（勾选=显示、取消=隐藏）。
- 可见集算法泛化后，画布、层级边、展开/取景与预算逻辑零改动。

**Non-Goals:**

- 不做标签的「悬停高亮/加粗/换色」等新视觉；不做话题勾选的持久化（与现有「当前话题不落盘」口径一致）。
- 不改节点数据、不改图谱落盘格式、不改服务端接口与校验。
- 不为「只看某一个话题」保留排他入口（用户明确不要）。

## Decisions

### D1：展开/收起键按「节点 + 标签」的合围盒定位

`GraphCanvas.tsx` 里键的期望落点从 `{ x: 节点中心 + 18, y: 节点中心 + 10 }` 改为由 `node.renderedBoundingBox({ includeLabels: true })` 得到合围盒后计算：优先放合围盒右侧（`x2 + 间隙`）、纵向与合围盒中线对齐；右侧超出画布时按节点中心镜像到左侧（沿用 `placeOverlay` 既有的镜像 + 夹紧逻辑），仍放不下则夹紧在画布内。**备选**（单纯把 y 挪到节点上方）被否：上方常被层级连线占据，且窄合围盒与宽合围盒需要不同的偏移，硬编码偏移迟早又会压字。

### D2：弱化档不再用元素级 `opacity`

`node.dimmed` 由 `opacity: 0.22` 改为只压可视填充：`background-opacity`、`border-opacity` 降到弱化档、`underlay-opacity` 归零，**不写 `color` 与 `text-opacity`**；`edge.dimmed` 由 `opacity: 0.16` 改为 `line-opacity`（该属性在本仓库样式表里已在用）。这样弱化只作用于「色块与线」，文字保持原样。**备选**（取消高亮弱化，只留边框加粗）被否：那样邻居高亮在密集图上几乎看不出来。

### D3：基准标签集合与「必显」解耦（悬停改走叠加显示）

- `refreshLabels()` 不再把悬停/选中项传给筛选：`pickLabels` / `computeLabelCandidates` 去掉 `forced`、`pinned` 参数与相关分支，基准集合只由几何与结构决定。
- 渲染器保留最近一次筛选结果 `shownLabels`，并新增一个 O(1) 的同步方法：把「被悬停或被选中」的节点移出 `label-off` 并加一个 `label-pinned` 类（`z-index` 抬高，读起来压在邻居之上，沿用既有 3 px 描边），其余节点按 `shownLabels` 恢复。`mouseover` / `mouseout` 只调用它，不再 `applyLabelScale()` + 全量筛选。
- 指针移动的开销因此从「全图样式写入 + O(节点数) 筛选」降为「切一两个节点的 class」。缩放/平移/布局/展开/可见集变化仍走原来的合帧调度，保持一次只算一次。

### D4：话题可见集泛化为「不属于任何被关闭话题」

`src/lib/topics.ts`：

- 新增 `topicVisibility(graph, hiddenTopicIds)`：可见集 = 不被任何 `hiddenTopicIds` 覆盖的节点（含不归属任何话题的节点）；`hierParentOf` 取「最近的可见祖先」，无则顶层。`hiddenTopicIds` 为空数组时走快路径，等价于不过滤。
- 保留并复用 `topicVisibleCount`（每行显示的成员数与该话题是否被关闭无关）。
- 指纹函数改为在原有「可见集 + 层级结构」基础上加入被关闭话题集合，供画布的「只在真变时重新套用与取景」机制继续生效。
- 删除 `topicView` / `topicVisibilityKey`（旧单选模型的 API），调用方一并迁移。

### D5：状态层存「被关闭集合」而不是「被显示集合」

`src/state/graphStore.ts`：`activeTopicId: string` + `setActiveTopic` → `hiddenTopicIds: string[]` + `toggleTopic(id)` + `setHiddenTopics(ids)`，`reset()` 复位为空数组。存「关闭集合」的理由：默认全开 = 空数组，新增话题自动可见，无需同步；无注册表的旧图与骨架视图天然落在同一条快路径上。仍是纯视图状态：不入撤销栈、不落盘。原有的「可见集变化后清掉不可见选中项」逻辑改用新可见集判断。

### D6：话题面板用 Popover（新增薄包装件）

`src/components/TopBar.tsx` 的单选 `DropdownMenu` 换成 `Popover`：触发器显示「话题 已开/总数」与可见节点数（有话题被关闭时数字转琥珀色并加小圆点）；面板内是搜索框（复用现有 `Input`）+ 复选行列表（原生 `role="checkbox"` + `aria-checked`，勾选态用 indigo 实心方块 + 对勾）+ 底部「全选 / 全不选」+ `ScrollArea` 限高。新建 `src/components/ui/popover.tsx` 按现有 `ui/` 件风格薄包装 `@radix-ui/react-popover`。**备选**（继续用 DropdownMenu + CheckboxItem）被否：DropdownMenu 会吞键盘事件、且其 CheckboxItem 在本项目未包装，搜索框放不进去。

### D7：详情页的话题入口改为「确保可见 + 选中」

`Inspector` 的 `onOpenTopic` 语义从「切换到该话题视图」改为「取消该话题的隐藏（若被关闭）+ 选中该节点」，`App.tsx` 传入对应处理器；不再有关闭其它话题的副作用。

### D8：空可见集提示由 App 判定、画布只负责显示

App 计算「注册表非空且全部话题都被关闭」，把 `topicsAllClosed` 与 `onEnableAllTopics` 传给画布；画布在画布中央渲染一行说明与「全选话题」按钮。这样画布不依赖话题注册表，且与既有 `isEmpty`（图谱真的没有节点）分支互不干扰。

## Risks / Trade-offs

- [被省略的悬停标签可能压住邻居] → 靠既有 3 px 浅色描边 + `label-pinned` 抬高层级保证可读；spec 已按「不挤掉别人」改写，可读性由层级而非让位保证。
- [`border-opacity` / `line-opacity` 在 cytoscape 的实际渲染表现需实测] → 实现后按浏览器实测确认；若不支持则退回到「只弱化 `background-opacity` + 边线颜色转浅」，同样不碰文字。
- [合围盒取 `includeLabels: true` 在标签折行时略宽] → 键落到合围盒外只会更远一点，不会更近；右侧不够时镜像到左侧的既有逻辑保留。
- [删除 `topicView` 会牵动多处调用] → 已确认引用点只有 `App.tsx`、`state/graphStore.ts`、`components/TopBar.tsx`（外加 `Inspector` 的 props 传参），迁移后以 `tsc -b` 与全仓 grep 双重确认无残留。
- [默认全开 + 25 节点上限] → 与现状一致（默认折叠深度 1，打开只显示顶层），不引入新的超限画面。
- [空可见集时的提示与 `isEmpty` 叠加] → 两者条件互斥（前者要求图谱有节点），实现时以单一条件分支保证不会同时出现。

## Migration Plan

1. 建 change 与三份 delta spec（本目录）。
2. 画布侧：键的落点（`GraphCanvas.tsx`）→ 弱化档（`styles.ts`）→ 标签筛选解耦与叠加显示（`labels.ts` / `cytoscapeSetup.ts`）。
3. 话题侧：`lib/topics.ts` 泛化 → `graphStore` 换状态 → `App.tsx` 重新装配 → `TopBar` 面板（含 `ui/popover.tsx`）→ `Inspector` 入口语义 → 文案与空可见集提示。
4. 验证：`npx tsc -b`、`npx eslint src scripts`、`npm run build`；纯函数（`lib/topics.ts` 的可见集/指纹、`labels.ts` 的筛选）用一次性 node 脚本按真实 `data/graph.json` 核对；浏览器逐项核对（见下）。
5. 浏览器核对清单：① 悬停任意节点，其名称与其余文字内容、浓淡不变；② 展开键出现在合围盒外，长标签与缩小后仍不压字；③ 取消勾选某话题 → 其成员消失、其余坐标不动；④ 重新勾选 → 原样恢复；⑤ 搜索框按名过滤；⑥ 全不选 → 提示 + 「全选话题」可恢复；⑦ 详情页点话题 → 该话题恢复可见并选中该节点，其它话题不被关闭。
6. 登记 `docs/DIRECTORY.md`（§7 变更记录、§8.1 的话题视图描述），随后归档。

## Open Questions

- 无。话题勾选是否跨刷新保留已按「与现有当前话题口径一致，不持久化」处理；若日后要保留，只需把 `hiddenTopicIds` 写入 `localStorage`，不影响本次的 specs 与任务分解。
