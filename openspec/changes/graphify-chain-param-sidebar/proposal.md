## Why

物理链页的参数词条是**浮在画布左上角的浮窗**（21rem 宽、贴着 ⓪① 两块），一展开就压住一级的块，且不可调宽；词条分组按"天体物理参数 / 宇宙学参数"这种**应用口径**分，与代码里的参数类（`AstroParams` / `CosmoParams` / `AstroOptions`）对不上号——想找 `R_MAX_TS` 得先猜它在哪一组。

更要紧的是：**选中一个参数时画布上什么也不亮**。参数标签（`tag:F_STAR10`）挂在**成员**（物理量 / 驱动量）上，而一级只有 10 个块；渲染器对**父节点**一律返回"没有标签"（`activeTagsOf` 的 `node.isParent()` 判据），于是"点词条 → 只有右侧属性栏换了内容"。用户要的是：选中参数就能看见**有此标签的产物、或装着它的天体物理过程**。

检索项本身也差一口气：四类命中的计数算了却从未进界面（`counts` 是死数据）、命中项不写出参数属于哪个代码类、不能键盘操作、也无法按代码阶段号（`S14`）找量。

## What Changes

- **左浮窗 → 真侧边栏**：与画布页「notes 数据库」同一套机制（`usePanelWidth` + `ResizeHandle`：可拖宽、双击复位、键盘 ←/→、拖过最小宽度自动收起为 36px 细条、宽度与收起状态本地记忆）。画布不再被浮窗遮挡。
- **词条按代码里的参数类名分组**：`AstroParams` / `CosmoParams` / `AstroOptions`（分组名来自生成物 `param.group`，视图不写死）；每组给出条数，词条右边写它作用的模块数。
- **选中参数 → 亮块 + 亮产物**：生成物给块补一份**成员标签并集**（与块已有的 `stages` 并集同一条口径：块没有自己的标签，写的是成员的），渲染器放行**非装饰父节点**（`type !== 'group'`）持有标签。于是选中参数时一级的块亮起，进块后成员也亮。画布页「容器（大框）不亮红点」的行为**不变**。
- **检索项完善**：四类命中（参数 / 物理量 / 过程 / 文献）**分组显示并给出计数**；参数命中写出所属代码类与它落到哪几个块；节点命中写出代码阶段号；支持按阶段号（`S14`）检索；↑/↓ 选、Enter 定位、Esc 清空。
- **选中参数时选中的是"块"**：不再把选中落在一个当前看不见的成员上，而是选中它作用的第一个块（右侧栏给过程块的属性页，画布高亮同一批对象）；词条下方的"作用于 …"里每一项都可点，点它就定位到那个成员（先把它所在的块摆到眼前）。

## Capabilities

### Modified Capabilities

- `graphify-physics-chain`：新增「参数词条按代码类名分组」与「选中参数点亮块与产物」两条需求；「本页检索与来源标注」MODIFIED（四类命中分组 + 计数 + 代码类 + 阶段号 + 键盘可达）。
- `graphify-panel-layout`：左侧栏由"浮窗"改为受面板机制管的真侧栏——宽度可拖可复位、越界自动收起为细条、宽度与收起状态本地记忆（与 `graphify-panel-layout` 现有四条需求同口径）。

## Impact

- 生成器与生成物：`Graphify/scripts/build-physics-chain.mjs` → `Graphify/src/generated/physics-chain.json`（块节点与 `graph.blocks.items[]` 各补一份 `tags` = 成员标签并集；块不自造标签）。
- 渲染器：`Graphify/src/graph/cytoscapeSetup.ts` 的 `activeTagsOf` 判据由"父节点一律无标签"改为"**装饰容器**（`type === 'group'`）无标签"；`scripts/check-canvas.mjs` 里"容器不亮红点"的断言口径不变（它测的就是 `type: 'group'` 的框）。
- 数据层：`Graphify/src/lib/physicsChain.ts`（参数类分组、块标签反查、检索项增强），新增 `Graphify/src/components/ChainSearchPanel.tsx`（侧栏），`Graphify/src/components/PhysicsChainView.tsx`（接线与布局）。
- 自检：`Graphify/scripts/check-physics-chain.mjs` 增"块的标签 = 成员并集"的独立重算断言与"块标签都在注册表里"；其余五个检查脚本必须全绿（尤其 `check:canvas` 的标签断言）。
- 不新增依赖，不改 `Graphify/data/graph.json`（画布页数据与行为不变）。
- 文档：`docs/notes/graphify/G4-物理链.md`、`G0-绘制规范.md`（如涉标签口径）、`docs/DIRECTORY.md` 记账。
