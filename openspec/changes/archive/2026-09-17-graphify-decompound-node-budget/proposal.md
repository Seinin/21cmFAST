## Why

画布用 cytoscape 的 **compound 容器**表达层级：任何有子节点的节点都会被渲染成一个**把若干小节点包起来的框**。实测当前数据（59 节点）里有 20 个这样的框、139 处包含关系，展开态是「6% 底色 + 36px 内边距的大色块」，嵌套三层后画面被色块切碎、节点被推到很远，读图成本远高于「谁是谁的细分」这一点信息本身。使用者明确表示不需要这个功能。

更关键的是，**compound 是这份代码里几乎所有画布缺陷的共同根因**：父子关系与元素几何被绑在一起，导致折叠必须改写结构（`move({ parent })`）、话题过滤必须「提升」越界成员、`display:none` 的容器仍带模型包围盒（fcose 因此抛 `labelWidth`）、取景与命中测试必须额外判断祖先是否隐藏。保留它只会不断产生同类问题。

同时缺少一个更本质的约束：**一张画布上同时出现的节点数没有上限**。数据里三个话题分别有 40 / 14 / 8 个节点、不过滤时 59 个，一屏铺开必然难读。正确做法是让一张画布只承载「能读懂的量」，更深的内容靠逐层展开、更大的内容靠切换话题。

## What Changes

- **BREAKING**（数据表现层面）：画布**不再渲染任何分组容器**。层级关系改由**父子连线**表达，父节点连向每个可见的直系子节点。`node.parent` 字段与数据文件保持原样只读，仅改变其渲染方式。
- **BREAKING**：删除「折叠方块」这一形态（152×46、「名称 · 后代数量」）。未展开的分支改为**在原节点上标记**：虚线描边 + 名称后附 `· N`（N 为未展开的直系子节点数）。
- 新增**可见节点上限 25**：状态条常显「可见 N / 25」，贴近上限转琥珀、超限转红。
- 新增**逐层展开**：一次动作只展开或收起**一层**（直系子节点）。入口为节点旁的悬浮扩展键、右键菜单项、双击节点。
- 打开页面或切换话题时**自动裁剪到上限内**：结果确定可复现，同一话题每次一致。
- 任何会使可见节点数超过 25 的展开动作 **MUST 被拒绝且画布不变**，并提示「已到上限 25，请收起其他分支或切到细分话题」。
- 「全部收起」回到只剩顶层节点；「全部展开」在预算内尽量展开，未展完时给出说明。
- 默认布局改为 **cytoscape 内置层级布局**（工具条标签「层级」，即已有的 `breadthfirst`），打开时根在上、按层铺开；工具条仍可切换其它布局算法。
- 删除随 compound 存在的一整套死代码与耦合：`effectiveParent` / `realParent` / `orderByParent` / `move({ parent })` / `collapsedIds` 折叠态 / `foldToDepth` / `DEFAULT_FOLD_DEPTH` / `node:parent` 与 `node.collapsed` 样式 / `CollapseInfo`。
- 话题视图的「提升为顶层」从**改写 compound 结构**变成**纯计算层级父级**：层级父级 = 最近的同话题祖先，不存在则视为顶层。语义等价，但不再触碰元素结构。

## Capabilities

### New Capabilities

- `graphify-canvas-budget`: 一张画布同时承载多少节点的契约——可见节点硬上限、逐层展开/收起的统一语义、打开与切换话题时的确定性裁剪、超限动作被拒绝并给出指定提示、批量动作在上限内的行为、结构变化后的自愈。

### Modified Capabilities

- `graphify-canvas-appearance`: 分组容器的视觉语言整体退场。移除「展开的分组容器不描边」与「折叠方块保留可交互描边」两条要求（其描述的对象不再存在），新增「画布不做分组容器」「层级连线」「未展开分支标记」「层级连线与语义关系的样式区分」。
- `graphify-canvas-layout`: 现有两条要求里以「复合容器 / 折叠」为场景的部分需要改写为「未展开分支 / 被话题过滤而隐藏」；新增「默认使用内置层级布局」「展开收起后的重排行为」；补实当前仍为 TBD 的 Purpose。
- `graphify-topic-views`: 「可见集仅含话题成员」中的提升语义改为「层级父级 = 最近同话题祖先」，「切换话题保留位置与折叠状态」改为「保留位置、按新可见集重算展开状态且不超过上限」，「非本话题关系一并隐藏」与「关系可见性随视图往返还原」补上层级连线同样受约束。

## Impact

- 前端改动：`Graphify/src/graph/hierarchy.ts`（新增）、`Graphify/src/graph/cytoscapeSetup.ts`、`Graphify/src/graph/styles.ts`、`Graphify/src/graph/layout.ts`、`Graphify/src/lib/topics.ts`、`Graphify/src/lib/types.ts`（注释）、`Graphify/src/components/GraphCanvas.tsx`、`Graphify/src/components/ContextMenu.tsx`、`Graphify/src/components/CanvasOverlays.tsx`、`Graphify/src/components/StatusBar.tsx`、`Graphify/src/App.tsx`。
- 数据与接口：**无变更**。`Graphify/data/*.json`、`Graphify/scripts/build-*.mjs`、`Graphify/server/**` 一概不动，图谱数据格式（含 `node.parent`）保持不变。
- 依赖：**不新增任何依赖**（层级布局使用 cytoscape 内置 `breadthfirst`，非 fcose/dagre/elk 扩展）。
- 需要保住的上一次修复（不得回归）：`index.html` 启动看门狗、`AppErrorBoundary`、`main.tsx` 全局错误收敛、布局失败提示、取景与命中按元素可见性判定。
- 文档：`docs/DIRECTORY.md` §7 变更记录补记本次改造，§8 中关于 compound 折叠与默认折叠深度的表述同步改写。
